const mongoose = require('mongoose');

// Ubicación física del almacén (repisa, rack, etc. — solo un nombre). Guarda cuántas piezas de cada
// refacción hay ahí. Lo que no está asignado a ninguna ubicación = "sin asignar".
const ItemSchema = new mongoose.Schema({
  codigoInterno: { type: String, required: true, trim: true }, // mismo id que usa /api/inventario (_id)
  cantidad:      { type: Number, required: true, min: 0 },
}, { _id: false });

const UbicacionInventarioSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  items:  { type: [ItemSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.model('UbicacionInventario', UbicacionInventarioSchema);
