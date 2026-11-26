"""SALIMOFFF GARAGE — scheduled YouTube uploader.

Usage (run from this folder):
  python uploader.py schedule            # write schedule.json and print the calendar
  python uploader.py --dry-run           # show what would be uploaded now
  python uploader.py auth                # one-time Google login (opens browser)
  python uploader.py                     # upload every ready video as private + scheduled
  python uploader.py --only EP001 L01    # upload only these ids

Each video file goes to videos/<ID>.mp4 (EP001.mp4, L01.mp4, MM01.mp4, PR01.mp4 ...).
Long video thumbnails go to thumbnails/<ID>.jpg (1280x720, under 2 MB).
"""
from __future__ import annotations

import argparse
import json
import random
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from plan import CATEGORY_AUTOS, DEFAULT_START, build_schedule

HERE = Path(__file__).resolve().parent
SCHEDULE_FILE = HERE / "schedule.json"
STATE_FILE = HERE / "uploaded.json"
CONFIG_FILE = HERE / "config.json"
CLIENT_SECRET = HERE / "client_secret.json"
TOKEN_FILE = HERE / "token.json"
SCOPES = ["https://www.googleapis.com/auth/youtube"]
MIN_LEAD = timedelta(minutes=15)  # publishAt must be safely in the future
RETRY_STATUS = {500, 502, 503, 504}
PLACEHOLDER_RE = re.compile(r"\[[A-Z][A-Z ]+\]|@username")


# ---------- local files ----------

def load_json(path: Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def save_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def write_schedule(start) -> list[dict]:
    items = [i.to_dict() for i in build_schedule(start)]
    save_json(SCHEDULE_FILE, items)
    return items


def load_schedule() -> list[dict]:
    if not SCHEDULE_FILE.exists():
        return write_schedule(DEFAULT_START)
    return load_json(SCHEDULE_FILE, [])


def parse_utc(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def video_body(item: dict) -> dict:
    return {
        "snippet": {
            "title": item["title"],
            "description": item["description"],
            "tags": item["tags"],
            "categoryId": CATEGORY_AUTOS,
            "defaultLanguage": "en",
            "defaultAudioLanguage": "en",
        },
        "status": {
            "privacyStatus": "private",  # required for scheduled publishing
            "publishAt": item["publish_at"],
            "selfDeclaredMadeForKids": False,
            "containsSyntheticMedia": True,  # YouTube "altered or synthetic content" label
            "embeddable": True,
            "license": "youtube",
        },
    }


def plan_uploads(items: list[dict], state: dict, only: set[str] | None, now: datetime) -> tuple[list[dict], list[str]]:
    """Return (items to upload now, human-readable skip reasons)."""
    todo, notes = [], []
    for it in items:
        if only and it["id"] not in only:
            continue
        if it["id"] in state:
            continue
        if not (HERE / it["video_file"]).exists():
            notes.append(f"{it['id']}: waiting for {it['video_file']}")
            continue
        text = " ".join([it["title"], it["description"], *it["tags"]])
        if PLACEHOLDER_RE.search(text):
            notes.append(f"{it['id']}: fill placeholders ({PLACEHOLDER_RE.search(text).group(0)}) in schedule.json first")
            continue
        if parse_utc(it["publish_at"]) < now + MIN_LEAD:
            notes.append(f"{it['id']}: publish time {it['publish_at']} has passed — change it in schedule.json "
                         f"or upload by hand in YouTube Studio")
            continue
        todo.append(it)
    return todo, notes


# ---------- YouTube API ----------

def get_service(interactive: bool):
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        from googleapiclient.discovery import build
    except ImportError:
        sys.exit("Google libraries are missing. Run: pip install -r requirements.txt")

    creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES) if TOKEN_FILE.exists() else None
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    if not creds or not creds.valid:
        if not interactive:
            sys.exit("Not logged in. Run: python uploader.py auth")
        if not CLIENT_SECRET.exists():
            sys.exit("client_secret.json not found in this folder (see README).")
        creds = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET), SCOPES).run_local_server(port=0)
    TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
    return build("youtube", "v3", credentials=creds)


