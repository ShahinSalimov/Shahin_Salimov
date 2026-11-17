"""Dashboard (Flask). Start with: python cli.py serve"""
from __future__ import annotations

import hmac
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, Response, abort, flash, redirect, render_template, request, url_for
from werkzeug.utils import secure_filename

from scc.config import get_settings
from scc.service import THUMB_EXT, VIDEO_EXT, Service, production_markdown
from scc.youtube import YouTubeError

STATUS_AZ = {"planned": "Video gözlənilir", "ready": "Fayl hazırdır", "uploaded": "Yükləndi - public et",
             "scheduled": "Planlaşdırılıb", "published": "Public", "failed": "Xəta"}


def create_app(svc: Service | None = None) -> Flask:
    svc = svc or Service(get_settings())
    app = Flask(__name__)
    app.secret_key = svc.s.dashboard_password or "local-dashboard"
    app.config["MAX_CONTENT_LENGTH"] = 4 * 1024 ** 3
    app.jinja_env.globals.update(STATUS_AZ=STATUS_AZ, settings=svc.s)

    @app.before_request
    def auth():
        pw = svc.s.dashboard_password
        if not pw:
            return None
        a = request.authorization
        if not a or not hmac.compare_digest(a.password or "", pw):
            return Response("Login required", 401, {"WWW-Authenticate": 'Basic realm="dashboard"'})
        return None

    def publish_time(v):
        return svc.publish_time(v).strftime("%Y-%m-%d %H:%M UTC")

    app.jinja_env.globals["publish_time"] = publish_time

    @app.get("/")
    def index():
        today = date.today()
        upcoming = svc.store.videos(start=today.isoformat(), end=(today + timedelta(days=1)).isoformat())
        to_publish = svc.store.videos(status="uploaded")
        failed = svc.store.videos(status="failed")
        return render_template("index.html", progress=svc.progress(), upcoming=upcoming, to_publish=to_publish,
                               failed=failed, counts=svc.store.counts(), quota=_quota(svc))

    @app.get("/calendar")
    def calendar():
        start = date.fromisoformat(request.args.get("from", max(date.today(), svc.s.channel_start).isoformat()))
        videos = svc.store.videos(start=start.isoformat(), end=(start + timedelta(days=29)).isoformat())
        past = svc.store.videos(end=(date.today() - timedelta(days=1)).isoformat())[-20:]
        return render_template("calendar.html", videos=videos, past=past)

    @app.get("/video/<vid>")
    def video(vid):
        v = svc.store.get(vid) or abort(404)
        return render_template("video.html", v=v, production_md=production_markdown(v))

    @app.post("/video/<vid>/file")
    def upload_file(vid):
        svc.store.get(vid) or abort(404)
        svc.s.inbox_dir.mkdir(parents=True, exist_ok=True)
        saved = []
        for field, exts in (("video", VIDEO_EXT), ("thumb", THUMB_EXT)):
            f = request.files.get(field)
            if not f or not f.filename:
                continue
            ext = Path(secure_filename(f.filename)).suffix.lower()
            if ext not in exts:
                flash(f"{field}: icazə verilən formatlar {', '.join(exts)}")
                continue
            for old in exts:      # one file per video id
                (svc.s.inbox_dir / f"{vid}{old}").unlink(missing_ok=True)
            f.save(svc.s.inbox_dir / f"{vid}{ext}")
            saved.append(field)
        svc.scan_inbox()
        flash("Saxlanıldı: " + (", ".join(saved) or "heç nə"))
        return redirect(url_for("video", vid=vid))

    @app.post("/video/<vid>/upload")
    def upload_now(vid):
        try:
            svc.scan_inbox()
            yt_id = svc.upload_one(vid)
            flash(f"YouTube-a private yükləndi: {yt_id}. İndi Studio-da public et.")
        except (YouTubeError, ValueError, OSError) as e:
            flash(f"Yükləmə alınmadı: {e}")
        return redirect(url_for("video", vid=vid))

    @app.post("/video/<vid>/published")
    def published(vid):
        svc.store.get(vid) or abort(404)
        svc.mark_published(vid, request.form.get("url", ""))
        flash("Public kimi qeyd edildi.")
        return redirect(request.referrer or url_for("index"))

    @app.post("/video/<vid>/regenerate")
    def regenerate(vid):
        try:
            svc.regenerate(vid)
            flash("Metadata və prompt-lar yeniləndi.")
        except ValueError as e:
            flash(str(e))
        return redirect(url_for("video", vid=vid))

    @app.post("/run-daily")
    def run_daily():
        try:
            for line in svc.daily():
                flash(line)
        except Exception as e:     # show the error instead of a 500 page
            flash(f"Xəta: {type(e).__name__}: {e}")
        return redirect(url_for("index"))

    @app.post("/plan")
    def plan():
        created = svc.ensure_plan(int(request.form.get("days", 14)))
        flash(f"{len(created)} yeni video planlaşdırıldı.")
        return redirect(url_for("calendar"))

    @app.post("/subscribers")
    def subscribers():
        n = int(request.form.get("count", 0))
        svc.store.save_stats(date.today().isoformat(), n, 0, 0)
        flash(f"Abunəçi sayı qeyd edildi: {n}")
        return redirect(url_for("index"))

    return app


def _quota(svc: Service) -> dict:
    key = "quota:" + datetime.now(timezone.utc).strftime("%Y-%m-%d")
    used = int(svc.store.get_control(key, 0))
    return {"used": used, "limit": svc.s.yt_daily_quota}


if __name__ == "__main__":
    create_app().run(port=8080)
