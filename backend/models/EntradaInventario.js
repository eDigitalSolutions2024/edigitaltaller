const mongoose = require('mongoose');

const CapturaSchema = new mongoose.Schema({
  // === Campos por renglón de la tabla ===
  codigoInterno: { type: String, trim: true },   // viene del catálogo de productos
  descripcion:  { type: String, trim: true },
  tipo:         { type: String, trim: true },    // p.ej. Refacción / Insumo
  unidad:       { type: String, trim: true },    // Pieza / Caja / Litro / etc.
  cantidad:     { type: Number, required: true, min: 0 },
  costoUnitario:{ type: Number, required: true, min: 0 },

  ivaPct:       { type: Number, default: 16 },   // ajusta a tu lógica
  descuentoPct: { type: Number, default: 0 },

  lote:         { type: String, trim: true },
  caducidad:    { type: Date },
}, { _id: true });

const OrdenVinculadaSchema = new mongoose.Schema({
  usadaEnOrden:  { type: Boolean, default: false },
  sucursal:      { type: String, trim: true, default: '' },
  ordenId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Vehiculo', default: null },
  numeroOrden:   { type: String, trim: true, default: '' },
  cliente:       { type: String, trim: true, default: '' },
  vehiculo:      { type: String, trim: true, default: '' },
  modelo:        { type: String, trim: true, default: '' },
  refaccionario: { type: String, trim: true, default: '' },
  fechaOrden:    { type: Date, default: null },
}, { _id: false });

const EntradaInventarioSchema = new mongoose.Schema({
  // === Encabezado (tu formulario de la captura) ===
  tipoComprobante: { type: String, required: true },      // Factura / Remisión / etc.
  numero:          { type: String, trim: true },          // Número de factura/remisión
  moneda:          { type: String, required: true },      // MXN / USD
  formaPago:       { type: String, required: true },      // Crédito / Contado / ...
  proveedorId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Proveedor', required: true },
  fechaFactura:    { type: Date, required: true },

  // Foto o PDF de la factura (opcional)
  fotoFactura: {
    filename: String,
    mimetype: String,
    size: Number,
    url: String,
  },

  estado: {
    type: String,
    enum: ['borrador', 'finalizada'],
    default: 'borrador'
  },

  // Vinculación con orden de servicio (opcional)
  ordenVinculada: { type: OrdenVinculadaSchema, default: () => ({}) },

  // === Arreglo con los renglones de la tabla ===
  captura: { type: [CapturaSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.model('EntradaInventario', EntradaInventarioSchema);
