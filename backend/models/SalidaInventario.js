const mongoose = require('mongoose');
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
  ordenServicio: { type: String, trim: true },
  partidas:      { type: [PartidaSalidaSchema], default: [] },
  estatus:       { type: String, enum:['cerrada','abierta'], default:'cerrada' },
}, { timestamps: true });

module.exports = mongoose.model('SalidaInventario', SalidaInventarioSchema);
