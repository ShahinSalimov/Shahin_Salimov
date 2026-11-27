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
HOST = "127.0.0.1"
if "--lan" in sys.argv:  # phone access over the same Wi-Fi, protected by a PIN
    os.environ["YTA_LAN"] = "1"
    HOST = "0.0.0.0"
    from app import access
    print("\n  SALIMOFF AI YOUTUBE — telefon girişi aktivdir")
    print(f"  Telefonda (eyni Wi-Fi) açın:  http://{access.lan_ip()}:{PORT}")
    print(f"  PIN: {access.pin()}\n")
print(f"  Kompüterdə: http://127.0.0.1:{PORT}")
if "--no-browser" not in sys.argv:
    threading.Timer(1.5, lambda: webbrowser.open(f"http://127.0.0.1:{PORT}")).start()
uvicorn.run("app.main:app", host=HOST, port=PORT, log_level="warning")
