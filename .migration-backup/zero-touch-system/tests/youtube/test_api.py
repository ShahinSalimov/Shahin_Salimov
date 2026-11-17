"""Tests for Google OAuth, quota tracking, YouTube signals, upload and analytics (HTTP mocked)."""
from datetime import datetime, timezone

import pytest
import responses
from freezegun import freeze_time

from core.db import JobStore
from core.tools import NonRetryable, ToolContext
from orgs.youtube.tools.google import GoogleAuth, QuotaExceeded, QuotaTracker, TOKEN_URL
from orgs.youtube.tools.youtube_upload import (FakeUploader, UPLOAD_URL, YouTubeUploader,
                                               youtube_upload_tool)
from orgs.youtube.tools.yt_analytics import ANALYTICS_URL, AnalyticsClient, weekly_analytics_tool
from orgs.youtube.tools.yt_signals import (DATA_API, YouTubeDataClient, collect_yt_signals_tool,
                                           parse_iso_duration)


@pytest.fixture
def store(tmp_path):
    s = JobStore(tmp_path / "y.db", org="youtube")
    yield s
    s.close()


def _ctx(store, key="r1:tools.youtube_upload:0", state=None):
    return ToolContext(org="youtube", run_id="r1", step="s", idempotency_key=key, state=state or {}, store=store)


def _auth():
    responses.post(TOKEN_URL, json={"access_token": "ya29.tok", "expires_in": 3600})
    return GoogleAuth("cid", "csecret", "refresh")


# --- auth & quota ---------------------------------------------------------------------------------

@responses.activate
def test_google_auth_refreshes_and_caches():
    auth = _auth()
    assert auth.token() == "ya29.tok"
    assert auth.token() == "ya29.tok"
    assert len(responses.calls) == 1
    body = responses.calls[0].request.body
    assert "grant_type=refresh_token" in body and "refresh_token=refresh" in body


@responses.activate
def test_google_auth_invalid_grant_is_non_retryable():
    responses.post(TOKEN_URL, json={"error": "invalid_grant"}, status=400)
    with pytest.raises(NonRetryable, match="youtube_oauth"):
        GoogleAuth("c", "s", "r").token()


def test_quota_tracker_per_day(store):
    q = QuotaTracker(store, daily_limit=1000)
    with freeze_time("2026-11-16 10:00:00"):
        q.charge(600)
        assert q.remaining() == 400
        with pytest.raises(QuotaExceeded):
            q.charge(500)
        assert q.remaining() == 400            # failed charge is not booked
    with freeze_time("2026-11-17 00:00:01"):   # YouTube resets at midnight Pacific; UTC day is conservative enough
        assert q.remaining() == 1000


# --- signals -------------------------------------------------------------------------------------------

@pytest.mark.parametrize("iso,sec", [("PT42S", 42), ("PT1M5S", 65), ("PT1H2M3S", 3723), ("P0D", 0)])
def test_parse_iso_duration(iso, sec):
    assert parse_iso_duration(iso) == sec


@responses.activate
def test_signals_compute_outlier_ratio_and_charge_quota(store):
    auth = _auth()
    responses.get(f"{DATA_API}/search", json={"items": [
        {"id": {"videoId": "v1"}, "snippet": {"channelId": "c1"}},
        {"id": {"videoId": "v2"}, "snippet": {"channelId": "c2"}}]})
    responses.get(f"{DATA_API}/videos", json={"items": [
        {"id": "v1", "snippet": {"title": "Budget trap", "channelId": "c1", "publishedAt": "2026-11-01T00:00:00Z"},
         "statistics": {"viewCount": "480000"}, "contentDetails": {"duration": "PT42S"}},
        {"id": "v2", "snippet": {"title": "Hidden subs", "channelId": "c2", "publishedAt": "2026-11-02T00:00:00Z"},
         "statistics": {"viewCount": "5000"}, "contentDetails": {"duration": "PT50S"}}]})
    responses.get(f"{DATA_API}/channels", json={"items": [
        {"id": "c1", "statistics": {"subscriberCount": "12000"}},
        {"id": "c2", "statistics": {"hiddenSubscriberCount": True}}]})
    quota = QuotaTracker(store, 10000)
    client = YouTubeDataClient(auth, quota)
    sigs = client.signals("budget", shorts=True, max_results=2)
    assert sigs[0]["outlier_ratio"] == 40.0 and sigs[0]["duration_s"] == 42
    assert sigs[1]["channel_subs"] is None and sigs[1]["outlier_ratio"] == 5.0   # floor of 1000 subs
    assert quota.used() == 100 + 1 + 1
    search = responses.calls[1].request.url
    assert "videoDuration=short" in search and "order=viewCount" in search
    assert responses.calls[1].request.headers["Authorization"] == "Bearer ya29.tok"


