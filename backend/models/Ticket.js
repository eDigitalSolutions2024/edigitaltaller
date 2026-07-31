const mongoose = require('mongoose');
const { Schema } = mongoose;

const TIPOS_PROBLEMA = [
  'VEHICULOS_ORDENES',
  'RESTABLECER_OS',
  'CAJAS',
  'REFACCIONARIA',
  'FACTURACION',
  'CLIENTES_PROVEEDORES',
  'REPORTES_CONFIGURACION',
  'OTRO',
];

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

    estado: {
      type: String,
      enum: ESTADOS_TICKET,
      default: 'PENDIENTE',
      index: true,
    },
    fechaCambioEstado: { type: Date, default: null },
    actualizadoPor: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Ticket', ticketSchema);
module.exports.TIPOS_PROBLEMA = TIPOS_PROBLEMA;
module.exports.ESTADOS_TICKET = ESTADOS_TICKET;
