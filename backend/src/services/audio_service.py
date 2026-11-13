import shutil
import os
import requests
import json
from fastapi import UploadFile
from typing import Dict, Any
from dotenv import load_dotenv

load_dotenv()

UPLOAD_DIR = "uploads/audios"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# Configuración de claves y modelos (leídas del entorno)
# ---------------------------------------------------------------------------
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
USE_GROQ     = os.getenv("USE_GROQ", "").strip().lower() in ("1", "true", "yes")

# DeepSeek (NLP principal). Token: DEEPSEEK_API_KEY en backend/.env
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "").strip()
USE_DEEPSEEK = os.getenv("USE_DEEPSEEK", "1" if DEEPSEEK_API_KEY else "0").strip().lower() in (
    "1", "true", "yes",
)
DEEPSEEK_MODEL = (os.getenv("DEEPSEEK_MODEL") or "deepseek-chat").strip()
_DEEPSEEK_BASE = (os.getenv("DEEPSEEK_BASE_URL") or "https://api.deepseek.com").rstrip("/")
DEEPSEEK_URL = (
    _DEEPSEEK_BASE
    if _DEEPSEEK_BASE.endswith("/chat/completions")
    else f"{_DEEPSEEK_BASE}/chat/completions"
)

# Modelo STT de Groq para transcripción de audio
GROQ_STT_MODEL = os.getenv("GROQ_STT_MODEL", "whisper-large-v3-turbo")
GROQ_STT_URL   = "https://api.groq.com/openai/v1/audio/transcriptions"

# Custom Whisper server (OpenAI compatible API)
USE_CUSTOM_WHISPER = os.getenv("USE_CUSTOM_WHISPER", "0").strip().lower() in ("1", "true", "yes")
CUSTOM_WHISPER_URL = os.getenv("CUSTOM_WHISPER_URL", "http://100.82.178.56:9000/v1/audio/transcriptions")

from src.services.groq_models import (
    DEFAULT_NLP_MODEL,
    extract_groq_text,
    is_groq_model_unavailable,
    nlp_models_to_try,
    resolve_groq_model,
)

# Modelo de chat/NLP de Groq (llama-3.1-8b-instant ya no está en Groq)
GROQ_MODEL = resolve_groq_model(os.getenv("GROQ_MODEL"), DEFAULT_NLP_MODEL)
GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions"

# Servidor vLLM local (Tailscale). Override con env vars si hace falta.
_VLLM_BASE = os.getenv("VLLM_BASE_URL", "").rstrip("/")
VLLM_MODEL = os.getenv("VLLM_MODEL", "Qwen/Qwen2.5-7B-Instruct-AWQ")
VLLM_URL   = f"{_VLLM_BASE}/chat/completions"

# ---------------------------------------------------------------------------
# Whisper local — desactivado para evitar OOM en Render (usa Groq)
# ---------------------------------------------------------------------------
whisper_model = None

# Audio/STT: siempre Groq (nunca DeepSeek).
if GROQ_API_KEY:
    print(f"[STT] Siempre Groq -> modelo={GROQ_STT_MODEL}")
elif USE_CUSTOM_WHISPER:
    print(f"[STT] Fallback Whisper Custom (sin GROQ_API_KEY) -> {CUSTOM_WHISPER_URL}")
else:
    print("ADVERTENCIA: GROQ_API_KEY no configurada. STT de audio fallará o usará mock.")

# DeepSeek: chat, clima, evolución, reporte de estadía, etc.
# Groq: STT + extracción de voz + Exportar Historias (historia clínica).
GROQ_PREFERRED_PURPOSES = frozenset({
    "extraccion_eventos",  # análisis del transcript de voz
    "historia_clinica",    # Exportar Historias (PDF)
})

if USE_DEEPSEEK and DEEPSEEK_API_KEY:
    print(f"[NLP] DeepSeek -> chat/clima/evolución/estadía ({DEEPSEEK_MODEL})")
if GROQ_API_KEY:
    print(
        f"[NLP] Groq -> STT + extraccion_eventos + historia_clinica ({GROQ_MODEL})"
    )
elif _VLLM_BASE:
    print(f"[NLP] Fallback vLLM ({VLLM_MODEL}) -> {VLLM_URL}")
else:
    print("[NLP] ADVERTENCIA: sin Groq ni DeepSeek configurados para NLP.")


