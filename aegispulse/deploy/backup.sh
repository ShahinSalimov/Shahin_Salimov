#!/usr/bin/env bash
# Nightly PostgreSQL backup for AegisPulse (run from cron as the deploy user).
#   0 3 * * * /opt/aegispulse/deploy/backup.sh >> /var/log/aegispulse-backup.log 2>&1
# Restore: gunzip -c FILE.sql.gz | docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/aegispulse}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/aegispulse}"
KEEP_DAYS="${KEEP_DAYS:-14}"

cd "$APP_DIR"
# shellcheck disable=SC1091
set -a; source .env; set +a

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_DIR/aegispulse-$stamp.sql.gz"

docker compose exec -T db pg_dump -U "${POSTGRES_USER:-aegis}" -d "${POSTGRES_DB:-aegispulse}" --no-owner --clean --if-exists \
  | gzip -9 > "$target.partial"
mv "$target.partial" "$target"
chmod 600 "$target"

# Sanity check: the dump must contain the core tables.
if ! gunzip -c "$target" | grep -q "CREATE TABLE public.threat_events"; then
  echo "[$(date -u)] backup $target looks incomplete" >&2
  exit 1
fi

find "$BACKUP_DIR" -name 'aegispulse-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "[$(date -u)] backup ok: $target ($(du -h "$target" | cut -f1))"
