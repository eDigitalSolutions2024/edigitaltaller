// backend/models/Devolucion.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const LineaSchema = new Schema({
  itemId: { type: Schema.Types.ObjectId, ref: 'Producto' },
  codigoInterno: String,
  codigoProveedor: String,
  marca: String,
  unidad: { type: String, default: 'Pieza' },
  cantidad: { type: Number, required: true, min: 0 },
  precioUnitario: { type: Number, required: true, min: 0 },
  ivaPct: { type: Number, default: 16 },
  ordenServicio: String,
  notas: String,
}, { _id: true });

const baseOpts = {
  timestamps: true,
  discriminatorKey: 'tipo',         // 👈 clave para los sub-modelos
  collection: 'devoluciones'
};

const BaseSchema = new Schema({
  folio: { type: String, unique: true },
  tipo: { type: String, enum: ['DINERO','PIEZA','VALE'], required: true },
  fechaDevolucion: { type: Date, required: true }, // mejor Date para consultas
  proveedor: { type: String, default: '' },
  motivo: { type: String, default: '' },
  fechaRecibe: { type: Date },
  quienRecibe: { type: String, default: '' },
  observaciones: { type: String, default: '' },
}, baseOpts);

BaseSchema.index({ tipo: 1, fechaDevolucion: -1 });
BaseSchema.index({ folio: 1 }, { unique: true });

const Devolucion = mongoose.model('Devolucion', BaseSchema);

// === DINERO ===
const DineroSchema = new Schema({
  formaPago: { type: String, enum: ['Efectivo','Transferencia','Nota de crédito','Otro'], default: 'Efectivo' },
  facturaNumero: { type: String, default: '' },
  lineas: [LineaSchema],
  totales: { subtotal: Number, iva: Number, total: Number },
});

// Calcula totales automáticamente (opcional)
DineroSchema.pre('validate', function (next) {
  if (!this.lineas || this.lineas.length === 0) return next();
  const subtotal = this.lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0);
  const iva = this.lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario * ((l.ivaPct ?? 16) / 100), 0);
  this.totales = { subtotal, iva, total: subtotal + iva };
  next();
});

const DevolucionDinero = Devolucion.discriminator('DINERO', DineroSchema);

// === PIEZA ===
const PiezaSchema = new Schema({
  lineasEntrada: [LineaSchema],
  lineasSalida:  [LineaSchema],
  totalesEntrada: { subtotal: Number, iva: Number, total: Number },
  totalesSalida:  { subtotal: Number, iva: Number, total: Number },
  diferencia: { type: Number, default: 0 },
  facturaCambio: { type: String, default: '' },
});
const DevolucionPieza = Devolucion.discriminator('PIEZA', PiezaSchema);

// === VALE === (ejemplo mínimo; ajusta a tu caso)
const ValeSchema = new Schema({
  numeroVale: { type: String, default: '' },
  venceEn: { type: Date },
  totalVale: { type: Number, default: 0 },
  // si el vale nace de una devolución de dinero o pieza, podrías guardar refs aquí
});
const DevolucionVale = Devolucion.discriminator('VALE', ValeSchema);

module.exports = {
  Devolucion,          // modelo base para consultas generales
  DevolucionDinero,
  DevolucionPieza,
  DevolucionVale
};