def test_collect_tool_degrades_and_adds_history(store):
    class Src:
        def signals(self, keyword, shorts, max_results):
            if keyword == "bad":
                raise ConnectionError("down")
            return [{"source": "youtube", "video_id": f"{keyword}-1", "title": "t", "views": 10,
                     "channel_subs": 1000, "outlier_ratio": 0.01}]

    store.insert_video(id="old", run_id="r0", title="Old title", topic_key="old-title", youtube_video_id="y",
                       publish_at=None, status="scheduled")
    tool = collect_yt_signals_tool(Src())
    out = tool({"channel_profile": {"format": "shorts"}, "keywords": ["good", "bad"]}, _ctx(store))
    assert len(out["raw_signals"]) == 1 and "bad" in out["source_errors"]
    assert out["history_titles"] == ["Old title"]


# --- upload ---------------------------------------------------------------------------------------------

SEO = {"snippet": {"title": "Why Your Budget Fails in Week 2 #Shorts", "description": "Desc",
                   "tags": ["a"] * 8, "categoryId": "27", "defaultLanguage": "en"},
       "status_block": {"privacyStatus": "private", "publishAt": "2026-11-16T17:00:00Z",
                        "selfDeclaredMadeForKids": False, "containsSyntheticMedia": False},
       "chapters": [{"time": "00:00", "label": "Intro"}, {"time": "00:20", "label": "Why"},
                    {"time": "00:40", "label": "Fix"}],
       "pinned_comment": "What surprised you?", "thumbnail_text": "WEEK 2"}


def _upload_payload(tmp_path, synthetic=True, fmt="longform"):
    video = tmp_path / "v.mp4"
    video.write_bytes(b"\x00" * 1000)
    thumb = tmp_path / "t.png"
    thumb.write_bytes(b"png")
    return {"seo": SEO, "render_result": {"video_path": str(video), "thumbnail_path": str(thumb),
                                          "ai_disclosure_required": synthetic, "duration_s": 46},
            "topic_key": "budget-week-2", "format": fmt}


@responses.activate
def test_resumable_upload_and_thumbnail(tmp_path, store):
    auth = _auth()
    responses.post(UPLOAD_URL, headers={"Location": "https://upload.example/session1"}, status=200)
    responses.put("https://upload.example/session1", json={"id": "VID123", "status": {"privacyStatus": "private"}})
    responses.post("https://www.googleapis.com/upload/youtube/v3/thumbnails/set", json={}, status=200)
    up = YouTubeUploader(auth, QuotaTracker(store, 10000), upload_cost=1600)
    res = up.upload(_upload_payload(tmp_path)["render_result"]["video_path"],
                    snippet=SEO["snippet"], status=SEO["status_block"])
    assert res["video_id"] == "VID123"
    init = responses.calls[1].request
    assert "uploadType=resumable" in init.url and "part=snippet%2Cstatus" in init.url
    assert init.headers["X-Upload-Content-Type"] == "video/mp4"
    assert init.headers["X-Upload-Content-Length"] == "1000"
    assert up.set_thumbnail("VID123", _upload_payload(tmp_path)["render_result"]["thumbnail_path"]) is True


@responses.activate
def test_thumbnail_forbidden_is_tolerated(tmp_path, store):
    auth = _auth()
    responses.post("https://www.googleapis.com/upload/youtube/v3/thumbnails/set", json={}, status=403)
    up = YouTubeUploader(auth, QuotaTracker(store, 10000), upload_cost=1600)
    assert up.set_thumbnail("V", _upload_payload(tmp_path)["render_result"]["thumbnail_path"]) is False


def test_upload_tool_enforces_private_synthetic_and_future_publish(tmp_path, store):
    up = FakeUploader()
    tool = youtube_upload_tool(up)
    with freeze_time("2026-11-16 18:00:00"):          # publishAt 17:00 is already in the past
        out = tool(_upload_payload(tmp_path, synthetic=True), _ctx(store))
    sent = up.uploads[0]
    assert sent["status"]["privacyStatus"] == "private"
    assert sent["status"]["containsSyntheticMedia"] is True          # render flag can't be downgraded by SEO
    assert sent["status"]["publishAt"] == "2026-11-16T20:00:00Z"     # moved to >= now + 2h
    assert "00:00 Intro" in sent["snippet"]["description"]           # chapters go into the description
    assert out["status"] == "ok" and out["video_id"].startswith("fake-")
    assert store.videos()[0]["status"] == "scheduled"


