// backend/utils/reasignarAsesor.js
const Vehiculo = require('../models/Vehiculo');
const User = require('../models/User');

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
  await vehiculo.save();

  return vehiculo;
}

module.exports = { reasignarAsesorOrden };
