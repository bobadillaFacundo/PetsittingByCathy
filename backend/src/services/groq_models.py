"""Modelos Groq vigentes y reemplazo de IDs dados de baja."""
from __future__ import annotations

import os
from typing import Iterable

# Reemplazo oficial de llama-3.1-8b-instant (fuera de servicio desde 16/08/2026).
DEFAULT_NLP_MODEL = "openai/gpt-oss-20b"
DEFAULT_VISION_MODEL = "qwen/qwen3.6-27b"
DEFAULT_VISION_FALLBACK = "qwen/qwen3.8-27b"

_REPLACEMENTS = {
    "llama-3.1-8b-instant": DEFAULT_NLP_MODEL,
    "llama-3.3-70b-versatile": "openai/gpt-oss-120b",
    "llama3-8b-8192": DEFAULT_NLP_MODEL,
    "llama3-70b-8192": "openai/gpt-oss-120b",
    "llama-3.2-11b-vision-preview": DEFAULT_VISION_MODEL,
    "llama-3.2-90b-vision-preview": DEFAULT_VISION_MODEL,
    "meta-llama/llama-4-scout-17b-16e-instruct": DEFAULT_VISION_MODEL,
    "meta-llama/llama-4-maverick-17b-128e-instruct": DEFAULT_VISION_MODEL,
    "qwen/qwen3-32b": "openai/gpt-oss-120b",
}


def resolve_groq_model(model: str | None, default: str = DEFAULT_NLP_MODEL) -> str:
    name = (model or "").strip() or default
    return _REPLACEMENTS.get(name, name)


def groq_models_to_try(primary: str, *fallbacks: str) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for name in (primary, *fallbacks):
        resolved = resolve_groq_model(name, default=name or DEFAULT_NLP_MODEL)
        if resolved and resolved not in seen:
            seen.add(resolved)
            ordered.append(resolved)
    return ordered


def nlp_models_to_try(configured: str | None = None) -> list[str]:
    primary = resolve_groq_model(configured or os.getenv("GROQ_MODEL"), DEFAULT_NLP_MODEL)
    extra = (os.getenv("GROQ_MODEL_FALLBACK") or "").strip()
    extras: Iterable[str] = (extra, DEFAULT_NLP_MODEL, "openai/gpt-oss-120b")
    return groq_models_to_try(primary, *extras)


def vision_models_to_try(primary: str | None = None, fallback: str | None = None) -> list[str]:
    return groq_models_to_try(
        resolve_groq_model(primary, DEFAULT_VISION_MODEL),
        resolve_groq_model(fallback, DEFAULT_VISION_FALLBACK),
        DEFAULT_VISION_FALLBACK,
    )


def is_groq_model_unavailable(status_code: int, body: str) -> bool:
    if status_code not in (400, 404):
        return False
    text = (body or "").lower()
    return any(
        token in text
        for token in (
            "model_decommissioned",
            "model_not_found",
            "does not exist",
            "decommissioned",
            "not supported",
        )
    )


def extract_groq_text(payload: dict) -> str:
    message = ((payload.get("choices") or [{}])[0].get("message") or {})
    content = message.get("content")
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                parts.append(item.get("text") or "")
        content = "".join(parts)
    if content:
        return str(content).strip()
    reasoning = message.get("reasoning")
    return str(reasoning or "").strip()
