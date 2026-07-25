# Gráficos e Inteligencia Visual — Panel de Auditoría

Los gráficos interactivos viven en el **Panel Admin → Auditoría Reportes** (`AuditoriaPanel.jsx`). Usan la librería [Recharts](https://recharts.org/) y se alimentan de `GET /api/reports/all`.

> **Índice:** [docs/README.md](./docs/README.md) · [docs/FRONTEND.md](./docs/FRONTEND.md)

## Ubicación en la App

```
/login (admin) → /admin → Auditoría Reportes
```

Solo visible para el super-admin (`username === 'cathy'`). Los cuidadores en el tablero principal (`Dashboard.jsx`) **no** ven gráficos; ven alertas, clima IA y fichas de pacientes.

---

## Vista General del Panel

```
┌─────────────────────────────────────────────────────────┐
│  El Clima de la Guardería (IA — texto, no gráfico)      │
├──────────────────────────┬──────────────────────────────┤
│  📊 Reportes por Mascota │  🥧 Distribución de Síntomas │
│     (Barras)             │     (Donut)                  │
├──────────────────────────┴──────────────────────────────┤
│  Filtros: Color (V/A/R) · Fechas · Mascota · Síntoma    │
│  Historial de Auditoría (tabla / cards filtrables)      │
└─────────────────────────────────────────────────────────┘
```

---

## Gráfico 1: Reportes por Mascota (Barras)

| Propiedad | Valor |
|-----------|-------|
| **Tipo** | `BarChart` (Recharts) |
| **Ventana temporal** | Últimas **48 horas** |
| **Eje X** | Nombre del paciente |
| **Eje Y** | Cantidad de reportes con hallazgos |
| **Color activo** | Índigo `#4f46e5` |
| **Color inactivo** | Índigo claro `#c7d2fe` (cuando hay filtro por otra mascota) |

### Lógica de datos

Un reporte cuenta para una mascota si, dentro de las 48 h:
- El filtro de síntoma es `"Todos"`, **o**
- El reporte contiene un evento que coincide con el síntoma filtrado

Solo se cuentan reportes con **anomalías** o eventos no rutinarios (Enfermedad, Medicación, o rutina con valor problemático según `color_rules`).

### Interacción

**Clic en una barra** → filtra todo el panel por esa mascota:
- La barra seleccionada queda resaltada en índigo oscuro
- El gráfico de síntomas se recalcula solo para esa mascota
- El historial de auditoría muestra solo sus reportes
- Segundo clic en la misma barra → quita el filtro (`Todas`)

---

## Gráfico 2: Distribución de Síntomas (Donut)

| Propiedad | Valor |
|-----------|-------|
| **Tipo** | `PieChart` con `innerRadius` (donut) |
| **Ventana temporal** | Últimas **48 horas** |
| **Valor (`value`)** | Cantidad de **mascotas distintas** con ese síntoma |
| **Paleta** | 6 colores rotativos (índigo, verde, ámbar, rojo, violeta, rosa) |

### Cómo se agrupan los síntomas

| Tipo de evento | Nombre en el gráfico |
|----------------|----------------------|
| Comida / Agua / Pis / Caca con valor anómalo | `"Problema con {tipo}"` |
| Enfermedad, Medicación, Conducta, etc. | Nombre del tipo tal cual |

Un mismo animal con el mismo síntoma en varios reportes cuenta **una sola vez** por categoría (usa `Set` de nombres).

### Interacción

**Clic en un segmento** → filtra por ese síntoma:
- El segmento seleccionado mantiene color; el resto pasa a gris `#f3f4f6`
- El gráfico de barras se recalcula mostrando solo mascotas con ese síntoma
- El historial filtra reportes que contengan ese hallazgo
- Segundo clic → quita filtro (`Todos`)

---

## Sincronización entre Gráficos y Feed

Los filtros son **compartidos** entre ambos gráficos y la tabla de auditoría:

| Filtro | Estado | Efecto visual |
|--------|--------|---------------|
| Mascota | `filterAnimal` | Badge índigo en cabecera del historial |
| Síntoma | `filterSymptom` | Badge ámbar en cabecera del historial |
| Fecha desde/hasta | `filterDateStart/End` | Limita filas del historial |

```
Clic barra "Kira"  ──►  filterAnimal = "Kira"
                              │
                              ├── Barras: solo Kira resaltada
                              ├── Donut: síntomas solo de Kira
                              └── Tabla: solo reportes de Kira

Clic donut "Enfermedad"  ──►  filterSymptom = "Enfermedad"
                              │
                              ├── Barras: mascotas con enfermedad
                              ├── Donut: segmento resaltado
                              └── Tabla: reportes con ese hallazgo
```

---

## Colores Semánticos en el Feed (no en los gráficos)

Los badges y el tinte de fila/card usan las mismas reglas que el historial clínico:

| Badge | Condición |
|-------|-----------|
| 🔴 Rojo | Enfermedad/Medicación, o keyword roja |
| 🟡 Amarillo | Tipo Observación/Observacion/Nota, o keyword amarilla |
| 🟢 Verde | Rutina normal / sin hallazgos anómalos |

El peor color de los eventos del reporte define el color del reporte (rojo > amarillo > verde).

**Filtro de color** en el historial: botones Todos / Verde / Amarillo / Rojo.

Configurables en **Panel Admin → Colores de Reporte**.

---

## El Clima de la Guardería (bloque superior)

No es un gráfico Recharts; es resumen textual generado por IA:

- Endpoint: `GET /api/dashboard/weather`
- Ventana: **48 horas**
- Muestra párrafo de resumen + tarjetas de alertas por animal
- Mismo endpoint que el botón "Analizar Clima" del tablero principal

---

## Análisis IA por Paciente (panel separado)

**Admin → Análisis IA** (`AnalisisPanel.jsx`) **no tiene gráficos**. Genera texto de evolución por mascota vía:

```
GET /api/animals/{id}/evolution-analysis
```

Compara los últimos 2 reportes con Qwen 7B (servidor) y devuelve un **párrafo neutro y factual** (sin alarmismo ni diagnósticos inventados).

---

## Stack Técnico

| Componente | Detalle |
|------------|---------|
| Librería | `recharts` ^3.x |
| Componentes usados | `BarChart`, `Bar`, `PieChart`, `Pie`, `Cell`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `Legend`, `ResponsiveContainer` |
| Datos | Calculados en frontend con `useMemo` (sin endpoint dedicado de analytics) |
| API fuente | `GET /api/reports/all?limit=100` |

---

## Archivos Relacionados

| Archivo | Rol |
|---------|-----|
| `frontend/src/pages/admin/AuditoriaPanel.jsx` | Gráficos + clima + feed de auditoría |
| `frontend/src/pages/admin/AdminDashboard.jsx` | Navegación al panel |
| `backend/src/routes/report_routes.py` | `GET /reports/all` |
| `backend/src/routes/dashboard_routes.py` | `GET /dashboard/weather` |
| `frontend/src/pages/Dashboard.jsx` | Tablero cuidador (sin gráficos) |

---

## Limitaciones Actuales

- Los gráficos solo miran las **últimas 48 h**; el historial puede filtrarse por fechas más amplias.
- `GET /reports/all` tiene `limit=100` — con muchos reportes diarios, datos antiguos pueden no aparecer en gráficos.
- No hay gráficos en el tablero del cuidador ni en la ficha del paciente.
- No hay exportación PNG/CSV de los gráficos.

---

## Documentación Relacionada

- [README.md](./README.md) — visión general
- [README_NLP.md](./README_NLP.md) — pipeline de voz e IA
- [README_BDD.md](./README_BDD.md) — esquema de datos
