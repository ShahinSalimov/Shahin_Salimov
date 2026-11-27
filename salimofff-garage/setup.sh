#!/bin/bash
# One-time setup per fresh cloud container. Usage: bash salimofff-garage/setup.sh
set -e
D=$(cd "$(dirname "$0")" && pwd)
V=$D/.venv
if [ ! -x "$V/bin/earshot" ]; then
  python3 -m venv "$V"
  "$V/bin/pip" install -q edge-tts==7.3.1 pillow numpy scipy soundfile "earshot @ git+https://github.com/Leonxlnx/earshot"
fi
# The cloud proxy re-signs TLS; edge-tts pins certifi, so add the proxy CA to this venv's bundle once.
CA=/root/.ccr/ca-bundle.crt
B=$("$V/bin/python" -c "import certifi;print(certifi.where())")
if [ -f "$CA" ] && ! grep -q "ccr-proxy-ca" "$B"; then { echo "# ccr-proxy-ca"; cat "$CA"; } >> "$B"; fi
command -v ffmpeg >/dev/null || { echo "ffmpeg missing"; exit 1; }
echo "ready: $V"
