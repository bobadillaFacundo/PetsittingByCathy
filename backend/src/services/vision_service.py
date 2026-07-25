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
GROQ_VISION_TIMEOUT = int(
    os.getenv(
        "GROQ_VISION_TIMEOUT",
        "25" if VISION_SKIP_LOCAL_FALLBACKS else "90",
    )
)
VISION_MAX_IMAGE_SIDE = int(
    os.getenv(
        "VISION_MAX_IMAGE_SIDE",
        "1280" if VISION_SKIP_LOCAL_FALLBACKS else "2048",
    )
)
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


class ScanImageError(ValueError):
    """El archivo no se pudo leer o convertir para el escaneo."""


class ScanNoVaccinesError(Exception):
    """El archivo se procesó pero no se encontraron vacunas estructuradas."""

    def __init__(self, raw_text: str = "", method: str = "groq"):
        self.raw_text = raw_text or ""
        self.method = method
        super().__init__("No se detectaron vacunas en la imagen")


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


def _pil_to_jpeg_bytes(img) -> bytes:
    from PIL import Image

    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    elif img.mode == "L":
        img = img.convert("RGB")

    max_side = VISION_MAX_IMAGE_SIDE
    w, h = img.size
    if max(w, h) > max_side:
        ratio = max_side / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.Resampling.LANCZOS)

    quality = 88
    while quality >= 55:
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=quality, optimize=True)
        if out.tell() <= 4 * 1024 * 1024:
            break
        quality -= 8

    data = out.getvalue()
    if len(data) > GROQ_MAX_IMAGE_BYTES:
        raise ScanImageError("La imagen es demasiado grande incluso comprimida.")
    return data


def _register_heif_opener() -> None:
    try:
        import pillow_heif
        pillow_heif.register_heif_opener()
    except ImportError:
        pass


def _pdf_pages_to_jpeg_list(pdf_bytes: bytes, max_pages: int = 8) -> list[bytes]:
    """Convierte cada página del PDF a JPEG (para escaneos sin texto)."""
    try:
        import fitz
    except ImportError as e:
        raise ScanImageError("No se pudo procesar el PDF en el servidor.") from e

    images: list[bytes] = []
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        page_count = min(len(doc), max_pages)
        zoom = 1.5 if VISION_SKIP_LOCAL_FALLBACKS else 2.0
        matrix = fitz.Matrix(zoom, zoom)
        for i in range(page_count):
            page = doc[i]
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            images.append(pix.tobytes("jpeg"))
    finally:
        doc.close()

    if not images:
        raise ScanImageError("El PDF está vacío o no se pudo convertir.")
    return images


def _prepare_image_for_vision(image_bytes: bytes, filename: str = "image.jpg") -> tuple[bytes, str]:
    """Convierte HEIC/PNG/WebP/etc. a JPEG optimizado para Groq."""
    if _is_pdf(image_bytes, filename):
        pages = _pdf_pages_to_jpeg_list(image_bytes, max_pages=1)
        return pages[0], "scan.jpg"

    try:
        from PIL import Image
    except ImportError:
        if len(image_bytes) > GROQ_MAX_IMAGE_BYTES:
            raise ScanImageError("La imagen supera 18 MB. Usá una foto más liviana.")
        return image_bytes, filename or "image.jpg"

    _register_heif_opener()

    try:
        img = Image.open(io.BytesIO(image_bytes))
        img.load()
    except Exception as e:
        raise ScanImageError(
            f"No se pudo leer el archivo ({filename or 'imagen'}). "
            f"El servidor intentó convertirlo automáticamente. Detalle: {e}"
        ) from e

    return _pil_to_jpeg_bytes(img), "scan.jpg"


def prepare_file_for_storage(
    file_bytes: bytes,
    filename: str = "cert.jpg",
    content_type: Optional[str] = None,
) -> tuple[bytes, str, str]:
    """Convierte HEIC/PNG/etc. a JPEG para Storage; PDF se conserva."""
    if _is_pdf(file_bytes, filename):
        return file_bytes, filename or "certificado.pdf", content_type or "application/pdf"
    try:
        jpeg_bytes, _ = _prepare_image_for_vision(file_bytes, filename)
        base = (filename or "cert").rsplit(".", 1)[0]
        return jpeg_bytes, f"{base}.jpg", "image/jpeg"
    except Exception:
        return file_bytes, filename or "cert.jpg", content_type or "application/octet-stream"


def _catalog_hint(catalog_names: Optional[list[str]], limit: Optional[int] = None) -> str:
    if not catalog_names:
        return ""
    if limit is None:
        limit = 20 if VISION_SKIP_LOCAL_FALLBACKS else 40
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
        parsed = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            parsed = json.loads(match.group())
        else:
            raise
    if isinstance(parsed, list):
        return {"vaccines": parsed}
    if isinstance(parsed, dict):
        return parsed
    return {}


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


