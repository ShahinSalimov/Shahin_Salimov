"""One-time local OAuth flow that prints a YouTube refresh token.

Run on your own computer (it opens a browser and listens on localhost):

    python scripts/youtube_oauth.py --client-id ID --client-secret SECRET

Create an OAuth client of type "Desktop app" in Google Cloud Console (YouTube Data API v3 and
YouTube Analytics API enabled). Sign in with the account that owns the channel. Put the printed
refresh token into the Replit secret YT_REFRESH_TOKEN (never commit it).
"""
from __future__ import annotations

import argparse
import http.server
import secrets
import sys
import urllib.parse
import webbrowser
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from orgs.youtube.tools.google import SCOPES, TOKEN_URL  # noqa: E402

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"


def build_auth_url(client_id: str, redirect_uri: str, state: str) -> str:
    return AUTH_URL + "?" + urllib.parse.urlencode({
        "client_id": client_id, "redirect_uri": redirect_uri, "response_type": "code",
        "scope": " ".join(SCOPES), "access_type": "offline", "prompt": "consent", "state": state})


def exchange_code(client_id: str, client_secret: str, code: str, redirect_uri: str) -> dict:
    res = requests.post(TOKEN_URL, data={"client_id": client_id, "client_secret": client_secret, "code": code,
                                         "redirect_uri": redirect_uri, "grant_type": "authorization_code"}, timeout=30)
    res.raise_for_status()
    return res.json()


def main() -> int:  # pragma: no cover - interactive
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--client-id", required=True)
    ap.add_argument("--client-secret", required=True)
    ap.add_argument("--port", type=int, default=8765)
    args = ap.parse_args()

    redirect = f"http://localhost:{args.port}/"
    state = secrets.token_urlsafe(16)
    result: dict[str, str] = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            ok = q.get("state", [""])[0] == state and "code" in q
            if ok:
                result["code"] = q["code"][0]
            self.send_response(200 if ok else 400)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(("Done. You can close this tab." if ok else "Invalid response.").encode())

        def log_message(self, *a):
            pass

    url = build_auth_url(args.client_id, redirect, state)
    print("Open this URL if the browser does not open:\n", url)
    webbrowser.open(url)
    with http.server.HTTPServer(("localhost", args.port), Handler) as srv:
        while "code" not in result:
            srv.handle_request()
    tokens = exchange_code(args.client_id, args.client_secret, result["code"], redirect)
    if "refresh_token" not in tokens:
        print("No refresh_token returned. Remove the app's access at myaccount.google.com/permissions and retry.")
        return 1
    print("\nYT_REFRESH_TOKEN=" + tokens["refresh_token"])
    print("Granted scopes:", tokens.get("scope"))
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
