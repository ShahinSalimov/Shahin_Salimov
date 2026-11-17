"""Daily operations: plan ahead, pick up rendered files, upload and schedule, track subscribers."""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from .config import Settings
from .db import Store
from .metadata import build_metadata
from .planner import Planner, VideoPlan
from .prompts import build_production
from .youtube import Quota, QuotaExceeded, YouTube, YouTubeError

log = logging.getLogger(__name__)
VIDEO_EXT = (".mp4", ".mov", ".webm", ".mkv")
THUMB_EXT = (".jpg", ".jpeg", ".png")


class Service:
    def __init__(self, settings: Settings, store: Store | None = None, youtube: YouTube | None = None,
                 polish=None):
        self.s = settings
        self.store = store or Store(settings.db_path)
        self._yt = youtube
        self._polish = polish

    # -- helpers ----------------------------------------------------------------
    @property
    def yt(self) -> YouTube:
        if self._yt is None:
            if not self.s.youtube_ready:
                raise YouTubeError("YouTube credentials missing (YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN)")
            self._yt = YouTube(self.s.yt_client_id, self.s.yt_client_secret, self.s.yt_refresh_token,
                               Quota(self.store, self.s.yt_daily_quota), self.s.yt_upload_cost)
        return self._yt

    def publish_time(self, video: dict) -> datetime:
        t = self.s.publish_long_utc if video["kind"] == "long" else self.s.publish_short_utc
        return datetime.combine(date.fromisoformat(video["publish_date"]), t, tzinfo=timezone.utc)

    def _history(self) -> list[VideoPlan]:
        return [VideoPlan.from_dict(v["plan"]) for v in self.store.videos()]

    def _long_url(self, plan: VideoPlan) -> str | None:
        if not plan.linked_long_id:
            return None
        long_v = self.store.get(plan.linked_long_id)
        if long_v and long_v.get("youtube_id"):
            return f"https://youtu.be/{long_v['youtube_id']}"
        return None

    def _build(self, plan: VideoPlan) -> tuple[dict, dict]:
        production = build_production(plan)
        meta = build_metadata(plan, production, self._long_url(plan), self.s.channel_handle, self.s.language)
        if self._polish is not None:
            meta = self._polish(plan, meta, production)
        elif self.s.llm_enabled:
            from .llm import polish
            meta = polish(plan, meta, production, model=self.s.llm_model)
        return production, meta

    # -- planning ---------------------------------------------------------------
    def ensure_plan(self, days: int | None = None, today: date | None = None) -> list[str]:
        today = today or date.today()
        days = days or self.s.plan_days_ahead
        start = max(today, self.s.channel_start)
        planner = Planner(self._history())
        created = []
        for plan in planner.plan_range(start, days, first_day=self.s.channel_start):
            production, meta = self._build(plan)
            self.store.upsert_video(plan.id, plan.publish_date, plan.kind, plan.to_dict(), production, meta)
            created.append(plan.id)
        return created

    def regenerate(self, vid: str) -> None:
        v = self.store.get(vid)
        if not v or v["status"] not in ("planned", "ready", "failed"):
            raise ValueError("only planned/ready/failed videos can be regenerated")
        plan = VideoPlan.from_dict(v["plan"])
        production, meta = self._build(plan)
        self.store.upsert_video(vid, plan.publish_date, plan.kind, plan.to_dict(), production, meta)

    # -- files ------------------------------------------------------------------
    def _find(self, vid: str, exts) -> Path | None:
        for ext in exts:
            p = self.s.inbox_dir / f"{vid}{ext}"
            if p.exists():
                return p
        return None

    def scan_inbox(self) -> list[str]:
        found = []
        for v in self.store.videos(status="planned") + self.store.videos(status="failed"):
            video = self._find(v["id"], VIDEO_EXT)
            if video:
                thumb = self._find(v["id"], THUMB_EXT)
                self.store.update(v["id"], status="ready", video_file=str(video),
                                  thumb_file=str(thumb) if thumb else None, error=None)
                found.append(v["id"])
        return found

    # -- uploading ----------------------------------------------------------------
    def upload_one(self, vid: str, now: datetime | None = None) -> str:
        now = now or datetime.now(timezone.utc)
        v = self.store.get(vid)
        if not v or v["status"] != "ready":
            raise ValueError(f"{vid} is not ready")
        plan = VideoPlan.from_dict(v["plan"])
        meta = v["meta"]
        if plan.linked_long_id and (url := self._long_url(plan)) and url not in meta["description"]:
            meta = build_metadata(plan, v["production"], url, self.s.channel_handle, self.s.language) \
                if not meta.get("llm_polished") else {**meta, "description": meta["description"].replace(
                    "\n\nNew supercar", f"\n\nFull crash test: {url}\n\nNew supercar", 1)}
        when = self.publish_time(v)
        scheduled = self.s.publish_mode == "scheduled" and when > now + timedelta(minutes=15)
        try:
            video_id = self.yt.upload(Path(v["video_file"]), meta, when if scheduled else None, privacy="private")
        except (YouTubeError, OSError) as e:
            self.store.update(vid, status="failed", error=str(e)[:500])
            raise
        # private mode: publish_at stores the recommended time for you to press "Public" in Studio
        self.store.update(vid, status="scheduled" if scheduled else "uploaded", youtube_id=video_id,
                          publish_at=when.isoformat(), meta=meta, error=None)
        self._after_upload(vid, video_id, v, meta)
        return video_id

    def _after_upload(self, vid: str, video_id: str, v: dict, meta: dict) -> None:
        notes = []
        if v.get("thumb_file") and v["kind"] == "long":
            try:
                self.yt.set_thumbnail(video_id, Path(v["thumb_file"]))
            except (YouTubeError, OSError) as e:
                notes.append(f"thumbnail: {e}")
        try:
            playlists = self.store.get_control("playlists", {})
            name = meta["playlist"]
            if name not in playlists:
                playlists[name] = self.yt.create_playlist(name)
                self.store.set_control("playlists", playlists)
            self.yt.add_to_playlist(playlists[name], video_id)
        except YouTubeError as e:
            notes.append(f"playlist: {e}")
        if notes:
            self.store.update(vid, error="; ".join(notes)[:500])

    def upload_due(self, now: datetime | None = None) -> list[str]:
        now = now or datetime.now(timezone.utc)
        horizon = now + timedelta(hours=self.s.upload_ahead_hours)
        due = [v for v in self.store.videos(status="ready") if self.publish_time(v) <= horizon]
        due.sort(key=lambda v: (v["publish_date"], v["kind"] != "long"))   # long first: Shorts link to it
        done = []
        for v in due:
            try:
                done.append(f"{v['id']} -> {self.upload_one(v['id'], now)}")
            except QuotaExceeded as e:
                log.warning("quota: %s", e)
                break
            except (YouTubeError, OSError) as e:
                log.error("upload %s failed: %s", v["id"], e)
        return done

    def mark_published(self, vid: str, youtube_ref: str = "") -> None:
        ref = youtube_ref.strip()
        for prefix in ("https://youtu.be/", "https://www.youtube.com/watch?v=", "https://www.youtube.com/shorts/",
                       "https://youtube.com/shorts/"):
            if ref.startswith(prefix):
                ref = ref[len(prefix):].split("&")[0].split("?")[0]
        self.store.update(vid, status="published", youtube_id=ref or None,
                          publish_at=datetime.now(timezone.utc).isoformat(), error=None)

    def refresh_statuses(self, now: datetime | None = None) -> None:
        now = now or datetime.now(timezone.utc)
        for v in self.store.videos(status="scheduled"):
            if v["publish_at"] and datetime.fromisoformat(v["publish_at"]) <= now:
                self.store.update(v["id"], status="published")

    # -- stats ------------------------------------------------------------------
    def refresh_stats(self) -> dict | None:
        try:
            st = self.yt.channel_stats()
        except YouTubeError as e:
            log.warning("stats: %s", e)
            return None
        self.store.save_stats(date.today().isoformat(), st["subscribers"], st["views"], st["videos"])
        return st

    def progress(self) -> dict:
        rows = self.store.stats()
        goal = self.s.subscriber_goal
        subs = rows[-1]["subscribers"] if rows else self.store.get_control("manual_subscribers", 0)
        per_day = None
        if len(rows) >= 2:
            window = rows[-8:]
            days = (date.fromisoformat(window[-1]["day"]) - date.fromisoformat(window[0]["day"])).days or 1
            per_day = (window[-1]["subscribers"] - window[0]["subscribers"]) / days
        eta = None
        if per_day and per_day > 0 and subs < goal:
            eta = (date.today() + timedelta(days=round((goal - subs) / per_day))).isoformat()
        return {"subscribers": subs, "goal": goal, "percent": min(100, round(100 * subs / goal, 1)),
                "per_day": per_day, "eta": eta, "reached": subs >= goal, "history": rows}

    # -- export (manual mode) --------------------------------------------------------
    def export(self, vid: str) -> Path:
        v = self.store.get(vid)
        if not v:
            raise ValueError(f"unknown video {vid}")
        out = self.s.export_dir / vid
        out.mkdir(parents=True, exist_ok=True)
        m, p = v["meta"], v["production"]
        (out / "title.txt").write_text(m["title"] + "\n\nAlternatives:\n" + "\n".join(m["title_alternatives"]), encoding="utf-8")
        (out / "description.txt").write_text(m["description"], encoding="utf-8")
        (out / "tags.txt").write_text(", ".join(m["tags"]), encoding="utf-8")
        (out / "pinned_comment.txt").write_text(m["pinned_comment"], encoding="utf-8")
        (out / "production.md").write_text(production_markdown(v), encoding="utf-8")
        if p.get("thumbnail_prompt"):
            (out / "thumbnail_prompt.txt").write_text(p["thumbnail_prompt"] + "\n\nText: " + p["thumbnail_text"], encoding="utf-8")
        return out

    # -- daily job ----------------------------------------------------------------------
    def daily(self, now: datetime | None = None) -> list[str]:
        now = now or datetime.now(timezone.utc)
        report = []
        created = self.ensure_plan(today=now.date())
        report.append(f"planned: {len(created)} new videos")
        found = self.scan_inbox()
        report.append(f"ready (files found): {', '.join(found) or 'none'}")
        if self.s.upload_mode == "api":
            done = self.upload_due(now)
            report.append(f"uploaded: {', '.join(done) or 'none'}")
            waiting = self.store.videos(status="uploaded")
            if waiting:
                report.append("MAKE PUBLIC IN STUDIO: " + ", ".join(
                    f"{w['id']} at {self.publish_time(w):%H:%M} UTC https://studio.youtube.com/video/{w['youtube_id']}/edit"
                    for w in waiting))
            self.refresh_statuses(now)
            st = self.refresh_stats()
            if st:
                report.append(f"subscribers: {st['subscribers']}")
        else:
            for v in self.store.videos(start=now.date().isoformat(), end=(now.date() + timedelta(days=1)).isoformat()):
                self.export(v["id"])
            report.append(f"manual mode: upload packs exported to {self.s.export_dir}")
        missing = [v["id"] for v in self.store.videos(start=now.date().isoformat(),
                                                      end=(now.date() + timedelta(days=1)).isoformat(), status="planned")]
        if missing:
            report.append("WAITING FOR VIDEO FILES: " + ", ".join(f"{m}.mp4" for m in missing))
        p = self.progress()
        report.append(f"goal: {p['subscribers']}/{p['goal']} subscribers ({p['percent']}%)")
        return report


def production_markdown(v: dict) -> str:
    p, m = v["production"], v["meta"]
    lines = [f"# {v['id']} - {m['title']}", "", f"Format: {v['plan']['format_key']} | {p['aspect']} | {p['duration']}",
             f"Music: {p['music']}", ""]
    for seg in p["segments"]:
        lines += [f"## {seg['label']} ({seg['start']}s - {seg['end']}s)", "", f"Voiceover: {seg['voiceover']}", ""]
        if seg.get("on_screen_text"):
            lines += [f"On-screen text: {seg['on_screen_text']}", ""]
        for c in seg["clips"]:
            lines += [f"**{c['start']}-{c['end']}s ({c['beat']})** {c['edit']}", "", "```", c["prompt"], "```", ""]
    if p.get("thumbnail_prompt"):
        lines += ["## Thumbnail", "", "```", p["thumbnail_prompt"], "```", "", f"Text: {p['thumbnail_text']}", ""]
    lines += ["## Editing notes", ""] + [f"- {n}" for n in p["editing_notes"]]
    return "\n".join(lines)
