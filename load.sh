#!/usr/bin/env bash
# Load the MySQL 8 conversion of the PostgreSQL dump into a Hostinger MySQL database.
# Usage: cp .env.example .env && edit .env && ./load.sh
# Order matters: schema -> data -> foreign keys.
set -euo pipefail
cd "$(dirname "$0")"
if [[ -f .env ]]; then set -a; source .env; set +a; fi
: "${MYSQL_HOST:?set MYSQL_HOST}"
: "${MYSQL_USER:?set MYSQL_USER}"
: "${MYSQL_PASSWORD:?set MYSQL_PASSWORD}"
: "${MYSQL_DATABASE:?set MYSQL_DATABASE}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
mysql_run() {
  mysql --host="$MYSQL_HOST" --port="$MYSQL_PORT" --user="$MYSQL_USER" \
        --password="$MYSQL_PASSWORD" --default-character-set=utf8mb4 \
        --max-allowed-packet=1G "$MYSQL_DATABASE"
}
run_file() {
  local f="$1"
  [[ -f "$f" ]] || { echo "skip (missing): $f"; return 0; }
  echo ">> loading $f ($(du -h "$f" | cut -f1))"
  mysql_run < "$f"
}
echo "== target: $MYSQL_USER@$MYSQL_HOST:$MYSQL_PORT/$MYSQL_DATABASE"
run_file sql/01_schema.sql
for f in $(ls sql/data_part_*.sql | sort); do run_file "$f"; done
run_file sql/03_foreign_keys.sql
echo "== tables present:"
mysql_run <<'SQL'
SELECT COUNT(*) AS tables_loaded FROM information_schema.tables WHERE table_schema = DATABASE();
SQL
echo "== done"
