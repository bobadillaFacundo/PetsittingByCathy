/** Colores de eventos de reporte (incluye lógica de peso opcional). */

export const WEIGHT_TOLERANCE_RATIO = 0.10;
export const WEIGHT_TOLERANCE_ABS_KG = 0.5;

export function parseWeightKg(value) {
  if (value == null) return null;
  const text = String(value).trim().toLowerCase().replace(',', '.');
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const kg = Number(match[1]);
  return Number.isFinite(kg) && kg > 0 ? kg : null;
}

export function formatWeightKg(kg) {
  if (kg == null || !Number.isFinite(kg)) return null;
  return Number.isInteger(kg) ? `${kg} kg` : `${kg.toFixed(1)} kg`;
}

export function isWeightApproximatelyEqual(currentKg, referenceKg) {
  if (referenceKg == null || referenceKg <= 0) return true;
  const diff = Math.abs(currentKg - referenceKg);
  if (diff <= WEIGHT_TOLERANCE_ABS_KG) return true;
  return diff / referenceKg <= WEIGHT_TOLERANCE_RATIO;
}

export function getWeightReferenceKg(report, reports, animalWeightKg) {
  const reportDate = report?.created_at ? new Date(report.created_at).getTime() : null;
  if (reportDate != null && Array.isArray(reports)) {
    const previous = reports
      .filter((r) => {
        if (r.animal_name !== report.animal_name) return false;
        const t = new Date(r.created_at).getTime();
        return t < reportDate;
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    for (const prev of previous) {
      const pesoEvent = (prev.events || []).find(
        (ev) => (ev.type || '').toLowerCase() === 'peso'
      );
      if (pesoEvent) {
        const kg = parseWeightKg(pesoEvent.value);
        if (kg != null) return kg;
      }
    }
  }

  const profile = parseWeightKg(animalWeightKg);
  return profile;
}

export function getWeightEventColor(currentKg, referenceKg) {
  if (currentKg == null) return 'green';
  if (referenceKg == null) return 'green';
  return isWeightApproximatelyEqual(currentKg, referenceKg) ? 'green' : 'red';
}

function matchColorRules(value, colorRules) {
  const v = (value || '').toLowerCase();
  let exactRed = [];
  let partialRed = [];
  let exactYellow = [];
  let partialYellow = [];

  (colorRules || []).forEach((r) => {
    const raw = r.keywords_list || r.keywords || '';
    const keys = Array.isArray(raw)
      ? raw.map((k) => String(k).trim().toLowerCase()).filter(Boolean)
      : String(raw).split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
    if (r.color === 'red') {
      if (r.match_type === 'exact') exactRed.push(...keys);
      else partialRed.push(...keys);
    } else if (r.color === 'yellow') {
      if (r.match_type === 'exact') exactYellow.push(...keys);
      else partialYellow.push(...keys);
    }
  });

  if (exactRed.includes(v) || partialRed.some((k) => v.includes(k))) return 'red';
  if (exactYellow.includes(v) || partialYellow.some((k) => v.includes(k))) return 'yellow';
  return 'green';
}

export function resolveEventColor(event, { colorRules = [], report = null, reports = [], animalWeightKg = null } = {}) {
  const type = (event?.type || '').toLowerCase();
  const value = event?.value || '';

  if (type === 'peso') {
    const current = parseWeightKg(value);
    const reference = getWeightReferenceKg(report, reports, animalWeightKg);
    return getWeightEventColor(current, reference);
  }

  if (['enfermedad', 'medicación', 'medicacion'].some((k) => type.includes(k))) {
    return 'red';
  }
  if (['observacion', 'observación', 'nota'].some((k) => type.includes(k))) {
    return 'yellow';
  }

  return matchColorRules(value, colorRules);
}

export function getEventBadgeClasses(color) {
  if (color === 'red') return 'bg-red-50 text-red-700 border-red-200';
  if (color === 'yellow') return 'bg-yellow-100 text-yellow-800 border-yellow-300';
  return 'bg-emerald-50 text-emerald-700 border-emerald-100';
}

export function getEventColorClasses(color) {
  if (color === 'red') {
    return { colorClass: 'bg-red-50 text-red-700 border-red-200', dotColor: 'bg-red-400' };
  }
  if (color === 'yellow') {
    return { colorClass: 'bg-yellow-100 text-yellow-800 border-yellow-300', dotColor: 'bg-yellow-400' };
  }
  return { colorClass: 'bg-green-50 text-green-700 border-green-200', dotColor: 'bg-green-400' };
}

export function formatEventDisplayValue(type, value) {
  const typeLower = (type || '').toLowerCase();
  if (typeLower === 'peso') {
    const kg = parseWeightKg(value);
    if (kg != null) return formatWeightKg(kg);
  }
  if (value && String(value).length > 40) return `${String(value).slice(0, 40)}…`;
  return value || 'Sí';
}

export function isWeightEvent(event) {
  return (event?.type || '').toLowerCase() === 'peso';
}
