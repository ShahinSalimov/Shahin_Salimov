"""SALIMOFF AI YOUTUBE: analysis → decision → channel → plan → produce → upload → report (demo mode)."""
import os
import tempfile
import time
from datetime import datetime, timezone

TMP = tempfile.mkdtemp()
os.environ.setdefault("YTA_DATA_DIR", os.path.join(TMP, "data"))
os.environ.setdefault("YTA_OUTPUT_DIR", os.path.join(TMP, "output"))
os.environ["YTA_SCHEDULER"] = "0"

from fastapi.testclient import TestClient  # noqa: E402

from app import store  # noqa: E402
from app.main import app  # noqa: E402
from app.salimoff import autopilot, db, planner, reports, research  # noqa: E402

client = TestClient(app)


def _wait_job(key, timeout=120):
    end = time.time() + timeout
    while time.time() < end:
        j = client.get(f"/api/salimoff/jobs/{key}").json()
        if j["status"] in ("done", "error"):
            assert j["status"] == "done", j
            return j
        time.sleep(0.3)
    raise TimeoutError(key)


def test_measure_scores_small_channel_success_higher():
    now = datetime.now(timezone.utc).isoformat()
    small = [{"video_id": str(i), "views": 300_000, "subs": 5_000, "seconds": 600, "channel_id": f"c{i}",
              "channel_created": now} for i in range(10)]
    big = [{"video_id": str(i), "views": 300_000, "subs": 5_000_000, "seconds": 600, "channel_id": "c1",
            "channel_created": "2012-01-01T00:00:00+00:00"} for i in range(10)]
    ms, mb = research.measure(small), research.measure(big)
    assert ms["opportunity"] > mb["opportunity"]
    assert ms["competition"] > mb["competition"]
    assert ms["demand"] == mb["demand"]
    assert research.measure([]) == {"n": 0}


def test_slots_spread_and_unique():
    assert research.clamp(150) == 100
    assert len(planner.slot_days(2)) == 2 and len(planner.slot_days(7)) == 7 and len(planner.slot_days(10)) == 10
    ch = {"autopilot": dict(db.DEFAULT_AUTOPILOT), "ideas": []}
    slots = planner.next_slots(ch, "short", 10)
    assert len(slots) == 10 and len(set(slots)) == 10
    assert all(s > datetime.now(timezone.utc) for s in slots)


