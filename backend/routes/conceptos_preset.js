// backend/routes/conceptos_preset.js
// Catálogo administrable de conceptos/códigos SAT reutilizables (Configuración fiscal).
const express = require("express");
const ConceptoPreset = require("../models/ConceptoPreset");
const { proteger, requiereRol } = require("../middleware/auth");

const router = express.Router();

const rx = (s) =>
  new RegExp(String(s).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

// Cualquiera logueado puede LEER el catálogo (lo usa Nueva Factura al armar
// conceptos); administrarlo (alta/edición/baja) es solo de Configuración
// fiscal, así que eso sí queda restringido a admin.
router.use(proteger);

// GET /api/conceptos-preset?search=
router.get("/", async (req, res) => {
  try {
    const { search = "" } = req.query;
    const match = { activo: true };

    if (search) {
      const r = rx(search);
      match.$or = [{ cProdServ: r }, { cProdServDescripcion: r }, { descripcion: r }];
    }

    const data = await ConceptoPreset.find(match).sort({ descripcion: 1 }).lean();
    res.json({ ok: true, data });
  } catch (err) {
    console.error("GET /conceptos-preset ERROR:", err);
    res.status(500).json({ ok: false, error: "Error al listar conceptos" });
  }
});

// El catálogo solo administra clave SAT + descripción; la unidad y el valor
// unitario se capturan al armar cada factura.
const FALTAN_DATOS = "Faltan datos: clave SAT y descripción son obligatorios.";

// Solo escribe los campos opcionales que realmente vengan en el body, para no
// borrar la unidad/valor de conceptos capturados antes de esta simplificación.
function camposOpcionales(body) {
  const out = {};
  if (body.cProdServDescripcion !== undefined) {
    out.cProdServDescripcion = String(body.cProdServDescripcion || "").trim();
  }
  if (body.cUnidad !== undefined && String(body.cUnidad).trim()) {
    out.cUnidad = String(body.cUnidad).trim();
  }
  if (body.unidad !== undefined && String(body.unidad).trim()) {
    out.unidad = String(body.unidad).trim();
  }
  if (body.valorUnitario !== undefined) {
    out.valorUnitario = Number(body.valorUnitario || 0);
  }
  return out;
}

// POST /api/conceptos-preset
router.post("/", requiereRol("admin"), async (req, res) => {
  try {
    const { cProdServ, descripcion } = req.body || {};

    if (!cProdServ || !descripcion) {
      return res.status(400).json({ ok: false, error: FALTAN_DATOS });
    }

    const doc = await ConceptoPreset.create({
      cProdServ: String(cProdServ).trim(),
      descripcion: String(descripcion).trim(),
      ...camposOpcionales(req.body),
    });

    res.json({ ok: true, data: doc });
  } catch (err) {
    console.error("POST /conceptos-preset ERROR:", err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// PUT /api/conceptos-preset/:id
router.put("/:id", requiereRol("admin"), async (req, res) => {
  try {
    const { cProdServ, descripcion } = req.body || {};

    if (!cProdServ || !descripcion) {
      return res.status(400).json({ ok: false, error: FALTAN_DATOS });
    }

    const doc = await ConceptoPreset.findByIdAndUpdate(
      req.params.id,
      {
        cProdServ: String(cProdServ).trim(),
        descripcion: String(descripcion).trim(),
        ...camposOpcionales(req.body),
      },
      { new: true }
    );

    if (!doc) return res.status(404).json({ ok: false, error: "No encontrado" });
    res.json({ ok: true, data: doc });
  } catch (err) {
    console.error("PUT /conceptos-preset/:id ERROR:", err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// DELETE /api/conceptos-preset/:id
router.delete("/:id", requiereRol("admin"), async (req, res) => {
  try {
    const doc = await ConceptoPreset.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ ok: false, error: "No encontrado" });
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /conceptos-preset/:id ERROR:", err);
    res.status(500).json({ ok: false, error: "Error al eliminar" });
  }
});

module.exports = router;
