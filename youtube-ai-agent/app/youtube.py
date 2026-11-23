"""Connect YouTube channels (Google OAuth) and upload videos + thumbnails (YouTube Data API v3).

Setup (once): Google Cloud project -> enable "YouTube Data API v3" -> OAuth consent screen
(External, add yourself as a test user) -> Credentials -> OAuth client ID -> type "Desktop app".
Put the client ID and secret into Settings -> API. Desktop clients accept http://127.0.0.1:<port> redirects.
"""
from __future__ import annotations

import io
import secrets
import time
from datetime import datetime, timedelta
from pathlib import Path

import httpx

from . import store

AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN = "https://oauth2.googleapis.com/token"
API = "https://www.googleapis.com/youtube/v3"
UPLOAD = "https://www.googleapis.com/upload/youtube/v3"
SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly"
CHUNK = 16 * 1024 * 1024  # must be a multiple of 256 KiB
_states: dict[str, tuple[str, str, float]] = {}


class YouTubeError(RuntimeError):
    pass


def _tokens() -> dict:
    return store._read(store.DATA / "youtube_tokens.json", {})


def _save_tokens(t: dict) -> None:
    store._write(store.DATA / "youtube_tokens.json", t)


def _client() -> tuple[str, str]:
    k = store.get_keys()
    if not k.get("yt_client_id") or not k.get("yt_client_secret"):
        raise YouTubeError("Google OAuth client ID və secret daxil edilməyib (Ayarlar → API → YouTube yükləmə)")
    return k["yt_client_id"], k["yt_client_secret"]


# ---------------- OAuth ----------------
def auth_url(cid: str, redirect_uri: str) -> str:
    client_id, _ = _client()
    state = secrets.token_urlsafe(24)
    _states[state] = (cid, redirect_uri, time.time())
    q = httpx.QueryParams({"client_id": client_id, "redirect_uri": redirect_uri, "response_type": "code",
                           "scope": SCOPES, "access_type": "offline", "prompt": "consent select_account",
                           "include_granted_scopes": "true", "state": state})
    return f"{AUTH}?{q}"


def finish_auth(code: str, state: str) -> tuple[str, dict]:
    """Exchange the code, find which YouTube channel was chosen, store tokens. Returns (cid, channel info)."""
    if state not in _states or time.time() - _states[state][2] > 900:
        raise YouTubeError("Bağlantı sessiyası köhnəlib. Proqramda 'YouTube-a bağla' düyməsini yenidən basın.")
    cid, redirect_uri, _ = _states.pop(state)
    client_id, secret = _client()
    r = httpx.post(TOKEN, data={"code": code, "client_id": client_id, "client_secret": secret,
                                "redirect_uri": redirect_uri, "grant_type": "authorization_code"}, timeout=30)
    if r.status_code >= 400:
        raise YouTubeError(f"Google token xətası {r.status_code}: {r.text[:300]}")
    tok = r.json()
    if not tok.get("refresh_token"):
        raise YouTubeError("Google refresh token vermədi. myaccount.google.com → Security → Third-party access-dən "
                           "tətbiqə verilən icazəni silib yenidən bağlayın.")
    tok["expires_at"] = time.time() + int(tok.get("expires_in", 3600)) - 60
    info = _get("channels", {"part": "snippet", "mine": "true"}, tok["access_token"]).get("items", [])
    if not info:
        raise YouTubeError("Bu Google hesabında YouTube kanalı tapılmadı. Əvvəlcə kanalı yaradın.")
    ch = {"channel_id": info[0]["id"], "title": info[0]["snippet"]["title"], "connected_at": time.time()}
    with store._lock:
        t = _tokens()
        t[cid] = {"refresh_token": tok["refresh_token"], "access_token": tok["access_token"],
                  "expires_at": tok["expires_at"], **ch}
        _save_tokens(t)
    return cid, ch


