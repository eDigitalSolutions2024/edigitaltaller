// backend/utils/reasignarAsesor.js
const Vehiculo = require('../models/Vehiculo');
const User = require('../models/User');
const Grupo = require('../models/Grupo');

// Reasigna una orden a otro asesor de servicio, actualizando creadoPor/
// creadoPorId. Usado tanto por PUT /vehiculos/:id/cambiar-asesor (admin
// directo) como por la aprobación de tickets CAMBIO_ASESOR.
async function reasignarAsesorOrden(ordenId, asesorId) {
  const vehiculo = await Vehiculo.findById(ordenId);
  if (!vehiculo) {
    const err = new Error('Orden no encontrada');
    err.status = 404;
    throw err;
  }

  const asesor = await User.findOne({ _id: asesorId, role: 'asesor_servicio', isActive: true });
  if (!asesor) {
    const err = new Error('Asesor no encontrado o inactivo.');
    err.status = 404;
    throw err;
  }

  vehiculo.creadoPor = asesor.name;
  vehiculo.creadoPorId = asesor._id;

  // Re-timbrar el grupo de trabajo con el MISMO criterio que el alta de la
  // orden (ver routes/vehiculos.js POST /). Si no se hiciera, la orden
  // conservaría el grupoId del asesor anterior y sus compañeros de ese grupo
  // seguirían pudiendo editarla (ver puedeGestionarOrden / condicionOrdenesPropias)
  // aunque el nuevo asesor no pertenezca a él. Queda en null si el nuevo
  // asesor no está en ningún grupo activo: entonces solo él la trabaja.
  const grupoActivo = await Grupo.findOne({
    activo: true,
    rol: asesor.role,
    miembros: asesor._id,
  }).select('_id');
  vehiculo.grupoId = grupoActivo ? grupoActivo._id : null;

  await vehiculo.save();

  return vehiculo;
}

module.exports = { reasignarAsesorOrden };
