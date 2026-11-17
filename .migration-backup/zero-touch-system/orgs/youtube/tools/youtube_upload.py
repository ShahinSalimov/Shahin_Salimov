"""OAuth2 refresh flow, resumable videos.insert and thumbnails.set; idempotent by topic_key.

Rules enforced in code, whatever the SEO agent returned:
- ``privacyStatus`` is always ``private`` with a ``publishAt`` at least 2 hours in the future
  (scheduled publishing). Videos from API projects that Google has not audited stay private anyway.
- ``containsSyntheticMedia`` is true if the render flagged AI-generated realistic media; the SEO agent
  can raise it but never lower it.
- Longform chapters are written into the description (YouTube reads chapters from there).
- A custom thumbnail needs a verified channel; a 403 there is tolerated and reported.
Pinning a comment is not possible through the API, so the suggested pinned comment is sent to
WhatsApp for manual posting.
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Protocol

import requests

from core.tools import ToolContext
from orgs.youtube.tools.google import GoogleApiError, GoogleAuth, QuotaTracker, check_response

log = logging.getLogger(__name__)
UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos"
THUMBNAIL_URL = "https://www.googleapis.com/upload/youtube/v3/thumbnails/set"
THUMBNAIL_COST = 50
MIN_LEAD = timedelta(hours=2)


class Uploader(Protocol):
    def upload(self, video_path: str, *, snippet: dict, status: dict) -> dict[str, Any]: ...

    def set_thumbnail(self, video_id: str, image_path: str) -> bool: ...


class YouTubeUploader:
    def __init__(self, auth: GoogleAuth, quota: QuotaTracker, upload_cost: int, timeout: float = 600.0):
        self.auth, self.quota, self.upload_cost, self.timeout = auth, quota, upload_cost, timeout

    def upload(self, video_path: str, *, snippet: dict, status: dict) -> dict[str, Any]:
        self.quota.charge(self.upload_cost)
        size = Path(video_path).stat().st_size
        try:
            init = requests.post(UPLOAD_URL, params={"uploadType": "resumable", "part": "snippet,status"},
                                 headers={**self.auth.headers(), "Content-Type": "application/json; charset=UTF-8",
                                          "X-Upload-Content-Type": "video/mp4",
                                          "X-Upload-Content-Length": str(size)},
                                 data=json.dumps({"snippet": snippet, "status": status}), timeout=60)
            check_response(init, "youtube upload init")
            session = init.headers["Location"]
            with open(video_path, "rb") as f:
                res = requests.put(session, data=f, headers={"Content-Type": "video/mp4"}, timeout=self.timeout)
        except requests.RequestException as e:
            raise GoogleApiError(f"youtube upload: {type(e).__name__}") from None
        body = check_response(res, "youtube upload")
        return {"video_id": body["id"], "url": f"https://youtu.be/{body['id']}",
                "privacy": body.get("status", {}).get("privacyStatus")}

    def set_thumbnail(self, video_id: str, image_path: str) -> bool:
        self.quota.charge(THUMBNAIL_COST)
        with open(image_path, "rb") as f:
            res = requests.post(THUMBNAIL_URL, params={"videoId": video_id},
                                headers={**self.auth.headers(), "Content-Type": "image/png"}, data=f, timeout=120)
        if res.status_code == 403:
            log.warning("custom thumbnail refused (channel not verified for custom thumbnails?)")
            return False
        check_response(res, "youtube thumbnail")
        return True


class FakeUploader:
    """Records uploads instead of sending them (tests, dry runs)."""

    def __init__(self) -> None:
        self.uploads: list[dict[str, Any]] = []

    def upload(self, video_path: str, *, snippet: dict, status: dict) -> dict[str, Any]:
        vid = "fake-" + hashlib.sha256(f"{video_path}{snippet.get('title')}".encode()).hexdigest()[:11]
        self.uploads.append({"video_path": video_path, "snippet": snippet, "status": status, "video_id": vid})
        return {"video_id": vid, "url": f"https://youtu.be/{vid}", "privacy": status.get("privacyStatus")}

    def set_thumbnail(self, video_id: str, image_path: str) -> bool:
        return True


def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def _fmt(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def safe_publish_at(requested: str | None) -> str:
    earliest = datetime.now(timezone.utc) + MIN_LEAD
    try:
        when = _parse(requested) if requested else earliest
    except ValueError:
        when = earliest
    return _fmt(max(when, earliest).replace(microsecond=0))


def youtube_upload_tool(uploader: Uploader):
    def upload(payload: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
        seo, render, topic_key = payload["seo"], payload["render_result"], payload["topic_key"]
        if ctx.store.video_topic_exists(topic_key):
            return {"status": "rejected", "errors": [f"duplicate video topic {topic_key!r}"]}
        snippet = dict(seo["snippet"])
        if payload.get("format") == "longform" and seo.get("chapters"):
            chapters = "\n".join(f"{c['time']} {c['label']}" for c in seo["chapters"])
            snippet["description"] = f"{snippet['description']}\n\n{chapters}"
        sb = seo["status_block"]
        status = {"privacyStatus": "private", "publishAt": safe_publish_at(sb.get("publishAt")),
                  "selfDeclaredMadeForKids": bool(sb.get("selfDeclaredMadeForKids")),
                  "containsSyntheticMedia": bool(sb.get("containsSyntheticMedia"))
                  or bool(render.get("ai_disclosure_required"))}
        result = uploader.upload(render["video_path"], snippet=snippet, status=status)
        thumb_ok = uploader.set_thumbnail(result["video_id"], render["thumbnail_path"]) \
            if render.get("thumbnail_path") else False
        ctx.store.insert_video(id=result["video_id"], run_id=ctx.run_id, title=snippet["title"], topic_key=topic_key,
                               youtube_video_id=result["video_id"], publish_at=status["publishAt"], status="scheduled")
        return {"status": "ok", **result, "title": snippet["title"], "publish_at": status["publishAt"],
                "contains_synthetic_media": status["containsSyntheticMedia"], "thumbnail_set": thumb_ok,
                "pinned_comment": seo.get("pinned_comment")}

    return upload
