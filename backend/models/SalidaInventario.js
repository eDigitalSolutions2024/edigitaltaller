const mongoose = require('mongoose');
const { LINEAS_NEGOCIO, LINEA_DEFAULT } = require('../utils/lineaNegocio');
const { Schema } = mongoose;

const PartidaSalidaSchema = new Schema({
  codigoInterno: { type: Schema.Types.Mixed, required: true }, // ObjectId o string
  descripcion:   { type: String, default: '' },
  marca:         { type: String, default: '' },
  unidad:        { type: String, default: 'Pieza' },
  cantidad:      { type: Number, required: true, min: 0 },
}, { _id: false });

const SalidaInventarioSchema = new Schema({
  fechaSalida:   { type: Date, required: true },
  // Almacén al que pertenece (cada línea de negocio tiene su propio inventario;
  // ver utils/lineaNegocio.js). Docs viejos sin el campo cuentan como Servicompacto.
  lineaNegocio: { type: String, enum: LINEAS_NEGOCIO, default: LINEA_DEFAULT, index: true },
  ordenServicio: { type: String, trim: true },
  surtidoPor:    { type: String, trim: true, default: '' },
  partidas:      { type: [PartidaSalidaSchema], default: [] },
  estatus:       { type: String, enum:['cerrada','abierta'], default:'cerrada' },
}, { timestamps: true });

module.exports = mongoose.model('SalidaInventario', SalidaInventarioSchema);
