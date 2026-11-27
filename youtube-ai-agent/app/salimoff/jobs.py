"""In-memory background jobs for long SALIMOFF tasks (analysis, channel setup, reports)."""
from __future__ import annotations

import threading
import time
import traceback

_jobs: dict[str, dict] = {}
_threads: dict[str, threading.Thread] = {}
_lock = threading.Lock()


class Busy(RuntimeError):
    pass


def status(key: str) -> dict:
    return dict(_jobs.get(key) or {"status": "idle"})


def running(key: str) -> bool:
    t = _threads.get(key)
    return bool(t and t.is_alive())


def set(key: str, **kw) -> None:  # noqa: A001 - short name used as jobs.set(...)
    with _lock:
        _jobs[key] = {**_jobs.get(key, {}), **kw}


def start(key: str, fn, *args, on_error=None) -> None:
    with _lock:
        if running(key):
            raise Busy("Bu tapşırıq artıq icra olunur")
        _jobs[key] = {"status": "running", "progress": 0, "message": "Başlayır...", "error": "", "started": time.time()}

    def runner():
        try:
            res = fn(lambda pct, msg: set(key, progress=round(pct), message=msg), *args)
            small = isinstance(res, (str, int)) or (isinstance(res, dict) and len(res) <= 4)
            set(key, status="done", progress=100, message="Tamamlandı", result=res if small else None)
        except Exception as e:  # noqa: BLE001 - surface to UI
            traceback.print_exc()
            set(key, status="error", message="Xəta", error=str(e))
            if on_error:
                on_error(e)

    t = threading.Thread(target=runner, daemon=True)
    _threads[key] = t
    t.start()


def run_sync(fn, *args):
    """Run a job function inline (tests, scheduler)."""
    return fn(lambda pct, msg: None, *args)
