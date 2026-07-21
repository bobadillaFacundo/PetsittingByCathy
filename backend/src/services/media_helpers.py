"""Utilidades compartidas para subida de fotos y videos."""
import os
from typing import Optional, Tuple

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".m4v", ".3gp", ".avi", ".mkv"}


def detect_media_type(filename: Optional[str], content_type: Optional[str] = None) -> Tuple[str, str]:
    """Devuelve (file_type, storage_folder). file_type: 'image' | 'video'."""
    ext = os.path.splitext(filename or "")[1].lower()
    if ext in VIDEO_EXTENSIONS or (content_type and content_type.startswith("video/")):
        return "video", "videos"
    if ext in IMAGE_EXTENSIONS or (content_type and content_type.startswith("image/")):
        return "image", "photos"
    raise ValueError(f"Formato no soportado: {filename or content_type or 'desconocido'}")
