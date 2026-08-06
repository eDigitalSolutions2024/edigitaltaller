// models/ClaveUnidad.js
// Catálogo administrable de claves de unidad SAT (c_ClaveUnidad) reutilizables al armar facturas.
const mongoose = require("mongoose");

const ClaveUnidadSchema = new mongoose.Schema(
  {
    clave: { type: String, required: true, trim: true, uppercase: true },
    descripcion: { type: String, required: true, trim: true },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true }
);

ClaveUnidadSchema.index({
  clave: "text",
  descripcion: "text",
});

module.exports = mongoose.model("ClaveUnidad", ClaveUnidadSchema);
