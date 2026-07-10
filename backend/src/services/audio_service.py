import shutil
import os
import requests
import json
from fastapi import UploadFile
from typing import Dict, Any

try:
    from faster_whisper import WhisperModel
    # Usar el modelo medium a pedido del usuario (buen balance entre velocidad y precisión)
    whisper_model = WhisperModel("medium", device="cpu", compute_type="int8")
except ImportError:
    whisper_model = None
    print("ADVERTENCIA: faster-whisper no está instalado. Ejecute 'pip install faster-whisper'.")

UPLOAD_DIR = "uploads/audios"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Configuración de Modelos
# Postproceso NLP: siempre el vLLM del servidor (Qwen 7B), no el modelo chico local.
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
USE_GROQ = os.getenv("USE_GROQ", "").strip().lower() in ("1", "true", "yes")

GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

# Servidor vLLM (Tailscale). Override con VLLM_BASE_URL / VLLM_MODEL si hace falta.
_VLLM_BASE = os.getenv("VLLM_BASE_URL", "http://100.82.178.56:8010/v1").rstrip("/")
VLLM_MODEL = os.getenv("VLLM_MODEL", "Qwen/Qwen2.5-7B-Instruct-AWQ")
VLLM_URL = f"{_VLLM_BASE}/chat/completions"

print(f"[IA] Postproceso NLP -> {VLLM_URL} (modelo={VLLM_MODEL})")
if USE_GROQ and GROQ_API_KEY:
    print("[IA] USE_GROQ=1: se usara Groq en lugar del vLLM del servidor")


class AudioService:
    @staticmethod
    async def save_audio(file: UploadFile) -> str:
        file_path = os.path.join(UPLOAD_DIR, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return file_path

    @staticmethod
    def transcribe_audio(file_path: str) -> str:
        if whisper_model:
            # Transcripción real usando Whisper Local con VAD (Voice Activity Detection)
            # Ajustado para ser menos sensible al ruido de fondo y priorizar la voz principal
            segments, info = whisper_model.transcribe(
                file_path, 
                beam_size=5, 
                vad_filter=True,
                vad_parameters=dict(threshold=0.7), # 0.7 exige que la voz sea más clara/fuerte para ser grabada
                no_speech_threshold=0.4, # Si la probabilidad de silencio/ruido pasa el 40%, ignora el audio
                condition_on_previous_text=False, # Reduce alucinaciones basadas en frases anteriores
                temperature=0.0 # Evita la creatividad del modelo (no intenta buscarle sentido al ruido)
            )
            transcript = " ".join([segment.text for segment in segments]).strip()
            
            # Filtro secundario de seguridad para alucinaciones comunes muy cortas
            lower_t = transcript.lower()
            hallucinations = ["thanks for watching", "thank you for watching", "subscribe", "subscríbete", "suscríbete"]
            if any(h in lower_t for h in hallucinations) and len(transcript) < 40:
                return "Silencio o ruido de fondo (no se detectó voz real)."
                
            return transcript if transcript else "Silencio o ruido de fondo (no se detectó voz real)."
        else:
            return "Theo comió, tomó agua, hizo pis, no hizo caca. Cleopatra tomó poca agua y tuvo caca blanda."


class NLPService:
    @staticmethod
    def _call_llm(messages: list, json_format: bool = False, temperature: float = None) -> str:
        """Llama al LLM del servidor (vLLM). Solo usa Groq si USE_GROQ=1."""
        is_groq = USE_GROQ and bool(GROQ_API_KEY)

        headers = {
            "Content-Type": "application/json"
        }
        if is_groq:
            headers["Authorization"] = f"Bearer {GROQ_API_KEY}"

        if temperature is None:
            temperature = 0.05 if json_format else 0.7

        payload = {
            "model": GROQ_MODEL if is_groq else VLLM_MODEL,
            "messages": messages,
            "temperature": temperature
        }

        if json_format:
            payload["response_format"] = {"type": "json_object"}

        url = GROQ_URL if is_groq else VLLM_URL

        response = requests.post(url, headers=headers, json=payload, timeout=90)
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]

    @staticmethod
    def generate_clinical_history(animal_name: str, reports_data: list, lab_results_data: list = None) -> str:
        """Genera un resumen clínico detallado basado en reportes y laboratorios usando el LLM."""
        context_text = "\n".join(reports_data)
        lab_text = ""
        if lab_results_data:
            lab_text = "\nTambién se proporcionan resultados de estudios de laboratorio (texto extraído de PDFs adjuntos):\n" + "\n".join(lab_results_data)
            
        prompt = f"""
Eres un veterinario jefe redactando una Historia Clínica formal para el paciente '{animal_name}'.
A continuación, se te proporcionan todos los reportes diarios y eventos del paciente en el período solicitado.{lab_text}

Tu tarea es analizar esta información y redactar un resumen clínico profesional, organizado y fácil de leer.
Si hay laboratorios, asegúrate de correlacionar la evolución clínica de los reportes con los resultados numéricos o diagnósticos del laboratorio.

Debes incluir (si hay información disponible):
- Evolución general del estado de ánimo y apetito.
- Resumen de signos vitales o eventos fisiológicos (orina, heces, vómitos).
- Evolución de enfermedades o síntomas registrados.
- Hallazgos relevantes de los estudios de laboratorio (si se proveen).
- Adherencia a medicación (si aplica).
- Conclusión veterinaria.

Usa texto plano con sangrías y saltos de línea claros. NO uses símbolos de Markdown (como asteriscos, negritas o numerales).

Reportes del período:
{context_text}
"""
        messages = [
            {"role": "system", "content": "Eres un asistente de redacción médica veterinaria avanzado."},
            {"role": "user", "content": prompt}
        ]
        
        try:
            return NLPService._call_llm(messages, json_format=False)
        except Exception as e:
            print(f"Error generando historia clínica: {e}")
            return f"## Historia Clínica: {animal_name}\n\n*Ocurrió un error al generar el resumen con IA. Por favor, intente de nuevo.*"

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
   - "value": El valor, cantidad, estado o descripción. MUY IMPORTANTE: Si es negativo (ej. "no hizo caca"), el valor debe ser "no" o "nada". Si es positivo, pon el estado (ej: "todo", "normal", "blanda", "sangre", "mitad").
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

