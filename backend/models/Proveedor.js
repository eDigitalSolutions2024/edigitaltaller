// models/Proveedor.js
const mongoose = require('mongoose');

const ProveedorSchema = new mongoose.Schema({
  nombreProveedor: { type: String, required: true, trim: true, index: true },
  aliasProveedor:  { type: String, trim: true },
  correo:          { type: String, trim: true, lowercase: true },
  telefonoLada:    { type: String, trim: true, maxlength: 5 },
  telefonoFijo:    { type: String, trim: true },

  calle:           { type: String, trim: true },
  numeroExterior:  { type: String, trim: true },
  numeroInterior:  { type: String, trim: true },
  colonia:         { type: String, trim: true },
  rfc:             { type: String, trim: true, uppercase: true, index: true },
  codigoPostal:    { type: String, trim: true },
  ciudad:          { type: String, trim: true },
  estado:          { type: String, trim: true },

  primerContacto:  { type: String, trim: true },
  segundoContacto: { type: String, trim: true },
  tercerContacto:  { type: String, trim: true },

  condicionesPago: { type: String, enum: ['', 'contado', 'credito', 'mixto'], default: '' },
  diasCredito:     { type: Number, default: 0, min: 0 },

  observaciones:   { type: String, trim: true },

  // flags básicos (por si luego quieres soft-delete)
  activo:          { type: Boolean, default: true }
}, { timestamps: true });

// Índices útiles para búsquedas
ProveedorSchema.index({ nombreProveedor: 'text', aliasProveedor: 'text', rfc: 'text', correo: 'text', ciudad: 'text' });

module.exports = mongoose.model('Proveedor', ProveedorSchema);
