import json
from datetime import date, datetime, timezone

import pytest

from scc.config import get_settings
from scc.db import Store
from scc.llm import merge
from scc.service import Service
from scc.youtube import Quota, QuotaExceeded, YouTube


class Resp:
    def __init__(self, status=200, body=None, headers=None):
        self.status_code, self._body, self.headers = status, body or {}, headers or {}
        self.content = json.dumps(self._body).encode()
        self.text = self.content.decode()

    def json(self):
        return self._body


class FakeHTTP:
    def __init__(self):
        self.calls, self.n = [], 0

    def post(self, url, **kw):
        self.calls.append(("POST", url, kw))
        if "oauth2" in url:
            return Resp(200, {"access_token": "t", "expires_in": 3600})
        if "upload/youtube/v3/videos" in url:
            return Resp(200, headers={"Location": "https://upload.example/session"})
        if "playlists" in url and "Items" not in url:
            return Resp(200, {"id": "PL1"})
        return Resp(200, {})

    def put(self, url, **kw):
        self.calls.append(("PUT", url, kw))
        self.n += 1
        return Resp(200, {"id": f"VID{self.n}"})

    def get(self, url, **kw):
        self.calls.append(("GET", url, kw))
        return Resp(200, {"items": [{"snippet": {"title": "C"},
                                     "statistics": {"subscriberCount": "42", "viewCount": "1000", "videoCount": "3"}}]})


@pytest.fixture
def svc(tmp_path):
    s = get_settings({"DATA_DIR": str(tmp_path / "data"), "INBOX_DIR": str(tmp_path / "inbox"),
                      "EXPORT_DIR": str(tmp_path / "exports"), "CHANNEL_START_DATE": "2026-11-18",
                      "LLM_ENABLED": "off", "UPLOAD_MODE": "api"})
    store = Store(":memory:")
    http = FakeHTTP()
    yt = YouTube("id", "secret", "refresh", Quota(store, 10000), 1600, session=http)
    service = Service(s, store=store, youtube=yt)
    service.http = http
    return service


def test_daily_plans_uploads_private_long_before_short(svc, tmp_path):
    svc.ensure_plan(days=3, today=date(2026, 11, 18))
    inbox = tmp_path / "inbox"
    inbox.mkdir()
    for vid in ("2026-11-18-L", "2026-11-18-S"):
        (inbox / f"{vid}.mp4").write_bytes(b"\0" * 1000)
    (inbox / "2026-11-18-L.jpg").write_bytes(b"jpg")
    report = svc.daily(now=datetime(2026, 11, 18, 8, 0, tzinfo=timezone.utc))
    assert any("MAKE PUBLIC IN STUDIO" in line for line in report)
    long_v, short_v = svc.store.get("2026-11-18-L"), svc.store.get("2026-11-18-S")
    assert long_v["status"] == short_v["status"] == "uploaded"
    starts = [kw["json"] for m, url, kw in svc.http.calls if m == "POST" and url.endswith("/videos")]
    assert starts[0]["status"]["privacyStatus"] == "private"
    assert "publishAt" not in starts[0]["status"]
    assert starts[0]["status"]["containsSyntheticMedia"] is True
    assert starts[0]["snippet"]["title"] == long_v["meta"]["title"]          # long first
    if short_v["plan"]["linked_long_id"]:
        assert f"https://youtu.be/{long_v['youtube_id']}" in starts[1]["snippet"]["description"]
    assert any("thumbnails/set" in url for _, url, _ in svc.http.calls)
    assert svc.progress()["subscribers"] == 42


def test_scheduled_mode_sets_publish_at(svc, tmp_path):
    svc.s.publish_mode = "scheduled"
    svc.ensure_plan(days=1, today=date(2026, 11, 18))
    (tmp_path / "inbox").mkdir()
    (tmp_path / "inbox" / "2026-11-18-L.mp4").write_bytes(b"\0" * 10)
    svc.scan_inbox()
    svc.upload_one("2026-11-18-L", now=datetime(2026, 11, 18, 8, tzinfo=timezone.utc))
    body = next(kw["json"] for m, url, kw in svc.http.calls if m == "POST" and url.endswith("/videos"))
    assert body["status"]["publishAt"] == "2026-11-18T16:00:00Z"
    assert svc.store.get("2026-11-18-L")["status"] == "scheduled"


def test_quota_blocks_upload():
    q = Quota(Store(":memory:"), 2000)
    q.charge(1600)
    with pytest.raises(QuotaExceeded):
        q.charge(1600)


def test_mark_published_parses_url(svc):
    svc.ensure_plan(days=1, today=date(2026, 11, 18))
    svc.mark_published("2026-11-18-S", "https://youtube.com/shorts/AbC123?feature=share")
    v = svc.store.get("2026-11-18-S")
    assert v["status"] == "published" and v["youtube_id"] == "AbC123"


def test_llm_merge_drops_deceptive_titles(svc):
    svc.ensure_plan(days=1, today=date(2026, 11, 18))
    meta = svc.store.get("2026-11-18-L")["meta"]
    out = merge(meta, {"titles": ["Real footage of a Chiron crash", "Chiron vs Wall: Only One Survived"],
                       "hook": "One wall. One hypercar.", "pinned_comment": "Which car next?"})
    assert out["title"] == "Chiron vs Wall: Only One Survived"
    assert out["description"].startswith("One wall. One hypercar.")


def test_dashboard_pages(svc):
    from app import create_app
    svc.ensure_plan(days=2)
    client = create_app(svc).test_client()
    assert client.get("/").status_code == 200
    assert client.get("/calendar").status_code == 200
    vid = svc.store.videos()[0]["id"]
    page = client.get(f"/video/{vid}")
    assert page.status_code == 200 and b"Voiceover" in page.data
