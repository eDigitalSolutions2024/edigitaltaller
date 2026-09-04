const mongoose = require('mongoose');

// Log INTERNO de desarrollador. No hay ninguna ruta HTTP que lo exponga y
// ningún rol de la aplicación (tampoco 'auditoria') lo puede leer. Se consulta
// solo con acceso directo a Mongo o con backend/verRegistroAcciones.js.
//
// Retención: 15 días. Pasado ese plazo MongoDB borra la fila sola (índice TTL
// sobre expiresAt, igual que RefreshToken). Para cambiarlo sin recrear el
// índice: db.runCommand({ collMod: 'registroacciones',
//   index: { keyPattern: { expiresAt: 1 }, expireAfterSeconds: 0 } })
// y ajustar RETENCION_DIAS aquí (afecta solo a las filas nuevas).
const RETENCION_DIAS = 15;
const RETENCION_MS = RETENCION_DIAS * 24 * 60 * 60 * 1000;

const registroAccionSchema = new mongoose.Schema(
  {
    // Qué pasó. Prefijo por dominio: ORDEN_CERRAR, ORDEN_RESTABLECER,
    // ORDEN_CAMBIO_ESTADO, ORDEN_EDICION_BLOQUEADA, ...
    accion: { type: String, required: true },

    // A qué entidad afecta (por ahora siempre una orden = Vehiculo).
    entidad: { type: String, default: 'Vehiculo' },
    entidadId: { type: mongoose.Schema.Types.ObjectId },
    referencia: { type: String, default: '' }, // folio legible, p. ej. "OS-2025..."

    // Quién lo hizo (snapshot, no populate: la fila se autodestruye en 15 días).
    usuario: { type: String, default: '' },
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rol: { type: String, default: '' },
    ip: { type: String, default: '' },

    // Contexto HTTP.
    metodo: { type: String, default: '' },
    ruta: { type: String, default: '' },

    // ok:false = intento rechazado (p. ej. un asesor tratando de editar una
    // orden ya cerrada). Son las filas más interesantes para revisar.
    ok: { type: Boolean, default: true },

    // Payload libre: { de, a, motivo, msg, ... }
    detalle: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Ancla del TTL. Se fija al crear y ya no cambia.
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + RETENCION_MS),
    },
  },
  { timestamps: true, versionKey: false }
);

// MongoDB elimina automáticamente cada documento al llegar su expiresAt.
registroAccionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Consultas típicas del panel de auditoría (siempre orden cronológico inverso).
registroAccionSchema.index({ entidadId: 1, createdAt: -1 });
registroAccionSchema.index({ usuarioId: 1, createdAt: -1 });
registroAccionSchema.index({ accion: 1, createdAt: -1 });

module.exports = mongoose.model('RegistroAccion', registroAccionSchema);
module.exports.RETENCION_DIAS = RETENCION_DIAS;
