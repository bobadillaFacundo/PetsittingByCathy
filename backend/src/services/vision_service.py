"""Extracción de datos de certificados de vacuna desde imágenes."""
from __future__ import annotations

import base64
import io
import json
import logging
import os
import re
import time
from typing import Any, Optional
from urllib.parse import urlparse

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
GROQ_VISION_MODEL_FALLBACK = os.getenv("GROQ_VISION_MODEL_FALLBACK", "llama-3.2-11b-vision-preview").strip()
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "90"))
OLLAMA_MAX_IMAGE_SIDE = int(os.getenv("OLLAMA_MAX_IMAGE_SIDE", "768"))
OCR_TIMEOUT = int(os.getenv("OCR_TIMEOUT", "10"))
VISION_MAX_IMAGE_SIDE = int(
    os.getenv(
        "VISION_MAX_IMAGE_SIDE",
        "1024" if VISION_SKIP_LOCAL_FALLBACKS else "2048",
    )
)
GROQ_MAX_IMAGE_BYTES = 18 * 1024 * 1024  # margen bajo el límite de 20 MB de Groq

# Reglas compartidas para visión y NLP (etiquetas argentinas: Zoetis, SENASA, etc.)
_VACCINE_FIELD_RULES = """
DÓNDE BUSCAR LOS DATOS (prioridad):
1. Etiquetas/stickers adhesivos del laboratorio en la foto (Zoetis, MSD, Boehringer, Nobivac, Vanguard, etc.).
2. Recuadros o franjas con texto: "N. Lote", "Lote", "Lot", "N° Lote" → lot_number (ej. 699509A, 662611).
3. "F. Cad", "F. Venc", "Caducidad", "Vto", "Exp" → next_due_date (vencimiento del lote; NO es la fecha de aplicación).
4. "F. Elab", "F. Fabric.", "Elaboración" → solo referencia; NO usar como date_administered.
5. Nombre comercial grande en la etiqueta → vaccine_name (ej. "Vanguard Plus 5 L4", "Nobivac Rabia", "Séxtuple").
6. Sellos SENASA / matrícula / firma del veterinario → veterinarian_name si es legible.
7. Fecha de aplicación (date_administered): solo si hay registro manuscrito en libreta, sello con fecha de vacunación,
   o texto explícito "fecha", "aplicada", "vacunado". Si solo hay F. Elab/F. Cad del frasco, date_administered = null.

REGLAS:
- Cada etiqueta/sticker visible = una entrada distinta en el array vaccines (aunque haya varias en la misma foto).
- Leé texto en recuadros negros, letra chica y códigos alfanuméricos; no inventes datos.
- Fechas a YYYY-MM-DD. Meses abreviados: ENE/JAN=01, FEB=02, MAR=03, ABR/APR=04, MAY=05, JUN=06, JUL=07,
  AGO/AUG=08, SEP=09, OCT=10, NOV=11, DIC/DEC=12. Años de 2 dígitos: 23→2023, 24→2024, 25→2025.
- Si un campo no aparece con claridad, usa null.

EJEMPLO (dos etiquetas en una foto):
{"vaccines": [
  {"vaccine_name": "Vanguard Plus 5 L4", "lot_number": "699509A", "date_administered": null,
   "next_due_date": "2025-05-27", "veterinarian_name": null},
  {"vaccine_name": "Zoetis (etiqueta)", "lot_number": "662611", "date_administered": null,
   "next_due_date": "2024-10-15", "veterinarian_name": null}
]}
"""

_VACCINE_VISION_PROMPT = (
    "Leé etiquetas/stickers de vacunas veterinarias (Argentina). "
    "Por cada etiqueta visible extraé: vaccine_name (nombre comercial), "
    "lot_number (N. Lote/Lote/Lot), next_due_date (F. Cad/Vto/Venc), "
    "date_administered solo si hay fecha de aplicación escrita (NO usar F. Elab), "
    "veterinarian_name si hay firma/sello.\n"
    "Fechas en YYYY-MM-DD. null si no se lee. Una etiqueta = un elemento en vaccines.\n"
    '{"vaccines":[{"vaccine_name":null,"lot_number":null,"date_administered":null,'
    '"next_due_date":null,"veterinarian_name":null}]}\n'
    "Responde SOLO JSON válido, sin markdown."
)


class GroqUnavailableError(Exception):
    """Groq no disponible (límite de uso, error de red, etc.)."""


class GroqRateLimitError(GroqUnavailableError):
    """Groq devolvió 429 (límite TPM/RPM)."""


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


