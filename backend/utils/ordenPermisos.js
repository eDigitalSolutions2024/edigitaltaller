const Grupo = require('../models/Grupo');

// Estados "terminales": una orden aquí ya salió del flujo de taller. Solo se
// reabre por la vía oficial (PUT /:id/restablecer, solo admin) o aprobando un
// ticket RESTABLECER_OS. Ninguna ruta de edición normal debe sacarla de aquí.
const ESTADOS_TERMINALES = ['CERRADA', 'CANCELADA'];

function ordenEnEstadoTerminal(vehiculo) {
  return !!vehiculo && ESTADOS_TERMINALES.includes(vehiculo.estadoOrden);
}

// ¿Este usuario puede gestionar (cerrar, pedir restablecer, etc.) esta orden?
// Mismo criterio que condicionOrdenesPropias (routes/vehiculos.js) y el
// esPropia del frontend, pero evaluado sobre un documento ya cargado:
//   - admin: siempre
//   - el asesor dueño: por id estable (creadoPorId) o, en órdenes viejas sin
//     ese campo, por nombre (creadoPor)
//   - un compañero del grupo de trabajo timbrado en la orden (grupoId): alguien
//     que pertenece o perteneció a ese grupo con su mismo rol. Órdenes sin
//     grupoId nunca las abre un compañero: cada asesor solo cierra las suyas.
async function puedeGestionarOrden(user, vehiculo) {
  if (!user || !vehiculo) return false;
  if (user.role === 'admin') return true;

  const creadoPorId = vehiculo.creadoPorId ? String(vehiculo.creadoPorId) : '';
  if (creadoPorId && creadoPorId === String(user._id)) return true;
  if (vehiculo.creadoPor && vehiculo.creadoPor === (user.name || user.username)) return true;

  const grupoOrdenId = vehiculo.grupoId
    ? String(vehiculo.grupoId._id || vehiculo.grupoId)
    : '';
  if (grupoOrdenId) {
    const enGrupo = await Grupo.findOne({
      _id: grupoOrdenId,
      rol: user.role,
      historialMiembros: user._id,
    }).select('_id').lean();
    if (enGrupo) return true;
  }

  return false;
}

// Guard para las rutas de edición de la orden: si ya está CERRADA o CANCELADA,
// nadie salvo un admin puede seguir tocándola. Un asesor (aunque sea el dueño o
// un compañero de grupo) tiene que pedir el restablecimiento por ticket o que
// un admin la reabra desde Configuración de la Orden. Devuelve null si se puede
// continuar, o { status, msg } listo para responder si hay que cortar.
function bloquearSiOrdenTerminal(vehiculo, user) {
  if (!ordenEnEstadoTerminal(vehiculo)) return null;
  if (user && user.role === 'admin') return null;
  return {
    status: 409,
    msg:
      `La orden está ${vehiculo.estadoOrden}. No se puede editar ni reabrir directamente: ` +
      'solicita su restablecimiento (ticket "Restablecer OS") o pide a un administrador que la reabra.',
  };
}

module.exports = {
  ESTADOS_TERMINALES,
  ordenEnEstadoTerminal,
  puedeGestionarOrden,
  bloquearSiOrdenTerminal,
};
