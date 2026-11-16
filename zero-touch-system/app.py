"""Flask entry point: /health, /webhooks/gumroad/<secret>, /admin/run/<pipeline>, /admin/kill.

``python app.py`` builds the runtime for ORG, starts the scheduler and the runner thread, and serves
HTTP. ``create_app(runtime)`` is used by tests. Admin endpoints need the X-Admin-Token header; when
ADMIN_TOKEN is not configured they are always refused.
"""
from __future__ import annotations

import hmac
import os
from functools import wraps

from flask import Flask, abort, jsonify, request

from core.bootstrap import Runtime, build_runtime
from core.config import Settings
from core.runner import KillSwitchActive


def _secret_matches(given: str | None, secret) -> bool:
    if secret is None or not given:
        return False
    return hmac.compare_digest(given.encode(), secret.get_secret_value().encode())


def create_app(rt: Runtime) -> Flask:
    app = Flask(__name__)

    def admin(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if not _secret_matches(request.headers.get("X-Admin-Token"), rt.settings.admin_token):
                abort(401)
            return fn(*args, **kwargs)
        return wrapper

    @app.get("/health")
    def health():
        return jsonify(org=rt.org, queue=rt.store.queue_depth(rt.org),
                       kill_switch=rt.kill.is_active(rt.org), last_run=rt.store.last_run(rt.org),
                       budget_remaining_usd=round(rt.budget.remaining(rt.org), 4))

    @app.post("/webhooks/gumroad/<secret>")
    def gumroad_ping(secret):
        handler = rt.webhooks.get("gumroad")
        if handler is None or not _secret_matches(secret, rt.settings.gumroad_ping_secret):
            abort(404)
        return jsonify(handler(request.form.to_dict(), rt)), 200

    @app.post("/admin/run/<pipeline>")
    @admin
    def manual_run(pipeline):
        if pipeline not in rt.runner.pipelines:
            abort(404)
        try:
            run_id = rt.runner.start_run(pipeline, request.get_json(silent=True) or {})
        except KillSwitchActive as e:
            return jsonify(error=str(e)), 409
        return jsonify(run_id=run_id), 202

    @app.get("/admin/runs/<run_id>")
    @admin
    def get_run(run_id):
        try:
            run = rt.store.get_run(run_id)
        except KeyError:
            abort(404)
        jobs = [{"id": j.id, "step": j.step, "status": j.status, "attempt": j.attempt,
                 "error": j.error, "meta": j.meta} for j in rt.store.jobs_of(run_id)]
        return jsonify(run=run.__dict__, jobs=jobs)

    @app.post("/admin/kill")
    @admin
    def kill_activate():
        reason = (request.get_json(silent=True) or {}).get("reason", "manual")
        rt.kill.activate(rt.org, reason=f"manual: {reason}")
        return jsonify(kill_switch=rt.kill.status(rt.org))

    @app.delete("/admin/kill")
    @admin
    def kill_reset():
        rt.kill.reset(rt.org)
        return jsonify(kill_switch=rt.kill.status(rt.org))

    return app


def main() -> None:  # pragma: no cover - process entry point
    import logging
    logging.basicConfig(level=logging.INFO)
    settings = Settings()
    if settings.org is None:
        raise SystemExit("ORG must be set to 'studio' or 'youtube'")
    rt = build_runtime(settings.org, settings)
    rt.start_background()
    create_app(rt).run(host="0.0.0.0", port=int(os.environ.get("PORT", settings.port)))


if __name__ == "__main__":  # pragma: no cover
    main()
