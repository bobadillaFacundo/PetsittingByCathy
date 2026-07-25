# Frontend — Petsitting by Cathy

Aplicación **React + Vite (PWA)** para cuidadores y administradores.

## Inicio rápido

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
npm run build
npm run test
```

Proxy dev: `/api/*` → `http://localhost:8000`

## Documentación completa

| Guía | Contenido |
|------|-----------|
| [docs/FRONTEND.md](../docs/FRONTEND.md) | Rutas, admin, componentes, stack |
| [README_PWA.md](../README_PWA.md) | Instalación móvil, offline, iOS |
| [README_GRAFICOS.md](../README_GRAFICOS.md) | Gráficos auditoría |
| [docs/VACUNAS_ESCANEO.md](../docs/VACUNAS_ESCANEO.md) | Escaneo libreta (LibretaTab) |
| [README.md](../README.md) | Visión general del proyecto |

## Panel admin — secciones

| Sección | Componente |
|---------|------------|
| Guardería Externa | `MascotasCRUD` (`daycareOnly=true`) |
| Internas | `MascotasCRUD` (`daycareOnly=false`) |
| Catálogos | `CatalogsPanel` |
| Exportar | `ExportacionPanel` |

Super-admin (`cathy`): Diccionario IA, Colores, Análisis, Auditoría, Usuarios.
