import http from './http';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';

export const getReporteOriginales = (desde, hasta) =>
  http.get('/reportes/originales', { params: { desde, hasta } });

export const getReporteVentasAsesores = (desde, hasta) =>
  http.get('/reportes/ventas-asesores', { params: { desde, hasta } });

export const getReporteOriginalesPdfUrl = (desde, hasta) =>
  `${BASE_URL}/reportes/originales-pdf?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;

export const getReporteVentasAsesoresPdfUrl = (desde, hasta) =>
  `${BASE_URL}/reportes/ventas-asesores-pdf?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;

export const getReporteOrdenesAbiertas = (desde, hasta) =>
  http.get('/reportes/ordenes-abiertas', { params: { desde, hasta } });

export const getReporteOriginalesAbiertas = (desde, hasta, asesor) =>
  http.get('/reportes/originales-abiertas', { params: { desde, hasta, asesor: asesor || undefined } });

export const getReporteOrdenesAbiertasPdfUrl = (desde, hasta) =>
  `${BASE_URL}/reportes/ordenes-abiertas-pdf?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;

export const getReporteOriginalesAbiertasPdfUrl = (desde, hasta, asesor) => {
  let url = `${BASE_URL}/reportes/originales-abiertas-pdf?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
  if (asesor) url += `&asesor=${encodeURIComponent(asesor)}`;
  return url;
};

export const getReporteGarantias = (desde, hasta, asesor) =>
  http.get('/reportes/garantias', { params: { desde, hasta, asesor: asesor || undefined } });

export const getReporteGarantiasPdfUrl = (desde, hasta, asesor) => {
  let url = `${BASE_URL}/reportes/garantias-pdf?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
  if (asesor) url += `&asesor=${encodeURIComponent(asesor)}`;
  return url;
};

export const getReporteCajasIngresos = (desde, hasta, tipo) =>
  http.get('/reportes/cajas-ingresos', { params: { desde, hasta, tipo } });

export const getReporteCajasIngresosDias = (desde, hasta, tipo) =>
  http.get('/reportes/cajas-ingresos-dias', { params: { desde, hasta, tipo } });

export const getReporteCajasIngresosPdfUrl = (desde, hasta, tipo) =>
  `${BASE_URL}/reportes/cajas-ingresos-pdf?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}&tipo=${encodeURIComponent(tipo)}`;

export const getReporteRhCxC = (desde, hasta, mecanico) =>
  http.get('/reportes/rh-cxc', { params: { desde, hasta, mecanico: mecanico || undefined } });

export const getReporteRhCxCPdfUrl = (desde, hasta, mecanico) => {
  let url = `${BASE_URL}/reportes/rh-cxc-pdf?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
  if (mecanico) url += `&mecanico=${encodeURIComponent(mecanico)}`;
  return url;
};

export const getReporteHorasTecnico = (desde, hasta, estado) =>
  http.get('/reportes/horas-tecnico', { params: { desde, hasta, estado: estado || undefined } });

export const getReporteHorasTecnicoPdfUrl = (desde, hasta, estado) => {
  let url = `${BASE_URL}/reportes/horas-tecnico-pdf?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
  if (estado) url += `&estado=${encodeURIComponent(estado)}`;
  return url;
};

export const getReportePendientesFactura = (desde, hasta) =>
  http.get('/reportes/pendientes-factura', { params: { desde, hasta } });

export const getReportePendientesFacturaPdfUrl = (desde, hasta) =>
  `${BASE_URL}/reportes/pendientes-factura-pdf?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;

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

export const getCierreCajaPdfUrl = (fecha) =>
  `${BASE_URL}/reportes/cierre-caja/pdf?fecha=${encodeURIComponent(fecha)}`;
