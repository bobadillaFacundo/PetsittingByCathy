# Petsitting by Cathy - Progressive Web App (PWA)

Guía de la aplicación web progresiva: instalación en móviles, modo offline, cámara y fotos en reportes.

## ¿Qué es una PWA?

Una PWA permite instalar la web como app nativa:
- Ícono en la pantalla de inicio junto a otras apps
- Pantalla completa (sin barra del navegador)
- Sin pasar por App Store ni Google Play

---

## Componentes Técnicos

### 1. Vite PWA Plugin (`vite.config.js`)
- Genera el **Web App Manifest** (nombre, colores, íconos)
- Registra un **Service Worker** para caché de recursos estáticos

### 2. Recursos Gráficos (`frontend/public/`)
- **`logo.png`**: ícono maestro de la app. Reemplazarlo y reiniciar `npm run dev` para regenerar íconos PWA

### 3. Cartel de Instalación (`InstallPrompt.jsx`)

| Plataforma | Comportamiento |
|------------|----------------|
| **Android** (Chrome/Edge) | Botón "Instalar Ahora" vía evento `beforeinstallprompt` |
| **iOS** (Safari) | Instrucciones: Compartir → "Agregar a Inicio" (Apple no permite instalación por botón) |

---

## Modo Offline (Reportes de Voz)

Si no hay conexión al enviar un audio:

1. El reporte se guarda en **IndexedDB** (`idb-keyval`, clave `offline_report_*`)
2. Aparece un aviso amarillo en `VoiceRecorder` con contador de pendientes
3. Al recuperar red: botón **Sincronizar Ahora** → `POST /reports/analyze-and-confirm-batch`

> Las fotos adjuntas en modo offline **no** se guardan localmente todavía; conviene sincronizar con conexión activa.

---

## Cámara y Fotos en Reportes

Debajo del botón de grabación:

- **Tomar o subir foto** abre la cámara trasera en móvil (`capture="environment"`) o el selector de archivos en desktop
- Vista previa con opción de eliminar antes de confirmar
- Al guardar el reporte, las fotos se suben a `/reports/{id}/attach-photo`
- Se almacenan en `backend/uploads/photos/` y quedan en el historial clínico del paciente

Casos de uso: heridas, aspecto de comida, deposiciones, comportamiento visible.

---

## Probar en el Celular (Desarrollo Local)

1. Obtener la IP local del PC (ej. `192.168.1.5`)
2. En el celular: `http://192.168.1.5:5173`
3. Asegurarse de que backend (`:8000`) también sea accesible en la red local

---

## Producción

- **HTTPS obligatorio** para PWA instalable (excepto `localhost`)
- Subir frontend (Vercel, Netlify…) y backend (Render, Railway…) con certificado SSL
- Configurar proxy o CORS para que `/api` apunte al backend en producción

---

## Archivos Relacionados

| Archivo | Función |
|---------|---------|
| `frontend/vite.config.js` | Config PWA y proxy API |
| `frontend/src/components/InstallPrompt.jsx` | UI de instalación |
| `frontend/src/components/VoiceRecorder.jsx` | Grabación, offline, fotos |
| `README_NLP.md` | Pipeline de voz e IA |
