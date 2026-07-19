#!/usr/bin/env python3
"""
backup_qdrant_to_chroma.py
==========================
Copia de seguridad de Qdrant → ChromaDB local (persistente).

Cada corrida regenera las colecciones en disco (dump completo, como la BD).

Uso:
  cd /ruta/PetsittingByCathy
  python migration/backup_qdrant_to_chroma.py

Cron (junto al backup de Supabase, cada 15 días):
  0 3 */15 * * /ruta/PetsittingByCathy/migration/run_backup.sh >> /var/log/petsitting_backup.log 2>&1

Variables (.env en backend/ o entorno):
  QDRANT_URL                 Origen (Cloud o self-hosted)
  QDRANT_API_KEY             Opcional (Cloud)
  BACKUP_DIR                 Destino base (default: ../backups/petsitting)
  CHROMA_BACKUP_PATH         Override path Chroma (default: BACKUP_DIR/chroma)
  QDRANT_BACKUP_COLLECTIONS  Lista separada por comas (default: veterinary_reports)
                             Usá "*" para migrar todas las colecciones
  BATCH_SIZE                 Puntos por lote (default: 100)
"""

from __future__ import annotations

import json
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = REPO_ROOT / "backend"
# Buscar .env en varios lugares (servidor con carpetas sueltas o repo completo)
for env_path in (
    SCRIPT_DIR / ".env",
    REPO_ROOT / ".env",
    BACKEND_DIR / ".env",
    Path.home() / "migration" / ".env",
):
    if env_path.is_file():
        load_dotenv(env_path)
load_dotenv()

# Por defecto: backups/qdrant (no mezclar con petsitting)
BACKUP_DIR = Path(os.getenv("BACKUP_DIR") or (Path.home() / "backups" / "qdrant")).resolve()
CHROMA_PATH = Path(os.getenv("CHROMA_BACKUP_PATH") or (BACKUP_DIR / "chroma")).resolve()
QDRANT_URL = (os.getenv("QDRANT_URL") or "").strip()
QDRANT_API_KEY = (os.getenv("QDRANT_API_KEY") or "").strip() or None
COLLECTIONS_ENV = (os.getenv("QDRANT_BACKUP_COLLECTIONS") or "veterinary_reports").strip()
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "100"))


def log(msg: str) -> None:
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)


