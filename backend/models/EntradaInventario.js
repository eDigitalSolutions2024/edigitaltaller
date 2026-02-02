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

  // === Arreglo con los renglones de la tabla ===
  captura: { type: [CapturaSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.model('EntradaInventario', EntradaInventarioSchema);