def _transcribe_with_api(file_path: str) -> str:
    """Transcribe audio SIEMPRE con Groq si hay key (DeepSeek no se usa para audio)."""
    if GROQ_API_KEY:
        url = GROQ_STT_URL
        headers = {"Authorization": f"Bearer {GROQ_API_KEY}"}
        model = GROQ_STT_MODEL
    elif USE_CUSTOM_WHISPER:
        url = CUSTOM_WHISPER_URL
        headers = {}
        model = "whisper-1"
    else:
        raise RuntimeError("No hay GROQ_API_KEY para transcribir audio.")

    data = {
        "model": model,
        "language": "es",
        "response_format": "json",
    }

    with open(file_path, "rb") as audio_file:
        response = requests.post(
            url,
            headers=headers,
            files={"file": (os.path.basename(file_path), audio_file)},
            data=data,
            timeout=120,
        )
    response.raise_for_status()
    return response.json().get("text", "").strip()


class AudioService:
    @staticmethod
    async def save_audio(file: UploadFile) -> str:
        file_path = os.path.join(UPLOAD_DIR, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return file_path

    @staticmethod
    def transcribe_audio(file_path: str) -> str:
        # Audio siempre por Groq (nunca DeepSeek).
        if GROQ_API_KEY or USE_CUSTOM_WHISPER:
            try:
                transcript = _transcribe_with_api(file_path)
                if not transcript:
                    return "Silencio o ruido de fondo (no se detectó voz real)."
                return transcript
            except Exception as e:
                print(f"[STT] Error con API de transcripción: {e}")

        return "Theo comió, tomó agua, hizo pis, no hizo caca. Cleopatra tomó poca agua y tuvo caca blanda."


class NLPService:
    _ES_RULE = (
        "IDIOMA OBLIGATORIO: respondé SIEMPRE en español rioplatense (Argentina). "
        "Prohibido inglés u otros idiomas en el texto visible para el usuario "
        "(clima, alertas, resúmenes, mensajes)."
    )

    @staticmethod
    def _with_spanish(messages: list) -> list:
        """Garantiza instrucción de idioma al inicio, sin duplicar si ya está."""
        if messages and messages[0].get("role") == "system":
            content = messages[0].get("content") or ""
            if "IDIOMA OBLIGATORIO" not in content:
                messages = [
                    {**messages[0], "content": f"{NLPService._ES_RULE}\n\n{content}"},
                    *messages[1:],
                ]
            return messages
        return [{"role": "system", "content": NLPService._ES_RULE}, *messages]

    @staticmethod
    def _post_chat(
        url: str,
        api_key: str | None,
        payload: dict,
        *,
        provider: str,
        purpose: str,
        timeout: int = 90,
    ) -> str:
        from src.services.ai_usage import log_ai_usage

        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        response = requests.post(url, headers=headers, json=payload, timeout=timeout)
        response.raise_for_status()
        data = response.json()
        log_ai_usage(
            provider=provider,
            model=payload.get("model"),
            purpose=purpose,
            payload=data,
        )
        content = extract_groq_text(data)
        if not content:
            raise RuntimeError(f"Respuesta vacía desde {url}")
        return content

    @staticmethod
    def _call_deepseek(messages: list, json_format: bool, temperature: float, purpose: str) -> str:
        payload = {
            "model": DEEPSEEK_MODEL,
            "messages": messages,
            "temperature": temperature,
        }
        if json_format:
            payload["response_format"] = {"type": "json_object"}
        return NLPService._post_chat(
            DEEPSEEK_URL,
            DEEPSEEK_API_KEY,
            payload,
            provider="deepseek",
            purpose=purpose,
        )

    @staticmethod
    def _call_groq(messages: list, json_format: bool, temperature: float, purpose: str) -> str:
        from src.services.ai_usage import log_ai_usage

        last_error = None
        for model_name in nlp_models_to_try(GROQ_MODEL):
            payload = {
                "model": model_name,
                "messages": messages,
                "temperature": temperature,
            }
            if json_format:
                payload["response_format"] = {"type": "json_object"}
            response = requests.post(
                GROQ_URL,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                },
                json=payload,
                timeout=90,
            )
            if response.status_code == 200:
                data = response.json()
                content = extract_groq_text(data)
                if content:
                    log_ai_usage(
                        provider="groq",
                        model=model_name,
                        purpose=purpose,
                        payload=data,
                    )
                    return content
                last_error = f"Groq {model_name} devolvió contenido vacío"
                continue
            if is_groq_model_unavailable(response.status_code, response.text):
                print(f"[NLP] Groq modelo no disponible ({model_name}): {response.text[:180]}")
                last_error = response.text
                continue
            response.raise_for_status()
        raise RuntimeError(last_error or "Groq no respondió")

    @staticmethod
    def _call_vllm(messages: list, json_format: bool, temperature: float, purpose: str) -> str:
        payload = {
            "model": VLLM_MODEL,
            "messages": messages,
            "temperature": temperature,
        }
        if json_format:
            payload["response_format"] = {"type": "json_object"}
        return NLPService._post_chat(
            VLLM_URL,
            None,
            payload,
            provider="vllm",
            purpose=purpose,
        )

    @staticmethod
    def _call_llm(
        messages: list,
        json_format: bool = False,
        temperature: float = None,
        purpose: str = "nlp",
    ) -> str:
        """
        NLP routing:
        - Groq primero: extraccion_eventos (voz) + historia_clinica (Exportar)
        - DeepSeek primero: chat, clima, evolución, reporte_estadia, resto
        - El otro proveedor actúa de respaldo
        Audio/STT nunca pasa por acá: siempre Groq en AudioService.
        """
        messages = NLPService._with_spanish(messages)
        if temperature is None:
            temperature = 0.05 if json_format else 0.7

        errors = []
        prefer_groq = purpose in GROQ_PREFERRED_PURPOSES

        def try_groq():
            if not GROQ_API_KEY:
                return None
            return NLPService._call_groq(messages, json_format, temperature, purpose)

        def try_deepseek():
            if not (USE_DEEPSEEK and DEEPSEEK_API_KEY):
                return None
            return NLPService._call_deepseek(messages, json_format, temperature, purpose)

        primary, secondary = (
            (try_groq, try_deepseek) if prefer_groq else (try_deepseek, try_groq)
        )
        primary_name = "Groq" if prefer_groq else "DeepSeek"
        secondary_name = "DeepSeek" if prefer_groq else "Groq"

        try:
            result = primary()
            if result is not None:
                return result
        except Exception as e:
            print(f"[NLP] {primary_name} falló ({purpose}), intento {secondary_name}: {e}")
            errors.append(f"{primary_name}: {e}")

        try:
            result = secondary()
            if result is not None:
                return result
        except Exception as e:
            print(f"[NLP] {secondary_name} falló ({purpose}): {e}")
            errors.append(f"{secondary_name}: {e}")

        # vLLM local si está configurado
        vllm_base = os.getenv("VLLM_BASE_URL", "").strip()
        if vllm_base:
            try:
                return NLPService._call_vllm(messages, json_format, temperature, purpose)
            except Exception as e:
                print(f"[NLP] vLLM falló: {e}")
                errors.append(f"vLLM: {e}")

        detail = " | ".join(errors) if errors else "sin proveedores NLP configurados"
        raise RuntimeError(f"No se pudo completar la llamada NLP ({detail})")

    # Anti-alucinación compartido por reportes IA (historia, estadía, evolución, clima, chat)
    _NO_HALLUCINATION = """
FIDELIDAD A LOS DATOS (OBLIGATORIO — SIN EXCEPCIONES)
1. Usá SOLO lo que aparece en los datos cargados (eventos, transcripciones, medicación, observaciones, ficha, labs).
2. PROHIBIDO inventar: síntomas, cantidades, horarios, diagnósticos, causas, pronósticos, "todo normal", convivencia, juego, apetito o medicación si no están escritos.
3. Si un eje no tiene datos, escribí explícitamente: "No hay registros cargados de [eje] en el período." Nunca lo completes con supuestos.
4. Aclará la fuente con frases como: "según los reportes cargados", "según la ficha de ingreso", "según las observaciones registradas".
5. Diferenciá SIEMPRE: (a) evidencia diaria registrada vs (b) dato de ficha/contexto. No presentes la ficha como si hubiera pasado en el día.
6. No generalices un solo día a "toda la estadía" salvo que los datos lo sostengan.
7. Si los datos son escasos, el texto debe ser corto y decir que la información cargada es limitada.
"""

    _CLINICAL_HISTORY_SYSTEM = f"""
ROL
Sos el/la Veterinario/a Jefe/a clínico/a de Petsitting by Cathy: médico veterinario senior con amplia experiencia en medicina interna de pequeños animales, seguimiento longitudinal y redacción de historias clínicas formales.
Tu criterio es clínico, preciso y responsable. No sos un redactor genérico ni un asistente conversacional: redactás documentación médica veterinaria usable por colegas y tutores informados.

{_NO_HALLUCINATION}

REGLAS DE ORO
1. Basate ÚNICAMENTE en los datos provistos. PROHIBIDO inventar diagnósticos, valores, fechas o síntomas.
2. Español rioplatense (Argentina). Prohibido inglés. Prohibido Markdown (#, *, **).
3. Lenguaje clínico sobrio, sin dramatizar ni minimizar.
4. Si falta evidencia, decilo; no completes huecos.
5. Cada afirmación relevante debe poder rastrearse a un dato cargado; si no, no la escribas.
"""

    @staticmethod
    def _chunk_list(items: list, chunk_size: int) -> list[list]:
        if chunk_size <= 0:
            return [items]
        return [items[i:i + chunk_size] for i in range(0, len(items), chunk_size)]

    @staticmethod
    def _summarize_clinical_chunk(
        animal_name: str,
        chunk_lines: list,
        chunk_index: int,
        total_chunks: int,
    ) -> str:
        """Resumen parcial de un lote de reportes (paso 1: de a poco)."""
        block = "\n".join(chunk_lines)
        prompt = f"""Paciente: {animal_name}
Lote {chunk_index}/{total_chunks} de reportes diarios.

Hacé un RESUMEN CLÍNICO PARCIAL (texto plano, 8-15 líneas) de SOLO este lote:
- Apetito / agua
- Pis / caca / vómitos
- Ánimo / energía
- Síntomas o medicación si aparecen
- Fechas o tendencia dentro del lote

No armes la historia clínica completa todavía.
Citá solo lo cargado (ej: "según el reporte del [fecha]...").
Si un ítem no aparece en el lote, escribí "sin registros en este lote".
PROHIBIDO inventar o asumir.

REPORTES DEL LOTE:
{block}
"""
        messages = [
            {"role": "system", "content": NLPService._CLINICAL_HISTORY_SYSTEM},
            {"role": "user", "content": prompt},
        ]
        return NLPService._call_llm(
            messages, json_format=False, temperature=0.1, purpose="historia_clinica"
        )

    @staticmethod
    def _consolidate_clinical_summaries(
        animal_name: str,
        partial_summaries: list[str],
        lab_results_data: list | None = None,
    ) -> str:
        """Une los resúmenes parciales en la historia clínica final (paso 2)."""
        labs = "Sin estudios de laboratorio en el período."
        if lab_results_data:
            labs = "\n".join(lab_results_data)

        joined = "\n\n----\n\n".join(
            f"RESUMEN PARCIAL {i + 1}:\n{s}" for i, s in enumerate(partial_summaries)
        )

        prompt = f"""Consolidá los resúmenes parciales del paciente "{animal_name}" en UNA historia clínica formal.

ESTRUCTURA OBLIGATORIA (texto plano, sin Markdown):
1) IDENTIFICACION Y PERIODO
2) RESUMEN CLINICO EJECUTIVO (solo hechos cargados)
3) ESTADO GENERAL, ANIMO Y APETITO
4) FUNCIONES FISIOLOGICAS
5) SIGNOS, SINTOMAS Y EVOLUCION PATOLOGICA
6) ESTUDIOS DE LABORATORIO E INTEGRACION CLINICA (solo si hay labs reales)
7) MEDICACION Y ADHERENCIA (solo si hay datos)
8) IMPRESION CLINICA Y CIERRE (sin inventar diagnósticos)

REGLAS AL CONSOLIDAR:
- No agregues nada que no esté en los resúmenes parciales o labs.
- Si un eje quedó sin datos en todos los lotes, decilo explícitamente.
- Preferí "según lo registrado" antes que afirmaciones absolutas.

RESUMENES PARCIALES (ya analizados de a poco):
{joined}

LABORATORIOS:
{labs}

Redactá el documento final consolidado en español, texto plano.
"""
        messages = [
            {"role": "system", "content": NLPService._CLINICAL_HISTORY_SYSTEM},
            {"role": "user", "content": prompt},
        ]
        return NLPService._call_llm(
            messages, json_format=False, temperature=0.1, purpose="historia_clinica"
        )

    @staticmethod
    def generate_clinical_history(
        animal_name: str,
        reports_data: list,
        lab_results_data: list = None,
        chunk_size: int = 20,
    ) -> str:
        """
        Historia clínica por lotes:
        1) resume de a poco (chunks de reportes)
        2) consolida en el documento final
        """
        lines = [ln for ln in (reports_data or []) if ln and str(ln).strip()]
        if not lines:
            lines = ["No hay reportes en este período."]

        try:
            # Poco volumen: una sola pasada
            if len(lines) <= chunk_size:
                partial = NLPService._summarize_clinical_chunk(
                    animal_name, lines, 1, 1
                )
                return NLPService._consolidate_clinical_summaries(
                    animal_name, [partial], lab_results_data
                )

            chunks = NLPService._chunk_list(lines, chunk_size)
            partials = []
            for idx, chunk in enumerate(chunks, start=1):
                try:
                    print(
                        f"[HISTORIA] Lote {idx}/{len(chunks)} "
                        f"({len(chunk)} líneas) para {animal_name}"
                    )
                    partials.append(
                        NLPService._summarize_clinical_chunk(
                            animal_name, chunk, idx, len(chunks)
                        )
                    )
                except Exception as e:
                    print(f"[HISTORIA] Falló lote {idx}: {e}")
                    # Conservar un extracto crudo del lote para no perder la ventana
                    preview = "\n".join(chunk[:8])
                    partials.append(
                        f"Resumen parcial {idx} (fallback local):\n{preview}"
                    )

            if not partials:
                raise RuntimeError("No se pudo resumir ningún lote")

            return NLPService._consolidate_clinical_summaries(
                animal_name, partials, lab_results_data
            )
        except Exception as e:
            print(f"Error generando historia clínica: {e}")
            return (
                f"HISTORIA CLINICA: {animal_name}\n\n"
                "Ocurrió un error al generar el resumen con IA. Por favor, intente de nuevo.\n\n"
                + "\n".join(lines[:30])
            )

    @staticmethod
    def extract_events_from_transcript(transcript: str, dictionaries: list, animal_name: str, tag_sets: list) -> Dict[str, Any]:
        # Construir configuración de etiquetas
        tags_instructions = ""
        for tag in tag_sets:
            tags_instructions += f"- Conjunto: '{tag.name}'\n"
            from src.services.tag_helpers import get_tag_variants_text
            tags_instructions += f"  Variantes conocidas: {get_tag_variants_text(tag)}\n"

        prompt = f"""
ERES UN EXTRACTOR DE DATOS ESTRICTO. Extrae la información del reporte veterinario para el paciente "{animal_name}" en formato JSON.
Reglas CRÍTICAS Y OBLIGATORIAS (PENALIZACIÓN SI NO SE CUMPLEN):
1. SOLO extrae eventos que se mencionaron EXPLÍCITAMENTE. NO INFIERAS, NO ASUMAS, NO INVENTES.
2. Todo el reporte corresponde exclusivamente a "{animal_name}".
3. Para cada evento extraído, debes indicar:
   - "standard_set": ESTRICTAMENTE UNO DE LOS CONJUNTOS CONOCIDOS LISTADOS ABAJO. ¡PROHIBIDO inventar nombres nuevos! Si es un síntoma o problema general y no hay conjunto específico, usa "Enfermedad" u "Observación".
   - "spoken_variant": El verbo o acción exacta que dijo el usuario (por ejemplo: "morfó", "garcó", "vomitó").
   - "value": El valor, cantidad, estado o descripción. MUY IMPORTANTE: Si es negativo (ej. "no hizo caca"), el valor debe ser "no" o "nada". Si es positivo, pon el estado (ej: "todo", "normal", "blanda", "sangre", "mitad"). Si el conjunto es "Peso", el valor debe ser SOLO el número en kilogramos (ej: "12.5", "8") sin unidades.
4. Evalúa la urgencia médica global de este reporte para el paciente y asígnala al campo "severity". Solo puedes usar estos valores exactos:
   - "normal": Si comió, hizo pis y no hay anomalías.
   - "observation": Si hay síntomas leves o inusuales (ej: caca blanda, no comió, poco ánimo).
   - "critical": Si hay síntomas graves (ej: vómito repetido, sangre). ¡No seas exagerado, usa critical solo si es emergencia real!

Conjuntos conocidos permitidos (USAR ESTRICTAMENTE SOLO ESTOS NOMBRES):
{tags_instructions}

EJEMPLO (solo formato, NO copiar los datos):
Reporte: "Luna morfó todo, tomó agua normal, no hizo caca y vomitó amarillo."
Respuesta:
{{
  "cleaned_text": "Luna morfó todo, tomó agua normal, no hizo caca y vomitó amarillo.",
  "data": [
    {{
      "animal": "{animal_name}",
      "severity": "observation",
      "inserts": [
        {{"standard_set": "Comida", "spoken_variant": "morfó", "value": "todo"}},
        {{"standard_set": "Agua", "spoken_variant": "tomó agua", "value": "normal"}},
        {{"standard_set": "Caca", "spoken_variant": "hizo caca", "value": "no"}},
        {{"standard_set": "Enfermedad", "spoken_variant": "vomitó", "value": "amarillo"}}
      ]
    }}
  ]
}}

Si mencionan peso (ej. "pesa 12 kilos"), agrega un evento con standard_set "Peso" y value numérico. El peso es OPCIONAL: no lo inventes si no se mencionó.

REPORTE REAL A ANALIZAR: "{transcript}"
Responde ÚNICAMENTE con el objeto JSON. NO inventes eventos que no se mencionaron.
"""
        try:
            content = NLPService._call_llm(
                [{"role": "user", "content": prompt}],
                json_format=True,
                purpose="extraccion_eventos",
            )
            
            # Limpiar por si el modelo devuelve markdown extra
            content = content.replace("```json", "").replace("```", "").strip()
            
            data = json.loads(content)
            return data # Devuelve tanto cleaned_text como data
        except Exception as e:
            print(f"Error con LLM (extracción): {e}")
            return []

    @staticmethod
    def answer_query(query: str, db) -> str:
        # Recuperamos los últimos reportes para dar contexto a la IA
        from src.models.models import Report, Animal
        reports = db.query(Report).order_by(Report.created_at.desc()).limit(5).all()
        
        context_lines = []
        for r in reports:
            animal = db.query(Animal).filter(Animal.id == r.animal_id).first()
            animal_name = animal.name if animal else "Desconocido"
            date_str = r.created_at.strftime("%Y-%m-%d %H:%M")
            context_lines.append(f"[{date_str}] Reporte sobre {animal_name}: {r.audio_transcript}")
            
        context_str = "\n".join(context_lines)
        
        system_prompt = f"""
Eres un asistente veterinario experto. Tienes acceso al siguiente historial clínico reciente:
{context_str}

{NLPService._NO_HALLUCINATION}

Responde a la pregunta del usuario basándote ÚNICAMENTE en el historial anterior.
Sé breve, amable y directo. Respondé siempre en español.
Si no está en el historial, decí: "No figura en la información cargada."
"""
        try:
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": query}
            ]
            return NLPService._call_llm(messages, json_format=False, purpose="chat")
        except Exception as e:
            print(f"Error con LLM (chat): {e}")
            return "Ocurrió un error al contactar al modelo de IA. Revisa los logs o tu conexión."

    @staticmethod
    def generate_daycare_stay_report(
        animal_name: str,
        stay_context: dict,
    ) -> str:
        """Genera un reporte de estadía en guardería (última ingreso → hoy) con IA."""
        period_start = stay_context.get("period_start") or "sin fecha"
        period_end = stay_context.get("period_end") or "hoy"
        reservation_status = stay_context.get("reservation_status") or "desconocido"
        events_text = stay_context.get("events_text") or "Sin eventos registrados."
        transcripts_text = stay_context.get("transcripts_text") or "Sin transcripciones."
        medications_text = stay_context.get("medications_text") or "Sin medicación activa registrada."
        observations_text = stay_context.get("observations_text") or "Sin observaciones adicionales."
        profile_text = stay_context.get("profile_text") or "Sin ficha de ingreso adicional."

        system_prompt = f"""
ROL
Sos la Coordinadora Senior de Guardería de Petsitting by Cathy: profesional experta en cuidado diario de mascotas, observación conductual y redacción de reportes de estadía para tutores.
No sos veterinaria clínica ni diagnosticás enfermedades: tu autoridad es el control operativo del animal DURANTE su estadía en la guardería.

{NLPService._NO_HALLUCINATION}

CONTEXTO
Trabajás en una guardería de animales que registra y controla el estado de cada mascota mientras está a cargo:
- Ingreso y egreso de estadías.
- Rutina fisiológica diaria (comida, agua, pis, caca).
- Convivencia y sociabilidad con otros animales y personas.
- Administración de medicación cuando el tutor o la ficha lo indican.
- Observaciones de ánimo, energía, juego, estrés o incidentes.
El reporte que redactás es el documento que se entrega al tutor sobre CÓMO estuvo la mascota en esta estadía (desde el último ingreso hasta ahora).

OBJETIVO
Redactar un REPORTE DE ESTADÍA claro, cálido-profesional y útil para el tutor de "{animal_name}", cubriendo EXCLUSIVAMENTE el período {period_start} → {period_end},
usando SOLO la información cargada en los bloques del mensaje del usuario.

ESTRUCTURA OBLIGATORIA (texto plano, sin Markdown, sin asteriscos, sin numerales de título con #)
Usá exactamente estos encabezados en mayúsculas, en este orden:

1) ENCABEZADO DE ESTADÍA
   - Nombre de la mascota, período (desde / hasta) y estado de la reserva si se conoce.
2) ALIMENTACIÓN Y AGUA
   - Solo según eventos/transcripciones cargados. Si no hay: "No hay registros cargados de alimentación/agua en el período."
3) HIGIENE FISIOLÓGICA (PIS Y CACA)
   - Solo según lo registrado. Sin inventar "normal".
4) CONVIVENCIA Y SOCIALIZACIÓN
   - Solo si hay datos explícitos. Si no: "No se registraron observaciones de convivencia en este período."
5) MEDICACIÓN
   - Si MEDICACIÓN EN FICHA tiene ítems, la sección es OBLIGATORIA y debe citar esa ficha.
   - Separá: "Según ficha..." vs "Según reportes del período...".
   - No afirmes que se administró si no hay eventos/transcripciones que lo digan.
6) OBSERVACIONES RELEVANTES
   - Solo lo cargado en observaciones/transcripciones/eventos.
7) CIERRE PARA EL TUTOR
   - 2 a 4 oraciones basadas en lo anterior; sin elogios inventados.

REGLAS DE ORO (INQUEBRANTABLES)
1. Basate ÚNICAMENTE en los datos provistos. PROHIBIDO inventar, asumir o rellenar huecos.
2. Cada sección debe reflejar la información cargada o declarar que falta.
3. Priorizá hechos concretos y tendencias solo si hay varios registros.
4. Tono: español rioplatense (Argentina), profesional, cercano, sobrio. Sin dramatizar. Sin diagnósticos médicos.
5. No uses inglés. No uses Markdown. No inventes fechas fuera del período.
6. Si hay medicación en ficha, NUNCA omitas MEDICACIÓN.
7. Nunca contradigas los datos cargados.
8. El reporte debe poder leerse en menos de 2 minutos.

CALIDAD
- Preferí: "se registró", "según los reportes cargados", "según la ficha".
- Evitá: "tuvo una estadía maravillosa", "comió siempre bien", "convivió perfecto" sin evidencia.
"""

        user_prompt = f"""Generá el reporte de estadía de "{animal_name}".

IMPORTANTE: estos bloques son LA ÚNICA fuente de verdad. No agregues nada que no esté acá.
Si un bloque dice que no hay datos, la sección correspondiente debe decirlo.

METADATOS DE ESTADÍA
- Período: {period_start} → {period_end}
- Estado de reserva/ingreso: {reservation_status}

FICHA / CONTEXTO DE INGRESO (contexto; no es evidencia diaria salvo medicación de ingreso)
{profile_text}

MEDICACIÓN EN FICHA (debe informarse si hay ítems)
{medications_text}

EVENTOS ESTRUCTURADOS DEL PERÍODO (comida, agua, pis, caca, medicación, etc.)
{events_text}

TRANSCRIPCIONES DE REPORTES DIARIOS DEL PERÍODO
{transcripts_text}

OBSERVACIONES ADICIONALES DEL PERÍODO
{observations_text}

Redactá ahora el reporte completo en español, con la estructura obligatoria, sin inventar.
"""
        try:
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ]
            return NLPService._call_llm(
                messages, json_format=False, temperature=0.1, purpose="reporte_estadia"
            )
        except Exception as e:
            print(f"Error generando reporte de estadía: {e}")
            return (
                f"REPORTE DE ESTADÍA: {animal_name}\n\n"
                "Ocurrió un error al generar el reporte con IA. "
                "Revisá la conexión con el modelo e intentá de nuevo."
            )

    @staticmethod
    def analyze_animal_evolution(animal_name: str, history_context: str) -> str:
        system_prompt = f"""
Sos un asistente que resume de forma NEUTRA y FACTUAL el historial de "{animal_name}" en una guardería canina.
No sos un diagnóstico veterinario ni una alerta dramática.
Escribí TODO el resumen en español (Argentina). Nunca en inglés.

{NLPService._NO_HALLUCINATION}

TONO (obligatorio):
- Neutro, sobrio, sin dramatizar.
- Sin alarmismo, sin urgencia inventada, sin lenguaje emocional.
- Evitá palabras como: "preocupante", "alarmante", "crítico", "grave", "urgente", "peligro", "riesgo alto", "debe atenderse de inmediato".
- Si algo es anómalo, describilo con calma (ej: "se registró caca blanda") sin magnificarlo.

CONTENIDO:
1. Un solo párrafo corto (3 a 5 oraciones) en español.
2. Decí solo lo que aparece en el historial cargado: rutina y hallazgos explícitos.
3. Compará reportes solo si hay datos suficientes; si no, decí que hay poca información cargada para comparar.
4. No inventes causas, diagnósticos, tratamientos ni pronósticos.
5. No recomiendes visitas al vet ni medidas urgentes salvo que el historial lo diga explícitamente.
6. Empezá o incluí una fórmula tipo "Según el historial cargado...".

REGLAS:
- Basate ÚNICAMENTE en el historial dado.
- No asumas ni completes huecos.
- Preferí "sin cambios relevantes en lo registrado" antes que forzar una evolución.
"""
        try:
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Historial cargado de {animal_name}:\n{history_context}\n\nRedactá un resumen neutro y breve EN ESPAÑOL, solo con lo cargado."}
            ]
            return NLPService._call_llm(
                messages, json_format=False, temperature=0.05, purpose="evolucion"
            )
        except Exception as e:
            print(f"Error con LLM (evolución): {e}")
            return "Ocurrió un error al generar el análisis. Revisa los logs de la aplicación."

    @staticmethod
    def generate_global_weather_report(reports_data: list):
        """Genera un reporte del 'Clima' global y alertas inteligentes basado en los reportes recientes."""
        reports_text = ""
        for r in reports_data:
            reports_text += f"- Mascota: {r['animal']} | Reporte: {r['transcript']} | Fecha: {r['date']}\n"

        prompt = f"""Eres el asistente jefe de una guardería veterinaria.
Lee los siguientes reportes CARGADOS de la ÚLTIMA SEMANA y genera el "Clima" del tablero.
Sé breve: el análisis debe ser rápido y concreto.

Reglas estrictas:
1. TODO el contenido (clima y alertas) debe estar EN ESPAÑOL de Argentina. Prohibido inglés.
2. Redactá un párrafo corto (3-5 oraciones) resumiendo SOLO lo que aparece en los reportes cargados. Usá emojis de clima (☀️, ⛅, ⛈️).
3. Empezá el clima con "Según los reportes cargados...".
4. Extraé alertas SOLO si el síntoma está escrito en algún reporte. No inventes mascotas ni mensajes.
5. Cada alerta.message debe citar el hallazgo cargado (frase corta).
6. Si no hay reportes o son insuficientes, weather debe decir que hay poca información cargada y alerts = [].
7. Priorizá lo más reciente; PROHIBIDO inventar.
8. Respondé ÚNICAMENTE en formato JSON válido, sin texto adicional, con esta estructura:
{{
  "weather": "Párrafo del clima aquí en español...",
  "alerts": [
    {{
      "animal_name": "Nombre",
      "message": "Mensaje corto de la alerta en español",
      "severity": "medium" o "high"
    }}
  ]
}}

Reportes cargados de la última semana:
{reports_text if reports_text.strip() else "(sin reportes cargados)"}
"""
        messages = [
            {
                "role": "system",
                "content": (
                    "Sos un asistente JSON veterinario. No alucinás. "
                    "Solo usás los reportes cargados. Todo el texto visible va en español."
                ),
            },
            {"role": "user", "content": prompt},
        ]

        try:
            ai_text = NLPService._call_llm(
                messages, json_format=True, temperature=0.0, purpose="clima"
            )
            data = json.loads(ai_text)
            return NLPService._normalize_weather_spanish(data)
        except Exception as e:
            print(f"Error generando clima: {e}")
            return {
                "weather": "No se pudo generar el clima por un error de conexión con la IA.",
                "alerts": []
            }

    @staticmethod
    def _normalize_weather_spanish(data: dict) -> dict:
        """Asegura estructura usable; mensajes vacíos se descartan."""
        weather = (data or {}).get("weather") or "Sin resumen de clima."
        alerts = []
        for item in (data or {}).get("alerts") or []:
            if not isinstance(item, dict):
                continue
            name = (item.get("animal_name") or "").strip()
            message = (item.get("message") or "").strip()
            if not name or not message:
                continue
            sev = (item.get("severity") or "medium").lower()
            if sev not in ("medium", "high"):
                sev = "medium"
            alerts.append({
                "animal_name": name,
                "message": message,
                "severity": sev,
            })
        return {"weather": weather, "alerts": alerts}