def test_full_system_demo_flow():
    client.put("/api/settings", json={"demo_mode": True})
    r = client.post("/api/salimoff/launch", json={"input": {"language": "English", "region": "US",
                                                            "interests": "history, science"}, "mode": "full"}).json()
    j = _wait_job(r["job"])
    cid = j["result"]["channel_id"]
    rs = client.get(f"/api/salimoff/research/{j['result']['research_id']}").json()
    assert rs["status"] == "done" and rs["decision"]["niche"] == rs["candidates"][0]["name"]
    totals = [c["score"]["total"] for c in rs["candidates"]]
    assert totals == sorted(totals, reverse=True)
    assert rs["patterns"]["title_formulas"]

    ch = client.get(f"/api/salimoff/channels/{cid}").json()
    assert ch["status"] == "ready" and ch["autopilot"]["enabled"]
    assert store.get_profile(ch["profiles"]["long"])["settings"]["visual"]["aspect"] == "16:9"
    short = store.get_profile(ch["profiles"]["short"])["settings"]
    assert short["visual"]["aspect"] == "9:16" and short["subtitles"]["burn_in"]
    assert client.get(f"/api/salimoff/channels/{cid}/asset/banner").status_code == 200
    assert any(i["kind"] == "long" for i in ch["ideas"]) and any(i["kind"] == "short" for i in ch["ideas"])
    assert all(i["status"] == "approved" for i in ch["ideas"])

    # produce one Short through the autopilot (long buffer off to keep the test fast)
    client.put(f"/api/salimoff/channels/{cid}", json={"autopilot": {"buffer_long": 0, "buffer_short": 1}})
    did = autopilot.tick(cid)
    assert "produce:short" in did, did
    deadline = time.time() + 300
    while time.time() < deadline:
        planner.sync_production(cid)
        if any(i["status"] in ("ready", "failed") for i in db.get_channel(cid)["ideas"]):
            break
        time.sleep(1)
    ready = [i for i in db.get_channel(cid)["ideas"] if i["status"] == "ready"]
    assert ready, [i.get("error") for i in db.get_channel(cid)["ideas"] if i["status"] == "failed"]
    proj = store.get_project(ready[0]["project_id"])
    assert proj["settings"]["visual"]["aspect"] == "9:16"
    assert "#Shorts" in proj["metadata"]["title"]

    # connect (demo) and let the autopilot upload into the next slot
    client.post(f"/api/salimoff/channels/{cid}/connect", json={"demo": True})
    assert "upload" in autopilot.tick(cid)
    _wait_job(f"upload:{cid}")
    up = next(i for i in db.get_channel(cid)["ideas"] if i["id"] == ready[0]["id"])
    assert up["status"] == "scheduled" and up["yt_id"] and up["publish_at"]

    # report → learnings + pillar weights + html export
    client.post(f"/api/salimoff/channels/{cid}/reports")
    _wait_job(f"report:{cid}")
    ch = db.get_channel(cid)
    rep = ch["reports"][-1]
    assert rep["kpis"]["views"] > 0 and rep["insights"]["actions"]
    assert any(l["source"] == "hesabat" for l in ch["learnings"])
    assert ch["pillar_weights"]
    html = client.get(f"/api/salimoff/channels/{cid}/reports/{rep['id']}?format=html").text
    assert "SALIMOFF AI YOUTUBE" in html and "YPP" in html

    ov = client.get("/api/salimoff/overview").json()
    assert any(c["id"] == cid and c["counts"]["scheduled"] == 1 for c in ov["channels"])


def test_report_analysis_maps_videos_and_ypp_eta():
    ch = {"ideas": [{"yt_id": "a", "title": "A", "kind": "long", "pillar": "P1"},
                    {"yt_id": "b", "title": "B", "kind": "short", "pillar": "P2"}]}
    data = {"period": ["2026-01-01", "2026-01-03"],
            "cur": {"views": 1000, "estimatedMinutesWatched": 6000, "subscribersGained": 30, "subscribersLost": 0},
            "prev": {"views": 500}, "channel": {"subs": 100, "views": 5000, "videos": 2},
            "per_video": [{"video": "a", "views": 300, "estimatedMinutesWatched": 3000},
                          {"video": "b", "views": 700, "estimatedMinutesWatched": 300}],
            "ypp": {"subs": 100, "hours": 100, "shorts_views": 1000, "approx": False}}
    a = reports.analyse(ch, data, 3)
    assert a["deltas"]["views"] == 100.0
    assert a["winners"][0]["title"] == "B"
    assert a["pillars"]["P2"]["index"] > a["pillars"]["P1"]["index"]
    # subs: 400 needed at 10/day = 40 days; long hours: 2900 needed at 16.7/day = 174 days → the slower wins
    assert a["ypp"]["eta_days"]["early"] == 174


def test_phone_lan_access_requires_pin(monkeypatch):
    from app import access
    monkeypatch.setenv("YTA_LAN", "1")
    monkeypatch.setenv("YTA_PIN", "424242")
    monkeypatch.setattr(access, "LOCAL", set())  # pretend the request comes from a phone
    c = TestClient(app)
    assert c.get("/api/salimoff/overview").status_code == 401
    assert c.get("/", follow_redirects=False).headers["location"] == "/login"
    assert c.get("/manifest.webmanifest").status_code == 200
    assert "yanlış" in c.post("/login", data={"pin": "000000"}).text
    c.post("/login", data={"pin": "424242"}, follow_redirects=False)
    assert c.get("/api/salimoff/overview").status_code == 200
    assert c.get("/studio.html").status_code == 200
