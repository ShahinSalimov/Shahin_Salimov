"""YouTube Data API v3, YouTube Analytics API v2 and Google OAuth 2.0 (no Google SDK needed).

Two kinds of credentials (Ayarlar → API):
  * youtube_api_key                         – public data for niche research (search/videos/channels)
  * google_client_id / google_client_secret – OAuth for upload, branding and analytics of YOUR channels

Quota (default 10,000 units/day per Google Cloud project):
  search.list = 100, videos.list / channels.list = 1, videos.insert = 1,600 (≈6 uploads/day),
  thumbnails.set = 50, channels.update = 50.
"""
from __future__ import annotations

import hashlib
import json
import secrets
import time
import urllib.parse
from datetime import date, timedelta
from pathlib import Path

import httpx

from .. import store
from . import ai, db

API = "https://www.googleapis.com/youtube/v3"
UPLOAD = "https://www.googleapis.com/upload/youtube/v3"
ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPES = [
    "https://www.googleapis.com/auth/youtube",           # branding, banner, thumbnails, playlists
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
]
_states: dict[str, tuple[str, float]] = {}


class YTError(RuntimeError):
    pass


def _check(r: httpx.Response, what: str) -> dict:
    if r.status_code >= 400:
        try:
            err = r.json().get("error", {})
            reason = (err.get("errors") or [{}])[0].get("reason", "")
            msg = f"{err.get('message', r.text[:200])} {f'({reason})' if reason else ''}"
        except (ValueError, AttributeError):
            msg = r.text[:300]
        if "quotaExceeded" in msg:
            msg += " — gündəlik YouTube API kvotası bitib, sabah bərpa olunacaq"
        raise YTError(f"{what}: HTTP {r.status_code} {msg}")
    return r.json() if r.content else {}


# =============================== public data (research) ===============================
def _key() -> str:
    k = store.get_keys().get("youtube_api_key", "")
    if not k:
        raise YTError("YouTube API açarı yoxdur (Ayarlar → API → YouTube Data API key)")
    return k


def has_api_key() -> bool:
    return bool(store.get_keys().get("youtube_api_key"))


def search_videos(query: str, *, region: str = "", language: str = "", days: int = 90,
                  max_results: int = 25, duration: str = "any") -> list[dict]:
    """Top videos by views for a keyword in the last `days` days, with channel stats. ≈102 units."""
    after = (date.today() - timedelta(days=days)).isoformat() + "T00:00:00Z"
    params = {"part": "snippet", "q": query, "type": "video", "order": "viewCount", "maxResults": max_results,
              "publishedAfter": after, "videoDuration": duration, "key": _key()}
    if region:
        params["regionCode"] = region
    if language:
        params["relevanceLanguage"] = language
    items = _check(httpx.get(f"{API}/search", params=params, timeout=30), "search").get("items", [])
    ids = [i["id"]["videoId"] for i in items if i.get("id", {}).get("videoId")]
    if not ids:
        return []
    vids = _check(httpx.get(f"{API}/videos", timeout=30, params={
        "part": "snippet,statistics,contentDetails", "id": ",".join(ids), "key": _key()}), "videos").get("items", [])
    ch_ids = sorted({v["snippet"]["channelId"] for v in vids})
    chans = {}
    for i in range(0, len(ch_ids), 50):
        for c in _check(httpx.get(f"{API}/channels", timeout=30, params={
                "part": "statistics,snippet", "id": ",".join(ch_ids[i:i + 50]), "key": _key()}), "channels").get("items", []):
            chans[c["id"]] = c
    out = []
    for v in vids:
        st, sn = v.get("statistics", {}), v["snippet"]
        ch = chans.get(sn["channelId"], {})
        cst = ch.get("statistics", {})
        out.append({
            "video_id": v["id"], "title": sn["title"], "channel_id": sn["channelId"], "channel": sn["channelTitle"],
            "published": sn["publishedAt"], "views": int(st.get("viewCount", 0)), "likes": int(st.get("likeCount", 0)),
            "comments": int(st.get("commentCount", 0)), "seconds": iso_duration(v["contentDetails"].get("duration", "")),
            "subs": int(cst.get("subscriberCount", 0)) if not cst.get("hiddenSubscriberCount") else 0,
            "channel_videos": int(cst.get("videoCount", 0)),
            "channel_created": ch.get("snippet", {}).get("publishedAt", ""),
        })
    return out


