#!/bin/bash
cd "$(dirname "$0")"
[ -d node_modules ] || npm install --omit=dev
[ -f .env ] || cp .env.example .env
( sleep 2; open http://localhost:3000 2>/dev/null || xdg-open http://localhost:3000 ) &
node --env-file-if-exists=.env src/index.ts
