"""Extracción de datos de certificados de vacuna desde imágenes."""
from __future__ import annotations

import base64
import json
import logging
import os
import re
from typing import Any, Optional

import requests
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://100.82.178.56:11435").rstrip("/")
OLLAMA_VISION_MODEL = os.getenv("OLLAMA_VISION_MODEL", "moondream")
OCR_SERVICE_URL = os.getenv("OCR_SERVICE_URL", "http://localhost:8703").rstrip("/")

_VLLM_BASE = os.getenv("VLLM_BASE_URL", "").rstrip("/")
VLLM_MODEL = os.getenv("VLLM_MODEL", "Qwen/Qwen2.5-7B-Instruct-AWQ")
VLLM_URL = f"{_VLLM_BASE}/chat/completions"

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_VISION_MODEL = os.getenv("GROQ_VISION_MODEL", "qwen/qwen3.6-27b")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

_VACCINE_VISION_PROMPT = (
    "Esta imagen es un certificado, etiqueta o sticker de vacuna veterinaria. "
    "Extrae los datos en JSON con estas claves exactas:\n"
    "- vaccine_name: string o null (nombre de la vacuna, ej. Séxtuple, Antirrábica, KC)\n"
    "- lot_number: string o null (número de lote)\n"
    "- date_administered: string o null (fecha de aplicación en formato YYYY-MM-DD)\n"
    "- next_due_date: string o null (próxima dosis o vencimiento en YYYY-MM-DD)\n"
    "- veterinarian_name: string o null (veterinario o clínica)\n"
    "Usa null si un dato no aparece. Responde SOLO con JSON válido."
)


class GroqUnavailableError(Exception):
    """Groq no disponible (límite de uso, error de red, etc.)."""


def _image_to_b64(image_bytes: bytes) -> str:
    return base64.b64encode(image_bytes).decode("ascii")


def _guess_mime(filename: str, image_bytes: bytes) -> str:
    lower = (filename or "").lower()
    if lower.endswith(".png") or image_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if lower.endswith(".webp") or image_bytes[:4] == b"RIFF":
        return "image/webp"
    if lower.endswith(".gif") or image_bytes[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    return "image/jpeg"


def _is_groq_retryable(status_code: int) -> bool:
    return status_code in (429, 500, 502, 503, 504)


def _ocr_text_from_response(body: Any) -> str:
    """Normaliza distintos formatos de respuesta del servicio OCR."""
    if isinstance(body, str):
        return body.strip()
    if not isinstance(body, dict):
        return str(body).strip()

    for key in ("text", "full_text", "content", "result_text"):
        val = body.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()

    lines: list[str] = []
    for key in ("lines", "results", "data"):
        items = body.get(key)
        if not isinstance(items, list):
            continue
        for item in items:
            if isinstance(item, str):
                lines.append(item)
            elif isinstance(item, dict):
                t = item.get("text") or item.get("content")
                if t:
                    lines.append(str(t))
            elif isinstance(item, (list, tuple)) and len(item) >= 2:
                text_part = item[1]
                if isinstance(text_part, (list, tuple)) and text_part:
                    lines.append(str(text_part[0]))
                elif isinstance(text_part, str):
                    lines.append(text_part)
    if lines:
        return "\n".join(lines).strip()
    return json.dumps(body, ensure_ascii=False)


def extract_text_ocr(image_bytes: bytes, filename: str = "image.jpg", lang: str = "es") -> str:
    """Extrae texto plano con PaddleOCR (servicio HTTP local)."""
    files = {"file": (filename, image_bytes)}
    data = {"lang": lang}
    resp = requests.post(f"{OCR_SERVICE_URL}/ocr", files=files, data=data, timeout=120)
    resp.raise_for_status()
    return _ocr_text_from_response(resp.json())


def extract_text_moondream(image_bytes: bytes) -> str:
    """Describe el contenido de la imagen con Moondream vía Ollama."""
    prompt = (
        "Esta imagen es un certificado, etiqueta o sticker de vacuna veterinaria. "
        "Transcribe TODO el texto visible y describe los datos: nombre de la vacuna, "
        "número de lote, fecha de aplicación, próxima dosis o vencimiento, "
        "nombre del veterinario o clínica. Responde en español."
    )
    payload = {
        "model": OLLAMA_VISION_MODEL,
        "prompt": prompt,
        "images": [_image_to_b64(image_bytes)],
        "stream": False,
    }
    resp = requests.post(f"{OLLAMA_BASE_URL}/api/generate", json=payload, timeout=180)
    resp.raise_for_status()
    text = (resp.json().get("response") or "").strip()
    if not text:
        raise RuntimeError("Ollama no devolvió texto")
    return text


def _call_groq_json(messages: list, model: str) -> dict:
    if not GROQ_API_KEY:
        raise GroqUnavailableError("GROQ_API_KEY no configurada")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {GROQ_API_KEY}",
    }
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.05,
        "response_format": {"type": "json_object"},
    }
    try:
        resp = requests.post(GROQ_URL, headers=headers, json=payload, timeout=90)
    except requests.RequestException as e:
        raise GroqUnavailableError(str(e)) from e

    if _is_groq_retryable(resp.status_code):
        raise GroqUnavailableError(f"Groq HTTP {resp.status_code}: {resp.text[:200]}")
    resp.raise_for_status()

    content = resp.json()["choices"][0]["message"]["content"]
    return json.loads(content)


