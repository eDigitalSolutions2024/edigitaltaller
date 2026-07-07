const mongoose = require('mongoose');
const { Schema } = mongoose;

const ESTATUS_VALE = [
  'Contado',
  'Credito',
  'Salida Provisional',
  'Cortesia',
  'Cancelada',
  'Garantia',
  'Cobrado en Otra',
];

const valeSalidaSchema = new Schema(
  {
    noOrden: { type: String, required: true, trim: true },
    vehiculo: { type: Schema.Types.ObjectId, ref: 'Vehiculo', default: null },

    fecha: { type: Date, default: Date.now },
    noVale: { type: Number, required: true },
    dig: { type: Number, default: 0 },

    quienEntrega: { type: String, default: '' },
    cajero: { type: String, default: '' },
    asesor: { type: String, default: '' },

    estatus: { type: String, enum: ESTATUS_VALE, default: 'Contado' },

    // snapshot de datos del cliente/vehículo al momento de emitir el vale
    nombreCliente: { type: String, default: '' },
    marca: { type: String, default: '' },
    tipo: { type: String, default: '' },
    modelo: { type: String, default: '' },
    color: { type: String, default: '' },
    serie: { type: String, default: '' },
    placas: { type: String, default: '' },
    kms: { type: String, default: '' },

    observaciones: { type: String, default: '' },
  },
  { timestamps: true }
);

valeSalidaSchema.index({ noVale: 1 });

module.exports = mongoose.model('ValeSalida', valeSalidaSchema);
module.exports.ESTATUS_VALE = ESTATUS_VALE;
