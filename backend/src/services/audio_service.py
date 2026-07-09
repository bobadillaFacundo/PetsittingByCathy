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
VLLM_MODEL = "Qwen/Qwen2.5-1.5B-Instruct-AWQ"
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
        is_groq = bool(GROQ_API_KEY)
        
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
2. ESTRICTAMENTE PROHIBIDO agregar "Enfermedad" o "Medicacion" a menos que se diga explícitamente (ej: "está enfermo", "vomitó", "le di remedio"). Una revisión normal NO es enfermedad.
3. NO DUPLIQUES EVENTOS. Cada conjunto (ej. Comida, Pis, Enfermedad) debe aparecer MÁXIMO UNA VEZ por paciente.
4. Todo el reporte corresponde exclusivamente a "{animal_name}".
5. Para cada evento extraído, debes indicar:
   - "standard_set": El nombre exacto del conjunto (Debe coincidir con uno de los conjuntos conocidos).
   - "spoken_variant": El verbo o acción exacta que dijo el usuario (por ejemplo: "morfó", "garcó", "vomitó").
   - "value": El valor, cantidad, estado o descripción. MUY IMPORTANTE: Si es negativo (ej. "no hizo caca", "no comió"), el valor debe ser "no" o "nada". Si es positivo, pon el estado (ej: "todo", "normal", "blanda", "con sangre", "mitad"). Nunca dejes el valor vacío si hay contexto.

Conjuntos conocidos permitidos:
{tags_instructions}

EJEMPLO (solo formato, NO copiar los datos):
Reporte: "Luna morfó todo, tomó agua normal, no hizo caca y vomitó amarillo."
Respuesta:
{{
  "cleaned_text": "Luna morfó todo, tomó agua normal, no hizo caca y vomitó amarillo.",
  "data": [
    {{
      "animal": "{animal_name}",
      "inserts": [
        {{"standard_set": "Comida", "spoken_variant": "morfó", "value": "todo"}},
        {{"standard_set": "Agua", "spoken_variant": "tomó agua", "value": "normal"}},
        {{"standard_set": "Caca", "spoken_variant": "hizo caca", "value": "no"}},
        {{"standard_set": "Vomito", "spoken_variant": "vomitó", "value": "amarillo"}}
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
