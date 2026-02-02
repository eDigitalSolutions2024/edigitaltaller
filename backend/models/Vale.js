const mongoose = require('mongoose');

const valeSchema = new mongoose.Schema({
  codigo:   { type: String, unique: true, index: true },  // ej. VAL-202509-01234
  monto:    { type: Number, required: true },             // total devuelto
  saldo:    { type: Number, required: true },             // saldo pendiente
  estado:   { type: String, enum: ['ACTIVO','CANJEADO','ANULADO'], default: 'ACTIVO' },
  folioDevolucion: { type: String },                      // folio DEV-...
  devolucionId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Devolucion' },
  cliente:  { type: String, default: '' },                // opcional si asignas cliente
}, { timestamps: true });

module.exports = mongoose.model('Vale', valeSchema);
