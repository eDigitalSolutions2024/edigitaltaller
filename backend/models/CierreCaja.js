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

// Una captura = un "Guardar" del formulario de Captura del día (billetes,
// monedas, cheques, transferencias, dólares y vales de esa ronda). Se guarda
// cada una por separado para tener historial del día y poder cancelar una mal
// hecha (monto equivocado) sin perder el resto. Lleva _id propio (por defecto)
// para poder apuntarle desde el endpoint de cancelación.
const capturaCajaSchema = new Schema({
  // Instante en que se pulsó "Guardar".
  fecha: { type: Date, default: Date.now },
  capturadoPor: { type: String, default: '' },

  billetes: [conteoSchema],
  monedas: [conteoSchema],
  // Únicos ingresos de terminal que son captura manual (el resto se suma solo
  // desde los pagos, ver utils/cierreCajaTotales).
  cheques: { type: Number, default: 0 },
  transferencias: { type: Number, default: 0 },
  dolares: {
    cantidad: { type: Number, default: 0 },
    tipoCambio: { type: Number, default: 0 },
  },
  vales: [valeCajaSchema],

  // true = no fue un "Guardar" real: se materializó al abrir el historial de
  // un día que ya traía captura acumulada de antes de que existiera este
  // registro por-captura (ver asegurarCapturaBaseline en routes/cierreCaja.js).
  sintetica: { type: Boolean, default: false },

  // Un admin puede cancelar una captura equivocada mientras la caja siga
  // ABIERTA; los totales del día se recalculan ignorando las canceladas. Queda
  // en el historial como bitácora (tachada), no se borra.
  cancelada: { type: Boolean, default: false },
  canceladaEn: { type: Date, default: null },
  canceladaPor: { type: String, default: '' },
  motivoCancelacion: { type: String, default: '' },
});

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

    // Bitácora de cada "Guardar" del formulario de Captura del día. Los totales
    // agregados de arriba (billetes/monedas/dolares/vales y
    // terminales.cheques/transferencias) se mantienen como CACHÉ = suma de
    // estas capturas NO canceladas (ver rebuildAgregadosCaptura en
    // routes/cierreCaja.js). Las terminales automáticas (bancomer…banorte) no
    // salen de aquí, se siguen sumando solas desde los pagos.
    capturas: [capturaCajaSchema],

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
