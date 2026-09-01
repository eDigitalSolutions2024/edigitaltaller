// backend/routes/facturas_cfdi.js
// Historial de facturas CFDI emitidas a clientes (distinto de facturas-proveedor).
const express = require("express");
const mongoose = require("mongoose");
const FacturaCfdi = require("../models/FacturaCfdi");

const router = express.Router();

const rx = (s) =>
  new RegExp(String(s).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

// GET /api/facturas-cfdi?q=&desde=&hasta=&estatus=&page=&limit=
router.get("/", async (req, res) => {
  try {
    let { q = "", desde = "", hasta = "", estatus = "", tipo = "", condicion = "", page = 1, limit = 10 } = req.query;
    page = Math.max(parseInt(page) || 1, 1);
    limit = Math.min(Math.max(parseInt(limit) || 10, 1), 200);

    const match = {};

    if (estatus && estatus !== "todos") match.estatus = estatus;

    // condicion=contado | credito => filtra por método de pago del CFDI
    // (PPD = crédito; PUE o documentos viejos sin método = contado)
    if (condicion === "credito") {
      match["cfdi.metodoPago"] = "PPD";
    } else if (condicion === "contado") {
      match["cfdi.metodoPago"] = { $ne: "PPD" };
    }

    // tipo=factura => solo CFDI de ingreso (excluye notas de crédito y complementos;
    // documentos viejos sin tipoFactura cuentan como factura)
    if (tipo === "factura") {
      match.tipoFactura = { $nin: ["notaCredito", "complementoPago"] };
    } else if (tipo && tipo !== "todos") {
      match.tipoFactura = tipo;
    }

    if (q) {
      const r = rx(q);
      match.$or = [
        { folio: r },
        { "cliente.nombre": r },
        { "cliente.rfc": r },
        { "orden.ordenServicio": r },
        // Una factura puede agrupar varias órdenes; hay que poder encontrarla
        // por cualquiera de ellas, no solo por la principal.
        { "ordenes.ordenServicio": r },
      ];
    }

    if (desde || hasta) {
      match.fecha = {};
      if (desde) match.fecha.$gte = new Date(desde);
      if (hasta) {
        const h = new Date(hasta);
        h.setHours(23, 59, 59, 999);
        match.fecha.$lte = h;
      }
    }

    const [docs, totalDocs] = await Promise.all([
      FacturaCfdi.find(match, { xml: 0, cadenaOriginal: 0, sello: 0 })
        .sort({ fecha: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      FacturaCfdi.countDocuments(match),
    ]);

    res.json({
      ok: true,
      page,
      limit,
      totalDocs,
      totalPages: Math.max(Math.ceil(totalDocs / limit), 1),
      docs,
    });
  } catch (err) {
    console.error("GET /facturas-cfdi ERROR:", err);
    res.status(500).json({ ok: false, error: "Error al listar facturas" });
  }
});

// GET /api/facturas-cfdi/:id  (documento completo, incluye xml, para "Ver XML")
router.get("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ ok: false, error: "ID inválido" });
    }
    const doc = await FacturaCfdi.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ ok: false, error: "No encontrada" });
    res.json({ ok: true, data: doc });
  } catch (err) {
    console.error("GET /facturas-cfdi/:id ERROR:", err);
    res.status(500).json({ ok: false, error: "Error al obtener la factura" });
  }
});

module.exports = router;
