import { formatWeightKg } from '../lib/eventColors';

function formatWeightDate(value) {
  if (!value) return 'Sin fecha de carga';
  return new Date(value).toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function WeightHistoryList({ items, compact = false }) {
  if (!items?.length) {
    return (
      <p className="text-sm text-gray-400 italic">
        Todavía no hay pesos con fecha. Se guardan al cargar el peso en la ficha o al mencionarlo en un reporte.
      </p>
    );
  }

  return (
    <ul className={compact ? 'space-y-1.5' : 'space-y-2'}>
      {items.map((item, idx) => (
        <li
          key={`${item.id || item.report_id || 'w'}-${item.recorded_at || idx}`}
          className="flex items-center justify-between gap-3 bg-white border border-violet-100 rounded-xl px-3 py-2"
        >
          <div>
            <p className={`font-bold text-violet-800 ${compact ? 'text-sm' : 'text-base'}`}>
              {formatWeightKg(item.kg)}
            </p>
            <p className="text-xs text-gray-500">{formatWeightDate(item.recorded_at)}</p>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wide text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
            {item.source === 'reporte' ? 'Reporte' : 'Ficha'}
          </span>
        </li>
      ))}
    </ul>
  );
}
