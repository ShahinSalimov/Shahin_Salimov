import os

os.environ["YTA_NO_WORKER"] = "1"

from fastapi.testclient import TestClient  # noqa: E402

from app import jobs  # noqa: E402
from app.main import app  # noqa: E402


def test_api_flow(channel):
    with TestClient(app) as client:
        assert client.get("/api/channels").json()[0]["connected"] is True
        r = client.post("/api/jobs", json={"script": "The car crashed. It was a Ferrari.", "channel_id": channel["id"],
                                           "make_short": False})
        assert r.status_code == 200, r.text
        jid = r.json()["id"]
        assert any(j["id"] == jid for j in client.get("/api/jobs").json())
        jobs.run_job(jid)
        j = next(j for j in client.get("/api/jobs").json() if j["id"] == jid)
        assert j["status"] == "done", j["error"]
        f = client.get(f"/api/jobs/{jid}/file/long")
        assert f.status_code == 200 and len(f.content) > 1000
        assert client.post("/api/jobs", json={"script": " ", "channel_id": channel["id"]}).status_code == 400


def test_settings_and_keys():
    with TestClient(app) as client:
        client.put("/api/keys", json={"openai": "sk-test-abcd1234"})
        assert client.get("/api/settings").json()["keys"]["openai"].endswith("1234")
        assert client.put("/api/settings", json={"budget_cap": 3}).json()["settings"]["budget_cap"] == 3.0
        bad = client.post("/api/youtube/client-secret", files={"file": ("c.json", b'{"web": {}}')})
        assert bad.status_code == 400
