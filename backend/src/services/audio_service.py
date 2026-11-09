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

# DeepSeek para TODO el NLP (reportes, chat, clima, evolución, etc.).
# Groq se reserva para audio/STT y como respaldo NLP.

if USE_DEEPSEEK and DEEPSEEK_API_KEY:
    print(f"[NLP] DeepSeek principal (reportes/chat/clima/evolución) -> {DEEPSEEK_MODEL}")
if GROQ_API_KEY:
    print(f"[STT/NLP] Groq = audio siempre + respaldo NLP -> {GROQ_MODEL}")
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
        - DeepSeek: reportes, chat, clima, evolución (y demás NLP)
        - Groq: respaldo NLP
        Audio/STT nunca pasa por acá: siempre Groq en AudioService.
        """
        messages = NLPService._with_spanish(messages)
        if temperature is None:
            temperature = 0.05 if json_format else 0.7

        errors = []

        # 1) DeepSeek para chat / clima / evolución / reportes / todo NLP
        if USE_DEEPSEEK and DEEPSEEK_API_KEY:
            try:
                return NLPService._call_deepseek(messages, json_format, temperature, purpose)
            except Exception as e:
                print(f"[NLP] DeepSeek falló ({purpose}), respaldo Groq: {e}")
                errors.append(f"DeepSeek: {e}")

        # 2) Groq como respaldo NLP (el audio STT no usa este método)
        if GROQ_API_KEY:
            try:
                return NLPService._call_groq(messages, json_format, temperature, purpose)
            except Exception as e:
                print(f"[NLP] Groq falló: {e}")
                errors.append(f"Groq: {e}")

        # 3) vLLM local si está configurado
        vllm_base = os.getenv("VLLM_BASE_URL", "").strip()
        if vllm_base:
            try:
                return NLPService._call_vllm(messages, json_format, temperature, purpose)
            except Exception as e:
                print(f"[NLP] vLLM falló: {e}")
                errors.append(f"vLLM: {e}")

        detail = " | ".join(errors) if errors else "sin proveedores NLP configurados"
        raise RuntimeError(f"No se pudo completar la llamada NLP ({detail})")

    @staticmethod
    def generate_clinical_history(animal_name: str, reports_data: list, lab_results_data: list = None) -> str:
        """Genera un resumen clínico detallado basado en reportes y laboratorios usando el LLM."""
        context_text = "\n".join(reports_data) if reports_data else "Sin reportes en el período."
        lab_block = "Sin estudios de laboratorio en el período."
        if lab_results_data:
            lab_block = "\n".join(lab_results_data)

        system_prompt = f"""
ROL
Sos el/la Veterinario/a Jefe/a clínico/a de Petsitting by Cathy: médico veterinario senior con amplia experiencia en medicina interna de pequeños animales, seguimiento longitudinal y redacción de historias clínicas formales.
Tu criterio es clínico, preciso y responsable. No sos un redactor genérico ni un asistente conversacional: redactás documentación médica veterinaria usable por colegas y tutores informados.

CONTEXTO
Trabajás sobre el historial de un paciente alojado/seguido en un entorno de guardería veterinaria que registra diariamente:
- Alimentación, hidratación, micción y defecación.
- Síntomas, enfermedades, vómitos, cambios de ánimo/energía.
- Medicación administrada o indicada.
- Observaciones clínicas de cuidadores.
- Estudios de laboratorio adjuntos (cuando existen).
Tu tarea es transformar ese registro crudo en una HISTORIA CLÍNICA profesional del paciente "{animal_name}" para el período solicitado, correlacionando clínica diaria con laboratorios cuando haya datos.

OBJETIVO
Producir un documento clínico claro, ordenado y defendible: que un colega pueda entender la evolución del paciente en pocos minutos sin volver a leer cada reporte suelto.

ESTRUCTURA OBLIGATORIA (texto plano; SIN Markdown; SIN asteriscos; SIN títulos con #)
Usá exactamente estos encabezados en mayúsculas y en este orden:

1) IDENTIFICACIÓN Y PERÍODO
   - Paciente y alcance temporal implícito de los datos analizados.
