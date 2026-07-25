# Escaneo de vacunas (visión + Storage)

Funcionalidad para fotografiar libretas o certificados de vacunación, extraer datos con IA y guardar el documento en Supabase Storage.

## Ubicación en la UI

**Admin → Guardería o Mascotas → modal del animal → pestaña Libreta**

Componente: `frontend/src/pages/admin/LibretaTab.jsx`

## Flujo de usuario

1. Subir **foto, HEIC o PDF** de la libreta
2. Clic en **Escanear** → el backend analiza sin guardar
3. Aparece un **lote pendiente** editable (puede detectar varias vacunas en una imagen)
4. Completar / corregir campos manualmente si hace falta
5. **Guardar N vacunas** (con o sin la misma foto adjunta)

## Formatos soportados

| Formato | Tratamiento |
|---------|-------------|
| JPEG, PNG, WebP | Comprimido a JPEG ≤ 2048 px |
| HEIC / HEIF (iPhone) | `pillow-heif` en servidor; también conversión en navegador |
| PDF con texto | Extracción `pypdf` + NLP |
| PDF escaneado (imagen) | `pymupdf` → páginas JPEG → Groq Vision |

## Cadena de procesamiento (backend)

Servicio: `backend/src/services/vision_service.py`

Modo `auto` (por defecto):

```
PDF → texto o visión por página
Imagen → normalizar JPEG
     → Groq Vision (qwen/qwen3.6-27b)
     → JSON { vaccines: [...] }
     → (si vacío) fallback NLP sobre texto crudo
```

En **Render** (`VISION_SKIP_LOCAL_FALLBACKS=1`):
- Solo Groq Vision
- Si no detecta vacunas: respuesta **200** con `warning` + `raw_text` (no error 400)

Fallbacks locales (solo dev, si están configurados y accesibles):
1. Ollama / Moondream
2. PaddleOCR (`OCR_SERVICE_URL`)

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/animals/{id}/vaccines/scan` | Escanea sin guardar |
| `POST` | `/animals/{id}/vaccines` | Una vacuna (JSON) |
| `POST` | `/animals/{id}/vaccines/with-document` | Una vacuna + archivo |
| `POST` | `/animals/{id}/vaccines/bulk` | Varias vacunas (JSON) |
| `POST` | `/animals/{id}/vaccines/bulk-with-document` | Varias + mismo archivo |
| `DELETE` | `/animals/{id}/vaccines/{vaccine_id}` | Borra vacuna y archivo Storage |

### Ejemplo scan (multipart)

```http
POST /animals/8/vaccines/scan
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: certificado.jpg
```

Respuesta exitosa:

```json
{
  "vaccines": [
    {
      "vaccine_name": "Antirrábica",
      "lot_number": "ABC123",
      "date_administered": "2025-01-15",
      "next_due_date": "2026-01-15",
      "veterinarian_name": "Dr. García",
      "vaccine_id": 3
    }
  ],
  "count": 1,
  "method": "groq",
  "raw_text": "..."
}
```

## Base de datos

Tabla `vaccines` — columna `document_url` (URL pública en Supabase Storage).

Migración automática en `migrate_normalize.py` al arrancar el backend.

## Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `GROQ_API_KEY` | — | Obligatoria en producción |
| `GROQ_VISION_MODEL` | `qwen/qwen3.6-27b` | Modelo multimodal |
| `VISION_SKIP_LOCAL_FALLBACKS` | `0` | `1` en Render |
| `OLLAMA_BASE_URL` | vacío | Fallback visión |
| `OCR_SERVICE_URL` | vacío | Fallback OCR |

## Dependencias Python

```
Pillow>=12.3.0
pillow-heif
pymupdf
pypdf>=6.14.2
```

## Errores comunes

| HTTP | Mensaje | Qué hacer |
|------|---------|-----------|
| 400 | No se pudo leer el archivo | Probar JPG; mejor luz y enfoque |
| 502 | Groq no respondió | Revisar API key y límites |
| 200 + warning | Sin vacunas detectadas | Completar manualmente con `raw_text` |

## Archivos clave

| Archivo | Rol |
|---------|-----|
| `vision_service.py` | Conversión, Groq, PDF, parsers |
| `animal_routes.py` | Endpoints scan / bulk / Storage |
| `storage_service.py` | Subida Supabase |
| `LibretaTab.jsx` | UI escaneo y lote |

## Documentación relacionada

- [DESPLIEGUE.md](./DESPLIEGUE.md)
- [API.md](./API.md)
