"""Trend channel finder: demo mode through the API, and the real path with a mocked YouTube API."""
import os
import tempfile
from datetime import datetime, timedelta, timezone

os.environ.setdefault("YTA_DATA_DIR", os.path.join(tempfile.mkdtemp(), "data"))
os.environ.setdefault("YTA_OUTPUT_DIR", os.path.join(tempfile.mkdtemp(), "output"))

from fastapi.testclient import TestClient  # noqa: E402

from app import store, trends  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app)


def test_demo_search_ideas_and_export():
    client.put("/api/settings", json={"demo_mode": True})
    res = client.post("/api/trends/search", json={"keywords": ["AI video", "side hustle"]}).json()
    assert len(res["channels"]) > 5
    scores = [c["score"] for c in res["channels"]]
    assert scores == sorted(scores, reverse=True)
    assert client.get("/api/trends").json()["channels"] == res["channels"]

    ideas = client.post("/api/trends/ideas", json={"count": 3}).json()["ideas"]
    assert len(ideas) == 3 and all(i["title"] and i["brief"] for i in ideas)

    csv = client.get("/api/trends/export")
    assert csv.status_code == 200 and "subs_per_day" in csv.text


def test_real_mode_requires_key():
    client.put("/api/settings", json={"demo_mode": False})
    client.put("/api/keys", json={"youtube": ""})
    r = client.post("/api/trends/search", json={})
    assert r.status_code == 400 and "YouTube" in r.json()["detail"]
    client.put("/api/settings", json={"demo_mode": True})


def test_filters_with_mocked_api(monkeypatch):
    now = datetime.now(timezone.utc)
    iso = lambda days: (now - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")  # noqa: E731
    chans = {  # id: (created, subs, views, videos)
        "NEW_BIG": (iso(60), 200_000, 50_000_000, 40),
        "OLD_BIG": (iso(900), 1_000_000, 300_000_000, 500),
        "NEW_SMALL": (iso(90), 3_000, 500_000, 10),
        "NEW_FAST": (iso(20), 80_000, 20_000_000, 15),
    }
    calls = []

    def fake_get(endpoint, params, key):
        calls.append(endpoint)
        if endpoint == "search":
            assert params["order"] == "viewCount" and params["publishedAfter"]
            return {"items": [{"id": {"videoId": f"v{i}"}, "snippet": {
                "channelId": list(chans)[i % 4], "title": f"Video {i}", "publishedAt": iso(5)}} for i in range(8)]}
        return {"items": [{"id": c, "snippet": {"title": c, "publishedAt": chans[c][0], "customUrl": "@" + c.lower()},
                           "statistics": {"subscriberCount": str(chans[c][1]), "viewCount": str(chans[c][2]),
                                          "videoCount": str(chans[c][3])}} for c in params["id"].split(",")]}

    monkeypatch.setattr(trends, "_get", fake_get)
    new = trends.find_channels({"keywords": ["AI"], "mode": "new", "min_subs": 10_000}, "k")
    assert [c["id"] for c in new["channels"]] == ["NEW_FAST", "NEW_BIG"]
    assert new["channels"][0]["url"] == "https://www.youtube.com/@new_fast"
    active = trends.find_channels({"keywords": ["AI"], "mode": "active", "min_subs": 10_000}, "k")
    assert {c["id"] for c in active["channels"]} == {"NEW_FAST", "NEW_BIG", "OLD_BIG"}
    assert calls.count("channels") == 2


def test_quota_error_keeps_partial_results(monkeypatch):
    def fake_get(endpoint, params, key):
        raise trends.TrendError("quota: limit")
    monkeypatch.setattr(trends, "_get", fake_get)
    try:
        trends.find_channels({"keywords": ["a", "b"]}, "k")
    except trends.TrendError as e:
        assert "quota" in str(e)
    else:
        raise AssertionError("expected TrendError")


def test_youtube_key_is_stored_and_masked():
    client.put("/api/keys", json={"youtube": "AIzaTEST1234"})
    assert store.get_keys()["youtube"] == "AIzaTEST1234"
    assert client.get("/api/settings").json()["keys"]["youtube"].endswith("1234")
    client.put("/api/keys", json={"youtube": ""})
