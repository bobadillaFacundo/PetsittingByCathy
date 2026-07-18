"""Persistencia de archivos en Supabase Storage (evita el disco efímero de Render)."""
from __future__ import annotations

import mimetypes
import os
import tempfile
import uuid
from typing import Optional
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = (os.getenv("SUPABASE_URL") or "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY") or ""

# Bucket público por defecto. Crearlo en Supabase → Storage → New bucket → Public.
DEFAULT_BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "uploads")

_client = None


def storage_configured() -> bool:
    return bool(SUPABASE_URL and (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY))


def _get_client():
    global _client
    if _client is not None:
        return _client
    if not storage_configured():
        return None
    from supabase import create_client

    key = SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY
    _client = create_client(SUPABASE_URL, key)
    return _client


def _content_type(filename: str, fallback: str = "application/octet-stream") -> str:
    guessed, _ = mimetypes.guess_type(filename)
    return guessed or fallback


def _public_url(bucket: str, path: str) -> str:
    return f"{SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}"


def _ensure_bucket(client, bucket: str) -> None:
    try:
        existing = {b.name for b in client.storage.list_buckets()}
        if bucket not in existing:
            client.storage.create_bucket(bucket, options={"public": True})
    except Exception as e:
        # Si ya existe o no hay permisos, el upload fallará con un error más claro
        print(f"ensure_bucket({bucket}): {e}")


def upload_bytes(
    data: bytes,
    folder: str,
    original_filename: Optional[str] = None,
    content_type: Optional[str] = None,
    bucket: str = DEFAULT_BUCKET,
) -> str:
    """
    Sube bytes a Supabase Storage y devuelve URL pública.
    Si Supabase no está configurado, guarda en disco local (dev) y devuelve path relativo.
    """
    ext = os.path.splitext(original_filename or "")[1] or ""
    filename = f"{uuid.uuid4()}{ext}"
    object_path = f"{folder.strip('/')}/{filename}"
    mime = content_type or _content_type(original_filename or filename)

    client = _get_client()
    if client is not None:
        _ensure_bucket(client, bucket)
        client.storage.from_(bucket).upload(
            object_path,
            data,
            file_options={"content-type": mime, "upsert": "false"},
        )
        return _public_url(bucket, object_path)

    # En Render el disco es efímero: no permitir fallback silencioso a local
    if os.getenv("RENDER") or os.getenv("RENDER_SERVICE_ID"):
        raise RuntimeError(
            "Supabase Storage no está configurado (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). "
            "Sin eso los archivos se pierden al reiniciar el servicio."
        )

    # Fallback local solo en desarrollo
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    local_dir = os.path.join(base_dir, "uploads", folder.strip("/"))
    os.makedirs(local_dir, exist_ok=True)
    local_path = os.path.join(local_dir, filename)
    with open(local_path, "wb") as f:
        f.write(data)
    return f"/uploads/{folder.strip('/')}/{filename}"


def delete_by_url(url: Optional[str], bucket: str = DEFAULT_BUCKET) -> None:
    if not url:
        return

    if url.startswith("http") and SUPABASE_URL and "/storage/v1/object/public/" in url:
        prefix = f"{SUPABASE_URL}/storage/v1/object/public/{bucket}/"
        if url.startswith(prefix):
            object_path = url[len(prefix):]
            client = _get_client()
            if client is not None:
                try:
                    client.storage.from_(bucket).remove([object_path])
                except Exception as e:
                    print(f"Failed to delete storage object: {e}")
        return

    if not url.startswith("http"):
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        file_path = os.path.join(base_dir, url.lstrip("/"))
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception as e:
                print(f"Failed to delete local file: {e}")


def resolve_local_path_or_download(url: Optional[str]) -> Optional[str]:
    """
    Devuelve un path local legible (PDF/imagen).
    - Paths relativos → archivo local
    - URLs http(s) → descarga temporal
    """
    if not url:
        return None

    if not url.startswith("http"):
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        file_path = os.path.join(base_dir, url.lstrip("/"))
        return file_path if os.path.exists(file_path) else None

    try:
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()
        suffix = os.path.splitext(urlparse(url).path)[1] or ".bin"
        fd, path = tempfile.mkstemp(suffix=suffix)
        os.close(fd)
        with open(path, "wb") as f:
            f.write(resp.content)
        return path
    except Exception as e:
        print(f"Failed to download file from storage: {e}")
        return None
