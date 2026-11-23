"""Start the YouTube AI Agent: python run.py  →  http://127.0.0.1:8765"""
import os
import shutil
import socket
import sys
import threading
import traceback
import webbrowser

os.chdir(os.path.dirname(os.path.abspath(__file__)))
PORT = int(os.environ.get("YTA_PORT", "8765"))
URL = f"http://127.0.0.1:{PORT}"
OPEN_BROWSER = "--no-browser" not in sys.argv


def fail(msg: str) -> None:
    """Show the error and keep the window open (when started from a desktop shortcut)."""
    print("\n" + "=" * 60 + "\nXƏTA: " + msg + "\n" + "=" * 60)
    if sys.stdin and sys.stdin.isatty():
        input("\nPəncərəni bağlamaq üçün Enter basın...")
    sys.exit(1)


def port_busy() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", PORT)) == 0


if port_busy():
    print(f"Proqram artıq işləyir: {URL}")
    if OPEN_BROWSER:
        webbrowser.open(URL)
    sys.exit(0)

if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
    fail("ffmpeg tapılmadı. Quraşdırın: Windows → 'winget install Gyan.FFmpeg', Mac → 'brew install ffmpeg'.\n"
         "Quraşdırdıqdan sonra kompüteri yenidən başladın.")

try:
    import uvicorn
    from app.main import app  # noqa: F401  (import errors are shown here, not hidden in the server)
except Exception:
    fail("Proqram yüklənmədi:\n" + traceback.format_exc() +
         "\nPaketləri yeniləyin: .\\.venv\\Scripts\\python.exe -m pip install -r requirements.txt")

print(f"YouTube AI Agent işləyir: {URL}\nDayandırmaq üçün bu pəncərəni bağlayın.")
if OPEN_BROWSER:
    threading.Timer(1.5, lambda: webbrowser.open(URL)).start()
try:
    uvicorn.run("app.main:app", host="127.0.0.1", port=PORT, log_level="warning")
except Exception:
    fail(traceback.format_exc())
