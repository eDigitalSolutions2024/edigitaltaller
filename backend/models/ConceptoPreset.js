// models/ConceptoPreset.js
// Catálogo administrable de conceptos/códigos SAT reutilizables para armar facturas.
const mongoose = require("mongoose");

const ConceptoPresetSchema = new mongoose.Schema(
  {
    cProdServ: { type: String, required: true, trim: true },
    cProdServDescripcion: { type: String, default: "", trim: true },
    // La unidad y el valor unitario se capturan al armar la factura (cambian por
    // orden), así que el catálogo solo administra clave SAT + descripción.
    cUnidad: { type: String, default: "E48", trim: true },
    unidad: { type: String, default: "Servicio", trim: true },
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
