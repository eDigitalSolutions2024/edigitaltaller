// models/ServicioCatalogo.js
// Catálogo de "Servicios" (paquetes de refacciones), distinto de CodigoRefaccion
// (que es el catálogo de códigos SAT/facturación usado en BD Códigos).
const mongoose = require('mongoose');

const refaccionBundleSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  obligatoria: { type: Boolean, default: true },
});

const ServicioCatalogoSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  refacciones: [refaccionBundleSchema],
}, { timestamps: true });

ServicioCatalogoSchema.index({ nombre: 'text' });

module.exports = mongoose.model('ServicioCatalogo', ServicioCatalogoSchema);
