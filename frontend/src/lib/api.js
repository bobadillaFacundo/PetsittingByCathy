const RENDER_API = 'https://petsittingbycathy.onrender.com';

/**
 * Base URL de la API.
 * - Dev: /api (proxy Vite → localhost:8000)
 * - Prod (Vercel): /api (rewrite en vercel.json → Render, mismo origen, sin CORS)
 * - Override: VITE_API_BASE=https://... para apuntar directo a Render
 */
function resolveApiBase() {
  const fromEnv = import.meta.env.VITE_API_BASE;
  if (fromEnv && fromEnv.startsWith('http')) {
    return fromEnv.replace(/\/$/, '');
  }
  return '/api';
}

export const API_BASE = resolveApiBase();

/** URL para archivos estáticos subidos al backend (fotos, adjuntos). */
export function mediaUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const base = import.meta.env.VITE_MEDIA_BASE || RENDER_API;
  return `${base}${path}`;
}

/** fetch que valida que la respuesta sea JSON (evita errores opacos con HTML de la PWA). */
export async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, options);
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    if (text.trimStart().startsWith('<!')) {
      throw new Error('La API no respondió correctamente. Recargá la página (Ctrl+Shift+R).');
    }
    throw new Error(text || `Error HTTP ${res.status}`);
  }
  return res;
}
