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

export const getOrdenServicioContador = () =>
  http.get('/configuracion/orden-servicio-contador').then(r => r.data);

export const actualizarOrdenServicioContador = (valor) =>
  http.put('/configuracion/orden-servicio-contador', { valor }).then(r => r.data);

export const getValeContador = () =>
  http.get('/configuracion/vale-contador').then(r => r.data);

export const actualizarValeContador = (valor) =>
  http.put('/configuracion/vale-contador', { valor }).then(r => r.data);

export const getDevolucionRefaccionContador = () =>
  http.get('/configuracion/devolucion-refaccion-contador').then(r => r.data);

export const actualizarDevolucionRefaccionContador = (valor) =>
  http.put('/configuracion/devolucion-refaccion-contador', { valor }).then(r => r.data);