def disconnect(cid: str) -> None:
    with store._lock:
        t = _tokens()
        tok = t.pop(cid, None)
        _save_tokens(t)
    if tok:
        try:
            httpx.post("https://oauth2.googleapis.com/revoke", data={"token": tok["refresh_token"]}, timeout=15)
        except httpx.HTTPError:
            pass


def is_connected(cid: str) -> bool:
    return cid in _tokens()


def access_token(cid: str, force: bool = False) -> str:
    t = _tokens().get(cid)
    if not t:
        raise YouTubeError("Kanal YouTube-a bağlanmayıb (Kanallarım → kanal → YouTube bağlantısı)")
    if not force and t.get("expires_at", 0) > time.time():
        return t["access_token"]
    client_id, secret = _client()
    r = httpx.post(TOKEN, data={"client_id": client_id, "client_secret": secret,
                                "refresh_token": t["refresh_token"], "grant_type": "refresh_token"}, timeout=30)
    if r.status_code >= 400:
        raise YouTubeError("Google icazəsi etibarsızdır, kanalı yenidən bağlayın. "
                           "(OAuth ekranı 'Testing' rejimindədirsə, icazə 7 gündən sonra bitir.) " + r.text[:200])
    d = r.json()
    with store._lock:
        all_t = _tokens()
        all_t[cid].update(access_token=d["access_token"], expires_at=time.time() + int(d.get("expires_in", 3600)) - 60)
        _save_tokens(all_t)
    return d["access_token"]


def _get(path: str, params: dict, token: str) -> dict:
    r = httpx.get(f"{API}/{path}", params=params, headers={"Authorization": f"Bearer {token}"}, timeout=30)
    if r.status_code >= 400:
        raise YouTubeError(f"YouTube API xətası {r.status_code}: {r.text[:300]}")
    return r.json()


# ---------------- upload ----------------
def next_publish_at(hhmm: str, now: datetime | None = None) -> str:
    """Next occurrence of local HH:MM (at least 1 hour away) as RFC3339 UTC."""
    now = now or datetime.now().astimezone()
    h, m = (int(x) for x in hhmm.split(":"))
    t = now.replace(hour=h, minute=m, second=0, microsecond=0)
    if t < now + timedelta(hours=1):
        t += timedelta(days=1)
    return t.isoformat(timespec="seconds")


def build_body(meta: dict, opts: dict, language_code: str = "") -> dict:
    clean = lambda s: (s or "").replace("<", "").replace(">", "")  # noqa: E731 - YouTube rejects angle brackets
    title = clean(meta.get("title")).strip()[:100] or "Untitled"
    tags, total = [], 0
    for t in meta.get("tags", []):
        t = clean(str(t)).strip()
        cost = len(t) + (2 if " " in t else 0) + (1 if tags else 0)
        if t and total + cost <= 470:
            tags.append(t)
            total += cost
    snippet = {"title": title, "description": clean(meta.get("description"))[:5000], "tags": tags,
               "categoryId": str(opts.get("category_id") or "22")}
    if language_code:
        snippet["defaultLanguage"] = snippet["defaultAudioLanguage"] = language_code
    status = {"privacyStatus": opts.get("privacy") or "private",
              "selfDeclaredMadeForKids": bool(opts.get("made_for_kids")),
              "containsSyntheticMedia": bool(opts.get("synthetic", True))}
    if opts.get("publish_at"):  # scheduled videos must be private until publishAt
        status["privacyStatus"] = "private"
        status["publishAt"] = opts["publish_at"]
    return {"snippet": snippet, "status": status}


