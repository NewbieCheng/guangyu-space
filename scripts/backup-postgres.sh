#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${GUANGYU_DB_BACKUP_DIR:-$PROJECT_ROOT/data/postgres-backups}"
STAMP="$(TZ=Asia/Shanghai date +%Y%m%d-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/guangyu-postgres-$STAMP.dump"

umask 077
mkdir -p "$BACKUP_DIR"
if ! docker compose -f "$PROJECT_ROOT/docker-compose.yml" -f "$PROJECT_ROOT/compose.local.yml" exec -T postgres pg_dump -U velobase -d velobase --format=custom > "$BACKUP_FILE"; then
  rm -f "$BACKUP_FILE"
  printf 'PostgreSQL backup failed.\n' >&2
  exit 1
fi
if [ ! -s "$BACKUP_FILE" ]; then
  rm -f "$BACKUP_FILE"
  printf 'PostgreSQL backup is empty.\n' >&2
  exit 1
fi
find "$BACKUP_DIR" -type f -name 'guangyu-postgres-*.dump' -mtime +6 -delete
printf 'Created %s\n' "$BACKUP_FILE"