def iso_duration(s: str) -> int:
    import re
    m = re.match(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", s or "")
    if not m:
        return 0
    d, h, mi, se = (int(x or 0) for x in m.groups())
    return d * 86400 + h * 3600 + mi * 60 + se


def demo_search(query: str) -> list[dict]:
    """Deterministic fake search results so the whole system works without keys."""
    seed = int(hashlib.md5(query.encode()).hexdigest(), 16)
    out = []
    for i in range(20):
        x = (seed >> (i * 5)) % 997 + 3
        subs = [800, 4_000, 12_000, 45_000, 160_000, 900_000][(x + i) % 6]
        views = int(x * 1_700 * (1 + (i % 4)) * (1.5 if subs < 50_000 else 1))
        out.append({
            "video_id": f"demo{i}{x}", "title": f"{query.title()} — the truth nobody tells you #{i + 1}",
            "channel_id": f"UCdemo{x % 9}", "channel": f"Demo Channel {x % 9}",
            "published": (date.today() - timedelta(days=(x % 85) + 1)).isoformat() + "T12:00:00Z",
            "views": views, "likes": views // 30, "comments": views // 400,
            "seconds": [45, 58, 480, 720, 1260, 600][(x + 2 * i) % 6], "subs": subs,
            "channel_videos": 20 + x % 300,
            "channel_created": (date.today() - timedelta(days=60 + x * 3)).isoformat() + "T00:00:00Z",
        })
    return out


# =============================== OAuth ===============================
def oauth_ready() -> bool:
    k = store.get_keys()
    return bool(k.get("google_client_id") and k.get("google_client_secret"))


def auth_url(cid: str) -> str:
    if not oauth_ready():
        raise YTError("Google OAuth Client ID/Secret daxil edilməyib (Ayarlar → API)")
    state = f"{cid}.{secrets.token_urlsafe(16)}"
    _states[state] = (cid, time.time())
    q = {"client_id": store.get_keys()["google_client_id"], "redirect_uri": db.get_system()["oauth_redirect"],
         "response_type": "code", "scope": " ".join(SCOPES), "access_type": "offline", "prompt": "consent",
         "include_granted_scopes": "true", "state": state}
    return f"{AUTH_URL}?{urllib.parse.urlencode(q)}"


def finish_oauth(code: str, state: str) -> str:
    """Exchange the code, store tokens for the channel, link YouTube channel id. Returns channel id."""
    cid, t = _states.pop(state, ("", 0))
    if not cid or time.time() - t > 900:
        raise YTError("OAuth sessiyası etibarsızdır və ya vaxtı keçib, yenidən qoşulun")
    k = store.get_keys()
    tok = _check(httpx.post(TOKEN_URL, timeout=30, data={
        "code": code, "client_id": k["google_client_id"], "client_secret": k["google_client_secret"],
        "redirect_uri": db.get_system()["oauth_redirect"], "grant_type": "authorization_code"}), "token")
    tok["expires_at"] = time.time() + int(tok.get("expires_in", 3600)) - 60
    db.save_token(cid, tok)
    me = my_channel(cid)
    db.update_channel(cid, lambda c: c["youtube"].update(connected=True, channel_id=me["id"], title=me["title"]))
    db.log(cid, f"YouTube kanalı qoşuldu: {me['title']}")
    return cid


def _access(cid: str) -> str:
    tok = db.get_token(cid)
    if not tok.get("refresh_token") and not tok.get("access_token"):
        raise YTError("Kanal YouTube-a qoşulmayıb (Kanal → Ayarlar → YouTube-a qoş)")
    if time.time() < tok.get("expires_at", 0):
        return tok["access_token"]
    if not tok.get("refresh_token"):
        raise YTError("Token vaxtı keçib, kanalı yenidən qoşun")
    k = store.get_keys()
    new = _check(httpx.post(TOKEN_URL, timeout=30, data={
        "client_id": k["google_client_id"], "client_secret": k["google_client_secret"],
        "refresh_token": tok["refresh_token"], "grant_type": "refresh_token"}), "token refresh")
    tok.update(new)
    tok["expires_at"] = time.time() + int(new.get("expires_in", 3600)) - 60
    db.save_token(cid, tok)
    return tok["access_token"]


def _h(cid: str) -> dict:
    return {"Authorization": f"Bearer {_access(cid)}"}


def is_demo_link(cid: str) -> bool:
    return db.get_token(cid).get("demo", False)


def connect_demo(cid: str) -> None:
    db.save_token(cid, {"demo": True})
    db.update_channel(cid, lambda c: c["youtube"].update(connected=True, channel_id="UCdemo" + cid, title=c["name"] + " (demo)"))
    db.log(cid, "Demo YouTube kanalı qoşuldu (real yükləmə olmayacaq)")


def disconnect(cid: str) -> None:
    db.save_token(cid, {})
    db.update_channel(cid, lambda c: c["youtube"].update(connected=False, channel_id="", title=""))


def my_channel(cid: str) -> dict:
    if is_demo_link(cid):
        ch = db.get_channel(cid)
        return {"id": "UCdemo" + cid, "title": ch["name"], "subs": 0, "views": 0, "videos": 0}
    items = _check(httpx.get(f"{API}/channels", headers=_h(cid), timeout=30,
                             params={"part": "snippet,statistics,brandingSettings", "mine": "true"}), "channels").get("items", [])
    if not items:
        raise YTError("Bu Google hesabında YouTube kanalı yoxdur. Əvvəlcə youtube.com-da kanal yaradın.")
    c = items[0]
    st = c.get("statistics", {})
    return {"id": c["id"], "title": c["snippet"]["title"], "subs": int(st.get("subscriberCount", 0)),
            "views": int(st.get("viewCount", 0)), "videos": int(st.get("videoCount", 0)),
            "branding": c.get("brandingSettings", {})}


# =============================== channel branding ===============================
def sync_branding(cid: str, description: str, keywords: list[str], banner: Path | None) -> str:
    """Sets channel description, keywords and banner. (Name and avatar cannot be changed via API.)"""
    if is_demo_link(cid):
        return "demo: brendinq sinxronlaşdırıldı"
    me = my_channel(cid)
    branding = me.get("branding") or {}
    chan = branding.get("channel", {})
    chan["description"] = description[:1000]
    chan["keywords"] = " ".join(f'"{k}"' if " " in k else k for k in keywords)[:500]
    body = {"id": me["id"], "brandingSettings": {**branding, "channel": chan}}
    if banner and banner.exists():
        r = httpx.post(f"{UPLOAD}/channelBanners/insert", headers={**_h(cid), "Content-Type": "image/jpeg"},
                       content=_jpeg(banner, max_bytes=6_000_000, size=(2560, 1440)), timeout=120)
        url = _check(r, "banner").get("url")
        if url:
            body["brandingSettings"]["image"] = {"bannerExternalUrl": url}
    _check(httpx.put(f"{API}/channels", params={"part": "brandingSettings"}, headers=_h(cid), json=body, timeout=60),
           "channels.update")
    return "Təsvir, açar sözlər və banner YouTube-a yazıldı"


def _jpeg(path: Path, max_bytes: int, size: tuple[int, int] | None = None) -> bytes:
    import io

    from PIL import Image
    im = Image.open(path).convert("RGB")
    if size:
        # cover-crop to the exact size
        tw, th = size
        scale = max(tw / im.width, th / im.height)
        im = im.resize((int(im.width * scale + 1), int(im.height * scale + 1)))
        left, top = (im.width - tw) // 2, (im.height - th) // 2
        im = im.crop((left, top, left + tw, top + th))
    for q in (92, 85, 75, 65, 50):
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=q)
        if buf.tell() <= max_bytes:
            return buf.getvalue()
    return buf.getvalue()


