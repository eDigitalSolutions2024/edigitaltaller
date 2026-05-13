const mongoose = require('mongoose');

const unidadMedidaSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: true,
      trim: true,
      unique: true
    },
    activo: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('UnidadMedida', unidadMedidaSchema);