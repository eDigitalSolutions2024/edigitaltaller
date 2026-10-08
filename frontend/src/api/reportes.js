import http from './http';
import { paramsLinea } from '../hooks/useLineaNegocio';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';

// Sufijo `&lineaNegocio=...` para las URLs de PDF ('' si no aplica).
const qLinea = (linea) => (linea ? `&lineaNegocio=${encodeURIComponent(linea)}` : '');

// El último parámetro `linea` ('CHIREY' o '') filtra el reporte por línea de negocio;
// vacío = todas las líneas (reportes normales). Ver hooks/useLineaNegocio.
export const getReporteOriginales = (desde, hasta, linea) =>
  http.get('/reportes/originales', { params: { desde, hasta, ...paramsLinea(linea) } });

export const getReporteVentasAsesores = (desde, hasta, linea) =>
  http.get('/reportes/ventas-asesores', { params: { desde, hasta, ...paramsLinea(linea) } });

export const getReporteOriginalesPdfUrl = (desde, hasta, linea) =>
  `${BASE_URL}/reportes/originales-pdf?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}${qLinea(linea)}`;

export const getReporteVentasAsesoresPdfUrl = (desde, hasta, linea) =>
  `${BASE_URL}/reportes/ventas-asesores-pdf?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}${qLinea(linea)}`;

export const getReporteOrdenesAbiertas = (desde, hasta, linea) =>
  http.get('/reportes/ordenes-abiertas', { params: { desde, hasta, ...paramsLinea(linea) } });

export const getReporteOriginalesAbiertas = (desde, hasta, asesor, linea) =>
  http.get('/reportes/originales-abiertas', { params: { desde, hasta, asesor: asesor || undefined, ...paramsLinea(linea) } });

export const getReporteOrdenesAbiertasPdfUrl = (desde, hasta, linea) =>
  `${BASE_URL}/reportes/ordenes-abiertas-pdf?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}${qLinea(linea)}`;

export const getReporteOriginalesAbiertasPdfUrl = (desde, hasta, asesor, linea) => {
  let url = `${BASE_URL}/reportes/originales-abiertas-pdf?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
  if (asesor) url += `&asesor=${encodeURIComponent(asesor)}`;
  return url + qLinea(linea);
};

export const getReporteGarantias = (desde, hasta, asesor, linea) =>
  http.get('/reportes/garantias', { params: { desde, hasta, asesor: asesor || undefined, ...paramsLinea(linea) } });

export const getReporteGarantiasPdfUrl = (desde, hasta, asesor, linea) => {
  let url = `${BASE_URL}/reportes/garantias-pdf?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
  if (asesor) url += `&asesor=${encodeURIComponent(asesor)}`;
  return url + qLinea(linea);
};

export const getReporteCajasIngresos = (desde, hasta, tipo) =>
  http.get('/reportes/cajas-ingresos', { params: { desde, hasta, tipo } });

// Solo admin: descarta la foto de un día ya terminado y lo recalcula con los
// datos de hoy. El motivo es obligatorio (queda en el reporte y en el Registro
// de Actividad).
export const regenerarReporteCajasIngresos = (desde, hasta, tipo, motivo) =>
  http.post('/reportes/cajas-ingresos/regenerar', { desde, hasta, tipo, motivo });

export const getReporteCajasIngresosDias = (desde, hasta, tipo) =>
  http.get('/reportes/cajas-ingresos-dias', { params: { desde, hasta, tipo } });

export const getReporteCajasIngresosPdfUrl = (desde, hasta, tipo) =>
  `${BASE_URL}/reportes/cajas-ingresos-pdf?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}&tipo=${encodeURIComponent(tipo)}`;

export const getReporteRhCxC = (desde, hasta, mecanico, linea) =>
  http.get('/reportes/rh-cxc', { params: { desde, hasta, mecanico: mecanico || undefined, ...paramsLinea(linea) } });

export const getReporteRhCxCPdfUrl = (desde, hasta, mecanico, linea) => {
  let url = `${BASE_URL}/reportes/rh-cxc-pdf?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
  if (mecanico) url += `&mecanico=${encodeURIComponent(mecanico)}`;
  return url + qLinea(linea);
};

export const getReporteHorasTecnico = (desde, hasta, estado, linea) =>
  http.get('/reportes/horas-tecnico', { params: { desde, hasta, estado: estado || undefined, ...paramsLinea(linea) } });

export const getReporteHorasTecnicoPdfUrl = (desde, hasta, estado, linea) => {
  let url = `${BASE_URL}/reportes/horas-tecnico-pdf?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
  if (estado) url += `&estado=${encodeURIComponent(estado)}`;
  return url + qLinea(linea);
};

export const getReportePendientesFactura = (desde, hasta, linea) =>
  http.get('/reportes/pendientes-factura', { params: { desde, hasta, ...paramsLinea(linea) } });

export const getReportePendientesFacturaPdfUrl = (desde, hasta, linea) =>
  `${BASE_URL}/reportes/pendientes-factura-pdf?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}${qLinea(linea)}`;

// ===== Clientes con Anticipos (saldo a favor) =====
// Es una fotografía del saldo actual, no un rango de fechas.
export const getReporteClientesAnticipos = () =>
  http.get('/reportes/clientes-anticipos');

export const getReporteClientesAnticiposPdfUrl = () =>
  `${BASE_URL}/reportes/clientes-anticipos-pdf`;

// ===== Cierre de Caja (por SESIÓN: una caja abierta hasta que se cierra a mano) =====

// Sin argumento -> la sesión de caja ABIERTA actual. Con id -> una sesión
// concreta (detalle del historial).
export const getCierreCaja = (id) =>
  http.get('/reportes/cierre-caja', { params: id ? { id } : {} });

export const guardarCierreCaja = (payload) =>
  http.post('/reportes/cierre-caja', payload);

// Cancela una captura (una ronda de "Guardar") mal hecha de la sesión abierta.
// Solo admin. capturaId puede ser 'baseline' para el movimiento inicial.
export const cancelarCapturaCierreCaja = (capturaId, motivo = '') =>
  http.post(`/reportes/cierre-caja/captura/${encodeURIComponent(capturaId)}/cancelar`, { motivo });

export const getHistorialCierresCaja = (desde, hasta) =>
  http.get('/reportes/cierre-caja/historial', { params: { desde, hasta } });

// Cierra la sesión de caja abierta.
export const cerrarCierreCaja = () =>
  http.post('/reportes/cierre-caja/cerrar', {});

// Reabre una sesión ya cerrada (solo admin, solo si no hay otra abierta).
export const restablecerCierreCaja = (id) =>
  http.post('/reportes/cierre-caja/restablecer', { id });

// Sólo consulta (no consume) el próximo folio, para mostrarlo al abrir el modal.
export const getValeCajaSiguienteFolio = () =>
  http.get('/reportes/cierre-caja/vale-siguiente-folio');

// Reclama el folio real; se llama al agregar el vale, no al abrir el modal.
export const confirmarValeCajaFolio = () =>
  http.post('/reportes/cierre-caja/vale-siguiente-folio', {});

// Sin argumento -> PDF de la sesión abierta; con id -> PDF de esa sesión.
export const getCierreCajaPdfUrl = (id) =>
  id
    ? `${BASE_URL}/reportes/cierre-caja/pdf?id=${encodeURIComponent(id)}`
    : `${BASE_URL}/reportes/cierre-caja/pdf`;
