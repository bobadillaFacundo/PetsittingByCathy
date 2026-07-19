#!/usr/bin/env bash
# Wrapper para cron: backup Qdrant → Chroma (cada 15 días)
#
# chmod +x run_backup_qdrant.sh
# 0 4 */15 * * /home/f/migration/migration/run_backup_qdrant.sh >> /home/f/migration/migration/backup.log 2>&1

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# venv: en esta carpeta, en el padre, o en ~/migration
if [[ -f "$SCRIPT_DIR/.venv/bin/activate" ]]; then
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/.venv/bin/activate"
elif [[ -f "$SCRIPT_DIR/../.venv/bin/activate" ]]; then
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/../.venv/bin/activate"
elif [[ -f "$HOME/migration/.venv/bin/activate" ]]; then
  # shellcheck disable=SC1091
  source "$HOME/migration/.venv/bin/activate"
fi

# Destino explícito para no mezclar con backup de Supabase
export BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/qdrant}"
export CHROMA_BACKUP_PATH="${CHROMA_BACKUP_PATH:-$BACKUP_DIR/chroma}"

exec python3 "$SCRIPT_DIR/backup_qdrant_to_chroma.py"
