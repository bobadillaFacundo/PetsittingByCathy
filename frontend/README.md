# Frontend - Petsitting by Cathy

Aplicación React + Vite (PWA) para cuidadores y administradores de la guardería.

## Stack

- React 19 + Vite 8
- TailwindCSS 4
- React Router 7
- Recharts (gráficos admin)
- idb-keyval (reportes offline)
- vite-plugin-pwa
- Lucide React (iconos)

## Estructura

```
src/
├── App.jsx                 # Rutas, AuthenticatedShell, tabs
├── components/
│   ├── VoiceRecorder.jsx   # Reporte por voz + fotos + offline
│   └── InstallPrompt.jsx   # Instalación PWA
└── pages/
    ├── Dashboard.jsx       # Casita, alertas críticas, clima IA
    ├── AnimalHistory.jsx   # Historial, edición, fotos
    ├── Login.jsx
    └── admin/
        ├── AdminDashboard.jsx
        ├── CalendarioPanel.jsx   # Tab Calendario (app principal)
        ├── MascotasCRUD.jsx      # Guardería / Externas + portal iOS
        ├── LibretaTab.jsx
        ├── DesparasitacionesTab.jsx
        ├── LaboratoriosTab.jsx
        ├── CatalogsPanel.jsx / CatalogCRUD.jsx
        ├── DiccionarioPanel.jsx
        ├── ColoresPanel.jsx
        ├── AnalisisPanel.jsx
        ├── AuditoriaPanel.jsx
        ├── ExportacionPanel.jsx
        └── UsuariosPanel.jsx
```

## Pantallas Principales (App)

| Tab / Ruta | Componente | Función |
|------------|------------|---------|
| Tablero | `Dashboard.jsx` | Mascotas de guardería, alertas, clima |
| Nuevo Reporte | `VoiceRecorder.jsx` | Voz, fotos, wizard, observación, offline |
| Calendario | `admin/CalendarioPanel.jsx` | Reservas estadía + vet/baño |
| `/admin` | `AdminDashboard.jsx` | Panel admin (rol `admin`) |
| Historial | `AnimalHistory.jsx` | Timeline, editar, fotos, PDF |

`AuthenticatedShell` mantiene casita y admin montados (hide/show) para no remount al cambiar de ruta.

## Panel Admin (`/admin`)

| Sección | Componente | Notas |
|---------|------------|-------|
| Diccionario IA | `DiccionarioPanel` | Solo super-admin (`cathy`) |
| Colores de Reporte | `ColoresPanel` | Solo super-admin |
| Análisis IA | `AnalisisPanel` | Solo super-admin |
| Mascotas Guardería | `MascotasCRUD` (`is_daycare`) | Perfil + Libreta / Labs / Desparasitaciones |
| Mascotas Externas | `MascotasCRUD` | Idem |
| Catálogos | `CatalogsPanel` | Especies, razas, labs, vacunas, productos, vets |
| Exportar Historias | `ExportacionPanel` | PDF vía `/reports/export-pdf/{id}` |
| Auditoría Reportes | `AuditoriaPanel` | Solo super-admin — ver [README_GRAFICOS.md](../README_GRAFICOS.md) |
| Usuarios | `UsuariosPanel` | Solo super-admin |

Modales de mascota/catálogo: `createPortal` a `document.body` para scroll en iOS.

### Perfil en `MascotasCRUD`
- Color del pelaje, edad o rango estimado (si **Rescate**), raza / **SÍMIL a**, características especiales (ciego, sordo, sin olfato, neurológico, mov. involuntarios).
- Listado e historial (`AnimalHistory`) muestran estos datos.

## Calendario

- **Nueva Reserva / estadía** → animales `is_daycare = false`
- **Vet / Baño** → animales `is_daycare = true`
- API: `CRUD /reservations/`

## Gráficos (Admin)

Panel **Auditoría Reportes** — ver [README_GRAFICOS.md](../README_GRAFICOS.md):

| Gráfico | Tipo | Interacción |
|---------|------|-------------|
| Reportes por Mascota | Barras | Clic → filtra por paciente |
| Distribución de Síntomas | Donut | Clic → filtra por síntoma |

Filtros extra: color (V/A/R) y rango de fechas.

## Desarrollo

```powershell
npm install
npx vite --port 5173 --host 0.0.0.0 --strictPort
# o con HTTPS local para PWA en LAN:
$env:VITE_DEV_HTTPS=1; npm run dev
npm run build
```

El proxy en `vite.config.js` redirige `/api/*` → `http://localhost:8000`.

Todo-en-uno (backend + frontend + DevTunnel): `PetsittingByCathy - START.bat` en la raíz del repo.

## Autenticación

- Login en `/login` → token JWT en `localStorage` (expira ~24 h en backend)
- Header: `Authorization: Bearer <token>`
- Rol en `localStorage.role` (`admin` | `user`)
- Super-admin UI: `localStorage.username === 'cathy'`
- Helpers en `src/lib/auth.js`: si el token venció o la API responde `401`, se limpia la sesión y se redirige a `/login` (evita pantalla blanca)

## Documentación Relacionada

- [../README.md](../README.md) — visión general y API
- [../README_PWA.md](../README_PWA.md) — instalación, offline, iOS
- [../README_NLP.md](../README_NLP.md) — pipeline de voz
- [../README_GRAFICOS.md](../README_GRAFICOS.md) — auditoría visual
