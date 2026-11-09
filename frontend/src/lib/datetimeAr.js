/** Fechas/horas de la app: siempre America/Argentina/Buenos_Aires */
export const AR_TIMEZONE = 'America/Argentina/Buenos_Aires';
const AR_OFFSET = '-03:00';

/** Parsea datetime de la API (con offset AR o legacy naive/UTC). */
export function parseApiDateTime(value) {
  if (!value) return new Date(NaN);
  if (value instanceof Date) return value;
  const s = String(value).trim();
  if (/[Zz]|[+-]\d{2}:?\d{2}$/.test(s)) {
    return new Date(s);
  }
  const normalized = s.includes('T') ? s.replace(' ', 'T') : `${s}T00:00:00`;
  const withSeconds = normalized.length === 16 ? `${normalized}:00` : normalized;
  return new Date(`${withSeconds}${AR_OFFSET}`);
}

/** Envía datetime-local como ISO con offset Argentina. */
export function toApiDateTime(localValue) {
  if (!localValue) return localValue;
  const v = localValue.length === 16 ? `${localValue}:00` : localValue;
  return `${v}${AR_OFFSET}`;
}

function arParts(dateObj) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: AR_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(dateObj);
}

function partValue(parts, type, fallback = '00') {
  return parts.find((p) => p.type === type)?.value ?? fallback;
}

/** Rellena input datetime-local en hora Argentina. */
export function formatForInput(value) {
  const dateObj = parseApiDateTime(value);
  if (Number.isNaN(dateObj.getTime())) return '';
  const parts = arParts(dateObj);
  let hour = partValue(parts, 'hour');
  // Algunos engines devuelven "24" a medianoche con hour12:false
  if (hour === '24') hour = '00';
  return `${partValue(parts, 'year')}-${partValue(parts, 'month')}-${partValue(parts, 'day')}T${hour}:${partValue(parts, 'minute')}`;
}

/** Texto legible en hora Argentina (evita saltos por TZ del navegador). */
export function formatArDisplay(value, withTime = true) {
  const dateObj = parseApiDateTime(value);
  if (Number.isNaN(dateObj.getTime())) return '';
  const opts = {
    timeZone: AR_TIMEZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  };
  if (withTime) {
    opts.hour = '2-digit';
    opts.minute = '2-digit';
    opts.hour12 = false;
  }
  return new Intl.DateTimeFormat('es-AR', opts).format(dateObj);
}

/** Rango legible inicio → fin en hora Argentina. */
export function formatArRange(start, end, withTime = true) {
  const a = formatArDisplay(start, withTime);
  const b = formatArDisplay(end, withTime);
  if (!a) return b || '';
  if (!b || a === b) return a;
  return `${a} → ${b}`;
}

/** Detecta alertas de día completo (vacunas/desparasitación). */
export function isAllDayAlert(dueDate) {
  if (!dueDate) return true;
  const s = String(dueDate);
  if (!s.includes('T')) return true;
  return /T12:00:00([+-]|$)/.test(s) || /T00:00:00([+-]|Z|$)/.test(s);
}
