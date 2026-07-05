# 📱 Petsitting by Cathy - Progressive Web App (PWA)

Este documento detalla cómo el sistema web de la guardería fue transformado en una Aplicación Web Progresiva (PWA). Esto permite que tú y tu equipo instalen el sistema directamente en sus teléfonos como si fuera una aplicación nativa, sin necesidad de publicarla en la App Store de Apple o en Google Play.

## 🚀 ¿Qué es una PWA y por qué la usamos?

Una PWA es una tecnología web avanzada que le permite a una página de internet comportarse exactamente como una app instalada en el celular.
Al instalarla:
- Se crea el ícono de **Petsitting by Cathy** junto al resto de tus aplicaciones (WhatsApp, Instagram, etc.).
- Se abre a **pantalla completa** (sin la molesta barra de búsqueda del navegador arriba ni los botones de navegación abajo).
- Evitas todos los costos, tiempos de espera y normativas estrictas de las tiendas oficiales de apps.

## ⚙️ ¿Cómo funciona por dentro?

### 1. El Motor: Vite PWA Plugin
En el frontend (React), utilizamos una herramienta llamada `vite-plugin-pwa` configurada en el archivo `vite.config.js`. Cuando ejecutas el proyecto, este plugin hace dos cosas clave:
- Construye un **Manifest** (un archivo JSON oculto que le dice al celular cómo se llama la app, qué color usar de fondo y cuáles son sus imágenes).
- Inyecta un **Service Worker**, un pequeño cerebro que corre en segundo plano para manejar los recursos instalados.

### 2. El Ícono y los Recursos Gráficos
Para que la aplicación se vea profesional en la pantalla del celular, se requieren imágenes fuente ubicadas en `frontend/public/`:
- **`logo.png`**: Este es el archivo maestro. El sistema lo toma para fabricar el ícono de la app. Si algún día quieres cambiar el logo, solo debes reemplazar este archivo por otro `.png` cuadrado y reiniciar el servidor.

### 3. El Cartel Inteligente de Instalación (`InstallPrompt.jsx`)
Las reglas para instalar PWAs son muy distintas entre Android y Apple. Para ofrecer una experiencia de usuario (UX) impecable, diseñamos un cartel inteligente que aparece en la parte inferior de la pantalla:

- **🤖 En Android (Chrome, Edge, etc.):** 
  El código intercepta un evento especial del navegador llamado `beforeinstallprompt`. Esto nos permite dibujar un botón azul enorme de **"Instalar Ahora"**. Cuando el usuario lo toca, el celular instala la app automáticamente.
  
- **🍎 En iPhone/iPad (iOS Safari):** 
  Apple es más restrictivo y **bloquea por completo** la instalación automática por botones. Si detectamos que el usuario está en un iPhone, el cartel muta y en lugar de darle un botón que no funcionará, le muestra una tarjeta didáctica: *"Toca el ícono de Compartir de Safari y elige 'Agregar a Inicio'"*.

## 🛠️ Cómo Probar y Mantenimiento

1. Si cambias el diseño de la app o reemplazas el `logo.png`, recuerda **reiniciar siempre la consola de React** (`npm run dev`) para que Vite reconstruya los archivos de la PWA.
2. Para probarlo tú mismo desde tu celular (mientras la app esté solo en tu computadora):
   - Averigua la IP local de tu PC (ej: `192.168.1.5`).
   - Abre el navegador de tu celular y entra a `http://192.168.1.5:5173`.
   - El celular creerá que estás en la página oficial y te mostrará el cartel de instalación.
   
> ⚠️ **Nota de Seguridad para Producción:** Las PWAs exigen estrictamente que la página web cuente con un certificado de seguridad **HTTPS**. Actualmente en tu computadora funciona porque `localhost` es una excepción segura. Cuando subas la aplicación a internet en el futuro (Vercel, Render, etc.), asegúrate de que el dominio comience con `https://` o los navegadores ocultarán la opción de instalar.