def resumable_upload(request) -> dict:
    from googleapiclient.errors import HttpError

    response, attempt = None, 0
    while response is None:
        try:
            status, response = request.next_chunk()
            if status:
                print(f"    {int(status.progress() * 100)}%")
        except HttpError as e:
            if e.resp.status not in RETRY_STATUS or attempt >= 6:
                raise
            attempt += 1
            wait = min(60, 2 ** attempt) + random.random()
            print(f"    server error {e.resp.status}, retry {attempt} in {wait:.0f}s")
            time.sleep(wait)
    return response


def upload_one(yt, item: dict, config: dict) -> str:
    from googleapiclient.http import MediaFileUpload

    media = MediaFileUpload(str(HERE / item["video_file"]), chunksize=8 * 1024 * 1024, resumable=True,
                            mimetype="video/mp4")
    req = yt.videos().insert(part="snippet,status", body=video_body(item), media_body=media)
    video_id = resumable_upload(req)["id"]

    thumb = HERE / item["thumbnail_file"] if item.get("thumbnail_file") else None
    if thumb and thumb.exists():
        try:
            yt.thumbnails().set(videoId=video_id, media_body=MediaFileUpload(str(thumb))).execute()
            print("    thumbnail set")
        except Exception as e:  # channel not phone-verified, file too big, etc.
            print(f"    thumbnail NOT set: {e}")

    playlist_id = config.get("playlists", {}).get(item["series"])
    if playlist_id:
        yt.playlistItems().insert(part="snippet", body={"snippet": {
            "playlistId": playlist_id, "resourceId": {"kind": "youtube#video", "videoId": video_id}}}).execute()
        print(f"    added to playlist '{item['series']}'")
    return video_id


# ---------- CLI ----------

def print_calendar(items: list[dict], state: dict) -> None:
    for it in items:
        mark = "uploaded" if it["id"] in state else ("ready" if (HERE / it["video_file"]).exists() else "-")
        print(f"{it['publish_at']}  {it['id']:<6} {it['kind']:<5} {mark:<8} {it['title']}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="SALIMOFFF GARAGE scheduled uploader")
    ap.add_argument("command", nargs="?", default="upload", choices=["upload", "auth", "schedule", "status"])
    ap.add_argument("--dry-run", action="store_true", help="show what would be uploaded, call no API")
    ap.add_argument("--only", nargs="*", help="limit to these ids")
    ap.add_argument("--start", help="first publishing day YYYY-MM-DD (for 'schedule')")
    args = ap.parse_args(argv)

    state = load_json(STATE_FILE, {})
    if args.command == "schedule":
        start = datetime.strptime(args.start, "%Y-%m-%d").date() if args.start else DEFAULT_START
        print_calendar(write_schedule(start), state)
        print(f"\nWritten {SCHEDULE_FILE.name}")
        return 0
    if args.command == "status":
        print_calendar(load_schedule(), state)
        return 0
    if args.command == "auth":
        get_service(interactive=True)
        print("Logged in. token.json saved.")
        return 0

    items = load_schedule()
    todo, notes = plan_uploads(items, state, set(args.only) if args.only else None, datetime.now(timezone.utc))
    for n in notes:
        print("skip  " + n)
    if not todo:
        print("Nothing to upload.")
        return 0
    if args.dry_run:
        for it in todo:
            print(f"would upload {it['id']} -> scheduled {it['publish_at']}: {it['title']}")
        return 0

    yt = get_service(interactive=False)
    config = load_json(CONFIG_FILE, {})
    for it in todo:
        print(f"upload {it['id']} ({it['publish_at']})")
        vid = upload_one(yt, it, config)
        state[it["id"]] = {"video_id": vid, "publish_at": it["publish_at"],
                           "uploaded_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
        save_json(STATE_FILE, state)
        print(f"    done: https://youtu.be/{vid}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
