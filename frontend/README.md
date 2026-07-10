# Frontend - Petsitting by Cathy

Aplicación React + Vite para cuidadores y administradores de la guardería.

## Stack

- React 19 + Vite 8
- TailwindCSS 4
- React Router 7
- Recharts (gráficos admin)
- idb-keyval (reportes offline)
- Lucide React (iconos)

## Estructura

```
src/
├── App.jsx                 # Rutas, layout principal, tabs
├── components/
│   ├── VoiceRecorder.jsx   # Reporte por voz + fotos + offline
│   └── InstallPrompt.jsx   # Instalación PWA
└── pages/
    ├── Dashboard.jsx       # Tablero, alertas críticas, clima IA
    ├── AnimalHistory.jsx   # Historial, edición, fotos
    ├── CalendarioPanel.jsx # Reservas
    └── admin/              # Panel administrativo
        ├── AdminDashboard.jsx
        ├── DiccionarioPanel.jsx
        ├── ColoresPanel.jsx
        ├── AuditoriaPanel.jsx
        └── ...
```

## Pantallas Principales

| Tab / Ruta | Componente | Función |
|------------|------------|---------|
| Tablero | `Dashboard.jsx` | Especies, animales, alertas críticas, clima |
| Nuevo Reporte | `VoiceRecorder.jsx` | Voz, fotos, wizard de confirmación |
| Calendario | `CalendarioPanel.jsx` | Reservas |
| `/admin` | `AdminDashboard.jsx` | Panel admin (solo rol `admin`) |
| `/admin` → Auditoría | `AuditoriaPanel.jsx` | Gráficos Recharts + feed de reportes |

## Gráficos (Admin)

Panel **Auditoría Reportes** — ver [README_GRAFICOS.md](../README_GRAFICOS.md):

| Gráfico | Tipo | Interacción |
|---------|------|-------------|
| Reportes por Mascota | Barras | Clic → filtra por paciente |
| Distribución de Síntomas | Donut | Clic → filtra por síntoma |

Ambos sincronizan filtros con el historial de auditoría debajo.

## Desarrollo

```powershell
npm install
npm run dev      # http://localhost:5173
npm run build    # Producción
```

El proxy en `vite.config.js` redirige `/api/*` → `http://localhost:8000`.

## Autenticación

- Login en `/login` → token JWT en `localStorage`
- Header en todas las peticiones: `Authorization: Bearer <token>`
- Rol en `localStorage.role` (`admin` | `user`)

## Funcionalidades Recientes

- **Fotos en reportes:** input cámara/archivo en `VoiceRecorder`
- **Alertas críticas:** banner rojo en `Dashboard`
- **Editar transcripciones:** botón en cada reporte de `AnimalHistory`

Ver documentación general en [../README.md](../README.md).