def _pil_to_jpeg_bytes(img, max_side: Optional[int] = None) -> bytes:
    from PIL import Image

    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    elif img.mode == "L":
        img = img.convert("RGB")

    limit = max_side if max_side is not None else VISION_MAX_IMAGE_SIDE
    limit = max_side if max_side is not None else VISION_MAX_IMAGE_SIDE
    w, h = img.size
    if max(w, h) > limit:
        ratio = limit / max(w, h)
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


def _prepare_image_for_vision(
    image_bytes: bytes,
    filename: str = "image.jpg",
    max_side: Optional[int] = None,
) -> tuple[bytes, str]:
    """Convierte HEIC/PNG/WebP/etc. a JPEG optimizado para visión."""
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

    return _pil_to_jpeg_bytes(img, max_side=max_side), "scan.jpg"


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
        limit = 12 if VISION_SKIP_LOCAL_FALLBACKS else 40
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


def _host_from_service_url(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").lower()
    except Exception:
        return ""


def _is_private_or_loopback_host(host: str) -> bool:
    """True si el host no es alcanzable desde un PaaS cloud (LAN, loopback, Tailscale)."""
    if not host:
        return True
    if host in ("localhost", "127.0.0.1", "0.0.0.0", "::1"):
        return True
    parts = host.split(".")
    if len(parts) != 4:
        return False
    try:
        a, b, _, _ = (int(x) for x in parts)
    except ValueError:
        return False
    if a == 10:
        return True
    if a == 172 and 16 <= b <= 31:
        return True
    if a == 192 and b == 168:
        return True
    if a == 100 and 64 <= b <= 127:
        return True
    return False


def _service_url_reachable_from_backend(url: str) -> bool:
    if not url:
        return False
    if VISION_SKIP_LOCAL_FALLBACKS and _is_private_or_loopback_host(_host_from_service_url(url)):
        return False
    return True


def _ollama_usable() -> bool:
    return bool(OLLAMA_BASE_URL) and _service_url_reachable_from_backend(OLLAMA_BASE_URL)


def _ocr_usable() -> bool:
    if VISION_SKIP_LOCAL_FALLBACKS:
        return False
    return bool(OCR_SERVICE_URL) and _service_url_reachable_from_backend(OCR_SERVICE_URL)


def _effective_groq_vision_timeout() -> int:
    explicit = (os.getenv("GROQ_VISION_TIMEOUT") or "").strip()
    if explicit:
        return int(explicit)
    if _ollama_usable():
        return 10
    if VISION_SKIP_LOCAL_FALLBACKS:
        return 20
    return 90


def _effective_ollama_timeout() -> int:
    if _ollama_usable() and VISION_SKIP_LOCAL_FALLBACKS:
        return min(OLLAMA_TIMEOUT, 22)
    return OLLAMA_TIMEOUT


def _groq_rate_limit_retries() -> int:
    """Menos reintentos en prod para no superar el timeout de Render (~30 s)."""
    explicit = (os.getenv("GROQ_RATE_LIMIT_RETRIES") or "").strip()
    if explicit:
        return max(1, int(explicit))
    if _ollama_usable():
        return 1
    if VISION_SKIP_LOCAL_FALLBACKS:
        return 2
    return 4


def _scan_all_engines_failed() -> RuntimeError:
    """Error genérico para el cliente; detalles quedan en logs del servidor."""
    return RuntimeError("scan_failed")


def _is_groq_retryable(status_code: int) -> bool:
    return status_code in (400, 500, 502, 503, 504)


def _parse_groq_retry_seconds(response_text: str) -> float:
    match = re.search(r"try again in ([\d.]+)s", response_text, re.IGNORECASE)
    if match:
        return min(float(match.group(1)) + 0.5, 20.0)
    return 5.0


def _groq_error_message(status_code: int, response_text: str) -> str:
    if status_code == 429:
        return (
            "Groq alcanzó el límite de consultas por minuto. "
            "Esperá 30–60 segundos y volvé a escanear."
        )
    return f"Groq HTTP {status_code}: {response_text[:200]}"


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


def extract_text_moondream(image_bytes: bytes, filename: str = "scan.jpg") -> str:
    """Describe el contenido de la imagen con Moondream vía Ollama."""
    prepared_bytes, _ = _prepare_image_for_vision(
        image_bytes,
        filename=filename,
        max_side=OLLAMA_MAX_IMAGE_SIDE,
    )
    prompt = (
        "Transcribí TODO el texto visible de etiquetas/stickers de vacunas veterinarias en la imagen. "
        "Incluí especialmente recuadros con N. Lote, F. Elab, F. Cad, nombres comerciales (Vanguard, Nobivac, etc.) "
        "y sellos SENASA o firmas de veterinario. Responde en español, línea por línea."
    )
    b64 = _image_to_b64(prepared_bytes)
    timeout = (5, _effective_ollama_timeout())
    options = {"num_predict": 600, "temperature": 0.1}
    last_error = ""

    attempts: list[tuple[str, dict]] = [
        (
            "generate",
            {
                "model": OLLAMA_VISION_MODEL,
                "prompt": prompt,
                "images": [b64],
                "stream": False,
                "options": options,
            },
        ),
        (
            "chat",
            {
                "model": OLLAMA_VISION_MODEL,
                "messages": [{"role": "user", "content": prompt, "images": [b64]}],
                "stream": False,
                "options": options,
            },
        ),
    ]

    for endpoint, payload in attempts:
        try:
            resp = requests.post(
                f"{OLLAMA_BASE_URL}/api/{endpoint}",
                json=payload,
                timeout=timeout,
            )
        except requests.Timeout as e:
            last_error = f"Ollama tardó más de {_effective_ollama_timeout()}s"
            logger.warning("Ollama %s timeout: %s", endpoint, e)
            continue
        except requests.RequestException as e:
            last_error = str(e)
            logger.warning("Ollama %s red: %s", endpoint, e)
            continue

        if resp.status_code != 200:
            last_error = f"HTTP {resp.status_code}: {resp.text[:300]}"
            logger.warning("Ollama %s respondió %s", endpoint, last_error)
            continue

        body = resp.json()
        if endpoint == "chat":
            text = (body.get("message") or {}).get("content") or ""
        else:
            text = body.get("response") or ""
        text = text.strip()
        if text:
            return text
        last_error = "respuesta vacía"

    raise RuntimeError(last_error or "Ollama no devolvió texto")


def _call_groq(
    messages: list,
    model: str,
    json_mode: bool = True,
    timeout: Optional[int] = None,
    max_tokens: Optional[int] = None,
) -> str:
    if not GROQ_API_KEY:
        raise GroqUnavailableError("GROQ_API_KEY no configurada")

    request_timeout = timeout if timeout is not None else _effective_groq_vision_timeout()

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {GROQ_API_KEY}",
    }

    attempts: list[dict] = []
    if json_mode:
        attempts.append({"response_format": {"type": "json_object"}})
    attempts.append({})

    last_error = ""
    rate_limit_retries = _groq_rate_limit_retries()
    for extra in attempts:
        payload = {
            "model": model,
            "messages": messages,
            "temperature": 0.05,
            **extra,
        }
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens

        for rate_attempt in range(rate_limit_retries):
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

            if resp.status_code == 429:
                last_error = _groq_error_message(429, resp.text)
                if rate_attempt < rate_limit_retries - 1:
                    time.sleep(_parse_groq_retry_seconds(resp.text))
                    continue
                raise GroqRateLimitError(last_error)

            last_error = _groq_error_message(resp.status_code, resp.text)
            if not _is_groq_retryable(resp.status_code):
                resp.raise_for_status()
            break

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
    models_to_try = [GROQ_VISION_MODEL]
    if (
        GROQ_VISION_MODEL_FALLBACK
        and GROQ_VISION_MODEL_FALLBACK != GROQ_VISION_MODEL
        and not VISION_SKIP_LOCAL_FALLBACKS
    ):
        models_to_try.append(GROQ_VISION_MODEL_FALLBACK)

    last_error: Optional[Exception] = None
    for model_name in models_to_try:
        try:
            content = _call_groq(
                messages,
                model_name,
                json_mode=True,
                max_tokens=512,
            )
            break
        except GroqRateLimitError:
            raise
        except (GroqUnavailableError, json.JSONDecodeError, KeyError) as e:
            last_error = e
            logger.warning("Groq vision con %s falló: %s", model_name, e)
            continue

    if not content:
        if isinstance(last_error, GroqUnavailableError):
            raise last_error
        try:
            content = _call_groq(
                messages,
                models_to_try[0],
                json_mode=False,
                max_tokens=512,
            )
        except GroqRateLimitError:
            raise
        except GroqUnavailableError as e:
            raise e
    if not content:
        raise GroqUnavailableError("Groq no devolvió contenido")

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
    month_map = {
        "ene": "01", "jan": "01",
        "feb": "02",
        "mar": "03",
        "abr": "04", "apr": "04",
        "may": "05",
        "jun": "06",
        "jul": "07",
        "ago": "08", "aug": "08",
        "sep": "09", "sept": "09",
        "oct": "10",
        "nov": "11",
        "dic": "12", "dec": "12",
    }
    m = re.match(
        r"^(\d{1,2})\s+([A-Za-zÁÉÍÓÚáéíóú]{3,5})\s+(\d{2,4})$",
        s,
        re.IGNORECASE,
    )
    if m:
        day, mon_txt, year = m.groups()
        mon = month_map.get(mon_txt.lower()[:4].replace(".", "")) or month_map.get(mon_txt.lower()[:3])
        if mon:
            y = int(year)
            if y < 100:
                y += 2000
            return f"{y}-{mon}-{int(day):02d}"
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
Analiza el texto extraído de un certificado o foto de etiquetas de vacunación veterinaria (Argentina).
Puede haber UNA o VARIAS etiquetas/stickers en el mismo texto.
{_VACCINE_FIELD_RULES}
{catalog_hint}
Devuelve JSON con esta estructura exacta:
{{"vaccines": [
  {{"vaccine_name": string|null, "lot_number": string|null,
    "date_administered": string|null, "next_due_date": string|null, "veterinarian_name": string|null}}
]}}

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
    Groq → Ollama (si OLLAMA_BASE_URL alcanzable) → OCR (solo local) → error.
    """
    if _is_pdf(image_bytes, filename):
        return _scan_pdf(image_bytes, catalog_names)

    errors: list[str] = []
    groq_nlp_ok = bool(GROQ_API_KEY)
    no_vaccines_error: Optional[ScanNoVaccinesError] = None

    if GROQ_API_KEY:
        try:
            return extract_fields_groq_vision(
                image_bytes, filename=filename, catalog_names=catalog_names
            )
        except ScanImageError:
            raise
        except ScanNoVaccinesError as e:
            no_vaccines_error = e
            errors.append("Groq: no se detectaron vacunas en la imagen")
            logger.warning("Escaneo vacuna - %s", errors[-1])
        except (GroqRateLimitError, GroqUnavailableError, json.JSONDecodeError, KeyError, requests.RequestException) as e:
            msg = f"Groq: {e}"
            logger.warning("Escaneo vacuna - %s", msg)
            errors.append(msg)
            groq_nlp_ok = False

    if _ollama_usable():
        logger.info("Escaneo: Groq no alcanzó; probando Ollama en %s", OLLAMA_BASE_URL)
        try:
            raw_text = extract_text_moondream(image_bytes, filename=filename)
            fields = parse_vaccine_fields(
                raw_text,
                catalog_names=catalog_names,
                prefer_groq=groq_nlp_ok,
            )
            if fields.get("vaccines"):
                fields["method"] = "moondream"
                if errors:
                    fields["fallback_from"] = errors
                return fields
            errors.append("Ollama: no se detectaron vacunas en la imagen")
            logger.warning("Escaneo vacuna - %s", errors[-1])
        except Exception as e:
            msg = f"Ollama: {e}"
            logger.warning("Escaneo vacuna - %s", msg)
            errors.append(msg)
    elif errors:
        logger.info("Escaneo: Ollama no configurado o no alcanzable desde el servidor")

    if _ocr_usable():
        try:
            raw_text = extract_text_ocr(image_bytes, filename=filename)
            if not raw_text.strip():
                raise RuntimeError("OCR no detectó texto")
            fields = parse_vaccine_fields(
                raw_text,
                catalog_names=catalog_names,
                prefer_groq=groq_nlp_ok,
            )
            if fields.get("vaccines"):
                fields["method"] = "ocr"
                if errors:
                    fields["fallback_from"] = errors
                return fields
            errors.append("OCR: no se detectaron vacunas en la imagen")
        except Exception as e:
            errors.append(f"OCR: {e}")

    if no_vaccines_error and not _ollama_usable() and not _ocr_usable():
        return _scan_result(
            [],
            no_vaccines_error.raw_text,
            no_vaccines_error.method,
            warning=(
                "No se detectaron vacunas automáticamente. "
                "Revisá el texto extraído abajo o cargá los datos a mano."
            ),
        )

    logger.error("Escaneo falló tras Groq/Ollama/OCR: %s", "; ".join(errors))
    raise _scan_all_engines_failed()


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
            raw_text = extract_text_moondream(image_bytes, filename=filename)
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