# =============================== upload ===============================
def upload_video(cid: str, video: Path, *, title: str, description: str, tags: list[str], publish_at: str = "",
                 privacy: str = "public", category_id: str = "22", language: str = "", thumbnail: Path | None = None,
                 progress=lambda pct: None) -> dict:
    """Resumable upload. With publish_at (RFC3339 UTC) the video is private until that moment."""
    if is_demo_link(cid) or ai.demo():
        progress(100)
        return {"id": "demo_" + hashlib.md5(f"{cid}{title}{time.time()}".encode()).hexdigest()[:11],
                "url": "", "demo": True}
    status = {"privacyStatus": "private" if publish_at else privacy, "selfDeclaredMadeForKids": False,
              "containsSyntheticMedia": True, "embeddable": True}
    if publish_at:
        status["publishAt"] = publish_at
    snippet = {"title": title[:100], "description": description[:5000], "tags": tags[:30], "categoryId": category_id}
    if language:
        snippet["defaultLanguage"] = snippet["defaultAudioLanguage"] = language
    size = video.stat().st_size
    init = httpx.post(f"{UPLOAD}/videos", params={"uploadType": "resumable", "part": "snippet,status"},
                      headers={**_h(cid), "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": str(size)},
                      json={"snippet": snippet, "status": status}, timeout=60)
    _check(init, "videos.insert")
    loc = init.headers.get("Location")
    if not loc:
        raise YTError("Upload URL alınmadı")
    chunk = 16 * 1024 * 1024
    sent, result = 0, None
    with video.open("rb") as f:
        while sent < size:
            data = f.read(chunk)
            end = sent + len(data) - 1
            for attempt in range(5):
                try:
                    r = httpx.put(loc, content=data, timeout=600, headers={
                        **_h(cid), "Content-Length": str(len(data)), "Content-Range": f"bytes {sent}-{end}/{size}"})
                    break
                except httpx.HTTPError:
                    if attempt == 4:
                        raise
                    time.sleep(2 ** attempt)
            if r.status_code == 308:
                rng = r.headers.get("Range", "")
                sent = int(rng.split("-")[-1]) + 1 if rng else 0
                f.seek(sent)
            else:
                result = _check(r, "upload")
                sent = size
            progress(int(100 * sent / size))
    vid = (result or {}).get("id")
    if not vid:
        raise YTError("YouTube video ID qaytarmadı")
    out = {"id": vid, "url": f"https://youtu.be/{vid}"}
    if thumbnail and thumbnail.exists():
        try:
            _check(httpx.post(f"{UPLOAD}/thumbnails/set", params={"videoId": vid}, timeout=120,
                              headers={**_h(cid), "Content-Type": "image/jpeg"},
                              content=_jpeg(thumbnail, 2_000_000, (1280, 720))), "thumbnail")
            out["thumbnail"] = True
        except YTError as e:  # custom thumbnails need a phone-verified channel
            out["thumbnail_error"] = str(e)
    return out


