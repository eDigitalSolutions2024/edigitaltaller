// models/FacturaCfdi.js
// Snapshot de cada CFDI generado (venta a cliente), para el historial de facturación.
const mongoose = require("mongoose");
const { Schema } = mongoose;

const ConceptoSnapshotSchema = new Schema(
  {
    cantidad: Number,
    unidad: String,
    cProdServ: String,
    cUnidad: String,
    descripcion: String,
    valorUnitario: Number,
  },
  { _id: false }
);

const FacturaCfdiSchema = new Schema(
  {
    serie: { type: String, default: "", trim: true },
    folio: { type: String, default: "", trim: true },
    fecha: { type: Date, default: Date.now },

    cliente: {
      clienteId: { type: Schema.Types.ObjectId, ref: "Cliente", default: null },
      nombre: { type: String, default: "" },
      rfc: { type: String, default: "" },
      regimenFiscal: { type: String, default: "" },
      codigoPostalFiscal: { type: String, default: "" },
    },

    orden: {
      vehiculoId: { type: Schema.Types.ObjectId, ref: "Vehiculo", default: null },
      ordenServicio: { type: String, default: "" },
    },

    conceptos: { type: [ConceptoSnapshotSchema], default: [] },

    cfdi: {
      usoCfdi: String,
      moneda: String,
      tipoCambio: Number,
      ivaRate: Number,
      metodoPago: String,
      formaPago: String,
      lugarExpedicion: String,
      oc: String,
      comentarios: String,
      aplicarRetencionIsr: Boolean,
      isrRate: Number,
    },

    emisor: {
      rfc: String,
      nombre: String,
      regimenFiscal: String,
      lugarExpedicion: String,
      noCertificado: String,
    },

    totales: {
      subtotal: Number,
      iva: Number,
      isr: Number,
      total: Number,
    },

    xml: { type: String, required: true },
    cadenaOriginal: { type: String, default: "" },
    sello: { type: String, default: "" },

    estatus: { type: String, enum: ["generada", "cancelada"], default: "generada" },
    generadoPor: { type: String, default: "" },
  },
  { timestamps: true }
);

FacturaCfdiSchema.index({ folio: 1 });
FacturaCfdiSchema.index({ "orden.ordenServicio": 1 });
FacturaCfdiSchema.index({ createdAt: -1 });

module.exports = mongoose.model("FacturaCfdi", FacturaCfdiSchema);
