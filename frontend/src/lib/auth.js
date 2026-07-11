/** Helpers de sesión JWT (cliente). */

const AUTH_KEYS = ['token', 'role', 'username'];

export function clearSession() {
  AUTH_KEYS.forEach((key) => localStorage.removeItem(key));
}

export function getToken() {
  return localStorage.getItem('token');
}

/** Decodifica el payload del JWT sin verificar firma (solo para chequear exp en cliente). */
export function isTokenExpired(token = getToken()) {
  if (!token) return true;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return true;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload.exp) return false;
    // margen de 10s para evitar carrera justo al vencer
    return Date.now() >= payload.exp * 1000 - 10_000;
  } catch {
    return true;
  }
}

export function isAuthenticated() {
  const token = getToken();
  return Boolean(token) && !isTokenExpired(token);
}

let redirectingToLogin = false;

/** Limpia sesión y lleva a /login (una sola vez). */
export function redirectToLogin() {
  clearSession();
  if (window.location.pathname === '/login') return;
  if (redirectingToLogin) return;
  redirectingToLogin = true;
  window.location.replace('/login');
}
