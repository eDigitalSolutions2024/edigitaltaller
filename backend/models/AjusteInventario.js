const mongoose = require('mongoose');
const { LINEAS_NEGOCIO, LINEA_DEFAULT } = require('../utils/lineaNegocio');

const AjusteInventarioSchema = new mongoose.Schema({
  codigoInterno: { type: String, required: true, trim: true },
  // Almacén al que pertenece (cada línea de negocio tiene su propio inventario;
  // ver utils/lineaNegocio.js). Docs viejos sin el campo cuentan como Servicompacto.
  lineaNegocio: { type: String, enum: LINEAS_NEGOCIO, default: LINEA_DEFAULT, index: true },
  descripcion:   { type: String, trim: true, default: '' },
  unidad:        { type: String, trim: true, default: '' },
  cantidad:      { type: Number, required: true }, // positivo = entrada, negativo = salida
  motivo:        { type: String, trim: true, default: '' },
  usuario:       { type: String, trim: true, default: '' },
  fecha:         { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('AjusteInventario', AjusteInventarioSchema);