def sanitize_metadata(payload: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Chroma solo acepta str/int/float/bool en metadata."""
    out: Dict[str, Any] = {}
    if not payload:
        return out
    for key, value in payload.items():
        if value is None:
            continue
        k = str(key)
        if isinstance(value, bool):
            out[k] = value
        elif isinstance(value, int) and not isinstance(value, bool):
            out[k] = value
        elif isinstance(value, float):
            out[k] = value
        elif isinstance(value, str):
            out[k] = value
        else:
            out[k] = json.dumps(value, ensure_ascii=False, default=str)
    return out


def document_from_payload(payload: Optional[Dict[str, Any]]) -> str:
    if not payload:
        return ""
    for key in ("text", "content", "document", "chunk", "body", "transcription"):
        val = payload.get(key)
        if isinstance(val, str) and val.strip():
            return val
    return json.dumps(payload, ensure_ascii=False, default=str)


def extract_vector(raw: Any) -> Optional[List[float]]:
    """Soporta vector plano o named vectors (toma el primero)."""
    if raw is None:
        return None
    if isinstance(raw, dict):
        if not raw:
            return None
        first = next(iter(raw.values()))
        return list(first) if first is not None else None
    return list(raw)


def resolve_collections(src) -> List[str]:
    existing = [c.name for c in src.get_collections().collections]
    if COLLECTIONS_ENV in ("*", "all", "ALL"):
        return existing
    wanted = [c.strip() for c in COLLECTIONS_ENV.split(",") if c.strip()]
    missing = [c for c in wanted if c not in existing]
    for name in missing:
        log(f"AVISO: colección '{name}' no existe en Qdrant; se omite")
    return [c for c in wanted if c in existing]


def migrate_collection(src, chroma, col_name: str) -> Tuple[int, int]:
    info = src.get_collection(col_name)
    total = src.count(col_name).count
    log(f"=== {col_name}: {total} punto(s) ===")

    # Recrear colección destino
    try:
        chroma.delete_collection(col_name)
    except Exception:
        pass
    dest = chroma.get_or_create_collection(name=col_name, metadata={"source": "qdrant", "backup": "true"})

    if total == 0:
        return 0, 0

    migrated = 0
    skipped = 0
    offset = None

    while True:
        results, next_offset = src.scroll(
            collection_name=col_name,
            offset=offset,
            limit=BATCH_SIZE,
            with_vectors=True,
            with_payload=True,
        )
        if not results:
            break

        ids: List[str] = []
        embeddings: List[List[float]] = []
        documents: List[str] = []
        metadatas: List[Dict[str, Any]] = []

        for point in results:
            vec = extract_vector(point.vector)
            if not vec:
                skipped += 1
                continue
            ids.append(str(point.id))
            embeddings.append(vec)
            payload = point.payload or {}
            documents.append(document_from_payload(payload))
            metadatas.append(sanitize_metadata(payload))

        if ids:
            dest.upsert(ids=ids, embeddings=embeddings, documents=documents, metadatas=metadatas)
            migrated += len(ids)
            log(f"  ... {migrated}/{total}")

        if next_offset is None:
            break
        offset = next_offset

    final = dest.count()
    if final != migrated:
        log(f"  AVISO: chroma.count()={final}, migrados={migrated}")
    else:
        log(f"  OK: {final} vectores en Chroma")
    if skipped:
        log(f"  omitidos sin vector: {skipped}")
    return migrated, skipped


def write_manifest(stats: Dict[str, Any]) -> None:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    manifest = BACKUP_DIR / "LAST_QDRANT_BACKUP.txt"
    lines = [
        f"fecha={datetime.now().isoformat()}",
        f"qdrant_url={QDRANT_URL}",
        f"chroma_path={CHROMA_PATH}",
        f"collections={','.join(stats.get('collections', []))}",
        f"migrated={stats.get('migrated', 0)}",
        f"skipped={stats.get('skipped', 0)}",
    ]
    for name, count in (stats.get("per_collection") or {}).items():
        lines.append(f"count.{name}={count}")
    manifest.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    if not QDRANT_URL:
        raise SystemExit("Falta QDRANT_URL en backend/.env")

    try:
        from qdrant_client import QdrantClient
        import chromadb
    except ImportError as e:
        raise SystemExit(
            f"Falta dependencia: {e}\n"
            "Instalá: pip install -r migration/requirements.txt"
        ) from e

    log(f"Origen Qdrant: {QDRANT_URL}")
    log(f"Destino Chroma: {CHROMA_PATH}")

    # Escribir en tmp y luego reemplazar para no dejar chroma a medias
    tmp_path = CHROMA_PATH.parent / f".chroma_tmp_{datetime.now().strftime('%Y%m%d%H%M%S')}"
    if tmp_path.exists():
        shutil.rmtree(tmp_path)
    tmp_path.mkdir(parents=True, exist_ok=True)

    src = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY, timeout=120, check_compatibility=False)
    try:
        src.get_collections()
    except Exception as e:
        shutil.rmtree(tmp_path, ignore_errors=True)
        raise SystemExit(f"No se pudo conectar a Qdrant: {e}") from e

    collections = resolve_collections(src)
    if not collections:
        shutil.rmtree(tmp_path, ignore_errors=True)
        raise SystemExit("No hay colecciones para migrar")

    chroma = chromadb.PersistentClient(path=str(tmp_path))
    migrated_total = 0
    skipped_total = 0
    per_collection: Dict[str, int] = {}

    for name in collections:
        m, s = migrate_collection(src, chroma, name)
        migrated_total += m
        skipped_total += s
        per_collection[name] = m

    # Swap atómico-ish
    CHROMA_PATH.parent.mkdir(parents=True, exist_ok=True)
    old_path = CHROMA_PATH.parent / f".chroma_old_{datetime.now().strftime('%Y%m%d%H%M%S')}"
    if CHROMA_PATH.exists():
        CHROMA_PATH.rename(old_path)
    tmp_path.rename(CHROMA_PATH)
    if old_path.exists():
        shutil.rmtree(old_path, ignore_errors=True)

    write_manifest(
        {
            "collections": collections,
            "migrated": migrated_total,
            "skipped": skipped_total,
            "per_collection": per_collection,
        }
    )
    log(f"OK — backup Qdrant→Chroma terminado ({migrated_total} vectores)")


if __name__ == "__main__":
    main()
