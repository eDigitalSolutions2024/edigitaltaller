const mongoose = require('mongoose');

const mecanicoSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: true,
      trim: true
    },
    telefono: {
      type: String,
      trim: true
    },
    activo: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Mecanico', mecanicoSchema);