REPORTE REAL A ANALIZAR: "{transcript}"
Responde ÚNICAMENTE con el objeto JSON. NO inventes eventos que no se mencionaron.
"""
        try:
            content = NLPService._call_llm([{"role": "user", "content": prompt}], json_format=True)
            
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
Sé breve, amable y directo. Si no sabes la respuesta o no está en el historial, dilo amablemente.
"""
        try:
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": query}
            ]
            return NLPService._call_llm(messages, json_format=False)
        except Exception as e:
            print(f"Error con LLM (chat): {e}")
            return "Ocurrió un error al contactar al modelo de IA. Revisa los logs o tu conexión."

    @staticmethod
    def analyze_animal_evolution(animal_name: str, history_context: str) -> str:
        system_prompt = f"""
Sos un asistente que resume de forma NEUTRA y FACTUAL el historial de "{animal_name}" en una guardería canina.
No sos un diagnóstico veterinario ni una alerta dramática.

TONO (obligatorio):
- Neutro, sobrio, sin dramatizar.
- Sin alarmismo, sin urgencia inventada, sin lenguaje emocional.
- Evitá palabras como: "preocupante", "alarmante", "crítico", "grave", "urgente", "peligro", "riesgo alto", "debe atenderse de inmediato".
- Si algo es anómalo, describilo con calma (ej: "se registró caca blanda") sin magnificarlo.

CONTENIDO:
1. Un solo párrafo corto (3 a 5 oraciones).
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
                {"role": "user", "content": f"Historial de {animal_name}:\n{history_context}\n\nRedactá un resumen neutro y breve."}
            ]
            return NLPService._call_llm(messages, json_format=False, temperature=0.1)
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
Lee los siguientes reportes de las últimas 24 horas y genera el "Clima de Hoy".

Reglas estrictas:
1. Redacta un párrafo general resumiendo el estado de la guardería (ej: "Día tranquilo, la mayoría comió bien, pero hay algunas alertas en observación"). Usa emojis de clima (☀️, ⛅, ⛈️).
2. Extrae alertas reales SOLO si hay síntomas que requieran atención (no exageres, si un animal no hizo caca un día no es crítico, pero si vomitó sangre sí).
3. Responde ÚNICAMENTE en formato JSON válido, sin texto adicional, con la siguiente estructura:
{{
  "weather": "Párrafo del clima aquí...",
  "alerts": [
    {{
      "animal_name": "Nombre",
      "message": "Mensaje corto de la alerta médica o de comportamiento",
      "severity": "medium" o "high"
    }}
  ]
}}

Reportes de las últimas 24 horas:
{reports_text}
"""
        payload = {
            "model": VLLM_MODEL,
            "messages": [
                {"role": "system", "content": "Eres un asistente JSON de uso veterinario que no alucina."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.0,
            "max_tokens": 800,
            "response_format": {"type": "json_object"}
        }

        try:
            response = requests.post(
                VLLM_URL,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            response.raise_for_status()
            ai_text = response.json()["choices"][0]["message"]["content"]
            return json.loads(ai_text)
        except Exception as e:
            print(f"Error generando clima: {e}")
            return {
                "weather": "No se pudo generar el clima por un error de conexión con la IA.",
                "alerts": []
            }
