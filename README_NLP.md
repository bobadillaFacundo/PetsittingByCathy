# Flujo de Procesamiento de Audio a Texto (NLP Pipeline)

Este documento detalla el motor de Inteligencia Artificial: cómo la voz se transforma en registros normalizados, cómo aprende vocabulario nuevo y cómo interactúan alertas, observaciones, fotos y edición.

> **Índice:** [docs/README.md](./docs/README.md) · [docs/ARQUITECTURA.md](./docs/ARQUITECTURA.md) · [docs/DESPLIEGUE.md](./docs/DESPLIEGUE.md)

## Arquitectura General

```
[Micrófono] → Groq Whisper (prod) / Whisper local (dev) → Qwen/Groq NLP → Auto-aprendizaje TagSet
                         ↓
              Wizard Frontend → /confirm → PostgreSQL
                         ↓
         Alertas críticas + severity + attachments + observaciones
```

Fases principales:
1. **Captura y Transcripción** (voz → texto) — Groq STT en producción; faster-whisper local en dev
2. **Interpretación Semántica** (texto → JSON) — **Qwen en IP del servidor**
3. **Auto-Aprendizaje** (diccionarios TagSet)
4. **Validación e Inserción** (wizard → base de datos)
5. **Analítica** (Clima + análisis por animal neutro)
6. **Post-procesamiento** (alertas, fotos, edición, colores)

---

## Fase 1: Captura y Transcripción (STT)

**Frontend (`VoiceRecorder.jsx`):**
- Selección de especie → paciente → grabación `.webm`
- Opcional: adjuntar fotos (cámara o galería)
- Si no hay red: IndexedDB + sync con `/reports/analyze-and-confirm-batch`

**Backend (`audio_service.py`):**
- **Producción:** Groq Whisper (`GROQ_STT_MODEL`, ej. `whisper-large-v3-turbo`)
- **Desarrollo:** Groq si hay `GROQ_API_KEY`; si no, **faster-whisper** `medium` (CPU)
- Endpoint: `POST /reports/analyze-voice`

---

## Fase 2: Interpretación Semántica (Qwen 2.5 7B en servidor)

El **postproceso NLP no usa un modelo chico local**. Llama al vLLM remoto:

| Variable | Default |
|----------|---------|
| `VLLM_BASE_URL` | `http://100.82.178.56:8010/v1` |
| `VLLM_MODEL` | `Qwen/Qwen2.5-7B-Instruct-AWQ` |
| `USE_GROQ` | vacío (solo si `1` + `GROQ_API_KEY` usa Groq) |

Al arrancar el backend se imprime: `[IA] Postproceso NLP -> ...`

1. **Prompt con restricciones:** TagSets y diccionarios de la BD. No inventa categorías fuera del vocabulario.
2. **Salida JSON** con `cleaned_text`, `severity` y `inserts` (`standard_set`, `spoken_variant`, `value`).
3. **Mapeo:** `Enfermedad` → diagnóstico, `Medicación` → medicación, `Observación`/`Observacion` → evento + observación, resto → `ReportEvent`.

También: `POST /reports/analyze-text` (mismo NLP sin audio).

---

## Fase 3: Auto-Aprendizaje (TagSet)

- Se comparan `spoken_variant` con variantes en `tag_sets`
- Variantes nuevas se agregan al conjunto correspondiente
- Admin audita en **Panel → Diccionarios IA**

### TagSets obligatorios

Siempre presentes y **no eliminables**:

- Comida  
- Agua  
- Pis  
- Caca  

El resto de conjuntos son opcionales.

---

## Fase 4: Validación e Inserción (Wizard)