def _call_vllm_json(messages: list) -> dict:
    if not _VLLM_BASE:
        raise RuntimeError("vLLM no configurado")

    headers = {"Content-Type": "application/json"}
    payload = {
        "model": VLLM_MODEL,
        "messages": messages,
        "temperature": 0.05,
        "response_format": {"type": "json_object"},
    }
    resp = requests.post(VLLM_URL, headers=headers, json=payload, timeout=90)
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]
    return json.loads(content)


def _call_llm_json(messages: list, prefer_groq: bool = True, groq_model: Optional[str] = None) -> dict:
    """Llama a Groq por defecto; si falla, usa vLLM."""
    if prefer_groq and GROQ_API_KEY:
        try:
            return _call_groq_json(messages, groq_model or GROQ_VISION_MODEL)
        except (GroqUnavailableError, json.JSONDecodeError, KeyError) as e:
            logger.warning("Groq NLP falló, probando vLLM: %s", e)

    if _VLLM_BASE:
        return _call_vllm_json(messages)
    return {}


def extract_fields_groq_vision(
    image_bytes: bytes,
    filename: str = "image.jpg",
    catalog_names: Optional[list[str]] = None,
) -> dict[str, Any]:
    """Analiza la imagen directamente con Groq Vision (qwen/qwen3.6-27b)."""
    catalog_hint = ""
    if catalog_names:
        catalog_hint = (
            "\nNombres de vacunas conocidos en el catálogo (elige el más cercano si aplica):\n"
            + ", ".join(catalog_names)
        )

    mime = _guess_mime(filename, image_bytes)
    data_url = f"data:{mime};base64,{_image_to_b64(image_bytes)}"
    messages = [
        {
            "role": "system",
            "content": "Eres un extractor de datos veterinarios. Responde SOLO con JSON válido.",
        },
        {
            "role": "user",
            "content": [
                {"type": "text", "text": _VACCINE_VISION_PROMPT + catalog_hint},
                {"type": "image_url", "image_url": {"url": data_url}},
            ],
        },
    ]
    parsed = _call_groq_json(messages, GROQ_VISION_MODEL)
    return _fields_from_parsed(parsed, raw_text=json.dumps(parsed, ensure_ascii=False))