2) RESUMEN CLÍNICO EJECUTIVO
   - 3 a 5 oraciones con la síntesis del estado general y la tendencia del período.
3) ESTADO GENERAL, ÁNIMO Y APETITO
   - Energía, humor, apetito e hidratación según lo registrado; tendencias y excepciones.
4) FUNCIONES FISIOLÓGICAS
   - Orina (pis), heces (caca), vómitos u otros signos digestivos/urinarios.
   - Destacá patrones (ej: caca blanda intermitente, retención, normalidad sostenida).
5) SIGNOS, SÍNTOMAS Y EVOLUCIÓN PATOLÓGICA
   - Enfermedades, síntomas o hallazgos anómalos del período, con cronología cuando sea posible.
6) ESTUDIOS DE LABORATORIO E INTEGRACIÓN CLÍNICA
   - Incluí esta sección SOLO si hay laboratorios.
   - Resumí hallazgos relevantes y correlacionalos con la clínica diaria (concordancia o discordancia).
   - Si no hay laboratorios, omití la sección por completo.
7) MEDICACIÓN Y ADHERENCIA
   - Incluí SOLO si hay evidencia de medicación en los datos.
   - Qué se administró/indicó y si la evolución sugiere buena respuesta o persistencia de signos.
   - Si no amerita, omití la sección.
8) IMPRESIÓN CLÍNICA Y CIERRE
   - Impresión profesional basada SOLO en evidencia disponible.
   - Mencionar limitaciones si los datos son escasos o inconsistentes.
   - Recomendaciones SOLO si se desprenden de forma directa y prudente de los datos (sin inventar tratamientos).

REGLAS DE ORO (INQUEBRANTABLES)
1. Basate ÚNICAMENTE en reportes, eventos y laboratorios provistos. PROHIBIDO inventar diagnósticos, valores de lab, fechas, dosis o síntomas no registrados.
2. Distinguí hechos observados de interpretaciones: primero el dato, después la lectura clínica prudente.
3. No dramatices ni minimices: lenguaje clínico sobrio. Evitá alarmismo teatral y también el optimismo vacío.
4. Si un eje no tiene datos (ej. no hay mención de vómitos), no asumas normalidad absoluta: indicá ausencia de registros sobre ese eje cuando sea relevante.
5. Cuando haya laboratorios, correlacionalos con la clínica; no copies el PDF entero: sintetizá lo clínicamente útil.
6. Si hay contradicciones entre días, explicitá la variación (no promedies inventando un estado único).
7. Español rioplatense (Argentina). Prohibido inglés. Prohibido Markdown.
8. No uses emojis. No uses listas con viñetas decorativas: podés usar guiones simples si mejora la lectura clínica.
9. No firmes con nombre inventado ni inventes matrícula/colegio profesional.
10. Preferí precisión temporal ("al inicio del período", "en los últimos registros") antes que vaguedades.
11. Si la evidencia es insuficiente para una conclusión fuerte, decilo: "con los datos disponibles no es posible concluir…"
12. Nunca contradigas un valor de laboratorio o un reporte explícito.

CALIDAD ESPERADA
- Densidad clínica alta, relleno cero.
- Debe servir como exportable formal (PDF de historia clínica).
- Un tutor informado y un veterinario externo deben poder usarlo como resumen serio del período.
"""

        user_prompt = f"""Redactá la historia clínica del paciente "{animal_name}".

REPORTES DIARIOS Y EVENTOS DEL PERÍODO
{context_text}

ESTUDIOS DE LABORATORIO (texto extraído; puede estar incompleto o ruidoso)
{lab_block}

