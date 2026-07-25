const RENDER_API = 'https://petsittingbycathy.onrender.com';

/**
 * Base URL de la API.
 * - Dev: /api (proxy de vite.config.js → localhost:8000)
 * - Prod: Render directo (CORS habilitado en el backend)
 * - Override: VITE_API_BASE en .env
 */
export const API_BASE =
  import.meta.env.VITE_API_BASE ||
  (import.meta.env.DEV ? '/api' : RENDER_API);

/** URL para archivos estáticos subidos al backend (fotos, adjuntos). */
export function mediaUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const base = import.meta.env.VITE_MEDIA_BASE || RENDER_API;
  return `${base}${path}`;
}
