import axios from 'axios';

const http = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:4000/api',
  withCredentials: false
});

// Interceptor para adjuntar token
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default http;
