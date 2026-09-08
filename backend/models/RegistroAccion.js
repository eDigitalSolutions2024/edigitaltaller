const mongoose = require('mongoose');

// Log de actividad del sistema. Lo alimenta:
//   - middleware/auditoria.js  -> toda creación/modificación/cancelación por
//     HTTP (origen: 'auto')
//   - utils/registrarAccion.js -> eventos de dominio con más contexto, sobre
//     todo intentos bloqueados (origen: 'manual')
// Lo lee SOLO el rol 'admin', vía GET /api/auditoria/registro y la pantalla
// "Registro de Actividad" del submenú Administración. También sigue disponible
// el script de consola backend/verRegistroAcciones.js.
//
// Retención: 15 días. Pasado ese plazo MongoDB borra la fila sola (índice TTL
// sobre expiresAt, igual que RefreshToken). Para cambiarlo sin recrear el
// índice: db.runCommand({ collMod: 'registroacciones',
//   index: { keyPattern: { expiresAt: 1 }, expireAfterSeconds: 0 } })
// y ajustar RETENCION_DIAS aquí (afecta solo a las filas nuevas). El endpoint
// además filtra por createdAt para no mostrar nada fuera de esa ventana aunque
// el TTL vaya retrasado.
const RETENCION_DIAS = 15;
const RETENCION_MS = RETENCION_DIAS * 24 * 60 * 60 * 1000;

const registroAccionSchema = new mongoose.Schema(
  {
    // Qué pasó. Filas automáticas: verbo simple (CREAR, MODIFICAR, ELIMINAR,
    // CANCELAR, ACTIVAR, DESACTIVAR). Filas de dominio: prefijo (ORDEN_CERRAR,
    // ORDEN_RESTABLECER, ORDEN_CAMBIO_ESTADO, ORDEN_EDICION_BLOQUEADA, ...).
    accion: { type: String, required: true },

    // Recurso afectado. Filas automáticas: primer segmento de la ruta
    // (cajas, clientes, vehiculos, facturacion, ...). Filas de dominio:
    // nombre del modelo (Vehiculo).
    entidad: { type: String, default: 'Vehiculo' },
    entidadId: { type: mongoose.Schema.Types.ObjectId },
    referencia: { type: String, default: '' }, // folio/id legible, p. ej. "OS-2025..."

    // 'auto'   -> lo escribió el middleware global de auditoría
    // 'manual' -> lo escribió una ruta con utils/registrarAccion.js
    origen: { type: String, enum: ['auto', 'manual'], default: 'manual' },

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
registroAccionSchema.index({ createdAt: -1 });
registroAccionSchema.index({ entidadId: 1, createdAt: -1 });
registroAccionSchema.index({ usuarioId: 1, createdAt: -1 });
registroAccionSchema.index({ accion: 1, createdAt: -1 });
registroAccionSchema.index({ entidad: 1, createdAt: -1 });

module.exports = mongoose.model('RegistroAccion', registroAccionSchema);
module.exports.RETENCION_DIAS = RETENCION_DIAS;
