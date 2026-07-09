# Flujo de Procesamiento de Audio a Texto (NLP Pipeline)

Este documento detalla el funcionamiento del motor de Inteligencia Artificial de la Guardería Canina, explicando paso a paso cómo se transforma la voz de un usuario en registros de base de datos normalizados y cómo el sistema aprende nuevas palabras con el tiempo.

## Arquitectura a Nivel General

El proceso involucra 4 fases principales:
1. **Captura y Transcripción** (Voz a Texto crudo).
2. **Interpretación Semántica** (Texto crudo a JSON Estructurado).
3. **Auto-Aprendizaje** (Actualización de Diccionarios de Modismos).
4. **Validación e Inserción** (Frontend Step-by-Step a Base de Datos).

---

### Fase 1: Captura y Transcripción (Whisper)

Todo comienza en el **Frontend (React)**:
- El usuario selecciona la tarjeta de un paciente específico (ej. "Boby") para darle contexto a la IA.
- Mantiene presionado el botón de grabar. El audio se comprime en formato `.webm` y se envía al servidor mediante el endpoint `POST /reports/analyze-voice`.

En el **Backend (FastAPI)**, interviene `faster-whisper`:
- Se utiliza el modelo **`large-v3`** (ejecutándose en CPU por restricciones de memoria de GPU, priorizando exactitud sobre velocidad).
- Whisper convierte el audio a una cadena de texto (String). Al ser un proceso crudo, esta transcripción puede contener tartamudeos, errores de pronunciación o muletillas ("ehhh", "este...").

---

### Fase 2: Interpretación Semántica (Qwen 1.5B)

Aquí entra en juego el Modelo de Lenguaje (LLM) **Qwen 2.5 1.5B Instruct (AWQ)**, que se ejecuta en el servidor de **vLLM** dentro de WSL para aceleración por GPU.

1. **Construcción del Prompt:** 
   El servidor FastAPI extrae de la base de datos (Tabla `TagSet`) los 5 conjuntos de etiquetas permitidos:
   - `Comida`
   - `Agua`
   - `Pis`
   - `Caca`
   - `Enfermedad`
   
   También extrae las variantes conocidas para cada conjunto (ej. "morfó", "peste").

2. **Ejecución del LLM (Chain of Thought):**
   A Qwen se le ordena ignorar ruidos, saludos o charlas innecesarias. 
   Su salida JSON contiene dos cosas vitales:
   - `cleaned_text`: Una versión resumida y perfecta de lo que el usuario quiso decir, descartando tartamudeos.
   - `inserts`: Un arreglo de objetos clasificando cada síntoma. Por cada uno, extrae el conjunto (`standard_set`), la palabra exacta usada (`spoken_variant`) y el valor o severidad (`value`).

---

### Fase 3: Auto-Aprendizaje de Diccionarios (Backend)

Una vez que FastAPI recibe el JSON estructurado de Qwen, realiza un cruce con la tabla `TagSet`.

- **Auto-Incremento:** El sistema revisa la palabra que capturó Qwen (el `spoken_variant`, por ejemplo: "se atragantó").
- Si el usuario dice que "se atragantó" pertenece a "Comida", pero el sistema nunca antes había escuchado esa palabra, **la inserta automáticamente en la lista de variantes** de la base de datos.
- Gracias a esto, el vocabulario del sistema crece orgánicamente con el uso (modismos argentinos, lunfardo, etc.), volviendo al prompt de la IA más robusto para futuros análisis.

---

### Fase 4: Validación e Inserción (Frontend a DB)

El backend empaqueta los datos de Qwen, los transforma al formato *Legacy* (mapeando "Enfermedad" a `AnimalDiagnosis` y el resto a `ReportEvent`), y los envía de vuelta al Frontend.

1. **Asistente (Wizard):** El Frontend renderiza la interfaz paso a paso. Muestra la frase limpia (`cleaned_text`) para que el usuario pueda corregirla si lo desea, y dedica una pantalla ("Paso X") por cada síntoma detectado.
2. **Confirmación:** Al llegar al final de la lista de síntomas, el usuario presiona "Confirmar e Insertar".
3. **Guardado (Endpoint `/confirm`):** La estructura JSON final se envía de nuevo a FastAPI, el cual itera sobre cada `insert` y guarda físicamente la información en las tablas relacionales correctas (`Report`, `ReportEvent`, `AnimalDiagnosis`, `AnimalObservation`), normalizando de esta manera un audio desordenado en historiales clínicos perfectos.

---

### Fase 5: Analítica Predictiva y Resumen (El Clima de la Guardería)

Además del procesamiento individual de cada audio, la IA actúa como un supervisor analítico global:
- A través del botón **"Analizar Clima"** en el Panel de Auditoría, el sistema recupera todos los reportes de las **últimas 48 horas**.
- Se envían estos reportes a la IA bajo un **Prompt de Estricta Objetividad**, con la instrucción explícita de *"no ser creativo ni alarmar sin motivo"*.
- La IA cruza los datos y genera un resumen clínico neutral (ej. "Día rutinario, a excepción de Kira que presentó heces blandas"). 
- El sistema también emite `alerts` estructuradas para cualquier animal que haya requerido observación, las cuales se pintan de colores en el frontend según su severidad (Ambar para observación, Rojo para Crítico).
