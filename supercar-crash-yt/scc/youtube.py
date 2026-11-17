"""YouTube Data API v3 client: OAuth refresh, resumable upload, thumbnail, playlists, channel stats.

Notes that matter in practice:
- Default flow (PUBLISH_MODE=private): the video is uploaded as private and the channel owner makes
  it public in YouTube Studio. Google documents that uploads from an API project that has not passed
  the YouTube API audit are restricted to private; test one upload and check Studio lets you publish.
- ``status.publishAt`` only works together with ``privacyStatus=private``; YouTube then publishes the
  video itself at that time.
- ``status.containsSyntheticMedia=True`` is YouTube's "altered or synthetic content" disclosure.
- Custom thumbnails need a phone-verified channel; a failed thumbnail does not fail the upload.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from pathlib import Path

import requests

TOKEN_URL = "https://oauth2.googleapis.com/token"
API = "https://www.googleapis.com/youtube/v3"
UPLOAD_API = "https://www.googleapis.com/upload/youtube/v3"
SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube"]
CHUNK = 8 * 1024 * 1024    # multiple of 256 KiB as the resumable protocol requires

COST = {"list": 1, "playlist_insert": 50, "playlist_item_insert": 50, "thumbnail": 50}


class YouTubeError(Exception):
    pass


class QuotaExceeded(YouTubeError):
    pass


class Quota:
    """Tracks units used per Pacific-time day approximation (UTC day; conservative)."""

    def __init__(self, store, daily_limit: int):
        self.store, self.limit = store, daily_limit

    def _key(self) -> str:
        return "quota:" + datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def used(self) -> int:
        return int(self.store.get_control(self._key(), 0))

    def charge(self, units: int) -> None:
        used = self.used()
        if used + units > self.limit:
            raise QuotaExceeded(f"need {units} quota units, {self.limit - used} left today")
        self.store.set_control(self._key(), used + units)


class YouTube:
    def __init__(self, client_id: str, client_secret: str, refresh_token: str, quota: Quota,
                 upload_cost: int = 1600, session: requests.Session | None = None):
        self._cid, self._secret, self._refresh = client_id, client_secret, refresh_token
        self.quota, self.upload_cost = quota, upload_cost
        self.http = session or requests.Session()
        self._token, self._expires = None, 0.0

    def __repr__(self) -> str:
        return "YouTube(<credentials hidden>)"

    # -- auth --------------------------------------------------------------------
    def _headers(self) -> dict:
        if not self._token or time.monotonic() > self._expires - 60:
            r = self.http.post(TOKEN_URL, data={"client_id": self._cid, "client_secret": self._secret,
                                                "refresh_token": self._refresh, "grant_type": "refresh_token"},
                               timeout=30)
            body = r.json() if r.content else {}
            if r.status_code != 200 or "access_token" not in body:
                raise YouTubeError(f"OAuth refresh failed ({body.get('error', r.status_code)}); "
                                   "run scripts/get_refresh_token.py again")
            self._token = body["access_token"]
            self._expires = time.monotonic() + int(body.get("expires_in", 3600))
        return {"Authorization": f"Bearer {self._token}"}

    @staticmethod
    def _check(r: requests.Response, what: str) -> dict:
        if r.status_code >= 400:
            try:
                msg = r.json().get("error", {}).get("message", "")
            except ValueError:
                msg = r.text[:200]
            raise YouTubeError(f"{what}: HTTP {r.status_code} {msg}".strip())
        return r.json() if r.content else {}

    # -- upload ------------------------------------------------------------------
    @staticmethod
    def video_body(meta: dict, publish_at: datetime | None, privacy: str = "private") -> dict:
        status = {"privacyStatus": "private" if publish_at else privacy,
                  "selfDeclaredMadeForKids": bool(meta.get("made_for_kids", False)),
                  "containsSyntheticMedia": bool(meta.get("contains_synthetic_media", True)),
                  "embeddable": True, "license": "youtube"}
        if publish_at:
            status["publishAt"] = publish_at.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        return {"snippet": {"title": meta["title"], "description": meta["description"], "tags": meta["tags"],
                            "categoryId": meta.get("category_id", "2"),
                            "defaultLanguage": meta.get("language", "en"),
                            "defaultAudioLanguage": meta.get("language", "en")},
                "status": status}

    def upload(self, path: Path, meta: dict, publish_at: datetime | None, privacy: str = "private") -> str:
        path = Path(path)
        size = path.stat().st_size
        self.quota.charge(self.upload_cost)
        r = self.http.post(f"{UPLOAD_API}/videos", params={"uploadType": "resumable", "part": "snippet,status"},
                           headers={**self._headers(), "Content-Type": "application/json; charset=UTF-8",
                                    "X-Upload-Content-Length": str(size), "X-Upload-Content-Type": "video/*"},
                           json=self.video_body(meta, publish_at, privacy), timeout=60)
        self._check(r, "start upload")
        session_url = r.headers.get("Location")
        if not session_url:
            raise YouTubeError("upload session URL missing")
        offset, retries = 0, 0
        with path.open("rb") as fh:
            while offset < size:
                fh.seek(offset)
                chunk = fh.read(CHUNK)
                end = offset + len(chunk) - 1
                try:
                    r = self.http.put(session_url, data=chunk, timeout=300,
                                      headers={**self._headers(), "Content-Length": str(len(chunk)),
                                               "Content-Range": f"bytes {offset}-{end}/{size}"})
                except requests.RequestException:
                    r = None
                if r is not None and r.status_code in (200, 201):
                    return self._check(r, "upload")["id"]
                if r is not None and r.status_code == 308:
                    rng = r.headers.get("Range")
                    offset = int(rng.split("-")[1]) + 1 if rng else 0
                    retries = 0
                    continue
                if r is not None and r.status_code < 500 and r.status_code != 429:
                    self._check(r, "upload chunk")
                retries += 1
                if retries > 5:
                    raise YouTubeError("upload failed after 5 retries")
                time.sleep(min(2 ** retries, 30))
                offset = self._resume_offset(session_url, size)
        raise YouTubeError("upload ended without a video id")

    def _resume_offset(self, session_url: str, size: int) -> int:
        r = self.http.put(session_url, headers={**self._headers(), "Content-Range": f"bytes */{size}"}, timeout=60)
        rng = r.headers.get("Range") if r.status_code == 308 else None
        return int(rng.split("-")[1]) + 1 if rng else 0

    def set_thumbnail(self, video_id: str, image: Path) -> None:
        self.quota.charge(COST["thumbnail"])
        ctype = "image/png" if str(image).lower().endswith(".png") else "image/jpeg"
        r = self.http.post(f"{UPLOAD_API}/thumbnails/set", params={"videoId": video_id},
                           headers={**self._headers(), "Content-Type": ctype}, data=Path(image).read_bytes(), timeout=120)
        self._check(r, "thumbnail")

    # -- playlists ----------------------------------------------------------------
    def create_playlist(self, title: str) -> str:
        self.quota.charge(COST["playlist_insert"])
        r = self.http.post(f"{API}/playlists", params={"part": "snippet,status"}, headers=self._headers(),
                           json={"snippet": {"title": title, "description": f"{title} - AI supercar crash simulations."},
                                 "status": {"privacyStatus": "public"}}, timeout=30)
        return self._check(r, "create playlist")["id"]

    def add_to_playlist(self, playlist_id: str, video_id: str) -> None:
        self.quota.charge(COST["playlist_item_insert"])
        r = self.http.post(f"{API}/playlistItems", params={"part": "snippet"}, headers=self._headers(),
                           json={"snippet": {"playlistId": playlist_id,
                                             "resourceId": {"kind": "youtube#video", "videoId": video_id}}}, timeout=30)
        self._check(r, "add to playlist")

    # -- stats --------------------------------------------------------------------
    def channel_stats(self) -> dict:
        self.quota.charge(COST["list"])
        r = self.http.get(f"{API}/channels", params={"part": "statistics,snippet", "mine": "true"},
                          headers=self._headers(), timeout=30)
        items = self._check(r, "channel stats").get("items") or []
        if not items:
            raise YouTubeError("no channel on this Google account")
        st = items[0]["statistics"]
        return {"title": items[0]["snippet"]["title"], "subscribers": int(st.get("subscriberCount", 0)),
                "views": int(st.get("viewCount", 0)), "videos": int(st.get("videoCount", 0)),
                "hidden": bool(st.get("hiddenSubscriberCount", False))}