def _call_groq(
    messages: list,
    model: str,
    json_mode: bool = True,
    timeout: Optional[int] = None,
) -> str:
    if not GROQ_API_KEY:
        raise GroqUnavailableError("GROQ_API_KEY no configurada")

    request_timeout = timeout if timeout is not None else GROQ_VISION_TIMEOUT

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
            resp = requests.post(
                GROQ_URL,
                headers=headers,
                json=payload,
                timeout=request_timeout,
            )
        except requests.Timeout as e:
            raise GroqUnavailableError(
                "Groq tardó demasiado en responder. Probá con una foto más clara o más liviana."
            ) from e
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
    already_prepared: bool = False,
) -> dict[str, Any]:
    """Analiza la imagen directamente con Groq Vision (qwen/qwen3.6-27b)."""
    if already_prepared:
        prepared_bytes = image_bytes
    else:
        prepared_bytes, _ = _prepare_image_for_vision(image_bytes, filename)
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
    content = ""
    last_error: Optional[Exception] = None
    for json_mode in (True, False):
        try:
            content = _call_groq(messages, GROQ_VISION_MODEL, json_mode=json_mode)
            break
        except (GroqUnavailableError, json.JSONDecodeError, KeyError) as e:
            last_error = e
            if isinstance(e, GroqUnavailableError):
                raise
            continue
    if not content:
        raise GroqUnavailableError(str(last_error or "Groq no devolvió contenido"))

    vaccines = _extract_vaccines_from_groq_content(content, catalog_names=catalog_names)
    if not vaccines:
        raise ScanNoVaccinesError(content, method="groq")
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


def _scan_result(
    vaccines: list[dict[str, Any]],
    raw_text: str,
    method: str,
    warning: Optional[str] = None,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "vaccines": vaccines,
        "count": len(vaccines),
        "raw_text": raw_text,
        "method": method,
    }
    if warning:
        result["warning"] = warning
    if vaccines:
        result.update(vaccines[0])
    return result


def _extract_vaccines_from_groq_content(
    content: str,
    catalog_names: Optional[list[str]] = None,
) -> list[dict[str, Any]]:
    """Intenta extraer vacunas del texto/JSON devuelto por Groq Vision."""
    parsed: dict[str, Any] = {}
    try:
        parsed = _parse_json_from_text(content)
    except json.JSONDecodeError:
        parsed = {}

    vaccines = _fields_list_from_parsed(parsed, content)
    if vaccines:
        return vaccines

    try:
        fields = parse_vaccine_fields(content, catalog_names=catalog_names, prefer_groq=True)
        return fields.get("vaccines") or []
    except Exception as e:
        logger.warning("Fallback NLP tras visión Groq falló: %s", e)
        return []


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


def _merge_vaccine_lists(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Une vacunas de varias páginas evitando duplicados obvios."""
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()
    for result in results:
        for item in result.get("vaccines") or []:
            key = "|".join([
                str(item.get("vaccine_name") or "").lower(),
                str(item.get("lot_number") or "").lower(),
                str(item.get("date_administered") or ""),
            ])
            if key in seen and key != "||":
                continue
            seen.add(key)
            merged.append(item)
    return merged


def _scan_pdf(
    pdf_bytes: bytes,
    catalog_names: Optional[list[str]] = None,
) -> dict[str, Any]:
    raw_text = _extract_text_pdf(pdf_bytes)
    if raw_text.strip():
        fields = parse_vaccine_fields(raw_text, catalog_names=catalog_names)
        if fields.get("vaccines"):
            fields["method"] = "pdf-text"
            return fields

    logger.info("PDF sin texto extraíble; convirtiendo páginas a imagen para visión...")
    page_images = _pdf_pages_to_jpeg_list(pdf_bytes)
    page_results: list[dict[str, Any]] = []
    raw_parts: list[str] = []

    for i, page_jpeg in enumerate(page_images):
        try:
            result = extract_fields_groq_vision(
                page_jpeg,
                filename=f"page-{i + 1}.jpg",
                catalog_names=catalog_names,
                already_prepared=True,
            )
            if result.get("vaccines"):
                page_results.append(result)
                raw_parts.append(result.get("raw_text") or "")
        except (ScanNoVaccinesError, ValueError):
            continue

    vaccines = _merge_vaccine_lists(page_results)
    raw_text = "\n---\n".join(raw_parts)
    if not vaccines:
        raise ScanNoVaccinesError(
            raw_text,
            method="pdf-vision",
        )

    return _scan_result(vaccines, raw_text, "pdf-vision")


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
    no_vaccines_error: Optional[ScanNoVaccinesError] = None

    if groq_available:
        try:
            return extract_fields_groq_vision(image_bytes, filename=filename, catalog_names=catalog_names)
        except ScanImageError:
            raise
        except ScanNoVaccinesError as e:
            no_vaccines_error = e
            errors.append("Groq: no se detectaron vacunas en la imagen")
        except (GroqUnavailableError, json.JSONDecodeError, KeyError, requests.RequestException) as e:
            msg = f"Groq: {e}"
            logger.warning("Escaneo vacuna - %s", msg)
            errors.append(msg)
            groq_available = False

    if not _local_fallbacks_enabled():
        if no_vaccines_error:
            return _scan_result(
                [],
                no_vaccines_error.raw_text,
                no_vaccines_error.method,
                warning=(
                    "No se detectaron vacunas automáticamente. "
                    "Revisá el texto extraído abajo o cargá los datos a mano."
                ),
            )
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

    try:
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
    except ScanNoVaccinesError as e:
        return _scan_result(
            [],
            e.raw_text,
            e.method,
            warning=(
                "No se detectaron vacunas automáticamente. "
                "Revisá el texto extraído abajo o cargá los datos a mano."
            ),
        )

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
