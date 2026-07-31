const mongoose = require('mongoose');
const { Schema } = mongoose;

// Denominaciones fijas del formato en papel (billetes y monedas de curso legal).
const DENOMINACIONES_BILLETES = [1000, 500, 200, 100, 50, 20];
const DENOMINACIONES_MONEDAS = [10, 5, 2, 1, 0.5, 0.2, 0.1];

const conteoSchema = new Schema(
  {
    denominacion: { type: Number, required: true },
    cantidad: { type: Number, default: 0 },
  },
  { _id: false }
);

const valeCajaSchema = new Schema(
  {
    folio: { type: String, default: '' },
    monto: { type: Number, default: 0 },
  },
  { _id: false }
);

const cierreCajaSchema = new Schema(
  {
    // Medianoche UTC del día que se cierra (ver utils/fechaSoloDia).
    fecha: { type: Date, required: true },

    billetes: [conteoSchema],
    monedas: [conteoSchema],

    terminales: {
      bancomer: { type: Number, default: 0 },
      banregio: { type: Number, default: 0 },
      banamex: { type: Number, default: 0 },
      americanExpress: { type: Number, default: 0 },
      cheques: { type: Number, default: 0 },
      transferencias: { type: Number, default: 0 },
    },

    dolares: {
      cantidad: { type: Number, default: 0 },
      tipoCambio: { type: Number, default: 0 },
    },

    // Vales de caja capturados en el formato; su efecto sobre los totales
    // todavía no está definido (pendiente de negocio), se guardan tal cual.
    vales: [valeCajaSchema],

    // Pendientes de automatizar: por ahora se capturan a mano en el formulario.
    totalReportes: { type: Number, default: 0 },
    fondoCaja: { type: Number, default: 0 },

    capturadoPor: { type: String, default: '' },
  },
  { timestamps: true }
);

cierreCajaSchema.index({ fecha: 1 }, { unique: true });

module.exports = mongoose.model('CierreCaja', cierreCajaSchema);
module.exports.DENOMINACIONES_BILLETES = DENOMINACIONES_BILLETES;
module.exports.DENOMINACIONES_MONEDAS = DENOMINACIONES_MONEDAS;
