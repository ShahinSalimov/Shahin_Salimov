"""YouTube Data API v3: connect the channel once (OAuth desktop flow) and upload privately.

Follows developers.google.com/youtube/v3/guides/uploading_a_video: InstalledAppFlow.run_local_server,
resumable videos.insert, thumbnails.set, captions.insert.
"""
from __future__ import annotations

import time
from pathlib import Path

from . import channels, config

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




# ---------------- fake client for tests ----------------
class _Fake:
    calls: list[tuple] = []
    fail_thumbnail = False
    connected = True


FAKE = _Fake


# ---------------- auth ----------------
def _credentials(channel_id: str):
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials

    path = channels.token_path(channel_id)
    if not path.exists():
        return None
    creds = Credentials.from_authorized_user_file(str(path), SCOPES)
    if creds.valid:
        return creds
    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
        except Exception:  # noqa: BLE001 - revoked/expired refresh token
            return None
        path.write_text(creds.to_json(), encoding="utf-8")
        return creds
    return None


def _service(channel_id: str):
    if config.FAKE:
        if not FAKE.connected:
            raise YouTubeError("YouTube hesabı qoşulmayıb (Ayarlar → Kanallar → Yenidən qoş)")
        return None
    creds = _credentials(channel_id)
    if not creds:
        raise YouTubeError("Kanalın YouTube girişi yoxdur və ya vaxtı bitib (Ayarlar → Kanallar → Yenidən qoş)")
    from googleapiclient.discovery import build
    return build("youtube", "v3", credentials=creds, cache_discovery=False)


def connect(channel_id: str | None = None) -> dict:
    """Google sign-in in the browser (Şahin picks the channel there). New channel, or re-login of channel_id."""
    if config.FAKE:
        FAKE.connected = True
        return channels.get(channel_id) if channel_id else channels.add("Fake Channel", "UCfake")
    if not client_secret_path().exists():
        raise YouTubeError("Əvvəlcə Google Cloud-dan yüklədiyiniz client_secret.json faylını əlavə edin")
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    flow = InstalledAppFlow.from_client_secrets_file(str(client_secret_path()), SCOPES)
    creds = flow.run_local_server(port=0, prompt="consent select_account", open_browser=True)
    items = build("youtube", "v3", credentials=creds, cache_discovery=False).channels() \
        .list(part="snippet", mine=True).execute().get("items") or []
    if not items:
        raise YouTubeError("Bu Google hesabında YouTube kanalı yoxdur. Girişdə kanalın özünü seçin.")
    ch = channels.get(channel_id) if channel_id else channels.add(items[0]["snippet"]["title"], items[0]["id"])
    path = channels.token_path(ch["id"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(creds.to_json(), encoding="utf-8")
    return ch


def is_connected(channel_id: str) -> bool:
    if config.FAKE:
        return FAKE.connected
    return _credentials(channel_id) is not None


# ---------------- uploads ----------------
def video_body(meta: dict, channel: dict) -> dict:
    return {
        "snippet": {
            "title": meta["title"][:100],
            "description": meta.get("description", "")[:4900],
            "tags": meta.get("tags", [])[:30],
            "categoryId": str(channel["category_id"]),
            "defaultLanguage": LANG_CODES.get(channel["language"].lower(), "en"),
        },
        "status": {
            "privacyStatus": "private",           # Şahin publishes manually from YouTube Studio
            "selfDeclaredMadeForKids": False,
            "containsSyntheticMedia": True,       # realistic AI visuals must be disclosed
        },
    }


def upload(video: Path, meta: dict, channel: dict, progress=lambda pct: None) -> str:
    body = video_body(meta, channel)
    yt = _service(channel["id"])
    if config.FAKE:
        FAKE.calls.append(("upload", str(video), body, channel["id"]))
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


def set_thumbnail(video_id: str, image: Path, channel: dict) -> None:
    yt = _service(channel["id"])
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


def upload_captions(video_id: str, srt: Path, channel: dict) -> None:
    yt = _service(channel["id"])
    lang = LANG_CODES.get(channel["language"].lower(), "en")
    if config.FAKE:
        FAKE.calls.append(("captions", video_id, lang))
        return
    from googleapiclient.http import MediaFileUpload
    yt.captions().insert(part="snippet", body={"snippet": {"videoId": video_id, "language": lang, "name": ""}},
                         media_body=MediaFileUpload(str(srt), mimetype="application/octet-stream")).execute()


def studio_url(video_id: str) -> str:
    return f"https://studio.youtube.com/video/{video_id}/edit"
