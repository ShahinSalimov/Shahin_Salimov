"""Channel strategy agent tests (demo mode + mocked YouTube API, no real keys)."""
import os
import tempfile
import time

if "YTA_DATA_DIR" not in os.environ:
    TMP = tempfile.mkdtemp()
    os.environ["YTA_DATA_DIR"] = os.path.join(TMP, "data")
    os.environ["YTA_OUTPUT_DIR"] = os.path.join(TMP, "output")

import httpx  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import research, store  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app)


def _wait(rid, timeout=10):
    end = time.time() + timeout
    while time.time() < end:
        doc = client.get(f"/api/research/{rid}").json()
        if doc["status"] != "running":
            return doc
        time.sleep(0.05)
    raise AssertionError("research job did not finish")


def test_demo_flow_all_kinds(monkeypatch):
    monkeypatch.setattr(research, "autocomplete", lambda *a, **k: [])
    client.put("/api/settings", json={"demo_mode": True})
    niche = _wait(client.post("/api/research/niche", json={"interests": "history"}).json()["id"])
    assert niche["status"] == "done" and niche["result"]["winner"]["channel_names"]
    ideas = _wait(client.post("/api/research/ideas", json={"niche": "history mysteries", "count": 5}).json()["id"])
    assert len(ideas["result"]["ideas"]) == 5
    seo = _wait(client.post("/api/research/seo", json={"title": "The Lost City"}).json()["id"])
    assert seo["result"]["tags_csv"]
    assert {x["id"] for x in client.get("/api/research").json()} >= {niche["id"], ideas["id"], seo["id"]}


def test_ideas_requires_niche():
    client.put("/api/settings", json={"demo_mode": True})
    doc = _wait(client.post("/api/research/ideas", json={"niche": " "}).json()["id"])
    assert doc["status"] == "error" and "Niş" in doc["error"]


def test_finalize_seo_enforces_youtube_limits():
    tags = [f"long tail keyword number {i}" for i in range(60)] + ["Dup", "dup", "<bad>"]
    res = research.finalize_seo({"tags": tags, "recommended_title": "x" * 150, "description": "a<b>" * 3000})
    assert res["tags_chars"] <= 500
    assert len(",".join(f'"{t}"' if " " in t else t for t in res["tags"])) <= research.TAG_BUDGET
    assert len(res["recommended_title"]) == 100 and len(res["description"]) <= 5000
    assert "<" not in res["description"]


def test_summarize_signals():
    vids = [
        {"views": 200_000, "subs": 5_000, "views_per_day": 4000, "outlier": 40.0, "minutes": 12},
        {"views": 1_000_000, "subs": 2_000_000, "views_per_day": 20000, "outlier": 0.5, "minutes": 15},
        {"views": 10_000, "subs": 30_000, "views_per_day": 100, "outlier": 0.3, "minutes": 9},
    ]
    s = research.summarize(vids)
    assert s["median_views"] == 200_000 and s["small_channel_hits"] == 1 and s["outlier_count"] == 1
    assert s["small_channel_share"] == 0.67


def test_keyword_snapshot_with_mocked_api(monkeypatch):
    def fake_get(url, params=None, **kw):
        path = url.rsplit("/", 1)[-1]
        data = {
            "search": {"items": [{"id": {"videoId": "v1"}}, {"id": {"videoId": "v2"}}]},
            "videos": {"items": [
                {"id": "v1", "snippet": {"title": "Small hit", "channelTitle": "Tiny", "channelId": "c1",
                                         "publishedAt": "2026-11-01T00:00:00Z"},
                 "statistics": {"viewCount": "300000", "likeCount": "9000", "commentCount": "500"},
                 "contentDetails": {"duration": "PT12M30S"}},
                {"id": "v2", "snippet": {"title": "Big channel", "channelTitle": "Huge", "channelId": "c2",
                                         "publishedAt": "2026-10-01T00:00:00Z"},
                 "statistics": {"viewCount": "500000"}, "contentDetails": {"duration": "PT1H2M"}},
            ]},
            "channels": {"items": [{"id": "c1", "statistics": {"subscriberCount": "4000"}},
                                   {"id": "c2", "statistics": {"subscriberCount": "3000000"}}]},
        }[path]
        assert params["key"] == "K"
        return httpx.Response(200, json=data)

    monkeypatch.setattr(research.httpx, "get", fake_get)
    snap = research.keyword_snapshot("mysteries", "K")
    v1 = next(v for v in snap["videos"] if v["video_id"] == "v1")
    v2 = next(v for v in snap["videos"] if v["video_id"] == "v2")
    assert v1["outlier"] == 75.0 and v1["minutes"] == 12.5 and v1["likes"] == 9000
    assert v2["minutes"] == 62.0 and snap["videos"][0]["video_id"] == "v2"
    assert snap["summary"]["small_channel_hits"] == 1
    assert "Small hit" in research.compact_data([snap], {"mysteries": ["mysteries unsolved"]})


def test_quota_error_is_readable(monkeypatch):
    monkeypatch.setattr(research.httpx, "get",
                        lambda *a, **k: httpx.Response(403, text='{"error": {"reason": "quotaExceeded"}}'))
    try:
        research.keyword_snapshot("x", "K")
    except research.ResearchError as e:
        assert "kvota" in str(e)
    else:
        raise AssertionError("expected ResearchError")


def test_idea_to_project_keeps_seo_metadata():
    seo = research.finalize_seo(research.demo_seo("The Lost City"))
    p = client.post("/api/research-to-project",
                    json={"title": "The Lost City", "brief": "angle", "metadata": seo}).json()
    proj = store.get_project(p["id"])
    assert proj["brief"] == "angle"
    assert proj["metadata"]["title"] == "The Lost City" and proj["metadata"]["tags"] == seo["tags"]


def test_bad_ids_are_404():
    assert client.get("/api/research/../../x").status_code == 404
    assert client.get("/api/research/nope123").status_code == 404
    assert client.post("/api/research/other", json={}).status_code == 400
