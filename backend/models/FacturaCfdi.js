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

const FacturaRelacionadaSchema = new Schema(
  {
    facturaId: { type: Schema.Types.ObjectId, ref: "FacturaCfdi", default: null },
    serie: { type: String, default: "" },
    folio: { type: String, default: "" },
    uuid: { type: String, default: "" },
    total: { type: Number, default: 0 },
    // Solo complemento de pago:
    saldoAnterior: { type: Number, default: 0 },
    importePagado: { type: Number, default: 0 },
    saldoInsoluto: { type: Number, default: 0 },
    numParcialidad: { type: Number, default: 1 },
  },
  { _id: false }
);

const FacturaCfdiSchema = new Schema(
  {
    // factura (I) | notaCredito (E) | complementoPago (P)
    tipoFactura: {
      type: String,
      enum: ["factura", "notaCredito", "complementoPago"],
      default: "factura",
    },
    tipoComprobante: { type: String, enum: ["I", "E", "P"], default: "I" },

    serie: { type: String, default: "", trim: true },
    folio: { type: String, default: "", trim: true },
    fecha: { type: Date, default: Date.now },

    // Facturas relacionadas (nota de crédito y complemento de pago)
    relacionadas: { type: [FacturaRelacionadaSchema], default: [] },

    // Datos del pago (solo complemento de pago)
    pago: {
      fechaPago: { type: Date, default: null },
      formaPago: { type: String, default: "" },
      monto: { type: Number, default: 0 },
    },

    cliente: {
      clienteId: { type: Schema.Types.ObjectId, ref: "Cliente", default: null },
      nombre: { type: String, default: "" },
      rfc: { type: String, default: "" },
      regimenFiscal: { type: String, default: "" },
      codigoPostalFiscal: { type: String, default: "" },
      direccion: {
        calle: { type: String, default: "" },
        numeroExterior: { type: String, default: "" },
        numeroInterior: { type: String, default: "" },
        colonia: { type: String, default: "" },
        codigoPostal: { type: String, default: "" },
        ciudad: { type: String, default: "" },
        estado: { type: String, default: "" },
      },
      pais: { type: String, default: "" },
    },

    // Orden principal de la factura. Se conserva para el historial, los
    // reportes y las búsquedas que ya la leían; cuando la factura agrupa
    // varias órdenes, aquí queda la primera y el listado completo va en
    // `ordenes`.
    orden: {
      vehiculoId: { type: Schema.Types.ObjectId, ref: "Vehiculo", default: null },
      ordenServicio: { type: String, default: "" },
    },

    // Todas las órdenes de servicio facturadas en este CFDI (una factura puede
    // agrupar varias órdenes del mismo cliente).
    ordenes: {
      type: [
        new Schema(
          {
            vehiculoId: { type: Schema.Types.ObjectId, ref: "Vehiculo", default: null },
            ordenServicio: { type: String, default: "" },
          },
          { _id: false }
        ),
      ],
      default: [],
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
      telefono: String,
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
FacturaCfdiSchema.index({ "ordenes.ordenServicio": 1 });
FacturaCfdiSchema.index({ createdAt: -1 });

module.exports = mongoose.model("FacturaCfdi", FacturaCfdiSchema);