def test_upload_tool_rejects_duplicate_topic(tmp_path, store):
    tool = youtube_upload_tool(FakeUploader())
    tool(_upload_payload(tmp_path), _ctx(store))
    out = tool(_upload_payload(tmp_path), _ctx(store, key="r2:x:0"))
    assert out["status"] == "rejected"


def test_upload_tool_shorts_keeps_description_without_chapters(tmp_path, store):
    up = FakeUploader()
    youtube_upload_tool(up)(_upload_payload(tmp_path, fmt="shorts"), _ctx(store))
    assert "00:00" not in up.uploads[0]["snippet"]["description"]


@responses.activate
def test_upload_quota_charged_and_exceeded(tmp_path, store):
    auth = _auth()
    q = QuotaTracker(store, 1000)
    up = YouTubeUploader(auth, q, upload_cost=1600)
    with pytest.raises(QuotaExceeded):
        up.upload(_upload_payload(tmp_path)["render_result"]["video_path"], snippet={}, status={})


# --- analytics ---------------------------------------------------------------------------------------------

ROWS = {"columnHeaders": [{"name": n} for n in ["video", "views", "estimatedMinutesWatched", "averageViewPercentage",
                                                 "subscribersGained", "estimatedRevenue"]],
        "rows": [["v1", 12000, 3000, 71.0, 40, 3.2], ["v2", 800, 100, 35.0, 1, 0.1]]}


@responses.activate
def test_analytics_parses_rows():
    auth = _auth()
    responses.get(ANALYTICS_URL, json=ROWS)
    rows = AnalyticsClient(auth).video_report("2026-11-09", "2026-11-15")
    assert rows[0] == {"video_id": "v1", "views": 12000, "watch_minutes": 3000, "avg_view_pct": 71.0,
                       "subs_gained": 40, "estimated_revenue_usd": 3.2, "ctr_pct": None}
    url = responses.calls[1].request.url
    assert "ids=channel%3D%3DMINE" in url and "dimensions=video" in url


@responses.activate
def test_analytics_drops_revenue_without_monetary_scope():
    auth = _auth()
    responses.get(ANALYTICS_URL, json={"error": {"code": 403}}, status=403)
    no_rev = {"columnHeaders": ROWS["columnHeaders"][:-1], "rows": [r[:-1] for r in ROWS["rows"]]}
    responses.get(ANALYTICS_URL, json=no_rev)
    rows = AnalyticsClient(auth).video_report("2026-11-09", "2026-11-15")
    assert rows[0]["estimated_revenue_usd"] is None
    assert "estimatedRevenue" not in responses.calls[2].request.url


def test_weekly_tool_breaks_down_costs(store):
    class FakeAnalytics:
        def video_report(self, start, end):
            return [{"video_id": "v1", "views": 1000, "watch_minutes": 50, "avg_view_pct": 60.0, "subs_gained": 3,
                     "estimated_revenue_usd": 1.5, "ctr_pct": None}]

        def titles(self, ids):
            return {"v1": "Budget trap"}

    with freeze_time("2026-11-16 07:00:00"):
        store.add_spend("youtube", "2026-11-12", 3.0)
        store.insert_ledger("tts_cost", -0.5, ref="tts:1", product_id=None, created_at="2026-11-12T10:00:00.000000Z")
        store.insert_ledger("media_cost", -1.0, ref="img:1", product_id=None, created_at="2026-11-12T10:00:00.000000Z")
        out = weekly_analytics_tool(FakeAnalytics())({}, _ctx(store))
    a, c = out["analytics"], out["costs"]
    assert a["period"] == "2026-11-09..2026-11-15"
    assert a["videos"][0]["title"] == "Budget trap"
    assert a["channel_totals"]["views"] == 1000 and a["channel_totals"]["estimated_revenue_usd"] == 1.5
    assert c == {"llm_usd": 1.5, "tts_usd": 0.5, "media_gen_usd": 1.0, "total_usd": 3.0}


def test_oauth_script_builds_offline_consent_url():
    import importlib.util
    spec = importlib.util.spec_from_file_location("youtube_oauth", "scripts/youtube_oauth.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    url = mod.build_auth_url("cid", "http://localhost:8765/", "st")
    assert "access_type=offline" in url and "prompt=consent" in url and "state=st" in url
    assert "youtube.upload" in url and "yt-analytics-monetary.readonly" in url
