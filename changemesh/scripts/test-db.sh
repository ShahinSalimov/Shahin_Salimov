#!/usr/bin/env bash
# Starts a throwaway local PostgreSQL 16 cluster for database tests.
# Usage: scripts/test-db.sh start|stop
# Then: TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres npm run test:db
set -euo pipefail
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
DATA="${PGDATA_DIR:-$(pwd)/.pgdata}"
PORT="${PGPORT:-54329}"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then RUN_AS=(runuser -u postgres --); fi

case "${1:-start}" in
  start)
    if [ ! -d "$DATA" ]; then
      mkdir -p "$DATA"; [ "$(id -u)" = "0" ] && chown postgres "$DATA"
      "${RUN_AS[@]}" "$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
    fi
    "${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp -c listen_addresses=127.0.0.1" -l "$DATA/server.log" -w start >/dev/null
    echo "PostgreSQL running: postgres://postgres@127.0.0.1:$PORT/postgres"
    ;;
  stop)
    "${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -w stop >/dev/null && echo "stopped"
    ;;
  *) echo "usage: $0 start|stop" >&2; exit 1 ;;
esac
