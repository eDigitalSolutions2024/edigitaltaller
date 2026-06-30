import http from './http';

export const getReporteOriginales = (desde, hasta) =>
  http.get('/reportes/originales', { params: { desde, hasta } });

export const getReporteVentasAsesores = (desde, hasta) =>
  http.get('/reportes/ventas-asesores', { params: { desde, hasta } });
