import http from './http';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';

// ─── Devolución de Refacciones (formato impreso) ─────────────────────────────

export const searchFacturasDevolucion = (q) =>
  http.get('/devoluciones/refaccion/facturas', { params: { q } });

export const prefillDevolucionRefaccion = (factura) =>
  http.get('/devoluciones/refaccion/prefill', { params: { factura } });

export const getDevolucionesRefaccion = (params) =>
  http.get('/devoluciones/refaccion', { params });

export const createDevolucionRefaccion = (payload) =>
  http.post('/devoluciones/refaccion', payload);

export const openDevolucionRefaccionPdf = (id) => {
  const url = `${BASE_URL}/devoluciones/refaccion/${id}/pdf`;
  window.open(url, '_blank', 'noopener');
};
