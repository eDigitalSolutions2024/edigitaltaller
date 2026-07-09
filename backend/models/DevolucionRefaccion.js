// backend/models/DevolucionRefaccion.js
// Formato "Devolución de Refacciones" (formato impreso de Servicompactos)
const mongoose = require('mongoose');

const RefaccionSchema = new mongoose.Schema({
  codigo: { type: String, trim: true, default: '' },
  nombre: { type: String, trim: true, default: '' },
}, { _id: false });

const DevolucionRefaccionSchema = new mongoose.Schema({
  folio: { type: Number, required: true, unique: true },

  // Devolución por: DINERO (pesos/dólares/cheque), PIEZA (pieza x pieza) o VALE
  tipoDevolucion: { type: String, enum: ['DINERO', 'PIEZA', 'VALE'], required: true },

  proveedor:          { type: String, trim: true, default: '' },
  fechaFactura:       { type: Date },
  fechaDevolucion:    { type: Date, required: true },
  numeroFactura:      { type: String, trim: true, default: '' },
  numeroComprobante:  { type: String, trim: true, default: '' },
  refacciones:        { type: [RefaccionSchema], default: [] },
  numeroOrdenServicio:{ type: String, trim: true, default: '' },

  // Cantidad a recuperar (se llena la opción que aplique)
  cantidadRecuperar: {
    pesos:    { type: String, trim: true, default: '' },
    dolares:  { type: String, trim: true, default: '' },
    cheque:   { type: String, trim: true, default: '' },
    vale:     { type: String, trim: true, default: '' },   // (ver anexo)
    garantia: { type: String, trim: true, default: '' },   // (pieza x pieza)
  },

  destinoDevolucion: {
    cajaChicaDlls: { type: Boolean, default: false },
    cajaChicaMN:   { type: Boolean, default: false },
    banco:         { type: Boolean, default: false },
    credito:       { type: Boolean, default: false },
  },

  motivoDevolucion: {
    errorTecnico:      { type: Boolean, default: false },
    errorRefaccionario:{ type: Boolean, default: false },
    errorProveedor:    { type: Boolean, default: false },
    core:              { type: Boolean, default: false },
    piezaDefectuosa:   { type: Boolean, default: false },
    cancelacionVenta:  { type: Boolean, default: false },
    otro:              { type: String, trim: true, default: '' },
  },
}, { timestamps: true, collection: 'devoluciones_refacciones' });

DevolucionRefaccionSchema.index({ fechaDevolucion: -1 });
DevolucionRefaccionSchema.index({ numeroFactura: 1 });

module.exports = mongoose.model('DevolucionRefaccion', DevolucionRefaccionSchema);
