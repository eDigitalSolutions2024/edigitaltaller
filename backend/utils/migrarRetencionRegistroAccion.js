const mongoose = require('mongoose');
const RegistroAccion = require('../models/RegistroAccion');

const RETENCION_DIAS = RegistroAccion.RETENCION_DIAS || 30;
const RETENCION_MS = RETENCION_DIAS * 24 * 60 * 60 * 1000;
const TOLERANCIA_MS = 24 * 60 * 60 * 1000;

// Migración idempotente de la retención del log de actividad.
//
// Flujo: al crear cada fila se fija `expiresAt = createdAt + RETENCION_DIAS` y
// el índice TTL sobre `expiresAt` la borra sola al vencer. Cuando se cambia
// RETENCION_DIAS (p. ej. 15 -> 30) las filas YA creadas siguen con el
// `expiresAt` viejo, así que se borrarían antes de tiempo. Esto las reajusta
// a `createdAt + RETENCION_DIAS` para que TODAS respeten el mismo plazo.
//
// Solo toca las filas cuyo `expiresAt` no cuadra con la ventana actual
// (± 1 día de tolerancia), de modo que en reinicios posteriores no hace nada.
// Se llama una vez al arrancar el servidor; nunca tumba el arranque.
async function migrarRetencionRegistroAccion() {
  try {
    if (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => mongoose.connection.once('open', resolve));
    }

    const res = await RegistroAccion.updateMany(
      {
        $expr: {
          $gt: [
            {
              $abs: {
                $subtract: [
                  { $subtract: ['$expiresAt', '$createdAt'] },
                  RETENCION_MS,
                ],
              },
            },
            TOLERANCIA_MS,
          ],
        },
      },
      [{ $set: { expiresAt: { $add: ['$createdAt', RETENCION_MS] } } }]
    );

    if (res.modifiedCount) {
      console.log(
        `[migrarRetencionRegistroAccion] expiresAt reajustado a ${RETENCION_DIAS} días en ${res.modifiedCount} fila(s)`
      );
    }
  } catch (err) {
    console.error('[migrarRetencionRegistroAccion] error (no crítico):', err.message);
  }
}

module.exports = { migrarRetencionRegistroAccion };
