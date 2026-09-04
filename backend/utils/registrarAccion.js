const RegistroAccion = require('../models/RegistroAccion');

function ipDe(req) {
  if (!req) return '';
  const xff = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.ip || req.connection?.remoteAddress || '';
}

// Escribe una fila en el log de acciones. FIRE-AND-FORGET a propósito: no se
// hace await y cualquier error se traga con un console.error. El log nunca
// debe frenar ni tumbar la petición que lo genera.
//
//   registrarAccion(req, {
//     accion: 'ORDEN_RESTABLECER',
//     entidadId: vehiculo._id,
//     referencia: vehiculo.ordenServicio,
//     detalle: { de: 'CERRADA', a: 'PENDIENTE_CERRAR', motivo },
//   });
function registrarAccion(
  req,
  { accion, entidad = 'Vehiculo', entidadId = null, referencia = '', ok = true, detalle = {} } = {}
) {
  try {
    if (!accion) return;
    const u = req && req.user;
    RegistroAccion.create({
      accion,
      entidad,
      entidadId: entidadId || null,
      referencia: referencia || '',
      usuario: (u && (u.name || u.username || u.email)) || '',
      usuarioId: (u && u._id) || null,
      rol: (u && u.role) || '',
      ip: ipDe(req),
      metodo: (req && req.method) || '',
      ruta: (req && (req.originalUrl || req.url)) || '',
      ok,
      detalle: detalle || {},
    }).catch((err) => console.error('registrarAccion (no crítico):', err.message));
  } catch (err) {
    console.error('registrarAccion (no crítico):', err.message);
  }
}

module.exports = { registrarAccion };
