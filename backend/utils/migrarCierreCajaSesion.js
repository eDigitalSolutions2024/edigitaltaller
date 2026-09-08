const mongoose = require('mongoose');
const CierreCaja = require('../models/CierreCaja');

// Migración idempotente al modelo de "sesión de caja" (una caja abierta a la
// vez, sin atar a un día calendario):
//   1. Quita el índice ÚNICO viejo `fecha_1` — ahora puede haber varias
//      sesiones abiertas el mismo día (abrir/cerrar/abrir).
//   2. Rellena `abiertaEn` en los documentos viejos (= su `fecha`) para que
//      los sorts por sesión funcionen.
// Se llama una vez al arrancar el servidor; nunca tumba el arranque.
async function migrarCierreCajaSesion() {
  try {
    if (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => mongoose.connection.once('open', resolve));
    }

    const coll = CierreCaja.collection;
    const indexes = await coll.indexes().catch(() => []);
    const fechaIdx = indexes.find((i) => i.name === 'fecha_1');
    if (fechaIdx && fechaIdx.unique) {
      await coll.dropIndex('fecha_1');
      console.log('[migrarCierreCajaSesion] índice único fecha_1 eliminado');
    }

    const sinAbiertaEn = await CierreCaja.find({ abiertaEn: null }).select('fecha createdAt').lean();
    for (const d of sinAbiertaEn) {
      await CierreCaja.updateOne(
        { _id: d._id },
        { $set: { abiertaEn: d.fecha || d.createdAt || new Date() } }
      );
    }
    if (sinAbiertaEn.length) {
      console.log(`[migrarCierreCajaSesion] abiertaEn rellenado en ${sinAbiertaEn.length} documento(s)`);
    }

    // En el modelo por SESIÓN solo puede haber UNA caja ABIERTA a la vez. Si
    // hay varias, es el estado heredado del modelo por-día (un doc ABIERTA por
    // cada día que nunca se cerró): se cierran todas menos la más reciente,
    // que pasa a ser la sesión actual. Solo corre cuando hay >1 (una sesión
    // legítima que cruza la medianoche NO se toca en reinicios posteriores).
    const abiertas = await CierreCaja.countDocuments({ estado: 'ABIERTA' });
    if (abiertas > 1) {
      const actual = await CierreCaja.findOne({ estado: 'ABIERTA' })
        .sort({ abiertaEn: -1 })
        .select('_id')
        .lean();
      const viejas = await CierreCaja.find({
        estado: 'ABIERTA',
        _id: { $ne: actual._id },
      }).select('fecha').lean();
      for (const d of viejas) {
        const finDia = new Date(d.fecha);
        finDia.setUTCHours(23, 59, 59, 999);
        await CierreCaja.updateOne(
          { _id: d._id },
          { $set: { estado: 'CERRADA', cerradoEn: finDia, cerradoPor: 'Sistema (migración a sesión de caja)' } }
        );
      }
      console.log(`[migrarCierreCajaSesion] ${viejas.length} caja(s) huérfanas del modelo por-día marcadas como cerradas`);
    }

    // Ya con como mucho UNA sesión ABIERTA, se puede crear el índice de
    // integridad (autoIndex de Mongoose habría fallado con duplicados).
    await coll
      .createIndex(
        { estado: 1 },
        { unique: true, partialFilterExpression: { estado: 'ABIERTA' }, name: 'una_sesion_abierta' }
      )
      .catch((e) => console.error('[migrarCierreCajaSesion] no se pudo crear índice una_sesion_abierta:', e.message));
  } catch (err) {
    console.error('[migrarCierreCajaSesion] error (no crítico):', err.message);
  }
}

module.exports = { migrarCierreCajaSesion };
