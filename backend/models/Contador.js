const mongoose = require('mongoose');

// Contadores genéricos tipo auto-increment (ej. folio de Orden de Servicio).
// Cada documento es un contador independiente identificado por `nombre`.
const contadorSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    valor: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Contador', contadorSchema);
