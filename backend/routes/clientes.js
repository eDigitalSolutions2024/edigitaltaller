// routes/clientes.js
const express = require("express");
const Cliente = require("../models/Cliente");
const router = express.Router();

// POST /api/clientes  (crear)
router.post("/", async (req, res) => {
  try {
    const body = { ...req.body };

    // 👇 Validación de nombre duplicado
    const { nombre, apellidoPaterno, apellidoMaterno, tipoCliente } = body;

    if (tipoCliente === "Particular" && nombre) {
      const query = {
        nombre: { $regex: new RegExp(`^${nombre.trim()}$`, "i") },
        apellidoPaterno: { $regex: new RegExp(`^${(apellidoPaterno || "").trim()}$`, "i") },
        apellidoMaterno: { $regex: new RegExp(`^${(apellidoMaterno || "").trim()}$`, "i") },
      };

      const existe = await Cliente.findOne(query);
      if (existe) {
        return res.status(409).json({
          ok: false,
          error: `Ya existe un cliente con el nombre "${nombre} ${apellidoPaterno || ""} ${apellidoMaterno || ""}".`.trim(),
        });
      }
    }

    // Para empresa/gobierno checa razón social o nombre gobierno
    if (tipoCliente === "Empresa Privada" || tipoCliente === "Empresa Arrendadora") {
      if (body.nombre) {
        const existe = await Cliente.findOne({
          tipoCliente,
          nombre: { $regex: new RegExp(`^${body.nombre.trim()}$`, "i") },
        });
        if (existe) {
          return res.status(409).json({
            ok: false,
            error: `Ya existe una empresa con el nombre "${body.nombre}".`,
          });
        }
      }
    }

    if (tipoCliente === "Empresa Gobierno") {
      const nombreGob = body.gobierno?.nombreGobierno;
      if (nombreGob) {
        const existe = await Cliente.findOne({
          "gobierno.nombreGobierno": { $regex: new RegExp(`^${nombreGob.trim()}$`, "i") },
        });
        if (existe) {
          return res.status(409).json({
            ok: false,
            error: `Ya existe un gobierno con el nombre "${nombreGob}".`,
          });
        }
      }
    }
    // 👆 fin validación

    const cliente = await Cliente.create(body);
    res.status(201).json({ ok: true, data: cliente });
  } catch (err) {
    console.error(err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// GET /api/clientes  (listar + búsqueda paginada)
router.get("/", async (req, res) => {
  try {
    const { q = "", page = 1, limit = 10 } = req.query;

    // ✅ Si hay texto, usa $text; si no, trae todos
    const find = q.trim() ? { $text: { $search: q.trim() } } : {};

    // ✅ Cuando hay búsqueda, ordena por relevancia; si no, por fecha
    const sort = q.trim()
      ? { score: { $meta: "textScore" } }
      : { createdAt: -1 };

    const projection = q.trim()
      ? { score: { $meta: "textScore" } }
      : {};

    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      Cliente.find(find, projection)
        .sort(sort)
        .skip(skip)
        .limit(Number(limit)),
      Cliente.countDocuments(find),
    ]);

    res.json({ ok: true, data: items, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/clientes/:id
router.get("/:id", async (req, res) => {
  const c = await Cliente.findById(req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: "No encontrado" });
  res.json({ ok: true, data: c });
});

// PUT /api/clientes/:id
router.put("/:id", async (req, res) => {
  try {
    const body = { ...req.body };

    // 🔴 Tampoco actualizamos facturación por ahora
    //delete body.facturacion;

    const c = await Cliente.findByIdAndUpdate(req.params.id, body, {
      new: true,
    });
    res.json({ ok: true, data: c });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// DELETE (soft delete opcional)
router.delete("/:id", async (req, res) => {
  const c = await Cliente.findByIdAndUpdate(
    req.params.id,
    { activo: false },
    { new: true }
  );
  res.json({ ok: true, data: c });
});

module.exports = router;
