const mongoose = require('mongoose');

const AjusteInventarioSchema = new mongoose.Schema({
  codigoInterno: { type: String, required: true, trim: true },
  descripcion:   { type: String, trim: true, default: '' },
  unidad:        { type: String, trim: true, default: '' },
  cantidad:      { type: Number, required: true }, // positivo = entrada, negativo = salida
  motivo:        { type: String, trim: true, default: '' },
  usuario:       { type: String, trim: true, default: '' },
  fecha:         { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('AjusteInventario', AjusteInventarioSchema);
