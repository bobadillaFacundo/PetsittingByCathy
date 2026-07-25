# Petsitting by Cathy - Progressive Web App (PWA)

Guía de la aplicación web progresiva: instalación en móviles, modo offline, cámara, responsive iOS y acceso remoto.

> **Índice:** [docs/README.md](./docs/README.md) · [docs/FRONTEND.md](./docs/FRONTEND.md) · [docs/DESPLIEGUE.md](./docs/DESPLIEGUE.md)

## ¿Qué es una PWA?

Una PWA permite instalar la web como app nativa:
- Ícono en la pantalla de inicio
- Pantalla completa (sin barra del navegador)
- Sin pasar por App Store ni Google Play

---

## Componentes Técnicos

### 1. Vite PWA Plugin (`vite.config.js`)
- Genera el **Web App Manifest**
- Registra un **Service Worker**
- HTTPS local opcional: `VITE_DEV_HTTPS=1 npm run dev` (no hace falta con DevTunnel)

### 2. Recursos (`frontend/public/`)
- **`logo.png`**: ícono maestro. Reemplazarlo y reiniciar Vite para regenerar íconos PWA

### 3. Cartel de Instalación (`InstallPrompt.jsx`)

| Plataforma | Comportamiento |
|------------|----------------|
| **Android** (Chrome/Edge) | Botón "Instalar Ahora" vía `beforeinstallprompt` |
| **iOS** (Safari) | Instrucciones: Compartir → "Agregar a Inicio" |

---

## Modo Offline (Reportes de Voz)

1. Sin red → reporte en **IndexedDB** (`offline_report_*`)
2. Aviso amarillo con contador de pendientes
3. Con red → **Sincronizar Ahora** → `POST /reports/analyze-and-confirm-batch`

> Las fotos offline aún no se cachean; sincronizar con conexión.

---

## Cámara y Fotos

- `capture="environment"` en móvil
- Subida a `/reports/{id}/attach-photo` → `backend/uploads/photos/`

---

## Responsive e iOS

- `viewport-fit=cover` y safe-area (`pt-safe` / `pb-safe`)
- Altura con `100dvh`
- Inputs a **16px** (evita zoom automático en iOS)
- Nav/tabs scrolleables; modales tipo sheet
- Filtros de fecha en auditoría: texto **negro** (WebKit a veces los pinta grises)

### Modales Admin (mascota / especie / raza)

En teléfono, los modales se renderizan con **`createPortal(..., document.body)`** para escapar del `overflow` del panel admin (iOS no scrollea bien los `fixed` anidados). El overlay completo scrollea y los botones Guardar quedan al final del formulario.

---

## Probar en el Celular

### Opción A — DevTunnel (recomendado)

1. Ejecutar `PetsittingByCathy - START.bat`
2. Espera a que levanten `:8000` y `:5173`
3. Hostea el túnel `guarderia-canina.brs`
4. Abrir la URL pública del puerto **5173** (ej. `https://….brs.devtunnels.ms/`)

> El túnel debe apuntar a Vite en **5173**. Si Vite no está escuchando ahí, el cliente SSH falla.

### Opción B — Misma Wi‑Fi + HTTPS local

```powershell
cd frontend
$env:VITE_DEV_HTTPS=1; npm run dev
```

Abrir en el celular la URL `https://<IP-LAN>:5173` y aceptar el certificado.

### Opción C — Solo localhost

```powershell
npx vite --port 5173 --host 0.0.0.0 --strictPort
```

Útil en PC; en celular hace falta túnel o red local.

> Sin HTTPS (ni túnel HTTPS), Android **no** permite instalar la PWA (salvo `localhost`).

---

## Navegación App ↔ Admin

`AuthenticatedShell` en `App.jsx` mantiene casita y admin montados (hide/show) para evitar remount lento al cambiar de ruta. El botón Home del admin está disponible para todos los admins.

---

## Producción

- HTTPS obligatorio para PWA instalable
- Proxy o CORS para `/api` → backend

---

## Si no deja instalar en Android

1. URL con `https://`
2. Chrome (no navegador del fabricante)
3. Incógnito o borrar datos del sitio
4. Menú ⋮ → **Instalar app**
5. Reiniciar Vite tras cambios de PWA

---

## Archivos Relacionados

| Archivo | Función |
|---------|---------|
| `frontend/vite.config.js` | PWA, HTTPS opcional, proxy API |
| `frontend/src/index.css` | Safe-area, modal-overlay, date inputs |
| `frontend/src/components/InstallPrompt.jsx` | UI de instalación |
| `frontend/src/components/VoiceRecorder.jsx` | Grabación, offline, fotos |
| `frontend/src/pages/admin/MascotasCRUD.jsx` | Modal mascota (portal + scroll móvil) |
| `frontend/src/pages/admin/CatalogCRUD.jsx` | Modal catálogos (portal + scroll móvil) |
| `PetsittingByCathy - START.bat` | Backend + Frontend + DevTunnel |
| `README_NLP.md` | Pipeline de voz e IA |
