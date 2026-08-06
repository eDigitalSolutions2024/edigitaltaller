// backend/utils/backfillCreadoPorId.js
//
// Rellena Vehiculo.creadoPorId para órdenes existentes, resolviendo el
// nombre guardado en creadoPor contra la colección User actual. Usado tanto
// por el script de línea de comandos (backend/scripts/backfillCreadoPorId.js)
// como por el endpoint de admin en Personal del Taller.
//
// Limitación conocida: si un asesor ya fue renombrado en Personal ANTES de
// correr esto, el creadoPor de sus órdenes viejas quedó "congelado" con el
// nombre anterior y ya no coincide con ningún User actual — no se puede
// recuperar automáticamente (no existe historial de nombres). Esas órdenes
// quedan reportadas como "sinResolver" para reasignar a mano si hace falta;
// mientras tanto siguen siendo visibles por el fallback a creadoPor que ya
// tienen las consultas.
const Vehiculo = require('../models/Vehiculo');
const User = require('../models/User');

async function backfillCreadoPorId({ dryRun = false } = {}) {
  const ordenes = await Vehiculo.find({
    creadoPor: { $nin: [null, ''] },
    creadoPorId: null,
  }).select('_id ordenServicio creadoPor');

  const cacheUsuarios = new Map(); // nombre/username -> [User]
  let actualizadas = 0;
  const ambiguas = [];
  const sinResolver = [];

  for (const orden of ordenes) {
    const nombre = orden.creadoPor;

    let candidatos = cacheUsuarios.get(nombre);
    if (candidatos === undefined) {
      candidatos = await User.find({
        $or: [{ name: nombre }, { username: nombre }],
      }).select('_id name username');
      cacheUsuarios.set(nombre, candidatos);
    }

    if (candidatos.length === 1) {
      if (!dryRun) {
        await Vehiculo.updateOne(
          { _id: orden._id },
          { $set: { creadoPorId: candidatos[0]._id } }
        );
      }
      actualizadas++;
    } else if (candidatos.length > 1) {
      ambiguas.push({
        orden: orden.ordenServicio,
        nombre,
        opciones: candidatos.map((c) => c.username),
      });
    } else {
      sinResolver.push({ orden: orden.ordenServicio, nombre });
    }
  }

  return {
    dryRun,
    totalPendientes: ordenes.length,
    actualizadas,
    ambiguas,
    sinResolver,
  };
}

module.exports = { backfillCreadoPorId };