Generá ahora el documento completo con la estructura obligatoria, en español, texto plano.
"""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        try:
            return NLPService._call_llm(
                messages, json_format=False, temperature=0.2, purpose="historia_clinica"
            )
        except Exception as e:
            print(f"Error generando historia clínica: {e}")
            return (
                f"HISTORIA CLINICA: {animal_name}\n\n"
                "Ocurrió un error al generar el resumen con IA. Por favor, intente de nuevo."
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

Responde a la pregunta del usuario basándote ÚNICAMENTE en el historial anterior.
Sé breve, amable y directo. Respondé siempre en español. Si no sabes la respuesta o no está en el historial, dilo amablemente.
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

CONTEXTO
Trabajás en una guardería de animales que registra y controla el estado de cada mascota mientras está a cargo:
- Ingreso y egreso de estadías.
- Rutina fisiológica diaria (comida, agua, pis, caca).
- Convivencia y sociabilidad con otros animales y personas.
- Administración de medicación cuando el tutor o la ficha lo indican.
- Observaciones de ánimo, energía, juego, estrés o incidentes.
El reporte que redactás es el documento que se entrega al tutor sobre CÓMO estuvo la mascota en esta estadía (desde el último ingreso hasta ahora).

OBJETIVO
Redactar un REPORTE DE ESTADÍA claro, cálido-profesional y útil para el tutor de "{animal_name}", cubriendo EXCLUSIVAMENTE el período {period_start} → {period_end}.

ESTRUCTURA OBLIGATORIA (texto plano, sin Markdown, sin asteriscos, sin numerales de título con #)
Usá exactamente estos encabezados en mayúsculas, en este orden:

1) ENCABEZADO DE ESTADÍA
   - Nombre de la mascota, período (desde / hasta) y estado de la reserva si se conoce.
2) ALIMENTACIÓN Y AGUA
   - Cómo comió (todo / poco / nada / irregular) y cómo tomó agua, con tendencia del período.
3) HIGIENE FISIOLÓGICA (PIS Y CACA)
   - Pis: frecuencia/normalidad según lo registrado.
   - Caca: consistencia y hallazgos (normal, blanda, no hizo, etc.) sin dramatizar.
4) CONVIVENCIA Y SOCIALIZACIÓN
   - Cómo se llevó con otros animales y con el entorno (juego, tolerancia, aislamiento, incidentes).
   - Si no hay datos explícitos de convivencia, decilo: "No se registraron observaciones de convivencia en este período."
5) MEDICACIÓN (SOLO SI AMERITA)
   - Incluí esta sección SOLO si hay medicación activa en ficha O eventos/transcripciones de medicación en el período.
   - Si no amerita, omití la sección por completo (no escribas "N/A").
6) OBSERVACIONES RELEVANTES
   - Ánimo, energía, sueño, vómitos, incidentes u otras notas útiles del período.
7) CIERRE PARA EL TUTOR
   - 2 a 4 oraciones de síntesis humana y tranquilizadora (sin inventar elogios vacíos ni alarmas).

REGLAS DE ORO (INQUEBRANTABLES)
1. Basate ÚNICAMENTE en los datos provistos (eventos, transcripciones, medicación, observaciones, ficha). PROHIBIDO inventar, asumir o rellenar huecos.
2. Si un eje (comida/pis/caca/convivencia) no tiene datos, escribí explícitamente que no hay registros en el período; no completes con "normal" inventado.
3. Priorizá hechos concretos y tendencias (ej: "los primeros días comió poco; luego recuperó el apetito") sobre adjetivos vagos.
4. Tono: español rioplatense (Argentina), profesional, cercano, sobrio. Sin dramatizar. Sin diagnósticos médicos. Sin recomendaciones veterinarias salvo que el dato lo diga explícitamente.
5. No uses inglés. No uses Markdown. No inventes fechas fuera del período.
6. Si la medicación no aplica, NO menciones medicación en ninguna sección.
7. Diferenciá claramente lo observado en guardería de lo que solo figura en la ficha de ingreso (la ficha es contexto; los reportes/eventos son evidencia de la estadía).
8. Si hay señales de alerta leves (caca blanda, poco apetito un día), describilas con calma. Si hay señales graves explícitas (sangre, vómito reiterado), reportalas con claridad sin alarmismo teatral.
9. El reporte debe poder leerse completo en menos de 2 minutos: concreto, ordenado, sin relleno.
10. Nunca contradigas los datos: si un día dice "no comió" y otro "comió todo", reflejá la variación.

CALIDAD
- Preferí verbos de observación: "se registró", "según los reportes", "en la mayoría de los días".
- Evitá frases vacías tipo "tuvo una estadía maravillosa" si no hay evidencia.
- El tutor debe terminar sabiendo: ¿comió? ¿hizo pis/caca? ¿cómo convivió? ¿tomó su medicación (si aplica)?
"""

        user_prompt = f"""Generá el reporte de estadía de "{animal_name}".

METADATOS DE ESTADÍA
- Período: {period_start} → {period_end}
- Estado de reserva/ingreso: {reservation_status}

FICHA / CONTEXTO DE INGRESO (solo contexto, no evidencia diaria)
{profile_text}

MEDICACIÓN EN FICHA
{medications_text}

EVENTOS ESTRUCTURADOS DEL PERÍODO (comida, agua, pis, caca, medicación, etc.)
{events_text}

TRANSCRIPCIONES DE REPORTES DIARIOS DEL PERÍODO
{transcripts_text}

OBSERVACIONES ADICIONALES DEL PERÍODO
{observations_text}

Redactá ahora el reporte completo en español, con la estructura obligatoria.
"""
        try:
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ]
            return NLPService._call_llm(
                messages, json_format=False, temperature=0.25, purpose="reporte_estadia"
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

TONO (obligatorio):
- Neutro, sobrio, sin dramatizar.
- Sin alarmismo, sin urgencia inventada, sin lenguaje emocional.
- Evitá palabras como: "preocupante", "alarmante", "crítico", "grave", "urgente", "peligro", "riesgo alto", "debe atenderse de inmediato".
- Si algo es anómalo, describilo con calma (ej: "se registró caca blanda") sin magnificarlo.

CONTENIDO:
1. Un solo párrafo corto (3 a 5 oraciones) en español.
2. Decí solo lo que aparece en el historial: rutina (comida/agua/pis/caca) y hallazgos explícitos.
3. Compará reportes solo si hay datos suficientes; si no, decí que hay poca información para comparar.
4. No inventes causas, diagnósticos, tratamientos ni pronósticos.
5. No recomiendes visitas al vet ni medidas urgentes salvo que el historial lo diga explícitamente.
6. Si todo está normal, decilo de forma simple: sin adornos.

REGLAS:
- Basate ÚNICAMENTE en el historial dado.
- No asumas ni completes huecos.
- Preferí "sin cambios relevantes" antes que forzar una evolución.
"""
        try:
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Historial de {animal_name}:\n{history_context}\n\nRedactá un resumen neutro y breve EN ESPAÑOL."}
            ]
            return NLPService._call_llm(
                messages, json_format=False, temperature=0.1, purpose="evolucion"
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
Lee los siguientes reportes de la ÚLTIMA SEMANA y genera el "Clima" del tablero.
Sé breve: el análisis debe ser rápido y concreto.

Reglas estrictas:
1. TODO el contenido (clima y alertas) debe estar EN ESPAÑOL de Argentina. Prohibido inglés.
2. Redactá un párrafo corto (3-5 oraciones) resumiendo el estado de la guardería. Usá emojis de clima (☀️, ⛅, ⛈️).
3. Extraé alertas reales SOLO si hay síntomas que requieran atención (no exageres: si un animal no hizo caca un día no es crítico; si vomitó sangre sí).
4. Cada alerta.message debe ser una frase corta en español, clara para el cuidador.
5. Priorizá lo más reciente de la semana; no inventes datos.
6. Respondé ÚNICAMENTE en formato JSON válido, sin texto adicional, con esta estructura:
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

Reportes de la última semana:
{reports_text}
"""
        messages = [
            {"role": "system", "content": "Sos un asistente JSON veterinario. No alucinás. Todo el texto visible va en español."},
            {"role": "user", "content": prompt}
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
