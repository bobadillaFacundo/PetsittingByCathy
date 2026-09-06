"""Helpers de URLs de Postgres/Supabase (sin abrir conexiones)."""
from __future__ import annotations

from urllib.parse import quote, unquote, urlparse


def redact_db_url(url: str) -> str:
    parsed = urlparse(url or "")
    host = parsed.hostname or "?"
    port = parsed.port or ""
    return f"{parsed.scheme}://***@{host}:{port}{parsed.path}"


def swap_pooler_port(url: str) -> str:
    return url.replace(":6543", ":5432") if ":6543" in url else url


def supabase_direct_from_pooler(url: str) -> str | None:
    """Convierte el pooler (6543, usuario postgres.REF) a db.REF.supabase.co:5432."""
    parsed = urlparse(url or "")
    host = parsed.hostname or ""
    user = parsed.username or ""
    if "pooler.supabase.com" not in host or "." not in user:
        return None
    project = user.split(".", 1)[1]
    if not project:
        return None
    password = quote(unquote(parsed.password or ""), safe="")
    path = parsed.path or "/postgres"
    query = f"?{parsed.query}" if parsed.query else ""
    return f"postgresql://postgres:{password}@db.{project}.supabase.co:5432{path}{query}"


def ddl_url_candidates(database_url: str | None, direct_url: str | None = None) -> list[str]:
    """Orden: DIRECT → host directo Supabase → mismo host :5432 → pooler original."""
    ordered: list[str] = []
    for url in (
        direct_url,
        supabase_direct_from_pooler(database_url or ""),
        swap_pooler_port(database_url or ""),
        database_url,
    ):
        if url and url not in ordered:
            ordered.append(url)
    return ordered