# =============================== analytics ===============================
def analytics(cid: str, start: date, end: date, metrics: str, dimensions: str = "", sort: str = "",
              max_results: int = 0, filters: str = "") -> list[dict]:
    p = {"ids": "channel==MINE", "startDate": start.isoformat(), "endDate": end.isoformat(), "metrics": metrics}
    if dimensions:
        p["dimensions"] = dimensions
    if sort:
        p["sort"] = sort
    if max_results:
        p["maxResults"] = max_results
    if filters:
        p["filters"] = filters
    data = _check(httpx.get(ANALYTICS, params=p, headers=_h(cid), timeout=60), "analytics")
    cols = [h["name"] for h in data.get("columnHeaders", [])]
    return [dict(zip(cols, row)) for row in data.get("rows", []) or []]


def video_stats(cid: str, ids: list[str]) -> dict[str, dict]:
    out = {}
    for i in range(0, len(ids), 50):
        items = _check(httpx.get(f"{API}/videos", headers=_h(cid), timeout=30, params={
            "part": "statistics,status", "id": ",".join(ids[i:i + 50])}), "videos").get("items", [])
        for v in items:
            st = v.get("statistics", {})
            out[v["id"]] = {"views": int(st.get("viewCount", 0)), "likes": int(st.get("likeCount", 0)),
                            "comments": int(st.get("commentCount", 0)),
                            "privacy": v.get("status", {}).get("privacyStatus", "")}
    return out


def dumps(x) -> str:
    return json.dumps(x, ensure_ascii=False)
