const mongoose = require("mongoose");

const FiscalConfigSchema = new mongoose.Schema(
  {
    // Datos del emisor
    rfc: { type: String, required: true, trim: true },
    nombre: { type: String, required: true, trim: true },
    regimenFiscal: { type: String, required: true, trim: true },
    lugarExpedicion: { type: String, required: true, trim: true }, // CP emisor

    // Series / folios
    serie: { type: String, default: "", trim: true },
    folioInterno: { type: String, default: "", trim: true },

    // del .cer
    noCertificado: { type: String, default: "", trim: true },
    certificadoBase64: { type: String, default: "" }, // contenido DER en base64
    certificadoNombreArchivo: { type: String, default: "", trim: true },

    // del .key
    keyPemCargado: { type: Boolean, default: false },
    keyNombreArchivo: { type: String, default: "", trim: true },

    // Estado
    listoParaTimbrar: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("FiscalConfig", FiscalConfigSchema);
