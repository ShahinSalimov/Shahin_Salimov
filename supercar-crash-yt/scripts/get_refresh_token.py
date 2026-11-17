"""Get a YouTube refresh token once, on your own computer (it opens a browser).

    python scripts/get_refresh_token.py <CLIENT_ID> <CLIENT_SECRET>

The OAuth client must be of type "Desktop app" in Google Cloud Console. Sign in with the Google
account that owns the YouTube channel (pick the channel / brand account when asked). Put the printed
token into .env as YT_REFRESH_TOKEN. It is a secret: never commit it or send it in chat.
"""
from __future__ import annotations

import http.server
import secrets
import sys
import threading
import urllib.parse
import webbrowser

import requests

SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube"
PORT = 8765


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    client_id, client_secret = sys.argv[1], sys.argv[2]
    redirect = f"http://127.0.0.1:{PORT}/"
    state = secrets.token_urlsafe(16)
    result: dict = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            if q.get("state", [""])[0] == state and "code" in q:
                result["code"] = q["code"][0]
                msg = "Done. You can close this tab and return to the terminal."
            else:
                msg = "Authorization failed: " + q.get("error", ["state mismatch"])[0]
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(msg.encode())
            threading.Thread(target=self.server.shutdown, daemon=True).start()

        def log_message(self, *args):
            pass

    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
        "client_id": client_id, "redirect_uri": redirect, "response_type": "code", "scope": SCOPES,
        "access_type": "offline", "prompt": "consent", "state": state})
    print("Opening the browser. If it does not open, visit:\n" + url)
    webbrowser.open(url)
    http.server.HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
    if "code" not in result:
        sys.exit("No authorization code received.")
    r = requests.post("https://oauth2.googleapis.com/token", data={
        "code": result["code"], "client_id": client_id, "client_secret": client_secret,
        "redirect_uri": redirect, "grant_type": "authorization_code"}, timeout=30)
    body = r.json()
    if "refresh_token" not in body:
        sys.exit(f"Token exchange failed: {body.get('error_description') or body.get('error')}")
    print("\nYT_REFRESH_TOKEN=" + body["refresh_token"])


if __name__ == "__main__":
    main()
