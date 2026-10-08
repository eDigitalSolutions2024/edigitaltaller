const mongoose = require('mongoose');
const { LINEAS_NEGOCIO, LINEA_DEFAULT } = require('../utils/lineaNegocio');

// Ubicación física del almacén (repisa, rack, etc. — solo un nombre). Guarda cuántas piezas de cada
// refacción hay ahí. Lo que no está asignado a ninguna ubicación = "sin asignar".
const ItemSchema = new mongoose.Schema({
  codigoInterno: { type: String, required: true, trim: true }, // mismo id que usa /api/inventario (_id)
  cantidad:      { type: Number, required: true, min: 0 },
}, { _id: false });

const UbicacionInventarioSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  // Almacén al que pertenece (cada línea de negocio tiene su propio inventario;
  // ver utils/lineaNegocio.js). Docs viejos sin el campo cuentan como Servicompacto.
  lineaNegocio: { type: String, enum: LINEAS_NEGOCIO, default: LINEA_DEFAULT, index: true },
  items:  { type: [ItemSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.model('UbicacionInventario', UbicacionInventarioSchema);
