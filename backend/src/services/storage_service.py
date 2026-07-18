"""Persistencia de archivos en Supabase Storage (API HTTP directa; evita bugs del SDK)."""
from __future__ import annotations

import mimetypes
import os
import tempfile
import uuid
from typing import Optional
from urllib.parse import quote, urlparse

import requests
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = (os.getenv("SUPABASE_URL") or "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY") or ""

# Bucket público por defecto. Crearlo en Supabase → Storage → New bucket → Public.
DEFAULT_BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "uploads")


def storage_configured() -> bool:
    return bool(SUPABASE_URL and (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY))


def _api_key() -> str:
    return SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY


def _auth_headers(extra: Optional[dict] = None) -> dict:
    key = _api_key()
    headers = {
        "Authorization": f"Bearer {key}",
        "apikey": key,
    }
    if extra:
        headers.update(extra)
    return headers


def _content_type(filename: str, fallback: str = "application/octet-stream") -> str:
    guessed, _ = mimetypes.guess_type(filename)
    return guessed or fallback


def _public_url(bucket: str, path: str) -> str:
    return f"{SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}"


def _ensure_bucket(bucket: str) -> None:
    """Crea el bucket público si no existe (idempotente)."""
    try:
        list_resp = requests.get(
            f"{SUPABASE_URL}/storage/v1/bucket",
            headers=_auth_headers(),
            timeout=30,
        )
        if list_resp.ok:
            buckets = list_resp.json()
            names = {
                (b.get("name") if isinstance(b, dict) else getattr(b, "name", None))
                for b in (buckets or [])
            }
            if bucket in names:
                return

        create_resp = requests.post(
            f"{SUPABASE_URL}/storage/v1/bucket",
            headers=_auth_headers({"Content-Type": "application/json"}),
            json={"id": bucket, "name": bucket, "public": True},
            timeout=30,
        )
        # 200/201 ok; 409 already exists
        if create_resp.status_code not in (200, 201, 409):
            print(f"ensure_bucket({bucket}): {create_resp.status_code} {create_resp.text}")
    except Exception as e:
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

    if storage_configured():
        _ensure_bucket(bucket)
        # Path segments encoded individually (keep '/')
        encoded_path = "/".join(quote(part, safe="") for part in object_path.split("/"))
        url = f"{SUPABASE_URL}/storage/v1/object/{bucket}/{encoded_path}"
        resp = requests.post(
            url,
            data=data,
            headers=_auth_headers({
                "Content-Type": mime,
                "x-upsert": "false",
            }),
            timeout=120,
        )
        if resp.status_code not in (200, 201):
            raise RuntimeError(
                f"Error Supabase Storage ({resp.status_code}): {resp.text[:500]}"
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
            if storage_configured():
                encoded_path = "/".join(quote(part, safe="") for part in object_path.split("/"))
                try:
                    requests.delete(
                        f"{SUPABASE_URL}/storage/v1/object/{bucket}/{encoded_path}",
                        headers=_auth_headers(),
                        timeout=30,
                    )
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
