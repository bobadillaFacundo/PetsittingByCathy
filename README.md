# Petsitting by Cathy - Sistema Integral de Guardería Canina

Bienvenido al repositorio principal del sistema **Petsitting by Cathy**, una plataforma Full-Stack impulsada por Inteligencia Artificial (FastAPI + React) diseñada para gestionar y normalizar el historial clínico de mascotas en una guardería canina.

## 🌟 Características Principales

1. **🎙️ Motor NLP y Reconocimiento de Voz:**
   Los cuidadores no necesitan escribir. Graban un audio ("Kira comió la mitad pero vomitó agua") y el sistema transcribe, limpia, extrae las entidades (Síntomas, Comida, etc.) y las normaliza en la base de datos automáticamente.
   > 📄 *Ver detalles técnicos en:* [README_NLP.md](./README_NLP.md)

2. **📱 Aplicación Web Progresiva (PWA):**
   El frontend está diseñado para instalarse directamente en los teléfonos de los cuidadores (Android/iOS) sin pasar por las tiendas de aplicaciones, comportándose como una App nativa.
   > 📄 *Ver guía de instalación en:* [README_PWA.md](./README_PWA.md)

3. **📊 Dashboard de Inteligencia de Negocios (BI) & Auditoría:**
   - **El Clima de la Guardería:** Una Inteligencia Artificial lee todos los reportes de las últimas 48 horas y genera un informe global sintetizado, alertando sobre anomalías o brotes de síntomas en la manada.
   - **Gráficos Interactivos en Tiempo Real:** Gráficos de barras y pastel que permiten hacer clics para cruzar datos y filtrar información al instante.
   - **Feed de Auditoría por Día:** Historial completo del día a día, agrupado automáticamente con separadores visuales y filtros de fecha precisos.

4. **🗄️ Esquema Relacional de Alta Complejidad:**
   Estructura normalizada para historiales médicos, desparasitaciones, libretas sanitarias y reportes diarios.
   > 📄 *Ver diagrama Entidad-Relación en:* [README_BDD.md](./README_BDD.md)

## 🛠️ Tecnologías Utilizadas
- **Frontend:** React, Vite, TailwindCSS, Recharts, Lucide-React.
- **Backend:** FastAPI (Python), SQLite/PostgreSQL, SQLAlchemy.
- **Inteligencia Artificial:** Whisper (Transcripción offline), vLLM + Qwen 2.5 1.5B Instruct (Razonamiento Semántico y Extracción JSON).

---
*Desarrollado para facilitar el día a día de cuidadores y proveer control total a los administradores.*
