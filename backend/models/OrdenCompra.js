// backend/models/OrdenCompra.js
const mongoose = require('mongoose');

const lineaOCSchema = new mongoose.Schema(
  {
    cant: Number,
    unidad: String,
    refaccion: String,
    tipo: String,
    marca: String,
    proveedor: String,
    codigo: String,
    precioUnitario: Number,
    importeTotal: Number,
    moneda: { type: String, default: 'MN' },
    observaciones: String,
  },
  { _id: false }
);

const ordenCompraSchema = new mongoose.Schema(
  {
    numero: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    // Orden / vehículo al que pertenece
    orden: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehiculo',
      required: true,
    },

    // normalmente 1 proveedor por OC
    proveedor: {
      type: String,
      trim: true,
    },

    lineas: [lineaOCSchema],

    estatus: {
      type: String,
      enum: ['PENDIENTE', 'EN_PROCESO', 'COMPRADO', 'CANCELADO'],
      default: 'PENDIENTE',
    },

    creadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

// 👇 Helper para generar el siguiente folio: OC-00001, OC-00002, etc.
ordenCompraSchema.statics.generarConsecutivo = async function () {
  const last = await this.findOne().sort({ createdAt: -1 }).select('numero');
  let next = 1;

  if (last && /^OC-(\d+)$/.test(last.numero)) {
    const num = parseInt(last.numero.split('-')[1], 10);
    if (!isNaN(num)) next = num + 1;
  }

  return `OC-${String(next).padStart(5, '0')}`;
};

module.exports = mongoose.model('OrdenCompra', ordenCompraSchema);
