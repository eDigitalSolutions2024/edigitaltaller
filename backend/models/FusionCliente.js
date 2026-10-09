// models/FusionCliente.js
// Bitácora de cada fusión de clientes (POST /api/clientes/fusionar) con lo
// necesario para DESHACERLA (POST /api/clientes/fusiones/:id/deshacer): qué
// documentos se movieron y cómo estaban el principal y los duplicados antes.
const mongoose = require("mongoose");
const { Schema } = mongoose;

const FusionClienteSchema = new Schema(
  {
    principal: { type: Schema.Types.ObjectId, ref: "Cliente", required: true, index: true },
    principalNombre: { type: String, default: "" },
    // Duplicados absorbidos por completo (quedaron inactivos) y su estado previo.
    duplicados: [
      {
        _id: false,
        cliente: { type: Schema.Types.ObjectId, ref: "Cliente" },
        nombre: { type: String, default: "" },
        activo: { type: Boolean, default: true },
        saldoAFavor: { type: Number, default: 0 },
        fusionadoEn: { type: Schema.Types.ObjectId, default: null },
      },
    ],
    // Clientes de los que solo se movieron órdenes sueltas (siguen activos).
    origenesParciales: [{ type: Schema.Types.ObjectId, ref: "Cliente" }],
    // _id de lo movido y de qué cliente venía (para devolverlo a su sitio).
    ordenes: [{ _id: false, id: Schema.Types.ObjectId, de: Schema.Types.ObjectId }],
    anticipos: [{ _id: false, id: Schema.Types.ObjectId, de: Schema.Types.ObjectId }],
    facturas: [{ _id: false, id: Schema.Types.ObjectId, de: Schema.Types.ObjectId }],
    garage: [{ _id: false, id: Schema.Types.ObjectId, clientes: [Schema.Types.ObjectId] }],
    saldoSumado: { type: Number, default: 0 },
    // Valor previo (por campo raíz) de lo que la fusión sobrescribió en el principal; null = no existía.
    principalPrevio: { type: Schema.Types.Mixed, default: {} },
    usuario: { type: String, default: "" },
    deshechaEn: { type: Date, default: null },
    deshechaPor: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("FusionCliente", FusionClienteSchema);
