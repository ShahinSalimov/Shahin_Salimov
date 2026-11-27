"""Phone / LAN access: when started with --lan, devices other than this computer must enter a PIN."""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import socket

from fastapi import Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

from . import store

LOCAL = {"127.0.0.1", "::1", "localhost", "testclient"}
OPEN_PATHS = ("/login", "/manifest.webmanifest", "/icon.svg", "/sw.js", "/style.css")
COOKIE = "yta_auth"


def lan_enabled() -> bool:
    return os.environ.get("YTA_LAN") == "1"


def pin() -> str:
    if os.environ.get("YTA_PIN"):
        return os.environ["YTA_PIN"]
    f = store.DATA / "access_pin.txt"
    if not f.exists():
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(f"{secrets.randbelow(10**6):06d}")
    return f.read_text().strip()


def _token() -> str:
    return hmac.new(pin().encode(), b"salimoff-access", hashlib.sha256).hexdigest()


def lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


async def middleware(request: Request, call_next):
    host = request.client.host if request.client else ""
    if not lan_enabled() or host in LOCAL or request.url.path.startswith(OPEN_PATHS):
        return await call_next(request)
    if hmac.compare_digest(request.cookies.get(COOKIE, ""), _token()):
        return await call_next(request)
    if request.url.path.startswith("/api/"):
        return JSONResponse({"detail": "PIN lazımdır"}, 401)
    return RedirectResponse("/login")


LOGIN_HTML = """<!doctype html><html lang=az><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>SALIMOFF giriş</title><link rel=stylesheet href=/style.css><link rel=manifest href=/manifest.webmanifest>
<body style="display:block"><main style="max-width:360px;margin:12vh auto;padding:16px">
<h1>SALIMOFF AI YOUTUBE</h1><form method=post action=/login class=card><label>PIN (kompüterdəki proqramın pəncərəsində yazılıb)</label>
<input name=pin inputmode=numeric autocomplete=one-time-code autofocus style="font-size:22px;letter-spacing:4px">
<p class=err>{err}</p><button class=primary style="width:100%">Daxil ol</button></form></main></body></html>"""


def login_page(err: str = "") -> HTMLResponse:
    return HTMLResponse(LOGIN_HTML.replace("{err}", err))


async def login_submit(request: Request):
    form = await request.form()
    if hmac.compare_digest(str(form.get("pin", "")).strip(), pin()):
        r = RedirectResponse("/", status_code=303)
        r.set_cookie(COOKIE, _token(), max_age=90 * 86400, httponly=True, samesite="lax")
        return r
    return login_page("PIN yanlışdır")
