const Vehiculo = require('../models/Vehiculo');
const ContratoOrdenServicio = require('../models/ContratoOrdenServicio');
const Grupo = require('../models/Grupo');
const { normalizaLineaNegocio } = require('./lineaNegocio');

// Campos de la orden de garantía que se copian a la orden de reemplazo
// cuando la garantía "No aplica". Mismo conjunto que ya arma
// buildPrefillNoAplica en frontend/src/pages/garantias/SolicitudesGarantia.jsx
// para el flujo manual de ModalCancelarGarantia -> VehiculoEntrada.
const CAMPOS_VEHICULO = [
  'marca', 'modelo', 'anio', 'color', 'serie', 'placas', 'kmsMillas',
  'nacionalidad', 'motor', 'numeroEconomico', 'traccion', 'nombreUsuarioDejaVehiculo',
];

const CAMPOS_SERVICIO_REPARACION = [
  'fallasReportadasCliente', 'infoLlantas', 'revisionFallas', 'fallasMotorOtros',
  'sistemaElectricoAire', 'suspensionDireccionFrenos', 'sistemaEnfriamiento',
];

// Resuelve un ticket GARANTIA_NO_APLICA como "Aplica": la garantía en sí
// sigue PENDIENTE (la aprobación formal —checkbox Autoriza Carreón + motivo—
// se sigue haciendo desde Solicitudes de Garantía, PUT /api/garantias/:id/resolver);
// aquí solo se desbloquea la orden para que el asesor pueda seguir editándola.
async function aplicarGarantia(ordenId) {
  const vehiculo = await Vehiculo.findById(ordenId);
  if (!vehiculo || !vehiculo.garantia) {
    const err = new Error('Solicitud de garantía no encontrada');
    err.status = 404;
    throw err;
  }

  vehiculo.garantia.ticketPendiente = null;
  await vehiculo.save();

  return vehiculo;
}

// Crea la orden de reemplazo (normal, sin garantía) de una garantía "No
// aplica" o negada (`razon` solo cambia el texto de las observaciones
// internas): mismos datos de ingreso que la orden original, sin servicios ni
// refacciones, y con el número de OS pendiente de capturar (queda sin folio;
// ver el guard de ordenServicioPendiente en el pre('save') de Vehiculo).
// Se asigna a `asesor` (documento User con role asesor_servicio) o, si no se
// indica, al mismo asesor de la orden original. El grupo de trabajo se
// re-timbra con el mismo criterio que reasignarAsesorOrden.
async function crearOrdenReemplazo(ordenGarantia, asesor, { razon = 'no aplicada' } = {}) {
  const vehiculoData = {};
  for (const campo of CAMPOS_VEHICULO) vehiculoData[campo] = ordenGarantia[campo] || '';

  const servicioReparacion = {};
  for (const campo of CAMPOS_SERVICIO_REPARACION) {
    servicioReparacion[campo] = ordenGarantia.servicioReparacion?.[campo] || '';
  }

  const ahora = new Date();
  const horaRecepcion = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;

  // Misma regla que POST /api/vehiculos: la orden nueva se fija a la versión
  // del contrato vigente al crearla, no a la última en el momento de imprimir.
  const contratoVigente = await ContratoOrdenServicio.getOrCreate();

  let creadoPor = ordenGarantia.creadoPor || '';
  let creadoPorId = ordenGarantia.creadoPorId || null;
  let grupoId = ordenGarantia.grupoId || null;
  if (asesor) {
    creadoPor = asesor.name;
    creadoPorId = asesor._id;
    const grupoActivo = await Grupo.findOne({
      activo: true,
      rol: asesor.role,
      miembros: asesor._id,
    }).select('_id');
    grupoId = grupoActivo ? grupoActivo._id : null;
  }

  const ordenReemplazo = new Vehiculo({
    cliente: ordenGarantia.cliente,
    sinVehiculo: ordenGarantia.sinVehiculo,
    ...vehiculoData,
    inspeccionFisica: ordenGarantia.inspeccionFisica || {},
    servicioReparacion,
    estadoOrden: 'INGRESO',
    fechaRecepcion: ahora,
    horaRecepcion,
    creadoPor,
    creadoPorId,
    grupoId,
    // La orden de reemplazo hereda la línea de negocio de la orden original.
    lineaNegocio: normalizaLineaNegocio(ordenGarantia.lineaNegocio),
    contratoOrdenServicio: contratoVigente._id,
    ordenServicio: '',
    ordenServicioPendiente: true,
    observacionesInternas: `Orden de reemplazo por garantía ${razon} sobre la orden ${ordenGarantia.ordenServicio}.`,
  });
  await ordenReemplazo.save();

  return ordenReemplazo;
}

// Resuelve un ticket GARANTIA_NO_APLICA como "No aplica": marca la garantía
// como NO_APLICA, cancela la orden (mismo efecto combinado que hoy hacen
// PUT /api/garantias/:id/resolver [NO_APLICA] + PUT /api/garantias/:id/cancelar
// por separado) y crea automáticamente la orden de reemplazo para el mismo
// asesor, pendiente de capturar el número de OS.
async function noAplicaGarantia(ordenId, resueltoPor) {
  const ordenGarantia = await Vehiculo.findById(ordenId);
  if (!ordenGarantia || !ordenGarantia.garantia) {
    const err = new Error('Solicitud de garantía no encontrada');
    err.status = 404;
    throw err;
  }
  if (ordenGarantia.garantia.estado !== 'PENDIENTE') {
    const err = new Error('La solicitud de garantía ya fue resuelta.');
    err.status = 400;
    throw err;
  }

  ordenGarantia.garantia.estado = 'NO_APLICA';
  ordenGarantia.garantia.fechaResolucion = new Date();
  ordenGarantia.garantia.resueltoPor = resueltoPor || '';
  ordenGarantia.garantia.ticketPendiente = null;
  // Defensivo: nunca debe existir fila garantía sin aprobación (mismo criterio
  // que PUT /api/garantias/:id/resolver)
  ordenGarantia.ventaCliente = (ordenGarantia.ventaCliente || []).filter((r) => !r.esGarantia);

  ordenGarantia.estadoAnterior = ordenGarantia.estadoOrden;
  ordenGarantia.estadoOrden = 'CANCELADA';
  await ordenGarantia.save();

  const ordenReemplazo = await crearOrdenReemplazo(ordenGarantia);

  return { ordenGarantia, ordenReemplazo };
}

module.exports = { aplicarGarantia, noAplicaGarantia, crearOrdenReemplazo };
