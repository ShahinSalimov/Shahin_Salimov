"""My channels + YouTube upload tests (demo mode and mocked Google endpoints, no real keys)."""
import os
import tempfile
import time
from datetime import datetime
from pathlib import Path

if "YTA_DATA_DIR" not in os.environ:
    TMP = tempfile.mkdtemp()
    os.environ["YTA_DATA_DIR"] = os.path.join(TMP, "data")
    os.environ["YTA_OUTPUT_DIR"] = os.path.join(TMP, "output")

import httpx  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import channels, pipeline, research, store, youtube  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app)


def _wait(rid, timeout=15):
    end = time.time() + timeout
    while time.time() < end:
        doc = client.get(f"/api/research/{rid}").json()
        if doc["status"] != "running":
            assert doc["status"] == "done", doc.get("error")
            return doc
        time.sleep(0.05)
    raise AssertionError("job did not finish")


def _wait_idle():
    end = time.time() + 15
    while any(r["status"] == "running" for r in research.list_all()) and time.time() < end:
        time.sleep(0.05)


def _channel(**kw):
    client.put("/api/settings", json={"demo_mode": True})
    c = client.post("/api/channels", json={"name": "Vault of Echoes", "handle": "VaultOfEchoes",
                                           "niche": "history mysteries", **kw}).json()
    _wait_idle()  # kit job
    return c


def test_from_research_copies_strategy(monkeypatch):
    monkeypatch.setattr(research, "autocomplete", lambda *a, **k: [])
    client.put("/api/settings", json={"demo_mode": True})
    rid = _wait(client.post("/api/research/niche", json={"interests": "history"}).json()["id"])["id"]
    c = client.post(f"/api/channels/from-research/{rid}", json={"name": "Lost Ledger", "handle": "@LostLedger"}).json()
    assert c["name"] == "Lost Ledger" and c["handle"] == "LostLedger"
    assert c["niche"] == "Unsolved historical mysteries"
    assert c["kit"]["channel_description"] and c["kit"]["content_pillars"]
    _wait_idle()
    kit = client.get(f"/api/channels/{c['id']}").json()["kit"]
    assert kit["default_tags"] and kit["description_footer"]  # filled by the kit job
    assert kit["channel_description"] == c["kit"]["channel_description"]  # research result kept


def test_daily_ideas_command_script_seo_project(monkeypatch):
    monkeypatch.setattr(research, "autocomplete", lambda *a, **k: [])
    c = _channel()
    _wait(client.post(f"/api/channels/{c['id']}/ideas", json={"count": 4, "scripts": 1}).json()["id"])
    ideas = client.get(f"/api/channels/{c['id']}").json()["ideas"]
    assert len(ideas) == 4 and sum(1 for i in ideas if i["script"]) == 1

    _wait(client.post(f"/api/channels/{c['id']}/command", json={"text": "Roman legion that vanished"}).json()["id"])
    ideas = client.get(f"/api/channels/{c['id']}").json()["ideas"]
    cmd = next(i for i in ideas if i.get("command"))
    assert cmd["script"] and cmd["status"] == "script"

    _wait(client.post(f"/api/channels/{c['id']}/ideas/{cmd['id']}/seo").json()["id"])
    seo = channels.get_idea(c["id"], cmd["id"])["seo"]
    kit = channels.get(c["id"])["kit"]
    assert all(t in seo["tags"] for t in kit["default_tags"])  # channel tags merged
    assert kit["description_footer"].strip() in seo["description"]  # channel footer appended

    p = client.post(f"/api/channels/{c['id']}/ideas/{cmd['id']}/project", json={}).json()
    proj = store.get_project(p["id"])
    assert proj["script"] == cmd["script"] and proj["channel_id"] == c["id"]
    assert proj["metadata"]["tags"] == seo["tags"]
    assert channels.get_idea(c["id"], cmd["id"])["status"] == "project"


def test_ideas_are_not_repeated(monkeypatch):
    seen = {}

    def fake_job_ideas(params, progress):
        seen["exclude"] = params.get("exclude")
        return {"ideas": [{"title": "Old one"}, {"title": "Fresh one"}]}, {}, []

    c = _channel()
    channels.update_ideas(c["id"], lambda items: items.append({"id": "x1", "title": "Old one", "status": "new"}))
    monkeypatch.setattr(research, "job_ideas", fake_job_ideas)
    res, _, _ = channels.job_ideas({"channel_id": c["id"], "count": 2}, lambda *a: None)
    assert seen["exclude"] == ["Old one"] and res["added"] == 1


def test_scheduler_runs_once_per_day(monkeypatch):
    started = []
    monkeypatch.setattr(research, "start", lambda kind, params: started.append(kind) or {"id": "x"})
    c = channels.save({"name": "Sched", "niche": "x", "auto": {"enabled": True, "time": "09:00"}})
    channels.run_due(datetime(2026, 11, 24, 8, 59))
    assert c["id"] not in [x["id"] for x in channels.due_channels(datetime(2026, 11, 24, 8, 59))]
    assert channels.run_due(datetime(2026, 11, 24, 9, 1)) and started.count("channel_ideas") >= 1
    n = started.count("channel_ideas")
    channels.run_due(datetime(2026, 11, 24, 18, 0))
    assert started.count("channel_ideas") == n  # not again the same day
    assert channels.get(c["id"])["auto"]["last_date"] == "2026-11-24"
    channels.save({"id": c["id"], "auto": {"enabled": False}})


