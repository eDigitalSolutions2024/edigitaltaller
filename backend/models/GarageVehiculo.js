const mongoose = require('mongoose');

const garageVehiculoSchema = new mongoose.Schema(
  {
    serie: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    marca:           { type: String, default: '' },
    modelo:          { type: String, default: '' },
    anio:            { type: String, default: '' },
    color:           { type: String, default: '' },
    placas:          { type: String, default: '' },
    kmsMillas:       { type: String, default: '' },
    nacionalidad:    { type: String, default: '' },
    motor:           { type: String, default: '' },
    numeroEconomico: { type: String, default: '' },
    traccion:        { type: String, default: '' },
    clientes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Cliente' }],
    vecesUsado: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('GarageVehiculo', garageVehiculoSchema);
