import http from './http';

const API = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';

export const getTiposCambio = () =>
  http.get('/configuracion/tipo-cambio').then(r => r.data);

export const crearTipoCambio = (payload) =>
  http.post('/configuracion/tipo-cambio', payload).then(r => r.data);

export const getUltimoTipoCambio = () =>
  http.get('/configuracion/tipo-cambio/ultimo').then(r => r.data);

export const getTipoCambioSie = () =>
  http.get('/configuracion/tipo-cambio/sie').then(r => r.data);

export const getHistorialComparadoTipoCambio = () =>
  http.get('/configuracion/tipo-cambio/historial-comparado').then(r => r.data);

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

export const getNotaVentaContador = () =>
  http.get('/configuracion/nota-venta-contador').then(r => r.data);

export const actualizarNotaVentaContador = (valor) =>
  http.put('/configuracion/nota-venta-contador', { valor }).then(r => r.data);

export const getRemisionContador = () =>
  http.get('/configuracion/remision-contador').then(r => r.data);

export const actualizarRemisionContador = (valor) =>
  http.put('/configuracion/remision-contador', { valor }).then(r => r.data);

export const getValeCajaContador = () =>
  http.get('/configuracion/vale-caja-contador').then(r => r.data);

export const actualizarValeCajaContador = (valor) =>
  http.put('/configuracion/vale-caja-contador', { valor }).then(r => r.data);

export const getOrdenCompraContador = () =>
  http.get('/configuracion/orden-compra-contador').then(r => r.data);

export const actualizarOrdenCompraContador = (valor) =>
  http.put('/configuracion/orden-compra-contador', { valor }).then(r => r.data);

// Folio propio de la Nota de crédito CFDI (serie fija "NC"), independiente del folio
// compartido por Factura/Complemento/Global.
export const getNotaCreditoContador = () =>
  http.get('/configuracion/nota-credito-contador').then(r => r.data);

export const actualizarNotaCreditoContador = (valor) =>
  http.put('/configuracion/nota-credito-contador', { valor }).then(r => r.data);

// Número de cuenta del taller en cada banco (RFC de cada banco viene fijo del
// catálogo) — para el "RFC Banco Emisor"/"Num Cuenta" del PDF de un Complemento
// de pago pagado por transferencia.
export const getCuentasBancarias = () =>
  http.get('/configuracion/cuentas-bancarias').then(r => r.data);

export const actualizarCuentasBancarias = (cuentas) =>
  http.put('/configuracion/cuentas-bancarias', { cuentas }).then(r => r.data);

export const getFondoCaja = () =>
  http.get('/configuracion/fondo-caja').then(r => r.data);

export const actualizarFondoCaja = (valor) =>
  http.put('/configuracion/fondo-caja', { valor }).then(r => r.data);

// ¿Se exige el UUID real al relacionar facturas? (solo pruebas mientras no se timbra)
export const getExigirUuid = () =>
  http.get('/configuracion/exigir-uuid').then(r => r.data);

export const actualizarExigirUuid = (valor) =>
  http.put('/configuracion/exigir-uuid', { valor }).then(r => r.data);

// Datos del sitio/sucursal (nombre, dirección, teléfono, si es matriz) que
// se imprimen en reportes y documentos.
export const getSitioConfig = () =>
  http.get('/configuracion/sitio').then(r => r.data);

export const actualizarSitioConfig = (payload) =>
  http.put('/configuracion/sitio', payload).then(r => r.data);

export const getContratoOrdenServicio = () =>
  http.get('/configuracion/contrato-orden-servicio').then(r => r.data);

export const actualizarContratoOrdenServicio = (payload) =>
  http.put('/configuracion/contrato-orden-servicio', payload).then(r => r.data);

export const getHistorialContratoOrdenServicio = () =>
  http.get('/configuracion/contrato-orden-servicio/historial').then(r => r.data);

// Sin token: se abre directo en el visor de PDF (ver PdfViewer/usePdfModal),
// igual que el resto de los PDFs de vehiculos.js.
export const getContratoOrdenServicioPdfUrl = (versionId) =>
  `${API}/configuracion/contrato-orden-servicio/historial/${versionId}/pdf`;
