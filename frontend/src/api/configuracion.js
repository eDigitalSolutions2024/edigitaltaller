import http from './http';

export const getTiposCambio = () =>
  http.get('/configuracion/tipo-cambio').then(r => r.data);

export const crearTipoCambio = (payload) =>
  http.post('/configuracion/tipo-cambio', payload).then(r => r.data);

export const getUnidadesMedida = () =>
  http.get('/configuracion/unidades-medida').then(r => r.data);

export const crearUnidadMedida = (payload) =>
  http.post('/configuracion/unidades-medida', payload).then(r => r.data);

export const cambiarEstadoUnidad = (id, activo) =>
  http.patch(`/configuracion/unidades-medida/${id}/status`, { activo }).then(r => r.data);

export const getMecanicos = () =>
  http.get('/configuracion/mecanicos').then(r => r.data);

export const crearMecanico = (payload) =>
  http.post('/configuracion/mecanicos', payload).then(r => r.data);

export const cambiarEstadoMecanico = (id, activo) =>
  http.patch(`/configuracion/mecanicos/${id}/status`, { activo }).then(r => r.data);
