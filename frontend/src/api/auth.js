import http from './http';

export const loginApi = (payload) => http.post('/auth/login', payload);
export const meApi = () => http.get('/auth/me');