def test_build_body_limits_and_schedule():
    b = youtube.build_body({"title": "<b>" + "x" * 120, "description": "a<b>", "tags": ["one tag"] * 3 + ["t" * 40] * 20},
                           {"privacy": "public", "publish_at": "2026-12-01T18:00:00+04:00", "synthetic": True}, "en")
    assert len(b["snippet"]["title"]) == 100 and "<" not in b["snippet"]["title"] + b["snippet"]["description"]
    assert b["status"]["privacyStatus"] == "private" and b["status"]["publishAt"]
    assert b["status"]["containsSyntheticMedia"] is True and b["snippet"]["defaultLanguage"] == "en"
    assert len(",".join(b["snippet"]["tags"])) <= 470


def test_next_publish_at_is_in_future():
    now = datetime(2026, 11, 24, 17, 30).astimezone()
    assert youtube.next_publish_at("18:00", now).startswith("2026-11-25T18:00")  # <1h away -> tomorrow
    assert youtube.next_publish_at("20:00", now).startswith("2026-11-24T20:00")


def test_resumable_upload_resumes_after_server_error(monkeypatch, tmp_path):
    video = tmp_path / "v.mp4"
    video.write_bytes(b"0" * 1000)
    monkeypatch.setattr(youtube, "CHUNK", 400)
    monkeypatch.setattr(youtube, "access_token", lambda cid, force=False: "tok")
    monkeypatch.setattr(youtube.time, "sleep", lambda s: None)
    got, calls = bytearray(), {"put": 0}

    def fake_post(url, **kw):
        assert kw["json"]["snippet"]["title"] == "T"
        return httpx.Response(200, headers={"Location": "https://upload/session"})

    def fake_put(url, content=None, headers=None, **kw):
        calls["put"] += 1
        rng = headers["Content-Range"]
        if rng.startswith("bytes */"):  # status query after failure
            return httpx.Response(308, headers={"Range": f"bytes=0-{len(got) - 1}"})
        if calls["put"] == 2:
            return httpx.Response(503)
        got.extend(content)
        if len(got) >= 1000:
            return httpx.Response(200, json={"id": "VID123"})
        return httpx.Response(308, headers={"Range": f"bytes=0-{len(got) - 1}"})

    monkeypatch.setattr(youtube.httpx, "post", fake_post)
    monkeypatch.setattr(youtube.httpx, "put", fake_put)
    vid = youtube.upload_video("c1", video, youtube.build_body({"title": "T"}, {}))
    assert vid == "VID123" and bytes(got) == video.read_bytes()


def test_thumbnail_is_1280x720_jpeg(tmp_path):
    from PIL import Image
    src = tmp_path / "t.png"
    Image.new("RGB", (1536, 1024), (200, 30, 30)).save(src)
    data = youtube.thumbnail_jpeg(src)
    import io
    im = Image.open(io.BytesIO(data))
    assert im.format == "JPEG" and im.size == (1280, 720) and len(data) < 2_000_000


def test_upload_job_demo_marks_idea_uploaded(monkeypatch):
    monkeypatch.setattr(research, "autocomplete", lambda *a, **k: [])
    c = _channel()
    channels.save({"id": c["id"], "kit": {"default_tags": ["chan tag"], "description_footer": "FOOTER LINE"}})
    channels.update_ideas(c["id"], lambda items: items.append({"id": "i1", "title": "Idea", "status": "new"}))
    p = channels.idea_to_project(c["id"], "i1")
    out = Path(store.OUTPUT) / "fake.mp4"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(b"x")
    store.update_project(p["id"], lambda x: x.update(output=str(out), metadata={"title": "Idea", "description": "D", "tags": ["a"]}))
    r = client.post(f"/api/projects/{p['id']}/upload", json={"privacy": "unlisted"})
    assert r.status_code == 200, r.text
    end = time.time() + 15
    while pipeline.is_running(p["id"]) and time.time() < end:
        time.sleep(0.05)
    proj = store.get_project(p["id"])
    assert proj["job"]["status"] == "done", proj["job"]
    assert proj["youtube"]["video_id"].startswith("demo_") and proj["thumbnail"]
    assert channels.get_idea(c["id"], "i1")["status"] == "uploaded"


def test_upload_requires_connection_in_real_mode():
    c = _channel()
    p = store.create_project("x", "")
    store.update_project(p["id"], lambda x: x.update(output="/nope.mp4", channel_id=c["id"],
                                                      settings={**x["settings"], "demo_mode": False}))
    r = client.post(f"/api/projects/{p['id']}/upload", json={})
    assert r.status_code == 400 and "bağlanmayıb" in r.json()["detail"]


def test_oauth_url_and_bad_state(monkeypatch):
    store.save_keys({"yt_client_id": "cid.apps.googleusercontent.com", "yt_client_secret": "s"})
    c = _channel()
    r = client.get(f"/api/youtube/connect/{c['id']}", follow_redirects=False)
    assert r.status_code == 307
    loc = r.headers["location"]
    assert "accounts.google.com" in loc and "youtube.upload" in loc and "access_type=offline" in loc
    assert "redirect_uri=http%3A%2F%2Ftestserver%2Fapi%2Fyoutube%2Fcallback" in loc
    assert client.get("/api/youtube/callback?code=x&state=forged").status_code == 400
    store.save_keys({"yt_client_id": "", "yt_client_secret": ""})


def test_channel_routes():
    c = _channel()
    assert client.post(f"/api/channels/{c['id']}/disconnect").json() == {"ok": True}
    assert client.post(f"/api/channels/{c['id']}/nope").status_code == 400
    assert client.get("/api/channels/zzz").status_code == 404
    assert client.delete(f"/api/channels/{c['id']}").json() == {"ok": True}
