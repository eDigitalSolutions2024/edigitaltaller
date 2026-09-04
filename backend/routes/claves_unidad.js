// backend/routes/claves_unidad.js
// Catálogo administrable de claves de unidad SAT (Configuración fiscal).
const express = require("express");
const ClaveUnidad = require("../models/ClaveUnidad");
const { proteger, requiereRol } = require("../middleware/auth");

const router = express.Router();

const rx = (s) =>
  new RegExp(String(s).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

// Cualquiera logueado puede LEER el catálogo (lo usa Nueva Factura al armar
// conceptos); administrarlo (alta/edición/baja) es solo de Configuración
// fiscal, así que eso sí queda restringido a admin.
router.use(proteger);

// GET /api/claves-unidad?search=
router.get("/", async (req, res) => {
  try {
    const { search = "" } = req.query;
    const match = { activo: true };

    if (search) {
      const r = rx(search);
      match.$or = [{ clave: r }, { descripcion: r }];
    }

    const data = await ClaveUnidad.find(match).sort({ clave: 1 }).lean();
    res.json({ ok: true, data });
  } catch (err) {
    console.error("GET /claves-unidad ERROR:", err);
    res.status(500).json({ ok: false, error: "Error al listar claves de unidad" });
  }
});

const FALTAN_DATOS = "Faltan datos: clave y descripción son obligatorios.";

// POST /api/claves-unidad
router.post("/", requiereRol("admin"), async (req, res) => {
  try {
    const { clave, descripcion } = req.body || {};

    if (!clave || !descripcion) {
      return res.status(400).json({ ok: false, error: FALTAN_DATOS });
    }

    const doc = await ClaveUnidad.create({
      clave: String(clave).trim(),
      descripcion: String(descripcion).trim(),
    });

    res.json({ ok: true, data: doc });
  } catch (err) {
    console.error("POST /claves-unidad ERROR:", err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// PUT /api/claves-unidad/:id
router.put("/:id", requiereRol("admin"), async (req, res) => {
  try {
    const { clave, descripcion } = req.body || {};

    if (!clave || !descripcion) {
      return res.status(400).json({ ok: false, error: FALTAN_DATOS });
    }

    const doc = await ClaveUnidad.findByIdAndUpdate(
      req.params.id,
      {
        clave: String(clave).trim(),
        descripcion: String(descripcion).trim(),
      },
      { new: true }
    );

    if (!doc) return res.status(404).json({ ok: false, error: "No encontrado" });
    res.json({ ok: true, data: doc });
  } catch (err) {
    console.error("PUT /claves-unidad/:id ERROR:", err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// DELETE /api/claves-unidad/:id
router.delete("/:id", requiereRol("admin"), async (req, res) => {
  try {
    const doc = await ClaveUnidad.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ ok: false, error: "No encontrado" });
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /claves-unidad/:id ERROR:", err);
    res.status(500).json({ ok: false, error: "Error al eliminar" });
  }
});

module.exports = router;
