"""Extracción de datos de certificados de vacuna desde imágenes."""
from __future__ import annotations

import base64
import io
import json
import logging
import os
import re
from typing import Any, Optional

import requests
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = (os.getenv("OLLAMA_BASE_URL") or "").strip().rstrip("/")
OLLAMA_VISION_MODEL = os.getenv("OLLAMA_VISION_MODEL", "moondream")
OCR_SERVICE_URL = (os.getenv("OCR_SERVICE_URL") or "").strip().rstrip("/")
VISION_SKIP_LOCAL_FALLBACKS = os.getenv("VISION_SKIP_LOCAL_FALLBACKS", "").strip().lower() in (
    "1", "true", "yes"
)

_VLLM_BASE = os.getenv("VLLM_BASE_URL", "").rstrip("/")
VLLM_MODEL = os.getenv("VLLM_MODEL", "Qwen/Qwen2.5-7B-Instruct-AWQ")
VLLM_URL = f"{_VLLM_BASE}/chat/completions"

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_VISION_MODEL = os.getenv("GROQ_VISION_MODEL", "qwen/qwen3.6-27b")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "15"))
OCR_TIMEOUT = int(os.getenv("OCR_TIMEOUT", "10"))
GROQ_MAX_IMAGE_BYTES = 18 * 1024 * 1024  # margen bajo el límite de 20 MB de Groq

_VACCINE_VISION_PROMPT = (
    "Esta imagen puede ser una libreta de vacunación, certificado o etiqueta con UNA o VARIAS vacunas. "
    "Identifica TODAS las vacunas visibles (cada fila, sello o aplicación cuenta como una entrada). "
    "Devuelve JSON con esta estructura exacta:\n"
    '{"vaccines": [{"vaccine_name": string|null, "lot_number": string|null, '
    '"date_administered": string|null, "next_due_date": string|null, "veterinarian_name": string|null}]}\n'
    "Campos por vacuna:\n"
    "- vaccine_name: nombre (ej. Séxtuple, Antirrábica, KC)\n"
    "- lot_number: número de lote\n"
    "- date_administered: fecha aplicación YYYY-MM-DD\n"
    "- next_due_date: próxima dosis o vencimiento YYYY-MM-DD\n"
    "- veterinarian_name: veterinario o clínica\n"
    "Usa null si un dato no aparece. Si hay una sola vacuna, igual devuelve un array con un elemento. "
    "Responde SOLO con JSON válido, sin markdown."
)


class GroqUnavailableError(Exception):
    """Groq no disponible (límite de uso, error de red, etc.)."""


def _image_to_b64(image_bytes: bytes) -> str:
    return base64.b64encode(image_bytes).decode("ascii")


def _is_pdf(image_bytes: bytes, filename: str = "") -> bool:
    if (filename or "").lower().endswith(".pdf"):
        return True
    return image_bytes[:4] == b"%PDF"


def _is_heic(image_bytes: bytes, filename: str = "") -> bool:
    lower = (filename or "").lower()
    if lower.endswith((".heic", ".heif")):
        return True
    if len(image_bytes) > 16 and image_bytes[4:8] == b"ftyp":
        brand = image_bytes[8:16].lower()
        return any(tag in brand for tag in (b"heic", b"heix", b"hevc", b"mif1", b"msf1"))
    return False


def _prepare_image_for_vision(image_bytes: bytes, filename: str = "image.jpg") -> tuple[bytes, str]:
    """
    Normaliza la imagen a JPEG razonable para Groq (HEIC, PNG grande, etc.).
  Devuelve (bytes, filename).
    """
    if _is_pdf(image_bytes, filename):
        raise ValueError("Para PDF usá escaneo automático; si falla, subí una foto JPG del certificado.")

    try:
        from PIL import Image
    except ImportError:
        if _is_heic(image_bytes, filename):
            raise ValueError(
                "Formato HEIC no soportado en el servidor. Exportá la foto como JPG o PNG."
            )
        if len(image_bytes) > GROQ_MAX_IMAGE_BYTES:
            raise ValueError("La imagen supera 18 MB. Usá una foto más liviana.")
        return image_bytes, filename or "image.jpg"

    try:
        import pillow_heif
        pillow_heif.register_heif_opener()
    except ImportError:
        pass

    try:
        img = Image.open(io.BytesIO(image_bytes))
        img.load()
    except Exception as e:
        raise ValueError(
            f"No se pudo leer la imagen ({filename or 'archivo'}). "
            f"Usá JPG o PNG. Detalle: {e}"
        ) from e

    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    elif img.mode == "L":
        img = img.convert("RGB")

    max_side = 2048
    w, h = img.size
    if max(w, h) > max_side:
        ratio = max_side / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.Resampling.LANCZOS)

    out = io.BytesIO()
    quality = 88
    while quality >= 55:
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=quality, optimize=True)
        if out.tell() <= 4 * 1024 * 1024:
            break
        quality -= 8

    data = out.getvalue()
    if len(data) > GROQ_MAX_IMAGE_BYTES:
        raise ValueError("La imagen es demasiado grande incluso comprimida. Probá con menor resolución.")
    return data, "scan.jpg"