def _normalize_date(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    s = str(value).strip()
    if not s or s.lower() in ("null", "none", "n/a", "-"):
        return None
    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return s
    m = re.match(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$", s)
    if m:
        d, mo, y = m.groups()
        return f"{y}-{int(mo):02d}-{int(d):02d}"
    return None


def _fields_from_parsed(parsed: dict, raw_text: str) -> dict[str, Any]:
    return {
        "vaccine_name": (parsed.get("vaccine_name") or None),
        "lot_number": (parsed.get("lot_number") or None),
        "date_administered": _normalize_date(parsed.get("date_administered")),
        "next_due_date": _normalize_date(parsed.get("next_due_date")),
        "veterinarian_name": (parsed.get("veterinarian_name") or None),
        "raw_text": raw_text,
    }


def parse_vaccine_fields(
    raw_text: str,
    catalog_names: Optional[list[str]] = None,
    prefer_groq: bool = True,
) -> dict[str, Any]:
    """Convierte texto OCR/visión en campos estructurados de vacuna."""
    catalog_hint = ""
    if catalog_names:
        catalog_hint = (
            "\nNombres de vacunas conocidos en el catálogo (elige el más cercano si aplica):\n"
            + ", ".join(catalog_names)
        )

    prompt = f"""
Analiza el siguiente texto extraído de un certificado o etiqueta de vacuna veterinaria.
Extrae los datos en JSON con estas claves exactas:
- vaccine_name: string o null (nombre de la vacuna, ej. Séxtuple, Antirrábica, KC)
- lot_number: string o null (número de lote)
- date_administered: string o null (fecha de aplicación en formato YYYY-MM-DD)
- next_due_date: string o null (próxima dosis o vencimiento en YYYY-MM-DD)
- veterinarian_name: string o null (veterinario o clínica)
{catalog_hint}

Texto extraído:
{raw_text}
"""
    messages = [
        {
            "role": "system",
            "content": "Eres un extractor de datos veterinarios. Responde SOLO con JSON válido.",
        },
        {"role": "user", "content": prompt},
    ]
    try:
        parsed = _call_llm_json(messages, prefer_groq=prefer_groq)
    except Exception as e:
        logger.warning("Error parseando campos de vacuna: %s", e)
        parsed = {}

    return _fields_from_parsed(parsed, raw_text=raw_text)


def _scan_with_auto_fallback(
    image_bytes: bytes,
    filename: str,
    catalog_names: Optional[list[str]] = None,
) -> dict[str, Any]:
    """
    Cadena automática: Groq Vision → Ollama → OCR.
    Si Groq falla por límite o error, no se reintenta en el paso de NLP.
    """
    errors: list[str] = []
    groq_available = bool(GROQ_API_KEY)

    if groq_available:
        try:
            fields = extract_fields_groq_vision(image_bytes, filename=filename, catalog_names=catalog_names)
            fields["method"] = "groq"
            return fields
        except (GroqUnavailableError, json.JSONDecodeError, KeyError, requests.RequestException) as e:
            msg = f"Groq: {e}"
            logger.warning("Escaneo vacuna - %s", msg)
            errors.append(msg)
            groq_available = False

    try:
        raw_text = extract_text_moondream(image_bytes)
        fields = parse_vaccine_fields(raw_text, catalog_names=catalog_names, prefer_groq=groq_available)
        fields["method"] = "moondream"
        if errors:
            fields["fallback_from"] = errors
        return fields
    except Exception as e:
        msg = f"Ollama: {e}"
        logger.warning("Escaneo vacuna - %s", msg)
        errors.append(msg)

    try:
        raw_text = extract_text_ocr(image_bytes, filename=filename)
        if not raw_text.strip():
            raise RuntimeError("OCR no detectó texto")
        fields = parse_vaccine_fields(raw_text, catalog_names=catalog_names, prefer_groq=groq_available)
        fields["method"] = "ocr"
        if errors:
            fields["fallback_from"] = errors
        return fields
    except Exception as e:
        errors.append(f"OCR: {e}")
        raise RuntimeError(
            "No se pudo analizar la imagen. Intentos: " + "; ".join(errors)
        ) from e


def scan_vaccine_image(
    image_bytes: bytes,
    filename: str = "image.jpg",
    engine: str = "auto",
    catalog_names: Optional[list[str]] = None,
) -> dict[str, Any]:
    """
    Escanea una imagen de vacuna.
    engine:
      - 'auto' (default): Groq qwen/qwen3.6-27b → Ollama → OCR
      - 'groq': solo Groq Vision
      - 'moondream' / 'ollama': solo Ollama
      - 'ocr': solo PaddleOCR
    """
    engine = (engine or "auto").strip().lower()

    if engine == "auto":
        return _scan_with_auto_fallback(image_bytes, filename, catalog_names)

    if engine == "groq":
        fields = extract_fields_groq_vision(image_bytes, filename=filename, catalog_names=catalog_names)
        fields["method"] = "groq"
        return fields

    if engine == "ocr":
        raw_text = extract_text_ocr(image_bytes, filename=filename)
        fields = parse_vaccine_fields(raw_text, catalog_names=catalog_names)
        fields["method"] = "ocr"
        return fields

    if engine in ("moondream", "vision", "modal", "ollama"):
        raw_text = extract_text_moondream(image_bytes)
        fields = parse_vaccine_fields(raw_text, catalog_names=catalog_names)
        fields["method"] = "moondream"
        return fields

    raise ValueError(
        f"Motor desconocido: {engine}. Use 'auto', 'groq', 'moondream' u 'ocr'."
    )


def match_vaccine_catalog_id(vaccine_name: Optional[str], catalog: list[dict]) -> Optional[int]:
    """Intenta mapear el nombre detectado al catálogo (coincidencia exacta o parcial)."""
    if not vaccine_name or not catalog:
        return None
    name_lower = vaccine_name.strip().lower()
    for item in catalog:
        cat_name = (item.get("name") or "").strip().lower()
        if cat_name == name_lower:
            return item["id"]
    for item in catalog:
        cat_name = (item.get("name") or "").strip().lower()
        if cat_name in name_lower or name_lower in cat_name:
            return item["id"]
    return None
