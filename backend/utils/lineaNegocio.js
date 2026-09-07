// backend/utils/lineaNegocio.js
//
// Línea de negocio: separa la operación histórica ('SERVICOMPACTO') de la
// cartera de clientes de Chirey ('CHIREY'). Las órdenes de Chirey comparten
// todo el sistema operativo (catálogo de refacciones, inventario, flujos de
// solicitar y surtir) pero NO aparecen en los reportes de Servicompacto.
//
// El valor se captura en el alta del cliente (Cliente.lineaNegocio) y se
// "sella" en cada orden al crearla (Vehiculo.lineaNegocio), copiándolo del
// cliente. Así los reportes filtran sobre la orden sin joins y una orden
// conserva su línea aunque el cliente se reclasifique después (mismo criterio
// que contratoOrdenServicio / creadoPorId / grupoId).

const LINEAS_NEGOCIO = ['SERVICOMPACTO', 'CHIREY'];
const LINEA_DEFAULT = 'SERVICOMPACTO';

// Normaliza cualquier entrada a una línea válida; lo desconocido cae al default.
function normalizaLineaNegocio(valor) {
  const v = String(valor || '').toUpperCase().trim();
  return LINEAS_NEGOCIO.includes(v) ? v : LINEA_DEFAULT;
}

// Filtro Mongo que EXCLUYE lo que no es de Servicompacto. Se esparce en todas
// las consultas de reportes (ver routes/reportes.js). El $ne (en vez de
// { $eq: 'SERVICOMPACTO' }) es defensivo: cubre documentos viejos sin el campo
// aunque el backfill ya debería haberlos rellenado.
const FILTRO_SERVICOMPACTO = { lineaNegocio: { $ne: 'CHIREY' } };

module.exports = {
  LINEAS_NEGOCIO,
  LINEA_DEFAULT,
  normalizaLineaNegocio,
  FILTRO_SERVICOMPACTO,
};
