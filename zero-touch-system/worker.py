"""Background process: scheduler + runner tick loop, for use next to gunicorn (see wsgi.py).

    python worker.py & gunicorn -w 2 -b 0.0.0.0:$PORT wsgi:app

For a single process (simplest on Replit), ``python app.py`` does both.
"""
from core.bootstrap import build_runtime, run_forever
from core.config import Settings
from core.logging import configure_logging

if __name__ == "__main__":  # pragma: no cover
    s = Settings()
    configure_logging(s)
    if s.org is None:
        raise SystemExit("ORG must be set to 'studio' or 'youtube'")
    run_forever(build_runtime(s.org, s))
