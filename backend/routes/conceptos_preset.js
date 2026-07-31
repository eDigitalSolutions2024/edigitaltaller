// backend/routes/conceptos_preset.js
// Catálogo administrable de conceptos/códigos SAT reutilizables (Configuración fiscal).
const express = require("express");
const ConceptoPreset = require("../models/ConceptoPreset");

const router = express.Router();

const rx = (s) =>
  new RegExp(String(s).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

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

// POST /api/conceptos-preset
router.post("/", async (req, res) => {
  try {
    const { cProdServ, cProdServDescripcion, cUnidad, unidad, descripcion, valorUnitario } =
      req.body || {};

    if (!cProdServ || !cUnidad || !unidad || !descripcion) {
      return res.status(400).json({
        ok: false,
        error: "Faltan datos: clave SAT, clave unidad, unidad y descripción son obligatorios.",
      });
    }

    const doc = await ConceptoPreset.create({
      cProdServ: String(cProdServ).trim(),
      cProdServDescripcion: String(cProdServDescripcion || "").trim(),
      cUnidad: String(cUnidad).trim(),
      unidad: String(unidad).trim(),
      descripcion: String(descripcion).trim(),
      valorUnitario: Number(valorUnitario || 0),
    });

    res.json({ ok: true, data: doc });
  } catch (err) {
    console.error("POST /conceptos-preset ERROR:", err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// PUT /api/conceptos-preset/:id
router.put("/:id", async (req, res) => {
  try {
    const { cProdServ, cProdServDescripcion, cUnidad, unidad, descripcion, valorUnitario } =
      req.body || {};

    if (!cProdServ || !cUnidad || !unidad || !descripcion) {
      return res.status(400).json({
        ok: false,
        error: "Faltan datos: clave SAT, clave unidad, unidad y descripción son obligatorios.",
      });
    }

    const doc = await ConceptoPreset.findByIdAndUpdate(
      req.params.id,
      {
        cProdServ: String(cProdServ).trim(),
        cProdServDescripcion: String(cProdServDescripcion || "").trim(),
        cUnidad: String(cUnidad).trim(),
        unidad: String(unidad).trim(),
        descripcion: String(descripcion).trim(),
        valorUnitario: Number(valorUnitario || 0),
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
router.delete("/:id", async (req, res) => {
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
