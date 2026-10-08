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

// Filtro Mongo para INVENTARIO (entradas, salidas, ajustes, ubicaciones):
// cada línea tiene su propio almacén, así que siempre se filtra por una de las
// dos. Sin valor => Servicompacto (el inventario histórico, incluidos los
// documentos viejos sin el campo).
function filtroInventario(valor) {
  return normalizaLineaNegocio(valor) === 'CHIREY'
    ? { lineaNegocio: 'CHIREY' }
    : FILTRO_SERVICOMPACTO;
}

// Filtro Mongo para REPORTES: sin valor (o desconocido) => todas las líneas
// (comportamiento histórico); 'CHIREY' / 'SERVICOMPACTO' => solo esa.
function filtroReporte(valor) {
  const v = String(valor || '').toUpperCase().trim();
  if (v === 'CHIREY') return { lineaNegocio: 'CHIREY' };
  if (v === 'SERVICOMPACTO') return FILTRO_SERVICOMPACTO;
  return {};
}

module.exports = {
  LINEAS_NEGOCIO,
  LINEA_DEFAULT,
  normalizaLineaNegocio,
  FILTRO_SERVICOMPACTO,
  filtroInventario,
  filtroReporte,
};
