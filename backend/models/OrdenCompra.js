// backend/models/OrdenCompra.js
const mongoose = require('mongoose');
const Contador = require('./Contador');

// Debe coincidir con ORDEN_COMPRA_CONTADOR en routes/configuracion.js
const ORDEN_COMPRA_CONTADOR = 'ordenCompra';

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

    // Orden / vehículo al que pertenece (no aplica en compras manuales/directas)
    orden: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehiculo',
    },

    // normalmente 1 proveedor por OC
    proveedor: {
      type: String,
      trim: true,
    },

    proveedorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Proveedor',
    },

    // domicilio del proveedor al momento de generar la OC (queda fijo aunque el proveedor cambie después)
    domicilioProveedor: {
      type: String,
      trim: true,
      default: '',
    },

    lineas: [lineaOCSchema],

    estatus: {
      type: String,
      enum: ['PENDIENTE', 'EN_PROCESO', 'COMPRADO', 'CANCELADO'],
      default: 'PENDIENTE',
    },

    // quién entrega la OC (se toma del usuario que la genera) y quién la recibe (queda en blanco para firma física)
    entrega: {
      type: String,
      trim: true,
      default: '',
    },
    recibe: {
      type: String,
      trim: true,
      default: '',
    },

    creadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

// 👇 Genera el siguiente folio: OC-00001, OC-00002, etc.
// Usa el contador genérico (configurable desde Configuración > Folio de Orden de Compra).
ordenCompraSchema.statics.generarConsecutivo = async function () {
  const contador = await Contador.findOneAndUpdate(
    { nombre: ORDEN_COMPRA_CONTADOR },
    { $inc: { valor: 1 } },
    { new: true, upsert: true }
  );

  return `OC-${String(contador.valor).padStart(5, '0')}`;
};

module.exports = mongoose.model('OrdenCompra', ordenCompraSchema);
