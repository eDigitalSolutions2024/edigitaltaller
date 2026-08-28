// backend/models/AnticipoCliente.js
// Libro mayor (ledger) del saldo a favor de un cliente. Nunca se borra un
// movimiento ni se edita su monto: se marca `cancelado` (solo aplica a
// DEPOSITO), igual que Vehiculo.pagos[]. La fuente de verdad para auditoría
// es esta colección; Cliente.saldoAFavor es solo un contador denormalizado
// para consultas rápidas, mantenido en sincronía por
// backend/utils/anticiposCliente.js.
const mongoose = require('mongoose');
const { Schema } = mongoose;

const FORMAS_PAGO = ['EFECTIVO', 'CREDITO', 'DEBITO', 'CHEQUE', 'TRANSFERENCIA'];

const anticipoClienteSchema = new Schema(
  {
    cliente: { type: Schema.Types.ObjectId, ref: 'Cliente', required: true, index: true },

    tipo: { type: String, enum: ['DEPOSITO', 'USO', 'REEMBOLSO_USO'], required: true },

    // Siempre positivo; el signo real sobre el saldo lo determina `tipo`.
    monto: { type: Number, required: true, min: 0 },
    saldoAnterior: { type: Number, default: 0 },
    saldoNuevo: { type: Number, default: 0 },
    fecha: { type: Date, default: Date.now },

    // ===== Solo en tipo DEPOSITO =====
    montoPesos: { type: Number, default: 0 },
    montoDolares: { type: Number, default: 0 },
    tipoCambio: { type: Number, default: 0 },
    formaPago: { type: String, enum: FORMAS_PAGO, default: undefined },
    chequeNumero: { type: String, default: '' },
    // Terminal por la que se cobró un depósito con tarjeta (formaPago
    // 'CREDITO' | 'DEBITO'); mismo catálogo que BANCO_A_TERMINAL en
    // utils/cierreCajaTerminales.js, para sumarlo al Cierre de Caja.
    banco: { type: String, enum: ['BANREGIO', 'AMERICAN EXPRESS', 'BANAMEX', 'BANORTE', 'BBVA BANCOMER'], default: '' },
    folioRecibo: { type: Number },
    referencia: { type: String, default: '' },
    observaciones: { type: String, default: '' },
    registradoPor: { type: String, default: '' },
    registradoPorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    // ===== En tipo USO / REEMBOLSO_USO siempre; en DEPOSITO solo cuando el
    // depósito nació de un "Anticipo" de caja ligado a una orden (POST
    // /api/cajas/:id/pagos con tipoPago ANTICIPO): ahí el dinero entra como
    // saldo a favor pero queda trazado a la orden y al pago que lo originó. =====
    ordenAplicada: { type: Schema.Types.ObjectId, ref: 'Vehiculo', default: null },
    pagoId: { type: Schema.Types.ObjectId, default: null },

    // Cancelación de un DEPOSITO (corrección de captura). El folio se
    // conserva; el movimiento no se borra ni deja de contar en el historial,
    // solo deja de sumar al saldo del cliente.
    cancelado: { type: Boolean, default: false },
    canceladoEn: { type: Date, default: null },
    canceladoPor: { type: String, default: '' },
    motivoCancelacion: { type: String, default: '' },
  },
  { timestamps: true }
);

anticipoClienteSchema.index({ cliente: 1, fecha: -1 });
anticipoClienteSchema.index({ folioRecibo: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('AnticipoCliente', anticipoClienteSchema);
module.exports.FORMAS_PAGO = FORMAS_PAGO;
