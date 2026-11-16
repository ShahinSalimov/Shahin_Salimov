"""Optional separate process that runs the runner tick loop and the scheduler (use with gunicorn).

Run ``python worker.py`` next to ``gunicorn 'app:create_app(...)'`` so only one process schedules
and processes jobs. For a single Replit process, ``python app.py`` already does both.
"""
from core.bootstrap import build_runtime, run_forever
from core.config import Settings

if __name__ == "__main__":  # pragma: no cover
    import logging
    logging.basicConfig(level=logging.INFO)
    s = Settings()
    if s.org is None:
        raise SystemExit("ORG must be set to 'studio' or 'youtube'")
    run_forever(build_runtime(s.org, s))
