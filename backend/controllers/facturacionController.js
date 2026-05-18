// backend/controllers/facturacionController.js
const { buildPreview } = require("../service/facturacionService");

exports.previewFactura = async (req, res) => {
  try {
    const data = await buildPreview(req.body);
    return res.json({ ok: true, data });
  } catch (err) {
    console.error("❌ facturacion/preview error:", err);
    return res.status(400).json({
      ok: false,
      message: err.message || "Error en preview de facturación",
    });
  }
};
