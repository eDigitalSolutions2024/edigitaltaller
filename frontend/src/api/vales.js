import http from './http';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';

export const ESTATUS_VALE_OPCIONES = [
  'Contado',
  'Credito',
  'Salida Provisional',
  'Cortesia',
  'Cancelada',
  'Garantia',
  'Cobrado en Otra',
];

export const getSiguienteNumeroVale = () => http.get('/vales/siguiente-numero');

export const getSiguienteDig = (noVale) => http.get('/vales/siguiente-dig', { params: { noVale } });

export const buscarOrdenParaVale = (noOrden) => http.get(`/vales/buscar-orden/${encodeURIComponent(noOrden)}`);

export const getVales = (params) => http.get('/vales', { params });

export const getVale = (id) => http.get(`/vales/${id}`);

export const createVale = (payload) => http.post('/vales', payload);

export const updateVale = (id, payload) => http.put(`/vales/${id}`, payload);

export const openValePdf = (id) => {
  const url = `${BASE_URL}/vales/${id}/pdf`;
  window.open(url, '_blank', 'noopener');
};
