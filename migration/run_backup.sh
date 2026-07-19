#!/usr/bin/env bash
# Wrapper para cron: backup Supabase (Postgres + Storage) cada 15 días
#
# Instalar:
#   chmod +x migration/run_backup.sh
#   crontab -e
#   0 3 */15 * * /home/f/migration/supabase/run_backup.sh >> /home/f/backups/petsitting/backup.log 2>&1

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"

cd "$SCRIPT_DIR"

if [[ -f "$SCRIPT_DIR/.venv/bin/activate" ]]; then
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/.venv/bin/activate"
elif [[ -d "$BACKEND_DIR" && -f "$BACKEND_DIR/.venv/bin/activate" ]]; then
  # shellcheck disable=SC1091
  source "$BACKEND_DIR/.venv/bin/activate"
  export PYTHONPATH="$BACKEND_DIR${PYTHONPATH:+:$PYTHONPATH}"
fi

exec python3 "$SCRIPT_DIR/backup_to_server.py"
