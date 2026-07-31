const mongoose = require('mongoose');

const tipoCambioSieSchema = new mongoose.Schema(
  {
    valor: {
      type: Number,
      required: true,
      min: 0
    },
    fecha: {
      type: Date,
      required: true
    },
    serie: {
      type: String,
      required: true,
      default: 'SF43718'
    }
  },
  { timestamps: true }
);

tipoCambioSieSchema.index({ fecha: 1 }, { unique: true });

module.exports = mongoose.model('TipoCambioSie', tipoCambioSieSchema);
