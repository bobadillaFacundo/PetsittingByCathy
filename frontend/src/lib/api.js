/**
 * Base URL de la API.
 * En Vercel y en dev local usamos /api (proxy en vercel.json y vite.config.js).
 */
export const API_BASE = import.meta.env.VITE_API_BASE || '/api';

/** URL para archivos estáticos subidos al backend (fotos, adjuntos). */
export function mediaUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const base = import.meta.env.VITE_MEDIA_BASE || 'https://petsittingbycathy.onrender.com';
  return `${base}${path}`;
}
