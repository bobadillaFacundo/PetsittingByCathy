# Flujo de Procesamiento de Audio a Texto (NLP Pipeline)

Este documento detalla el motor de Inteligencia Artificial: cómo la voz se transforma en registros normalizados, cómo aprende vocabulario nuevo y cómo interactúan las funcionalidades de alertas, fotos y edición.

## Arquitectura General

```
[Micrófono] → Whisper → Qwen LLM → Auto-aprendizaje TagSet
                    ↓
              Wizard Frontend → /confirm → PostgreSQL
                    ↓
         Alertas críticas + severity + attachments
```

Fases principales:
1. **Captura y Transcripción** (voz → texto crudo)
2. **Interpretación Semántica** (texto → JSON estructurado)
3. **Auto-Aprendizaje** (actualización de diccionarios)
4. **Validación e Inserción** (wizard → base de datos)
5. **Analítica Global** (El Clima de la Guardería)
6. **Post-procesamiento** (alertas críticas, fotos, edición)

---

## Fase 1: Captura y Transcripción (Whisper)

**Frontend (`VoiceRecorder.jsx`):**
- Selección de especie → paciente → grabación `.webm`
- Opcional: adjuntar fotos (cámara o galería) antes de confirmar
- Si no hay red: guardado en IndexedDB y sync con `/reports/analyze-and-confirm-batch`

**Backend (`audio_service.py`):**
- Modelo: **`faster-whisper` medium** (CPU, `int8`)
- Endpoint: `POST /reports/analyze-voice`
- Salida: texto crudo con posibles muletillas y errores de pronunciación

---

## Fase 2: Interpretación Semántica (Qwen 2.5 7B)

**Modelo:** `Qwen/Qwen2.5-7B-Instruct-AWQ` vía vLLM (WSL/GPU) o **Groq** como alternativa cloud.

1. **Prompt con restricciones:** se cargan `TagSet` y `DataDictionary` de la BD. La IA no puede inventar categorías fuera del vocabulario permitido.
2. **Salida JSON:**
   ```json
   {
     "cleaned_text": "Kira comió la mitad y vomitó agua.",
     "data": [{
       "animal": "Kira",
       "severity": "observation",
       "inserts": [
         { "standard_set": "Comida", "spoken_variant": "comió", "value": "mitad" },
         { "standard_set": "Enfermedad", "spoken_variant": "vomitó", "value": "agua" }
       ]
     }]
   }
   ```
3. **Mapeo legacy:** `Enfermedad` → `AnimalDiagnosis`, `Medicación` → `AnimalMedication`, resto → `ReportEvent`.

También disponible: `POST /reports/analyze-text` (mismo NLP sin audio).

---

## Fase 3: Auto-Aprendizaje (TagSet)

Tras recibir el JSON de Qwen:
- Se compara cada `spoken_variant` con las variantes existentes en `tag_sets`
- Si es nueva (*"se atragantó"*), se agrega automáticamente al conjunto correspondiente
- El admin puede auditar/editar en **Panel → Diccionario IA** (`GET /dashboard/dictionary`)

---

## Fase 4: Validación e Inserción

1. **Wizard:** el frontend muestra `cleaned_text` editable y un paso por cada evento detectado
2. **Confirmación:** `POST /reports/confirm` persiste en:
   - `reports` (transcripción)
   - `report_events` (comida, pis, caca…)
   - `animal_diagnoses`, `animal_medications`, `animal_observations`
3. **Fotos:** tras confirmar, el frontend sube cada imagen con `POST /reports/{report_id}/attach-photo` → tabla `attachments`
4. **Severidad:** se calcula y actualiza `animals.severity` (`normal` / `observation` / `critical`)

---

## Fase 5: Alertas Críticas (Palabras Rojo)

Al confirmar o editar un reporte, `report_helpers.py` escanea la transcripción y valores de eventos contra `color_rules` (color = `red`):

| match_type | Ejemplo |
|------------|---------|
| `exact` | `"no"`, `"nada"` |
| `partial` | `"sangre"`, `"vómito"`, `"diarrea"` |

Si hay coincidencia:
- Se crea un registro en `critical_alerts`
- El animal pasa a `severity = critical`
- El **Dashboard** muestra un banner rojo fijado hasta `PATCH /dashboard/critical-alerts/{id}/resolve`

Las reglas se configuran en **Panel Admin → Colores** (`PUT /catalogs/color-rules/{id}`).

---

## Fase 6: Edición Manual de Transcripciones

Cuando Whisper o Qwen transcriben mal por ruido de fondo:

1. En el historial clínico, botón **Editar** en cualquier reporte
2. `PUT /reports/{id}/edit` con la transcripción corregida
3. El backend:
   - Borra los `report_events` anteriores del reporte
   - Re-ejecuta el NLP sobre el texto nuevo
   - Recalcula severidad y colores
   - Genera alertas críticas si corresponde

---

## Fase 7: Analítica Global (El Clima)

- Botón **Analizar Clima** → `GET /dashboard/weather`
- Lee reportes de las últimas **48 horas**
- Qwen genera resumen neutral + alertas estructuradas por animal
- Actualiza `animals.severity` según severidad IA (`high` → critical, `medium` → observation)

---

## Colores Semánticos en el Frontend

El historial y la auditoría aplican colores según `color_rules`:

| Color | Condición |
|-------|-----------|
| **Verde** | Valor normal (default) |
| **Amarillo** | `"poco"`, `"blanda"`, `"mitad"`, etc. |
| **Rojo** | `"no"`, `"sangre"`, `"diarrea"`, o tipos Enfermedad/Medicación |

Prioridad: Enfermedad y Medicación → siempre rojo.

---

## Archivos Clave

| Archivo | Rol |
|---------|-----|
| `frontend/src/components/VoiceRecorder.jsx` | Grabación, fotos, wizard, sync offline |
| `backend/src/services/audio_service.py` | Whisper + Qwen + clima global |
| `backend/src/services/report_helpers.py` | Severidad, alertas críticas, keywords |
| `backend/src/routes/report_routes.py` | analyze, confirm, edit, attach-photo |
| `frontend/src/pages/AnimalHistory.jsx` | Timeline, edición, fotos |
| `frontend/src/pages/Dashboard.jsx` | Tablero, alertas críticas, clima |

---

## Variables de Entorno (Backend)

| Variable | Descripción |
|----------|-------------|
| `GROQ_API_KEY` | API key de Groq (solo si `USE_GROQ=1`) |
| `USE_GROQ` | `1` para forzar Groq; por defecto usa vLLM del servidor |
| `VLLM_BASE_URL` | URL base del vLLM (default: `http://100.82.178.56:8010/v1`) |
| `VLLM_MODEL` | Modelo en el servidor (default: `Qwen/Qwen2.5-7B-Instruct-AWQ`) |

La conexión PostgreSQL se configura en `backend/src/database/session.py`.
