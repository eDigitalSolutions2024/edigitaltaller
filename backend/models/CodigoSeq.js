const mongoose = require("mongoose");

const CodigoSeqSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true }, // p.ej. "refaccion", "servicio"
  seq: { type: Number, required: true, default: 0 },
});

module.exports = mongoose.model("CodigoSeq", CodigoSeqSchema);