1. **Rutina diaria siempre visible:** Comida, Agua, Pis, Caca aparecen en el formulario de confirmación aunque el audio no los mencione.
2. **No son obligatorios:** si quedan vacíos, **no se guardan** en BD.
3. **Observación:** botón *Agregar como observación* guarda el texto como evento `Observacion` + `AnimalObservation` y `severity = observation` (amarillo).
4. **Confirmación:** `POST /reports/confirm`
5. **Fotos:** `POST /reports/{report_id}/attach-photo`
6. **Severidad:** `normal` / `observation` / `critical` (tipos Observación → observation; Enfermedad/Medicación → critical)

---

## Fase 5: Alertas Críticas

`report_helpers.py` escanea transcripción y valores contra `color_rules` (rojo).

Si hay match → `critical_alerts` + `severity = critical` hasta `PATCH /dashboard/critical-alerts/{id}/resolve`.

---

## Fase 6: Edición Manual

`PUT /reports/{id}/edit` → borra eventos previos, re-ejecuta NLP, recalcula severidad/colores/alertas.

---

## Fase 7: Analítica

### Clima de la Guardería
- `GET /dashboard/weather`
- Resumen + alertas JSON (sin exagerar síntomas leves)

### Análisis por animal
- `GET /animals/{id}/evolution-analysis`
- Prompt **neutro y factual**: sin alarmismo, sin diagnósticos inventados, temperatura baja (`0.1`)
- Un párrafo corto basado solo en el historial reciente

### Exportación PDF (historia clínica)
- `GET /reports/export-pdf/{animal_id}?range=1month|3months|6months|9months|1year`
- La IA resume reportes del período + texto extraído de PDFs de laboratorio (`pypdf`)
- UI: **Admin → Exportar Historias** (`ExportacionPanel.jsx`)

---

## Colores Semánticos en el Frontend

| Color | Condición |
|-------|-----------|
| **Verde** | Default / rutina normal |
| **Amarillo** | Tipo `Observacion` / `Observación` / `Nota`, o keywords amarillas |
| **Rojo** | Tipo Enfermedad / Medicación, o keywords rojas |

Prioridad: rojo > amarillo > verde (el peor color del reporte gana en auditoría).

El historial de auditoría permite filtrar por **Verde / Amarillo / Rojo** y por rango de fechas (texto negro en inputs `type=date`).

---

## Archivos Clave

| Archivo | Rol |
|---------|-----|
| `frontend/src/components/VoiceRecorder.jsx` | Grabación, fotos, wizard, observación, offline |
| `backend/src/services/audio_service.py` | Whisper + Qwen (servidor) + clima + evolución |
| `backend/src/services/report_helpers.py` | Severidad, alertas, TagSets requeridos |
| `backend/src/routes/report_routes.py` | analyze, confirm, edit, attach-photo |
| `frontend/src/pages/AnimalHistory.jsx` | Timeline y colores |
| `frontend/src/pages/admin/AuditoriaPanel.jsx` | Feed, filtros color/fecha |
| `frontend/src/pages/admin/AnalisisPanel.jsx` | Análisis por animal |
| `frontend/src/pages/admin/ExportacionPanel.jsx` | PDF clínico por rango |
| `frontend/src/pages/Dashboard.jsx` | Casita, observación amarilla |

---

## Variables de Entorno (Backend)

| Variable | Descripción |
|----------|-------------|
| `GROQ_API_KEY` | API key de Groq (solo si `USE_GROQ=1`) |
| `USE_GROQ` | `1` para forzar Groq; por defecto vLLM del servidor |
| `GROQ_STT_MODEL` | Default: `whisper-large-v3-turbo` |
| `GROQ_VISION_MODEL` | Escaneo vacunas: `qwen/qwen3.6-27b` — ver [docs/VACUNAS_ESCANEO.md](./docs/VACUNAS_ESCANEO.md) |
| `VLLM_BASE_URL` | Default: `http://100.82.178.56:8010/v1` |
| `VLLM_MODEL` | Default: `Qwen/Qwen2.5-7B-Instruct-AWQ` |
| `SECRET_KEY` | Firma JWT (cambiar en producción) |

PostgreSQL se configura en `backend/src/database/session.py`.