def _catalog_hint(catalog_names: Optional[list[str]], limit: int = 40) -> str:
    if not catalog_names:
        return ""
    names = catalog_names[:limit]
    extra = f" (y {len(catalog_names) - limit} más)" if len(catalog_names) > limit else ""
    return (
        "\nNombres de vacunas conocidos en el catálogo (elige el más cercano si aplica):\n"
        + ", ".join(names)
        + extra
    )


def _guess_mime(filename: str, image_bytes: bytes) -> str:
    lower = (filename or "").lower()
    if lower.endswith(".png") or image_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if lower.endswith(".webp") or (len(image_bytes) > 4 and image_bytes[:4] == b"RIFF"):
        return "image/webp"
    if lower.endswith(".gif") or image_bytes[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    return "image/jpeg"


def _is_local_service_url(url: str) -> bool:
    if not url:
        return True
    lower = url.lower()
    return any(
        token in lower
        for token in ("localhost", "127.0.0.1", "0.0.0.0", "100.82.178.56")
    )


def _local_fallbacks_enabled() -> bool:
    if VISION_SKIP_LOCAL_FALLBACKS:
        return False
    return (bool(OLLAMA_BASE_URL) and not _is_local_service_url(OLLAMA_BASE_URL)) or (
        bool(OCR_SERVICE_URL) and not _is_local_service_url(OCR_SERVICE_URL)
    )


def _is_groq_retryable(status_code: int) -> bool:
    return status_code in (400, 429, 500, 502, 503, 504)


def _parse_json_from_text(content: str) -> dict:
    text = (content or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            return json.loads(match.group())
        raise


def _extract_text_pdf(pdf_bytes: bytes) -> str:
    import pypdf

    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    pages = [page.extract_text() for page in reader.pages if page.extract_text()]
    return "\n".join(pages).strip()


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
    resp = requests.post(f"{OCR_SERVICE_URL}/ocr", files=files, data=data, timeout=OCR_TIMEOUT)
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
    resp = requests.post(
        f"{OLLAMA_BASE_URL}/api/generate",
        json=payload,
        timeout=(5, OLLAMA_TIMEOUT),
    )
    resp.raise_for_status()
    text = (resp.json().get("response") or "").strip()
    if not text:
        raise RuntimeError("Ollama no devolvió texto")
    return text


def _call_groq(messages: list, model: str, json_mode: bool = True) -> str:
    if not GROQ_API_KEY:
        raise GroqUnavailableError("GROQ_API_KEY no configurada")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {GROQ_API_KEY}",
    }

    attempts: list[dict] = []
    if json_mode:
        attempts.append({"response_format": {"type": "json_object"}})
    attempts.append({})

    last_error = ""
    for extra in attempts:
        payload = {
            "model": model,
            "messages": messages,
            "temperature": 0.05,
            **extra,
        }
        try:
            resp = requests.post(GROQ_URL, headers=headers, json=payload, timeout=90)
        except requests.RequestException as e:
            raise GroqUnavailableError(str(e)) from e

        if resp.status_code == 200:
            return resp.json()["choices"][0]["message"]["content"]

        last_error = f"Groq HTTP {resp.status_code}: {resp.text[:300]}"
        if not _is_groq_retryable(resp.status_code):
            resp.raise_for_status()

    raise GroqUnavailableError(last_error or "Groq no respondió")


def _call_groq_json(messages: list, model: str) -> dict:
    content = _call_groq(messages, model, json_mode=True)
    return _parse_json_from_text(content)


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
    return _parse_json_from_text(content)


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
    prepared_bytes, _prepared_name = _prepare_image_for_vision(image_bytes, filename)
    catalog_hint = _catalog_hint(catalog_names)

    data_url = f"data:image/jpeg;base64,{_image_to_b64(prepared_bytes)}"
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": _VACCINE_VISION_PROMPT + catalog_hint},
                {"type": "image_url", "image_url": {"url": data_url}},
            ],
        },
    ]
    content = _call_groq(messages, GROQ_VISION_MODEL, json_mode=False)
    parsed = _parse_json_from_text(content)
    vaccines = _fields_list_from_parsed(parsed, content)
    if not vaccines:
        raise ValueError(
            "No se detectaron vacunas en la imagen. Probá con mejor luz, más cerca del texto, o JPG/PNG nítido."
        )
    return _scan_result(vaccines, content, "groq")


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


def _normalize_vaccine_item(item: dict) -> dict[str, Any]:
    if not isinstance(item, dict):
        return {}
    return {
        "vaccine_name": (item.get("vaccine_name") or None),
        "lot_number": (item.get("lot_number") or None),
        "date_administered": _normalize_date(item.get("date_administered")),
        "next_due_date": _normalize_date(item.get("next_due_date")),
        "veterinarian_name": (item.get("veterinarian_name") or None),
    }


