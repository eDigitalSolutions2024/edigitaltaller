const Vehiculo = require('../models/Vehiculo');
const ContratoOrdenServicio = require('../models/ContratoOrdenServicio');

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

  const ordenReemplazo = new Vehiculo({
    cliente: ordenGarantia.cliente,
    sinVehiculo: ordenGarantia.sinVehiculo,
    ...vehiculoData,
    inspeccionFisica: ordenGarantia.inspeccionFisica || {},
    servicioReparacion,
    estadoOrden: 'INGRESO',
    fechaRecepcion: ahora,
    horaRecepcion,
    creadoPor: ordenGarantia.creadoPor || '',
    creadoPorId: ordenGarantia.creadoPorId || null,
    grupoId: ordenGarantia.grupoId || null,
    contratoOrdenServicio: contratoVigente._id,
    observacionesInternas: `Orden de reemplazo por garantía no aplicada sobre la orden ${ordenGarantia.ordenServicio}.`,
  });
  // El pre('save') de Vehiculo genera un folio temporal si ordenServicio
  // viene vacío; se limpia justo después con findByIdAndUpdate (no dispara
  // ese hook), mismo mecanismo que ya tolera PUT /vehiculos/:id/datos para
  // dejar el folio en blanco.
  await ordenReemplazo.save();
  await Vehiculo.findByIdAndUpdate(ordenReemplazo._id, {
    ordenServicio: '',
    ordenServicioPendiente: true,
  });
  ordenReemplazo.ordenServicio = '';
  ordenReemplazo.ordenServicioPendiente = true;

  return { ordenGarantia, ordenReemplazo };
}

module.exports = { aplicarGarantia, noAplicaGarantia };
