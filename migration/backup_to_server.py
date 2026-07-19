#!/usr/bin/env python3
"""
backup_to_server.py
===================
Copia de seguridad desde Supabase → carpeta local del servidor.

- Base de datos: SIEMPRE dump completo nuevo (se regenera de cero).
- Storage: solo descarga archivos que aún no existen en local (incremental).

Uso en el servidor (SSH):
  cd /ruta/PetsittingByCathy
  python migration/backup_to_server.py

Cron cada 15 días (ejemplo, a las 03:00):
  0 3 */15 * *  /ruta/PetsittingByCathy/migration/run_backup.sh >> /var/log/petsitting_backup.log 2>&1

Variables (.env o entorno):
  BACKUP_DIR                 Carpeta destino (default: ../backups/petsitting)
  BACKUP_SOURCE_DATABASE_URL URL Postgres DIRECTA de Supabase (puerto 5432, no 6543)
                             Si no está, usa DATABASE_URL
  SUPABASE_URL               https://XXXX.supabase.co
  SUPABASE_SERVICE_ROLE_KEY  service_role
  SUPABASE_STORAGE_BUCKET    uploads (default)
  BACKUP_KEEP_DB             Cuántos dumps de BD conservar (default: 4)
"""

from __future__ import annotations

import gzip
import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import List, Set
from urllib.parse import quote, urlparse

import requests
from dotenv import load_dotenv

# migration/ → repo root; .env vive en backend/
REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
load_dotenv(BACKEND_DIR / ".env")
load_dotenv()

BACKUP_DIR = Path(os.getenv("BACKUP_DIR") or (REPO_ROOT / "backups" / "petsitting")).resolve()
BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "uploads").strip() or "uploads"
KEEP_DB = int(os.getenv("BACKUP_KEEP_DB", "4"))

SUPABASE_URL = (os.getenv("SUPABASE_URL") or "").strip().rstrip("/")
for _suf in ("/rest/v1", "/storage/v1", "/auth/v1"):
    if SUPABASE_URL.endswith(_suf):
        SUPABASE_URL = SUPABASE_URL[: -len(_suf)].rstrip("/")

SERVICE_KEY = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
DB_URL = (os.getenv("BACKUP_SOURCE_DATABASE_URL") or os.getenv("DATABASE_URL") or "").strip()


def log(msg: str) -> None:
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)


def _auth_headers() -> dict:
    return {
        "Authorization": f"Bearer {SERVICE_KEY}",
        "apikey": SERVICE_KEY,
    }


def _sanitize_db_url_for_dump(url: str) -> str:
    """Asegura URI usable por pg_dump (sin +psycopg2 etc.)."""
    if url.startswith("postgresql+psycopg2://"):
        url = "postgresql://" + url[len("postgresql+psycopg2://") :]
    elif url.startswith("postgres+psycopg2://"):
        url = "postgresql://" + url[len("postgres+psycopg2://") :]
    # Preferir puerto directo 5432 si alguien dejó el pooler 6543
    parsed = urlparse(url)
    if parsed.port == 6543:
        log("AVISO: DATABASE_URL usa puerto 6543 (pooler). Para dump preferí 5432 (directo).")
    return url


def backup_database() -> Path:
    """Dump completo nuevo (regenera de cero el archivo de esa corrida)."""
    if not DB_URL:
        raise SystemExit("Falta BACKUP_SOURCE_DATABASE_URL o DATABASE_URL")

    if shutil.which("pg_dump") is None:
        raise SystemExit("pg_dump no está instalado en este servidor (apt install postgresql-client)")

    db_dir = BACKUP_DIR / "db"
    db_dir.mkdir(parents=True, exist_ok=True)

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_sql = db_dir / f"petsitting_{stamp}.sql"
    out_gz = db_dir / f"petsitting_{stamp}.sql.gz"
    dump_url = _sanitize_db_url_for_dump(DB_URL)

    log(f"BD: dump completo → {out_gz.name}")
    # Formato plain SQL comprimido: fácil de inspeccionar y restaurar
    env = os.environ.copy()
    # pg_dump lee la URL
    proc = subprocess.run(
        ["pg_dump", "--no-owner", "--no-acl", "--clean", "--if-exists", dump_url],
        capture_output=True,
    )
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", errors="replace")[:800]
        raise SystemExit(f"pg_dump falló:\n{err}")

    with gzip.open(out_gz, "wb") as f:
        f.write(proc.stdout)

    # Enlace/copia "latest" siempre regenerada
    latest = db_dir / "petsitting_latest.sql.gz"
    if latest.exists() or latest.is_symlink():
        latest.unlink()
    shutil.copy2(out_gz, latest)
    log(f"BD: listo ({out_gz.stat().st_size // 1024} KB). latest actualizado.")

    # Retener solo los últimos KEEP_DB dumps (además de latest)
    dumps = sorted(db_dir.glob("petsitting_2*.sql.gz"), reverse=True)
    for old in dumps[KEEP_DB:]:
        log(f"BD: borrando dump viejo {old.name}")
        old.unlink(missing_ok=True)

    return out_gz


