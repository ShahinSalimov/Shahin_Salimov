"""YouTube Data API v3: connect the channel once (OAuth desktop flow) and upload privately.

Follows developers.google.com/youtube/v3/guides/uploading_a_video: InstalledAppFlow.run_local_server,
resumable videos.insert, thumbnails.set, captions.insert.
"""
from __future__ import annotations

import time
from pathlib import Path

from . import config

SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.force-ssl",   # captions
    "https://www.googleapis.com/auth/youtube.readonly",    # show the connected channel name
]
LANG_CODES = {"english": "en", "azerbaijani": "az", "turkish": "tr", "russian": "ru",
              "german": "de", "french": "fr", "spanish": "es"}


class YouTubeError(RuntimeError):
    pass


def client_secret_path() -> Path:
    return config.DATA / "client_secret.json"


def token_path() -> Path:
    return config.DATA / "token.json"


# ---------------- fake client for tests ----------------
class _Fake:
    calls: list[tuple] = []
    fail_thumbnail = False
    connected = True


FAKE = _Fake


# ---------------- auth ----------------
def _credentials():
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials

    if not token_path().exists():
        return None
    creds = Credentials.from_authorized_user_file(str(token_path()), SCOPES)
    if creds.valid:
        return creds
    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
        except Exception:  # noqa: BLE001 - revoked/expired refresh token
            return None
        token_path().write_text(creds.to_json(), encoding="utf-8")
        return creds
    return None


def _service():
    if config.FAKE:
        if not FAKE.connected:
            raise YouTubeError("YouTube hesabı qoşulmayıb (Ayarlar → YouTube → Kanalı qoş)")
        return None
    creds = _credentials()
    if not creds:
        raise YouTubeError("YouTube hesabı qoşulmayıb və ya giriş vaxtı bitib (Ayarlar → YouTube → Kanalı qoş)")
    from googleapiclient.discovery import build
    return build("youtube", "v3", credentials=creds, cache_discovery=False)


def connect() -> dict:
    """Opens the browser for Google sign-in, stores the token, returns the channel."""
    if config.FAKE:
        FAKE.connected = True
        return {"title": "Fake Channel"}
    if not client_secret_path().exists():
        raise YouTubeError("Əvvəlcə Google Cloud-dan yüklədiyiniz client_secret.json faylını əlavə edin")
    from google_auth_oauthlib.flow import InstalledAppFlow
    flow = InstalledAppFlow.from_client_secrets_file(str(client_secret_path()), SCOPES)
    creds = flow.run_local_server(port=0, prompt="consent", open_browser=True)
    token_path().parent.mkdir(parents=True, exist_ok=True)
    token_path().write_text(creds.to_json(), encoding="utf-8")
    return channel() or {"title": "?"}


def channel() -> dict | None:
    if config.FAKE:
        return {"title": "Fake Channel"} if FAKE.connected else None
    try:
        yt = _service()
    except YouTubeError:
        return None
    items = yt.channels().list(part="snippet", mine=True).execute().get("items") or []
    return {"title": items[0]["snippet"]["title"], "id": items[0]["id"]} if items else {"title": "(kanal yoxdur)"}


def disconnect() -> None:
    token_path().unlink(missing_ok=True)
    if config.FAKE:
        FAKE.connected = False


# ---------------- uploads ----------------
def video_body(meta: dict, settings: dict) -> dict:
    return {
        "snippet": {
            "title": meta["title"][:100],
            "description": meta.get("description", "")[:4900],
            "tags": meta.get("tags", [])[:30],
            "categoryId": str(settings["category_id"]),
            "defaultLanguage": LANG_CODES.get(settings["language"].lower(), "en"),
        },
        "status": {
            "privacyStatus": "private",           # Şahin publishes manually from YouTube Studio
            "selfDeclaredMadeForKids": False,
            "containsSyntheticMedia": True,       # realistic AI visuals must be disclosed
        },
    }


def upload(video: Path, meta: dict, settings: dict, progress=lambda pct: None) -> str:
    body = video_body(meta, settings)
    yt = _service()
    if config.FAKE:
        FAKE.calls.append(("upload", str(video), body))
        return f"fake{len(FAKE.calls)}"
    from googleapiclient.errors import HttpError
    from googleapiclient.http import MediaFileUpload

    req = yt.videos().insert(part="snippet,status", body=body,
                             media_body=MediaFileUpload(str(video), chunksize=8 * 1024 * 1024, resumable=True))
    response, retries = None, 0
    while response is None:
        try:
            status, response = req.next_chunk()
            if status:
                progress(status.progress() * 100)
        except HttpError as e:
            if e.resp.status in (500, 502, 503, 504) and retries < 5:
                retries += 1
                time.sleep(2 ** retries)
                continue
            if e.resp.status == 403 and "quota" in str(e).lower():
                raise YouTubeError("YouTube gündəlik yükləmə limiti doldu, sabah yenidən cəhd edin") from e
            raise YouTubeError(f"YouTube yükləmə xətası {e.resp.status}: {e}") from e
        except OSError as e:
            if retries < 5:
                retries += 1
                time.sleep(2 ** retries)
                continue
            raise YouTubeError(f"Şəbəkə xətası: {e}") from e
    if "id" not in response:
        raise YouTubeError(f"YouTube gözlənilməz cavab verdi: {response}")
    return response["id"]


def set_thumbnail(video_id: str, image: Path) -> None:
    yt = _service()
    if config.FAKE:
        if FAKE.fail_thumbnail:
            raise YouTubeError("The channel is not allowed to upload custom thumbnails")
        FAKE.calls.append(("thumbnail", video_id, str(image)))
        return
    from googleapiclient.errors import HttpError
    from googleapiclient.http import MediaFileUpload
    try:
        yt.thumbnails().set(videoId=video_id, media_body=MediaFileUpload(str(image), mimetype="image/jpeg")).execute()
    except HttpError as e:
        raise YouTubeError(f"Thumbnail qəbul edilmədi ({e.resp.status}). Kanal telefonla təsdiqlənməyibsə, "
                           "YouTube öz thumbnail-i qoymağa icazə vermir.") from e


def upload_captions(video_id: str, srt: Path, settings: dict) -> None:
    yt = _service()
    lang = LANG_CODES.get(settings["language"].lower(), "en")
    if config.FAKE:
        FAKE.calls.append(("captions", video_id, lang))
        return
    from googleapiclient.http import MediaFileUpload
    yt.captions().insert(part="snippet", body={"snippet": {"videoId": video_id, "language": lang, "name": ""}},
                         media_body=MediaFileUpload(str(srt), mimetype="application/octet-stream")).execute()


def studio_url(video_id: str) -> str:
    return f"https://studio.youtube.com/video/{video_id}/edit"
