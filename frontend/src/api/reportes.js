import http from './http';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';

export const getReporteOriginales = (desde, hasta) =>
  http.get('/reportes/originales', { params: { desde, hasta } });

export const getReporteVentasAsesores = (desde, hasta) =>
  http.get('/reportes/ventas-asesores', { params: { desde, hasta } });

export const openReporteOriginalesPdf = (desde, hasta) => {
  const url = `${BASE_URL}/reportes/originales-pdf?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
  window.open(url, '_blank', 'noopener');
};

export const openReporteVentasAsesoresPdf = (desde, hasta) => {
  const url = `${BASE_URL}/reportes/ventas-asesores-pdf?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
  window.open(url, '_blank', 'noopener');
};
