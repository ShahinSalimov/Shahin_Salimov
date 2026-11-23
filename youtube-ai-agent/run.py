"""Start the YouTube AI Agent: python run.py  →  http://127.0.0.1:8765"""
import os
import shutil
import sys
import threading
import webbrowser

import uvicorn

if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
    sys.exit("ffmpeg tapılmadı. Quraşdırın: Windows → 'winget install Gyan.FFmpeg', Mac → 'brew install ffmpeg'.")

PORT = int(os.environ.get("YTA_PORT", "8765"))
if "--no-browser" not in sys.argv:
    threading.Timer(1.5, lambda: webbrowser.open(f"http://127.0.0.1:{PORT}")).start()
uvicorn.run("app.main:app", host="127.0.0.1", port=PORT, log_level="warning")
