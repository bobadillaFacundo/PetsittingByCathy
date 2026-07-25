# Referencia API REST

Base URL producción: `https://petsittingbycathy.onrender.com`  
Desarrollo: `http://localhost:8000`

Prefijos de routers (sin `/api` en el backend; el frontend usa proxy `/api` → backend):

| Router | Prefijo |
|--------|---------|
| Auth | `/auth` |
| Users | `/users` |
| Animals | `/animals` |
| Reports | `/reports` |
| Dashboard | `/dashboard` |
| Catalogs | `/catalogs` |
| Reservations | `/reservations` |
| Calendar | `/calendar` |
| Chat | `/chat` |

**Autenticación:** casi todos los endpoints requieren `Authorization: Bearer <JWT>`, excepto `POST /auth/login`.

---

## Auth y usuarios

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/auth/login` | Login (form: username, password) → JWT |
| `GET` | `/auth/me` | Usuario actual |
| `GET` | `/users/` | Listar usuarios (admin) |
| `POST` | `/users/` | Crear usuario (admin) |
| `PUT` | `/users/{id}/password` | Cambiar contraseña |
| `PUT` | `/users/{id}/toggle_status` | Activar / desactivar |

---

## Reportes e IA

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/reports/analyze-voice` | Audio → transcripción + NLP |
| `POST` | `/reports/analyze-text` | NLP sin audio |
| `POST` | `/reports/confirm` | Guardar reporte confirmado |
| `POST` | `/reports/analyze-and-confirm-batch` | Sync offline (lote) |
| `PUT` | `/reports/{id}/edit` | Editar transcripción, recalcular NLP |
| `POST` | `/reports/{id}/attach-photo` | Adjuntar foto al reporte |
| `GET` | `/reports/all` | Feed auditoría (`?limit=100`) |
| `GET` | `/reports/export-pdf/{animal_id}` | PDF clínico IA (`?range=1month\|3months\|6months\|9months\|1year`) |

---

## Animales

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/animals/` | Listar (`?is_daycare=true\|false`, `include_inactive`) |
| `POST` | `/animals/` | Crear |
| `GET` | `/animals/{id}` | Detalle |
| `PUT` | `/animals/{id}` | Actualizar |
| `DELETE` | `/animals/{id}` | Borrar (soft) |
| `GET` | `/animals/{id}/history` | Historial clínico |
| `GET` | `/animals/{id}/evolution-analysis` | Análisis IA neutro |
| `GET` | `/animals/species` | Especies |
| `GET` | `/animals/breeds` | Razas (`?species_id=`) |

### Medicación

| Método | Ruta |
|--------|------|
| `GET/POST` | `/animals/{id}/medications` |
| `PUT/DELETE` | `/animals/{id}/medications/{medication_id}` |

### Libreta sanitaria (vacunas)

| Método | Ruta | Notas |
|--------|------|-------|
| `GET` | `/animals/{id}/health_record` | Libreta |
| `GET/POST` | `/animals/{id}/vaccines` | CRUD vacunas |
| `POST` | `/animals/{id}/vaccines/scan` | Escaneo IA (multipart `file`) |
| `POST` | `/animals/{id}/vaccines/bulk` | Lote JSON |
| `POST` | `/animals/{id}/vaccines/bulk-with-document` | Lote + archivo |
| `POST` | `/animals/{id}/vaccines/with-document` | Una vacuna + archivo |
| `DELETE` | `/animals/{id}/vaccines/{vaccine_id}` | Borra + Storage |

Ver [VACUNAS_ESCANEO.md](./VACUNAS_ESCANEO.md).

### Desparasitaciones

| Método | Ruta |
|--------|------|
| `GET/POST` | `/animals/{id}/internal_dewormings` |
| `DELETE` | `/animals/{id}/internal_dewormings/{id}` |
| `GET/POST` | `/animals/{id}/external_dewormings` |
| `DELETE` | `/animals/{id}/external_dewormings/{id}` |

### Laboratorios y observaciones

| Método | Ruta |
|--------|------|
| `GET/POST` | `/animals/{id}/lab_results` |
| `POST` | `/animals/{id}/lab_results/upload` |
| `DELETE` | `/animals/{id}/lab_results/{id}` |
| `GET/POST` | `/animals/{id}/observations` |
| `POST` | `/animals/{id}/observations/{id}/media` |
| `DELETE` | `/animals/{id}/observations/{id}` |

### Catálogos (vía animals)

| Método | Ruta |
|--------|------|
| `GET` | `/animals/catalogs/laboratories` |
| `GET` | `/animals/catalogs/products` |
| `GET` | `/animals/catalogs/vaccines` |
| `GET` | `/animals/veterinarians` |

---

## Dashboard

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/dashboard/` | Tablero + alertas críticas |
| `GET` | `/dashboard/weather` | Clima IA (48 h) |
| `PATCH` | `/dashboard/critical-alerts/{id}/resolve` | Resolver alerta |
| `GET` | `/dashboard/dictionary` | Diccionario IA |

---

## Catálogos admin (`/catalogs`)

CRUD para: `species`, `breeds`, `laboratories`, `vaccines`, `products`, `veterinarians`, `tagsets`

| Método | Ruta |
|--------|------|
| `GET/PUT` | `/catalogs/color-rules` |

---

## Reservas y calendario

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET/POST/PUT/DELETE` | `/reservations/` | CRUD reservas |
| `GET` | `/calendar/` | Eventos agrupados para calendario |

Reglas `is_daycare`: ver [ARQUITECTURA.md](./ARQUITECTURA.md).

---

## Chat

| Método | Ruta |
|--------|------|
| `POST` | `/chat/` | Q&A NLP (disponible) |

---

## Archivos estáticos

| Ruta | Contenido |
|------|-----------|
| `/uploads/photos/` | Fotos de reportes (dev) |
| `/uploads/labs/` | PDFs laboratorio (dev) |

En producción las URLs apuntan a Supabase Storage.

---

## Códigos de error habituales

| Código | Significado |
|--------|-------------|
| 401 | Token inválido o expirado |
| 403 | Sin permisos (rol) |
| 422 | Validación Pydantic (detalle en `detail[]`) |
| 400 | Regla de negocio (mensaje en `detail` string) |
| 502 | Servicio externo (Groq, etc.) |

---

## Documentación relacionada

- [ARQUITECTURA.md](./ARQUITECTURA.md)
- [README_NLP.md](../README_NLP.md)