def _fields_list_from_parsed(parsed: dict, raw_text: str) -> list[dict[str, Any]]:
    """Extrae lista de vacunas desde JSON (multi o formato legacy de una sola)."""
    items = parsed.get("vaccines")
    if isinstance(items, list) and items:
        result = [_normalize_vaccine_item(x) for x in items if isinstance(x, dict)]
        result = [x for x in result if any(x.values())]
        if result:
            return result

    single = _fields_from_parsed(parsed, raw_text)
    if any(single.get(k) for k in ("vaccine_name", "lot_number", "date_administered", "next_due_date", "veterinarian_name")):
        return [single]
    return []


def _scan_result(vaccines: list[dict[str, Any]], raw_text: str, method: str) -> dict[str, Any]:
    result: dict[str, Any] = {
        "vaccines": vaccines,
        "count": len(vaccines),
        "raw_text": raw_text,
        "method": method,
    }
    if vaccines:
        result.update(vaccines[0])
    return result


def parse_vaccine_fields(
    raw_text: str,
    catalog_names: Optional[list[str]] = None,
    prefer_groq: bool = True,
) -> dict[str, Any]:
    """Convierte texto OCR/visión en campos estructurados de vacuna."""
    catalog_hint = _catalog_hint(catalog_names)

    prompt = f"""
Analiza el siguiente texto extraído de un certificado o libreta de vacunación veterinaria.
Puede contener UNA o VARIAS vacunas. Identifica TODAS las aplicaciones visibles.
Devuelve JSON con esta estructura exacta:
{{"vaccines": [
  {{"vaccine_name": string|null, "lot_number": string|null,
    "date_administered": string|null, "next_due_date": string|null, "veterinarian_name": string|null}}
]}}
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

    vaccines = _fields_list_from_parsed(parsed, raw_text)
    return _scan_result(vaccines, raw_text, "text")


def _scan_pdf(
    pdf_bytes: bytes,
    catalog_names: Optional[list[str]] = None,
) -> dict[str, Any]:
    raw_text = _extract_text_pdf(pdf_bytes)
    if not raw_text.strip():
        raise ValueError(
            "El PDF no tiene texto legible (escaneo sin OCR). Subí una foto JPG o PNG del certificado."
        )
    fields = parse_vaccine_fields(raw_text, catalog_names=catalog_names)
    if not fields.get("vaccines"):
        raise ValueError("No se detectaron vacunas en el PDF. Subí una foto del certificado.")
    fields["method"] = "pdf"
    return fields


def _scan_with_auto_fallback(
    image_bytes: bytes,
    filename: str,
    catalog_names: Optional[list[str]] = None,
) -> dict[str, Any]:
    """
    Cadena automática: PDF → Groq Vision → Ollama → OCR (solo si están configurados).
    """
    if _is_pdf(image_bytes, filename):
        return _scan_pdf(image_bytes, catalog_names)

    errors: list[str] = []
    groq_available = bool(GROQ_API_KEY)

    if groq_available:
        try:
            return extract_fields_groq_vision(image_bytes, filename=filename, catalog_names=catalog_names)
        except ValueError:
            raise
        except (GroqUnavailableError, json.JSONDecodeError, KeyError, requests.RequestException) as e:
            msg = f"Groq: {e}"
            logger.warning("Escaneo vacuna - %s", msg)
            errors.append(msg)
            groq_available = False

    if not _local_fallbacks_enabled():
        if errors:
            raise RuntimeError(
                "No se pudo analizar la imagen con Groq. "
                "Probá con una foto JPG/PNG nítida del certificado. "
                f"Detalle: {errors[0]}"
            )
        raise RuntimeError("GROQ_API_KEY no configurada en el servidor.")

    if OLLAMA_BASE_URL and not _is_local_service_url(OLLAMA_BASE_URL):
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

    if OCR_SERVICE_URL and not _is_local_service_url(OCR_SERVICE_URL):
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
        "No se pudo analizar la imagen. Usá una foto JPG o PNG del certificado. "
        + (f"Detalle: {errors[0]}" if errors else "")
    )


def scan_vaccine_image(
    image_bytes: bytes,
    filename: str = "image.jpg",
    engine: str = "auto",
    catalog_names: Optional[list[str]] = None,
) -> dict[str, Any]:
    """
    Escanea una imagen de vacuna.
    engine:
      - 'auto' (default): PDF → Groq Vision → Ollama → OCR
      - 'groq': solo Groq Vision
      - 'moondream' / 'ollama': solo Ollama
      - 'ocr': solo PaddleOCR
    """
    engine = (engine or "auto").strip().lower()

    if engine == "auto":
        return _scan_with_auto_fallback(image_bytes, filename, catalog_names)

    if _is_pdf(image_bytes, filename):
        return _scan_pdf(image_bytes, catalog_names)

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