def _list_prefix(prefix: str) -> List[dict]:
    """Lista un nivel del bucket (archivos y carpetas)."""
    url = f"{SUPABASE_URL}/storage/v1/object/list/{BUCKET}"
    items: List[dict] = []
    offset = 0
    limit = 100
    while True:
        resp = requests.post(
            url,
            headers={**_auth_headers(), "Content-Type": "application/json"},
            json={
                "prefix": prefix,
                "limit": limit,
                "offset": offset,
                "sortBy": {"column": "name", "order": "asc"},
            },
            timeout=60,
        )
        if not resp.ok:
            raise RuntimeError(f"List storage falló ({resp.status_code}): {resp.text[:400]}")
        batch = resp.json() or []
        if not batch:
            break
        items.extend(batch)
        if len(batch) < limit:
            break
        offset += limit
    return items


def _walk_storage(prefix: str = "") -> List[str]:
    """Devuelve paths relativos de todos los archivos del bucket."""
    files: List[str] = []
    stack = [prefix]
    while stack:
        cur = stack.pop()
        for item in _list_prefix(cur):
            name = item.get("name") or ""
            if not name or name in (".emptyFolderPlaceholder",):
                continue
            if cur and not cur.endswith("/"):
                rel = f"{cur}/{name}"
            else:
                rel = f"{cur}{name}"
            # En Storage API: carpetas tienen id=null; archivos tienen id
            if item.get("id") is None:
                folder_prefix = rel if rel.endswith("/") else rel + "/"
                stack.append(folder_prefix)
            else:
                files.append(rel.lstrip("/"))
    return files


def backup_storage_incremental() -> None:
    """Solo descarga lo que falta en BACKUP_DIR/storage."""
    if not SUPABASE_URL or not SERVICE_KEY:
        raise SystemExit("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY para Storage")

    storage_dir = BACKUP_DIR / "storage"
    storage_dir.mkdir(parents=True, exist_ok=True)

    log(f"Storage: listando bucket '{BUCKET}'…")
    try:
        remote_files = _walk_storage("")
    except Exception as e:
        # Fallback: listar carpetas conocidas
        log(f"Storage: walk raíz falló ({e}); pruebo labs/ y photos/")
        remote_files = []
        for folder in ("labs", "photos", "audios"):
            for item in _list_prefix(f"{folder}/"):
                name = item.get("name") or ""
                if not name or item.get("id") is None:
                    continue
                remote_files.append(f"{folder}/{name}")

    # Deduplicar
    remote_set: Set[str] = set(remote_files)
    log(f"Storage: {len(remote_set)} objeto(s) en Supabase")

    downloaded = 0
    skipped = 0
    errors = 0

    for rel in sorted(remote_set):
        dest = storage_dir / rel
        if dest.exists() and dest.stat().st_size > 0:
            skipped += 1
            continue

        dest.parent.mkdir(parents=True, exist_ok=True)
        encoded = "/".join(quote(p, safe=".-_") for p in rel.split("/") if p)
        url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{encoded}"
        try:
            resp = requests.get(url, headers=_auth_headers(), timeout=120)
            if not resp.ok:
                log(f"  ERROR {rel}: {resp.status_code} {resp.text[:120]}")
                errors += 1
                continue
            dest.write_bytes(resp.content)
            downloaded += 1
            log(f"  + {rel} ({len(resp.content) // 1024} KB)")
        except Exception as e:
            log(f"  ERROR {rel}: {e}")
            errors += 1

    log(f"Storage: nuevos={downloaded} ya_estaban={skipped} errores={errors}")


def write_manifest(db_file: Path) -> None:
    manifest = BACKUP_DIR / "LAST_BACKUP.txt"
    manifest.write_text(
        f"fecha={datetime.now().isoformat()}\n"
        f"db={db_file.name}\n"
        f"storage_dir={BACKUP_DIR / 'storage'}\n"
        f"bucket={BUCKET}\n",
        encoding="utf-8",
    )


def main() -> None:
    log(f"Backup → {BACKUP_DIR}")
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    db_file = backup_database()
    backup_storage_incremental()
    write_manifest(db_file)
    log("OK — backup terminado")


if __name__ == "__main__":
    main()
