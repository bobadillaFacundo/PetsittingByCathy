# Frontend — React + Vite + PWA

Código en `frontend/`. Documentación de despliegue: [DESPLIEGUE.md](./DESPLIEGUE.md).

## Stack

| Tecnología | Versión | Uso |
|------------|---------|-----|
| React | 19 | UI |
| Vite | 6 | Build y dev server |
| Tailwind CSS | 4 | Estilos |
| React Router | 8 | Rutas (`react-router`) |
| Recharts | 3 | Gráficos admin |
| idb-keyval | 6 | Reportes offline |
| vite-plugin-pwa | 1 | Service worker, manifest |
| Lucide React | — | Iconos |
| Vitest | 4 | Tests |

## Estructura de carpetas

```
frontend/src/
├── App.jsx              # Rutas, AuthenticatedShell, tabs principales
├── main.jsx             # Entry + interceptor 401
├── index.css            # Tailwind, safe-area, modales
├── lib/
│   ├── api.js           # API_BASE, mediaUrl()
│   ├── auth.js          # Sesión JWT, redirect login
│   ├── datetimeAr.js    # Fechas Argentina
│   └── eventColors.js   # Colores calendario
├── components/
│   ├── VoiceRecorder.jsx
│   ├── InstallPrompt.jsx
│   └── SmartSearch.jsx
└── pages/
    ├── Dashboard.jsx
    ├── AnimalList.jsx
    ├── AnimalHistory.jsx
    ├── Login.jsx
    └── admin/
        ├── AdminDashboard.jsx
        ├── MascotasCRUD.jsx
        ├── LibretaTab.jsx
        ├── DesparasitacionesTab.jsx
        ├── LaboratoriosTab.jsx
        ├── MedicacionTab.jsx
        ├── ObservacionesTab.jsx
        ├── CalendarioPanel.jsx
        ├── CatalogsPanel.jsx
        ├── DiccionarioPanel.jsx
        ├── ColoresPanel.jsx
        ├── AnalisisPanel.jsx
        ├── AuditoriaPanel.jsx
        ├── ExportacionPanel.jsx
        └── UsuariosPanel.jsx
```

## Rutas principales

| Ruta | Componente | Rol |
|------|------------|-----|
| `/login` | `Login.jsx` | Público |
| `/` | `Dashboard` + tabs | Autenticado |
| `/admin` | `AdminDashboard` | `admin` |
| Historial animal | `AnimalHistory.jsx` | Autenticado |

`AuthenticatedShell` mantiene Dashboard y Admin montados (hide/show) para evitar remount lento.

## Tabs de la app (cuidador)

| Tab | Componente | Función |
|-----|------------|---------|
| Tablero | `Dashboard.jsx` | Casita, alertas, clima IA |
| Nuevo Reporte | `VoiceRecorder.jsx` | Voz, fotos, offline |
| Calendario | `CalendarioPanel.jsx` | Reservas y vet/baño |

## Panel admin (`/admin`)

| Sección | Componente | Quién |
|---------|------------|-------|
| Diccionario IA | `DiccionarioPanel` | Super-admin |
| Colores de Reporte | `ColoresPanel` | Super-admin |
| Análisis IA | `AnalisisPanel` | Super-admin |
| **Guardería Externa** | `MascotasCRUD` (`daycareOnly=true`) | Admin |
| **Internas** | `MascotasCRUD` (`daycareOnly=false`) | Admin |
| Gestión de Catálogos | `CatalogsPanel` | Admin |
| Exportar Historias | `ExportacionPanel` | Admin |
| Auditoría Reportes | `AuditoriaPanel` | Super-admin |
| Usuarios | `UsuariosPanel` | Super-admin |

Super-admin: `localStorage.username === 'cathy'`.

### Modal de mascota

- Pestañas: datos, medicación, libreta, desparasitaciones, laboratorios, observaciones
- Pestañas montadas con `hidden` (no se recargan al cambiar)
- Altura fija del modal (`index.css` + `MascotasCRUD.jsx`)
- `createPortal` a `document.body` para scroll en iOS

## Calendario

| Acción | Animales |
|--------|----------|
| Nueva Reserva / estadía | `is_daycare = false` (internas) |
| Vet / Baño | `is_daycare = true` (guardería externa) |

## Desarrollo

```bash
cd frontend
npm install
npm run dev          # :5173, proxy /api → :8000
npm run build        # dist/
npm run test         # vitest
npm run lint         # oxlint
```

HTTPS local (PWA en LAN):

```bash
VITE_DEV_HTTPS=1 npm run dev
```

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `VITE_API_BASE` | URL API (si no usa proxy) |
| `VITE_DEV_HTTPS` | `1` para certificado local |

Ver `frontend/.env.example`.

## PWA y móvil

- Instalación: [README_PWA.md](../README_PWA.md)
- Safe-area iOS, `100dvh`, inputs 16px
- Offline: reportes de voz en IndexedDB

## Gráficos

Solo en **Auditoría Reportes**: [README_GRAFICOS.md](../README_GRAFICOS.md).

## Tests frontend

```bash
npm run test
```

Archivos: `App.test.jsx`, `auth.test.js`.

## Documentación relacionada

- [VACUNAS_ESCANEO.md](./VACUNAS_ESCANEO.md)
- [API.md](./API.md)
