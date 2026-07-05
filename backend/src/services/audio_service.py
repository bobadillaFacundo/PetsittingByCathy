import shutil
import os
import requests
import json
from fastapi import UploadFile
from typing import Dict, Any

try:
    from faster_whisper import WhisperModel
    # Usar el modelo large-v3 a pedido del usuario (mucho más preciso, pero consumirá más RAM y CPU)
    whisper_model = WhisperModel("large-v3", device="cpu", compute_type="int8")
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
VLLM_URL = "http://localhost:8701/v1/chat/completions"


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
            # Transcripción real usando Whisper Local
            segments, info = whisper_model.transcribe(file_path, beam_size=5)
            transcript = " ".join([segment.text for segment in segments])
            return transcript.strip()
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
            "temperature": 0.1 if json_format else 0.7
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
Extrae la información del reporte veterinario para el paciente "{animal_name}" en formato JSON.
Reglas IMPORTANTES:
1. Ignora cualquier texto irrelevante, charla adicional o ruido en el reporte.
2. Todo el reporte corresponde exclusivamente a "{animal_name}". No busques datos para otros animales.
3. Clasifica los eventos encontrados en los 5 Conjuntos disponibles. Si el reporte menciona comida y también pis, extrae ambos por separado.
4. Para cada evento extraído, debes indicar:
   - "standard_set": El nombre exacto del conjunto al que pertenece.
   - "spoken_variant": La palabra o frase exacta que dijo el usuario (por ejemplo: "morfó", "garcó", "peste").
   - "value": El valor o descripción asociada (ej: "todo", "blanda", "infección de oído").

Conjuntos y sus Variantes Conocidas:
{tags_instructions}

EJEMPLO (solo formato, NO copiar los datos):
Reporte: "Hola, paso a contarte sobre Luna... Luunq morfó todo y... uhm... le agarró una peste. Listo, chau."
Respuesta:
{{
  "cleaned_text": "Luna morfó todo y le agarró una peste.",
  "data": [
    {{
      "animal": "{animal_name}",
      "inserts": [
        {{"standard_set": "Comida", "spoken_variant": "morfó", "value": "todo"}},
        {{"standard_set": "Enfermedad", "spoken_variant": "peste", "value": "una peste"}}
      ]
    }}
  ]
}}

REPORTE REAL A ANALIZAR: "{transcript}"
Responde ÚNICAMENTE con el objeto JSON.
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
