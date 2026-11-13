import { useMemo, useState } from 'react';
import { Navigate } from 'react-big-calendar';
import { format, startOfDay, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';

export const AGENDA_SECTIONS = [
  {
    id: 'medicacion',
    label: 'Medicación',
    emoji: '💊',
    color: '#8b5cf6',
    match: (e) => e.isAlert && (e.resource?.alert_type || '').startsWith('Medicación'),
  },
  {
    id: 'vacunacion',
    label: 'Vacunación',
    emoji: '💉',
    color: '#ec4899',
    match: (e) => e.isAlert && e.resource?.alert_type === 'Vacunación',
  },
  {
    id: 'desparasitacion_interna',
    label: 'Desparasitación interna',
    emoji: '🪱',
    color: '#f97316',
    match: (e) => e.isAlert && (e.resource?.alert_type || '').includes('Interna'),
  },
  {
    id: 'desparasitacion_externa',
    label: 'Desparasitación externa',
    emoji: '🦟',
    color: '#06b6d4',
    match: (e) => e.isAlert && (e.resource?.alert_type || '').includes('Externa'),
  },
  {
    id: 'pendiente',
    label: 'Reservas pendientes',
    emoji: '📋',
    color: '#3b82f6',
    match: (e) => !e.isAlert && e.resource?.status === 'Pendiente',
  },
  {
    id: 'confirmada',
    label: 'Reservas confirmadas',
    emoji: '✅',
    color: '#10b981',
    match: (e) => !e.isAlert && e.resource?.status === 'Confirmada',
  },
  {
    id: 'ingresada',
    label: 'Ingresadas en guardería',
    emoji: '🏠',
    color: '#7c3aed',
    match: (e) => !e.isAlert && e.resource?.status === 'Ingresada',
  },
  {
    id: 'llevar_vet',
    label: 'Llevar veterinaria',
    emoji: '🚗',
    color: '#f97316',
    match: (e) => !e.isAlert && e.resource?.status === 'Llevar Veterinaria',
  },
  {
    id: 'viene_vet',
    label: 'Viene veterinaria',
    emoji: '🩺',
    color: '#eab308',
    match: (e) => !e.isAlert && e.resource?.status === 'Viene Veterinaria',
  },
  {
    id: 'bano',
    label: 'Llevar a bañar',
    emoji: '🛁',
    color: '#06b6d4',
    match: (e) => !e.isAlert && e.resource?.status === 'Llevar a Bañar',
  },
  {
    id: 'otras',
    label: 'Otras actividades',
    emoji: '📌',
    color: '#64748b',
    match: (e) => !e.isAlert && e.resource?.status === 'Otras actividades',
  },
  {
    id: 'finalizada',
    label: 'Finalizadas',
    emoji: '✔️',
    color: '#9ca3af',
    match: (e) => !e.isAlert && e.resource?.status === 'Finalizada',
  },
  {
    id: 'cancelada',
    label: 'Canceladas',
    emoji: '❌',
    color: '#ef4444',
    match: (e) => !e.isAlert && e.resource?.status === 'Cancelada',
  },
];

const ALL_SECTION_IDS = AGENDA_SECTIONS.map((s) => s.id);

/** Fin inclusivo del evento (all-day de estadía usa fin exclusivo en el calendario). */
function eventEndInclusive(ev) {
  if (!ev?.end) return ev?.start || new Date(0);
  if (ev.allDay) return addDays(ev.end, -1);
  return ev.end;
}

function isCurrentOrFuture(ev, todayStart) {
  return eventEndInclusive(ev) >= todayStart;
}

function isPastEvent(ev, todayStart) {
  return eventEndInclusive(ev) < todayStart;
}

function groupEventsByDay(events) {
  const map = new Map();
  for (const ev of events) {
    const key = format(ev.start, 'yyyy-MM-dd');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(ev);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function formatEventTime(event) {
  if (event.allDay) return 'Todo el día';
  return format(event.start, 'HH:mm', { locale: es });
}

function formatDayLabel(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return format(date, "EEEE d 'de' MMMM", { locale: es });
}

function eventSearchText(ev) {
  const r = ev.resource || {};
  return [
    ev.title,
    r.status,
    r.notes,
    r.animal?.name,
    r.animal_name,
    r.alert_type,
    r.product_name,
    r.species?.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function buildSections(events) {
  return AGENDA_SECTIONS.map((section) => ({
    section,
    events: events
      .filter(section.match)
      .sort((a, b) => a.start.getTime() - b.start.getTime()),
  })).filter(({ events: evs }) => evs.length > 0);
}

function SectionList({ sectionsWithEvents, collapsed, toggleSection, onSelectEvent, emptyLabel }) {
  if (sectionsWithEvents.length === 0) {
    return (
      <div className="flex items-center justify-center text-gray-500 text-sm py-8 px-4">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sectionsWithEvents.map(({ section, events: sectionEvents }) => {
        const isCollapsed = collapsed.has(section.id);
        return (
          <div
            key={section.id}
            className="rounded-xl overflow-hidden border border-gray-200/80 bg-white shadow-sm"
          >
            <button
              type="button"
              onClick={() => toggleSection(section.id)}
              className="w-full flex items-center gap-2 px-3 py-2.5 sm:px-4 sm:py-3 text-left text-white font-bold text-sm sm:text-base transition-opacity hover:opacity-95"
              style={{ backgroundColor: section.color }}
            >
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4 shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 shrink-0" />
              )}
              <span className="flex-1">
                {section.emoji} {section.label}
              </span>
              <span className="text-xs font-semibold bg-white/25 px-2 py-0.5 rounded-full">
                {sectionEvents.length}
              </span>
            </button>

            {!isCollapsed && (
              <div className="divide-y divide-gray-100">
                {groupEventsByDay(sectionEvents).map(([dayKey, dayEvents]) => (
                  <div key={dayKey} className="px-3 py-2 sm:px-4">
                    <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wide text-gray-400 mb-1.5 capitalize">
                      {formatDayLabel(dayKey)}
                    </p>
                    <ul className="space-y-1">
                      {dayEvents.map((ev) => (
                        <li key={`${ev.isAlert ? 'a' : 'r'}-${ev.id}-${ev.start?.getTime?.() || 0}`}>
                          <button
                            type="button"
                            onClick={() => onSelectEvent?.(ev)}
                            className="w-full text-left flex gap-2 sm:gap-3 items-start py-1.5 px-2 rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            <span className="text-xs font-mono text-gray-500 shrink-0 pt-0.5 min-w-[3.5rem]">
                              {formatEventTime(ev)}
                            </span>
                            <span className="text-sm text-gray-800 leading-snug">{ev.title}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function AgendaGroupedView({ events, onSelectEvent }) {
  const todayStart = useMemo(() => startOfDay(new Date()), []);
  const [collapsed, setCollapsed] = useState(() => new Set(ALL_SECTION_IDS));
  const [historyCollapsed, setHistoryCollapsed] = useState(() => new Set(ALL_SECTION_IDS));
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState('');

  const { upcoming, past } = useMemo(() => {
    const list = events || [];
    return {
      upcoming: list.filter((ev) => isCurrentOrFuture(ev, todayStart)),
      past: list
        .filter((ev) => isPastEvent(ev, todayStart))
        .sort((a, b) => b.start.getTime() - a.start.getTime()),
    };
  }, [events, todayStart]);

  const upcomingSections = useMemo(() => buildSections(upcoming), [upcoming]);

  const filteredPast = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    if (q.length < 2) return past;
    return past.filter((ev) => eventSearchText(ev).includes(q));
  }, [past, historyQuery]);

  const historySections = useMemo(() => buildSections(filteredPast), [filteredPast]);

  const toggleSection = (id) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleHistorySection = (id) => {
    setHistoryCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="rbc-agenda-view h-full overflow-y-auto p-3 sm:p-4 bg-gray-50/80">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-bold text-gray-800">Agenda</h3>
          <p className="text-xs text-gray-500">Hoy y próximos cargados</p>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setCollapsed(new Set())}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded-lg hover:bg-indigo-50"
          >
            Expandir todo
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(new Set(ALL_SECTION_IDS))}
            className="text-xs font-semibold text-gray-600 hover:text-gray-800 px-2 py-1 rounded-lg hover:bg-gray-100"
          >
            Comprimir todo
          </button>
        </div>
      </div>

      <SectionList
        sectionsWithEvents={upcomingSections}
        collapsed={collapsed}
        toggleSection={toggleSection}
        onSelectEvent={onSelectEvent}
        emptyLabel="No hay eventos para hoy ni próximos."
      />

      <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-3 sm:px-4 text-left bg-slate-700 text-white font-bold text-sm sm:text-base hover:bg-slate-800 transition-colors"
        >
          {historyOpen ? (
            <ChevronDown className="w-4 h-4 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 shrink-0" />
          )}
          <span className="flex-1">📜 Histórico</span>
          <span className="text-xs font-semibold bg-white/20 px-2 py-0.5 rounded-full">
            {past.length}
          </span>
        </button>

        {historyOpen && (
          <div className="p-3 sm:p-4 space-y-3 bg-slate-50/80">
            <p className="text-xs text-slate-500">
              Eventos ya pasados. Usá el buscador para encontrar una mascota o actividad.
            </p>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={historyQuery}
                onChange={(e) => setHistoryQuery(e.target.value)}
                placeholder="Buscar en histórico (ej. banana, medicación…)"
                className="w-full border border-gray-300 rounded-xl pl-9 pr-9 py-2.5 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
              {historyQuery && (
                <button
                  type="button"
                  onClick={() => setHistoryQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <SectionList
              sectionsWithEvents={historySections}
              collapsed={historyCollapsed}
              toggleSection={toggleHistorySection}
              onSelectEvent={onSelectEvent}
              emptyLabel={
                historyQuery.trim().length >= 2
                  ? 'No hay coincidencias en el histórico.'
                  : 'No hay eventos históricos cargados.'
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

AgendaGroupedView.range = (_date, { localizer }) => {
  // Agenda operativa: desde hoy hacia adelante (no histórico)
  const start = localizer.startOf(new Date(), 'day');
  const end = localizer.add(start, 60, 'day');
  return { start, end };
};

AgendaGroupedView.navigate = (date, action, { localizer }) => {
  const today = localizer.startOf(new Date(), 'day');
  switch (action) {
    case Navigate.PREVIOUS:
      // No retroceder al pasado: la agenda queda en hoy+futuro
      return today;
    case Navigate.NEXT:
      return localizer.add(today, 30, 'day');
    case Navigate.TODAY:
      return today;
    default:
      return date;
  }
};

AgendaGroupedView.title = (_date, { localizer }) => {
  const start = format(new Date(), 'dd MMM yyyy', { locale: es });
  const end = format(localizer.add(localizer.startOf(new Date(), 'day'), 60, 'day'), 'dd MMM yyyy', { locale: es });
  return `${start} — ${end}`;
};
