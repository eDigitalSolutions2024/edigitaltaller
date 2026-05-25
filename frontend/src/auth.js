import { clearAccessToken } from './api/http';

/** Guarda solo el usuario en localStorage (el token va en memoria) */
export const saveSession = ({ user }) => {
  localStorage.removeItem('token'); // limpiar token legacy si existía
  localStorage.setItem('user', JSON.stringify(user));
};

export const getUser = () => {
  const raw = localStorage.getItem('user');
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
};

/** Limpia la sesión del cliente (el backend revoca el refresh token por separado) */
export const logout = () => {
  localStorage.removeItem('user');
  localStorage.removeItem('token'); // limpiar token legacy si existía
  clearAccessToken();
};
