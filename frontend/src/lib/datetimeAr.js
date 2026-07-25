/** Fechas/horas de la app: siempre America/Argentina/Buenos_Aires */
export const AR_TIMEZONE = 'America/Argentina/Buenos_Aires';
const AR_OFFSET = '-03:00';

/** Parsea datetime de la API (con offset AR o legacy naive/UTC). */
export function parseApiDateTime(value) {
  if (!value) return new Date(NaN);
  if (value instanceof Date) return value;
  const s = String(value).trim();
  if (/[Zz]|[+-]\d{2}:\d{2}$/.test(s)) {
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

/** Rellena input datetime-local en hora Argentina. */
export function formatForInput(value) {
  const dateObj = parseApiDateTime(value);
  if (Number.isNaN(dateObj.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: AR_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(dateObj);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** Detecta alertas de día completo (vacunas/desparasitación). */
export function isAllDayAlert(dueDate) {
  if (!dueDate) return true;
  const s = String(dueDate);
  if (!s.includes('T')) return true;
  return /T12:00:00([+-]|$)/.test(s) || /T00:00:00([+-]|Z|$)/.test(s);
}
