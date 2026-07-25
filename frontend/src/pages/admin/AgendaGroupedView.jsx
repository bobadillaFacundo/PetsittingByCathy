import { useState } from 'react';
import { Navigate } from 'react-big-calendar';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronDown, ChevronRight } from 'lucide-react';

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

export default function AgendaGroupedView({ events, onSelectEvent }) {
  const [collapsed, setCollapsed] = useState(() => new Set(ALL_SECTION_IDS));

  const toggleSection = (id) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(ALL_SECTION_IDS));

  const sectionsWithEvents = AGENDA_SECTIONS.map((section) => ({
    section,
    events: events
      .filter(section.match)
      .sort((a, b) => a.start.getTime() - b.start.getTime()),
  })).filter(({ events: evs }) => evs.length > 0);

  if (sectionsWithEvents.length === 0) {
    return (
      <div className="rbc-agenda-view flex items-center justify-center h-full text-gray-500 text-sm p-6">
        No hay eventos en este rango.
      </div>
    );
  }

  return (
    <div className="rbc-agenda-view h-full overflow-y-auto p-3 sm:p-4 bg-gray-50/80">
      <div className="flex justify-end gap-2 mb-3">
        <button
          type="button"
          onClick={expandAll}
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded-lg hover:bg-indigo-50"
        >
          Expandir todo
        </button>
        <button
          type="button"
          onClick={collapseAll}
          className="text-xs font-semibold text-gray-600 hover:text-gray-800 px-2 py-1 rounded-lg hover:bg-gray-100"
        >
          Comprimir todo
        </button>
      </div>

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
                          <li key={ev.id}>
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
    </div>
  );
}

AgendaGroupedView.range = (date, { localizer }) => {
  const start = localizer.startOf(date, 'day');
  const end = localizer.add(start, 30, 'day');
  return { start, end };
};

AgendaGroupedView.navigate = (date, action, { localizer }) => {
  switch (action) {
    case Navigate.PREVIOUS:
      return localizer.add(date, -30, 'day');
    case Navigate.NEXT:
      return localizer.add(date, 30, 'day');
    case Navigate.TODAY:
      return new Date();
    default:
      return date;
  }
};

AgendaGroupedView.title = (date, { localizer }) => {
  const start = format(date, 'dd MMM yyyy', { locale: es });
  const end = format(localizer.add(date, 30, 'day'), 'dd MMM yyyy', { locale: es });
  return `${start} — ${end}`;
};
