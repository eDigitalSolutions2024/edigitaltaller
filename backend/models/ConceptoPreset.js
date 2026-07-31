// models/ConceptoPreset.js
// Catálogo administrable de conceptos/códigos SAT reutilizables para armar facturas.
const mongoose = require("mongoose");

const ConceptoPresetSchema = new mongoose.Schema(
  {
    cProdServ: { type: String, required: true, trim: true },
    cProdServDescripcion: { type: String, default: "", trim: true },
    cUnidad: { type: String, required: true, trim: true },
    unidad: { type: String, required: true, trim: true },
    descripcion: { type: String, required: true, trim: true },
    valorUnitario: { type: Number, default: 0 },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true }
);

ConceptoPresetSchema.index({
  cProdServ: "text",
  cProdServDescripcion: "text",
  descripcion: "text",
});

module.exports = mongoose.model("ConceptoPreset", ConceptoPresetSchema);
