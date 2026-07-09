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

# Configuración de Modelos (Soporta Groq Cloud Free o vLLM Local)
GROQ_API_KEY = os.getenv("GROQ_API_KEY") # Define esto en tu entorno de producción (ej. Render)

# Groq es gratuito, veloz y tiene modelos LLaMA
GROQ_MODEL = "llama-3.1-8b-instant"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

# vLLM Local (OpenAI compatible en WSL)
VLLM_MODEL = "Qwen/Qwen2.5-7B-Instruct-AWQ"
VLLM_URL = "http://100.82.178.56:8010/v1/chat/completions"


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
    def _call_llm(messages: list, json_format: bool = False) -> str:
        """Llama al LLM (Groq si hay API Key, si no vLLM local)."""
        is_groq = False
        
        headers = {
            "Content-Type": "application/json"
        }
        if is_groq:
            headers["Authorization"] = f"Bearer {GROQ_API_KEY}"
            
        payload = {
            "model": GROQ_MODEL if is_groq else VLLM_MODEL,
            "messages": messages,
            "temperature": 0.05 if json_format else 0.7
        }
        
        # El formato JSON puede variar según si el modelo soporta response_format
        if json_format:
            payload["response_format"] = {"type": "json_object"}
            
        url = GROQ_URL if is_groq else VLLM_URL
            
        response = requests.post(url, headers=headers, json=payload, timeout=60)
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]

    @staticmethod
    def generate_clinical_history(animal_name: str, reports_data: list) -> str:
        """Genera un resumen clínico detallado basado en reportes usando el LLM."""
        context_text = "\n".join(reports_data)
        prompt = f"""
Eres un veterinario jefe redactando una Historia Clínica formal para el paciente '{animal_name}'.
A continuación, se te proporcionan todos los reportes diarios y eventos del paciente en el período solicitado.
Tu tarea es analizar esta información y redactar un resumen clínico profesional, organizado y fácil de leer.

Debes incluir (si hay información disponible):
- Evolución general del estado de ánimo y apetito.
- Resumen de signos vitales o eventos fisiológicos (orina, heces, vómitos).
- Evolución de enfermedades o síntomas registrados.
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
            tags_instructions += f"  Variantes conocidas: {tag.variants}\n"

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
Eres un veterinario experto analizando la evolución clínica de un paciente llamado "{animal_name}".
Se te proporcionará un historial reciente de eventos (reportes, comidas, síntomas, deposiciones, etc.).

Tu tarea es:
1. Resumir brevemente el estado actual del animal basándote en los últimos eventos.
2. Analizar su evolución (si mejoró, empeoró o se mantiene estable respecto a días o reportes previos).
3. Redactar tu respuesta en un solo párrafo claro, conciso y profesional.

REGLAS CRÍTICAS:
- BÁSATE ESTRICTAMENTE Y ÚNICAMENTE en la información proporcionada en el historial.
- NO ASUMAS, NO INFIERAS Y NO INVENTES síntomas, enfermedades, mejoras ni medicamentos que no estén escritos ahí.
- Si no hay suficientes datos para analizar una evolución, indícalo amablemente sin inventar nada.
"""
        try:
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Historial de {animal_name}:\n{history_context}"}
            ]
            return NLPService._call_llm(messages, json_format=False)
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
