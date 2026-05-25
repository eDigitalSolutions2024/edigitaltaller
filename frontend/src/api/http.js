import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';

// ─── Access token en memoria (no en localStorage) ───────────────────────────
let accessToken = null;
export const setAccessToken   = (t) => { accessToken = t; };
export const getAccessToken   = ()  => accessToken;
export const clearAccessToken = ()  => { accessToken = null; };

// ─── Instancia principal ─────────────────────────────────────────────────────
const http = axios.create({
  baseURL:         BASE_URL,
  withCredentials: true,   // necesario para enviar la cookie del refresh token
});

// ─── Request: adjunta access token si existe ─────────────────────────────────
http.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// ─── Response: reintento silencioso cuando el access token expira ─────────────
let isRefreshing = false;
let failedQueue  = [];      // requests que llegaron mientras se refrescaba

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) =>
    error ? reject(error) : resolve(token)
  );
  failedQueue = [];
};

http.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    const is401         = error.response?.status === 401;
    const alreadyRetried = original._retry;
    const isRefreshCall  = original.url?.includes('/auth/refresh');
    const isLogoutCall   = original.url?.includes('/auth/logout');

    if (is401 && !alreadyRetried && !isRefreshCall && !isLogoutCall) {

      if (isRefreshing) {
        // Encolar el request hasta que termine el refresh
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return http(original);
        });
      }

      original._retry  = true;
      isRefreshing     = true;

      try {
        // Llamada directa (no pasa por el interceptor) para evitar loop
        const { data } = await axios.post(
          `${BASE_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        );

        setAccessToken(data.accessToken);

        // Actualizar el usuario en localStorage si viene en la respuesta
        if (data.user) localStorage.setItem('user', JSON.stringify(data.user));

        processQueue(null, data.accessToken);

        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return http(original);

      } catch (refreshError) {
        processQueue(refreshError, null);
        clearAccessToken();
        localStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default http;
