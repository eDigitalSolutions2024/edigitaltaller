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

export const getReporteOrdenesAbiertas = (desde, hasta) =>
  http.get('/reportes/ordenes-abiertas', { params: { desde, hasta } });

export const getReporteOriginalesAbiertas = (desde, hasta, asesor) =>
  http.get('/reportes/originales-abiertas', { params: { desde, hasta, asesor: asesor || undefined } });

export const openReporteOrdenesAbiertasPdf = (desde, hasta) => {
  const url = `${BASE_URL}/reportes/ordenes-abiertas-pdf?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
  window.open(url, '_blank', 'noopener');
};

export const openReporteOriginalesAbiertasPdf = (desde, hasta, asesor) => {
  let url = `${BASE_URL}/reportes/originales-abiertas-pdf?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
  if (asesor) url += `&asesor=${encodeURIComponent(asesor)}`;
  window.open(url, '_blank', 'noopener');
};

export const getReporteGarantias = (desde, hasta, asesor) =>
  http.get('/reportes/garantias', { params: { desde, hasta, asesor: asesor || undefined } });

export const openReporteGarantiasPdf = (desde, hasta, asesor) => {
  let url = `${BASE_URL}/reportes/garantias-pdf?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
  if (asesor) url += `&asesor=${encodeURIComponent(asesor)}`;
  window.open(url, '_blank', 'noopener');
};

export const getReporteCajasIngresos = (desde, hasta, tipo) =>
  http.get('/reportes/cajas-ingresos', { params: { desde, hasta, tipo } });

export const getReporteRemisionesDias = (desde, hasta) =>
  http.get('/reportes/cajas-ingresos-dias', { params: { desde, hasta, tipo: 'REMISION' } });

export const openReporteCajasIngresosPdf = (desde, hasta, tipo) => {
  const url = `${BASE_URL}/reportes/cajas-ingresos-pdf?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}&tipo=${encodeURIComponent(tipo)}`;
  window.open(url, '_blank', 'noopener');
};

export const getReporteRhCxC = (desde, hasta, mecanico) =>
  http.get('/reportes/rh-cxc', { params: { desde, hasta, mecanico: mecanico || undefined } });

export const openReporteRhCxCPdf = (desde, hasta, mecanico) => {
  let url = `${BASE_URL}/reportes/rh-cxc-pdf?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
  if (mecanico) url += `&mecanico=${encodeURIComponent(mecanico)}`;
  window.open(url, '_blank', 'noopener');
};

export const getReporteHorasTecnico = (desde, hasta, estado) =>
  http.get('/reportes/horas-tecnico', { params: { desde, hasta, estado: estado || undefined } });

export const openReporteHorasTecnicoPdf = (desde, hasta, estado) => {
  let url = `${BASE_URL}/reportes/horas-tecnico-pdf?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
  if (estado) url += `&estado=${encodeURIComponent(estado)}`;
  window.open(url, '_blank', 'noopener');
};

// ===== Cierre de Caja =====

export const getCierreCaja = (fecha) =>
  http.get('/reportes/cierre-caja', { params: { fecha } });

export const guardarCierreCaja = (payload) =>
  http.post('/reportes/cierre-caja', payload);

export const getHistorialCierresCaja = (desde, hasta) =>
  http.get('/reportes/cierre-caja/historial', { params: { desde, hasta } });

export const cerrarCierreCaja = (fecha) =>
  http.post('/reportes/cierre-caja/cerrar', { fecha });

export const restablecerCierreCaja = (fecha) =>
  http.post('/reportes/cierre-caja/restablecer', { fecha });

export const getValeCajaSiguienteFolio = () =>
  http.get('/reportes/cierre-caja/vale-siguiente-folio');

export const openCierreCajaPdf = (fecha) => {
  const url = `${BASE_URL}/reportes/cierre-caja/pdf?fecha=${encodeURIComponent(fecha)}`;
  window.open(url, '_blank', 'noopener');
};