def upload_video(cid: str, video: Path, body: dict, progress=lambda pct, msg: None,
                 should_stop=lambda: False) -> str:
    """Resumable upload. Returns the YouTube video id."""
    size = video.stat().st_size
    tok = access_token(cid)
    init = httpx.post(f"{UPLOAD}/videos", params={"uploadType": "resumable", "part": "snippet,status"}, json=body,
                      headers={"Authorization": f"Bearer {tok}", "X-Upload-Content-Type": "video/mp4",
                               "X-Upload-Content-Length": str(size)}, timeout=60)
    if init.status_code == 401:
        tok = access_token(cid, force=True)
        init = httpx.post(f"{UPLOAD}/videos", params={"uploadType": "resumable", "part": "snippet,status"},
                          json=body, headers={"Authorization": f"Bearer {tok}", "X-Upload-Content-Type": "video/mp4",
                                              "X-Upload-Content-Length": str(size)}, timeout=60)
    if init.status_code >= 400:
        txt = init.text[:400]
        if "quota" in txt.lower():
            raise YouTubeError("YouTube API gündəlik kvotası bitib (bir yükləmə ≈1600 vahid, gündə 10 000). Sabah davam edin.")
        if "uploadLimitExceeded" in txt:
            raise YouTubeError("Kanalın gündəlik yükləmə limiti dolub. Bir neçə saat sonra cəhd edin.")
        raise YouTubeError(f"Yükləmə başlamadı {init.status_code}: {txt}")
    location = init.headers["Location"]
    offset, fails = 0, 0
    with video.open("rb") as f:
        while True:
            if should_stop():
                raise YouTubeError("Dayandırıldı")
            f.seek(offset)
            chunk = f.read(CHUNK)
            end = offset + len(chunk) - 1
            try:
                r = httpx.put(location, content=chunk, timeout=900,
                              headers={"Authorization": f"Bearer {tok}", "Content-Range": f"bytes {offset}-{end}/{size}"})
            except httpx.HTTPError as e:
                r, err = None, str(e)
            if r is not None and r.status_code in (200, 201):
                progress(100, "Yükləndi")
                return r.json()["id"]
            if r is not None and r.status_code == 308:
                rng = r.headers.get("Range")
                offset = int(rng.split("-")[1]) + 1 if rng else 0
                fails = 0
                progress(100 * offset / size, f"YouTube-a yüklənir: {offset // 1048576}/{size // 1048576 + 1} MB")
                continue
            if r is not None and r.status_code == 401:
                tok = access_token(cid, force=True)
                continue
            if r is not None and r.status_code < 500:
                raise YouTubeError(f"Yükləmə xətası {r.status_code}: {r.text[:300]}")
            fails += 1  # 5xx or network: ask the server where to resume
            if fails > 6:
                raise YouTubeError(f"Yükləmə dəfələrlə kəsildi: {err if r is None else r.status_code}")
            time.sleep(min(60, 2 ** fails))
            q = httpx.put(location, headers={"Authorization": f"Bearer {tok}", "Content-Range": f"bytes */{size}"},
                          timeout=60)
            if q.status_code in (200, 201):
                return q.json()["id"]
            rng = q.headers.get("Range") if q.status_code == 308 else None
            offset = int(rng.split("-")[1]) + 1 if rng else 0


def thumbnail_jpeg(src: Path) -> bytes:
    """1280x720 JPEG under 2 MB (YouTube thumbnail limits)."""
    from PIL import Image

    im = Image.open(src).convert("RGB")
    w, h = im.size
    target = 16 / 9
    if w / h > target:
        nw = int(h * target)
        im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = int(w / target)
        im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    im = im.resize((1280, 720))
    for q in (92, 85, 75, 65):
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=q)
        if buf.tell() < 2_000_000:
            return buf.getvalue()
    return buf.getvalue()


def set_thumbnail(cid: str, video_id: str, image: Path) -> None:
    data = thumbnail_jpeg(image)
    r = httpx.post(f"{UPLOAD}/thumbnails/set", params={"videoId": video_id, "uploadType": "media"}, content=data,
                   headers={"Authorization": f"Bearer {access_token(cid)}", "Content-Type": "image/jpeg"}, timeout=120)
    if r.status_code >= 400:
        hint = " Kanalda telefon təsdiqi lazımdır: youtube.com/verify" if r.status_code == 403 else ""
        raise YouTubeError(f"Thumbnail qoyulmadı {r.status_code}: {r.text[:200]}.{hint}")
