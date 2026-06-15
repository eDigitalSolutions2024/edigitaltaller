// models/CodigoRefaccion.js  (o Codigo.js)
const mongoose = require('mongoose');

const CodigoSchema = new mongoose.Schema({
  // identificador para saber si es refacción o servicio
  tipo: {
    type: String,
    enum: ['refaccion', 'servicio'],
    required: true,
    index: true,
    default: 'refaccion',
  },

  // 👇 código interno R1, R2, S1, S2...
  codigo: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },

  // número de parte real (OEM, proveedor, etc.)
  numeroParte:  { type: String, required: true, trim: true },
  descripcion:  { type: String, trim: true },
  marca:        { type: String, trim: true },
  proveedor:    { type: String, trim: true, default: "" },

  
  // Datos SAT para facturación
  codigoSat: { type: String, trim: true, default: "" },
  descripcionSat: { type: String, trim: true, default: "" },

  // para que el PDF sepa en qué columna va (servicios)
  grupoServicio: {
    type: String,
    enum: ['motor', 'lubricacion', 'revision', 'otros'],
    default: 'otros',
  },

  // Opcionales: pre-llenan solicitudes de refacciones al seleccionar el código
  unidad:         { type: String, trim: true, default: "" },
  precioUnitario: { type: Number, default: null },
}, { timestamps: true });

CodigoSchema.index({ numeroParte: 1 });
CodigoSchema.index({ marca: 1 });
CodigoSchema.index({
  descripcion: 'text',
  numeroParte: 'text',
  marca: 'text',
  proveedor: 'text',
  codigoSat: 'text',
  descripcionSat: 'text',
});

module.exports = mongoose.model('CodigoRefaccion', CodigoSchema);
