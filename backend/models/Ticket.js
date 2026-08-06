const mongoose = require('mongoose');
const { Schema } = mongoose;

const TIPOS_PROBLEMA = [
  'VEHICULOS_ORDENES',
  'RESTABLECER_OS',
  'CAMBIO_ASESOR',
  'CAJAS',
  'REFACCIONARIA',
  'FACTURACION',
  'CLIENTES_PROVEEDORES',
  'REPORTES_CONFIGURACION',
  'OTRO',
];

const RESULTADOS_TICKET = ['APROBADO', 'RECHAZADO'];

const ESTADOS_TICKET = ['PENDIENTE', 'EN_PROCESO', 'FINALIZADO'];

const ticketSchema = new Schema(
  {
    folio: { type: String, required: true, unique: true, trim: true },

    usuarioReporta: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    nombreUsuarioReporta: { type: String, default: '' },

    tipoProblema: { type: String, enum: TIPOS_PROBLEMA, required: true },
    detalle: { type: String, required: true, trim: true },

    // Orden de servicio vinculada (opcional). Se guarda también el folio como
    // snapshot para poder listar tickets sin necesidad de popular.
    ordenServicio: { type: Schema.Types.ObjectId, ref: 'Vehiculo', default: null },
    folioOrdenServicio: { type: String, default: '' },

    // Solo para tipoProblema === 'CAMBIO_ASESOR': el asesor destino que el
    // solicitante pide para la orden. Snapshot de nombre igual que arriba.
    asesorSolicitadoId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    asesorSolicitadoNombre: { type: String, default: '' },

    estado: {
      type: String,
      enum: ESTADOS_TICKET,
      default: 'PENDIENTE',
      index: true,
    },
    // Solo aplica a tickets resueltos vía aprobar/negar (hoy: CAMBIO_ASESOR).
    resultado: { type: String, enum: RESULTADOS_TICKET, default: null },
    fechaCambioEstado: { type: Date, default: null },
    actualizadoPor: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Ticket', ticketSchema);
module.exports.TIPOS_PROBLEMA = TIPOS_PROBLEMA;
module.exports.ESTADOS_TICKET = ESTADOS_TICKET;
module.exports.RESULTADOS_TICKET = RESULTADOS_TICKET;
