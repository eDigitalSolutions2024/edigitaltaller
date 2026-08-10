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
    motivo: { type: String, default: '' },
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
      banorte: { type: Number, default: 0 },
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

    // totalReportes y fondoCaja se recalculan server-side (pagos del día /
    // Configuración, ver utils/totalIngresosDia y GET /reportes/cierre-caja)
    // mientras la caja sigue ABIERTA, y se congelan al cerrar.
    totalReportes: { type: Number, default: 0 },
    fondoCaja: { type: Number, default: 0 },

    capturadoPor: { type: String, default: '' },

    // ABIERTA: el día se sigue capturando desde Gestión de Caja (editable).
    // CERRADA: el reporte quedó congelado, solo lectura desde Reportes.
    estado: { type: String, enum: ['ABIERTA', 'CERRADA'], default: 'ABIERTA' },
    cerradoEn: { type: Date, default: null },
    cerradoPor: { type: String, default: '' },

    // Un admin puede reabrir un día ya cerrado (directo, o al aprobar un
    // ticket RESTABLECER_CAJA solicitado por el rol cajas) — ver
    // utils/restablecerCierreCajaDia. Se conserva lo capturado, solo cambia
    // el estado; estos campos quedan como bitácora del último restablecido.
    restablecidoEn: { type: Date, default: null },
    restablecidoPor: { type: String, default: '' },
  },
  { timestamps: true }
);

cierreCajaSchema.index({ fecha: 1 }, { unique: true });

module.exports = mongoose.model('CierreCaja', cierreCajaSchema);
module.exports.DENOMINACIONES_BILLETES = DENOMINACIONES_BILLETES;
module.exports.DENOMINACIONES_MONEDAS = DENOMINACIONES_MONEDAS;
