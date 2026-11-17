"""WSGI entry point for gunicorn. Serves HTTP only: no scheduler, no runner thread.

Run exactly one ``python worker.py`` next to it so jobs are processed and schedules fire once.
"""
from app import create_app
from core.bootstrap import build_runtime
from core.config import Settings
from core.logging import configure_logging

settings = Settings()
if settings.org is None:
    raise SystemExit("ORG must be set to 'studio' or 'youtube'")
configure_logging(settings)
runtime = build_runtime(settings.org, settings)
app = create_app(runtime)
