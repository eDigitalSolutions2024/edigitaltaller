// backend/routes/facturas_cfdi.js
// Historial de facturas CFDI emitidas a clientes (distinto de facturas-proveedor).
const express = require("express");
const mongoose = require("mongoose");
const FacturaCfdi = require("../models/FacturaCfdi");
const { proteger, requiereRol } = require("../middleware/auth");
const { registrarAccion } = require("../utils/registrarAccion");
const { numerosLiberadosDeGlobal } = require("../utils/notaCreditoGlobal");
const {
  MOTIVOS_CANCELACION,
  folioDe,
  facturasPreviasDeOrdenes,
  vehiculoIdsConCobroHeredable,
  registrarCancelacionFactura,
} = require("../utils/refacturacion");

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
        // Serie + folio juntos (ej. "A44"), como se muestra en la tabla.
        {
          $expr: {
            $regexMatch: {
              input: { $concat: [{ $ifNull: ["$serie", ""] }, { $toString: { $ifNull: ["$folio", ""] } }] },
              regex: r.source,
              options: "i",
            },
          },
        },
        { "cliente.nombre": r },
        { "cliente.rfc": r },
        { "orden.ordenServicio": r },
        // Una factura puede agrupar varias órdenes; hay que poder encontrarla
        // por cualquiera de ellas, no solo por la principal.
        { "ordenes.ordenServicio": r },
        // Una Factura Global tampoco guarda órdenes: se encuentra por las de sus notas de venta
        // (para acreditar una nota con una nota de crédito y facturarla a su cliente).
        { "notasVenta.ordenServicio": r },
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

// GET /api/facturas-cfdi/por-orden/:vehiculoId
// Facturas de ingreso previas de una orden (vigentes y canceladas), para que Nueva
// Factura sepa si es una refacturación (sustitución 04) y qué cobro hereda.
router.get("/por-orden/:vehiculoId", proteger, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.vehiculoId)) {
      return res.status(400).json({ ok: false, error: "ID inválido" });
    }
    const { vigentes, canceladas } = await facturasPreviasDeOrdenes([req.params.vehiculoId]);
    const resumen = (f) => ({
      _id: f._id,
      serie: f.serie || "",
      folio: f.folio || "",
      folioCompleto: folioDe(f),
      fecha: f.fecha,
      total: f.totales?.total || 0,
      estatus: f.estatus,
      ordenes: [f.orden, ...(f.ordenes || [])]
        .filter((o) => o?.ordenServicio)
        .map((o) => ({ vehiculoId: o.vehiculoId, ordenServicio: o.ordenServicio }))
        .filter((o, i, a) => a.findIndex((x) => String(x.vehiculoId) === String(o.vehiculoId)) === i),
    });
    // ¿Hay pagos de Cajas ligados a esas facturas? Entonces la factura nueva hereda ese
    // cobro y el wizard no debe pedir capturarlo otra vez.
    const heredables = await vehiculoIdsConCobroHeredable(
      [req.params.vehiculoId],
      [...vigentes, ...canceladas].map((f) => f._id)
    );
    res.json({
      ok: true,
      data: {
        vigentes: vigentes.map(resumen),
        canceladas: canceladas.map(resumen),
        heredaCobro: heredables.has(String(req.params.vehiculoId)),
      },
    });
  } catch (err) {
    console.error("GET /facturas-cfdi/por-orden ERROR:", err);
    res.status(500).json({ ok: false, error: "Error al consultar las facturas de la orden" });
  }
});

// GET /api/facturas-cfdi/:id/notas-liberadas
// Números de nota de venta de una Factura Global que ya se acreditaron con una nota de crédito
// (Nueva Factura no deja elegirlas otra vez).
router.get("/:id/notas-liberadas", proteger, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ ok: false, error: "ID inválido" });
    }
    res.json({ ok: true, data: await numerosLiberadosDeGlobal(req.params.id) });
  } catch (err) {
    console.error("GET /facturas-cfdi/:id/notas-liberadas ERROR:", err);
    res.status(500).json({ ok: false, error: "Error al consultar las notas liberadas" });
  }
});

// POST /api/facturas-cfdi/:id/cancelar   (solo admin)
// REGISTRA la cancelación de una factura de ingreso (la cancelación real ante el SAT
// se hace fuera del sistema). Motivo 01 exige el folio de la factura que la
// sustituye, que debe existir y estar vigente.
router.post("/:id/cancelar", proteger, requiereRol("admin"), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ ok: false, error: "ID inválido" });
    }
    const { motivo = "", sustituidaPorFolio = "", nota = "" } = req.body || {};
    if (!MOTIVOS_CANCELACION.includes(motivo)) {
      return res.status(400).json({ ok: false, error: "Motivo de cancelación inválido (01, 02, 03 o 04)." });
    }

    const factura = await FacturaCfdi.findById(req.params.id).select("serie folio tipoFactura estatus").lean();
    if (!factura) return res.status(404).json({ ok: false, error: "No encontrada" });
    if (factura.tipoFactura !== "factura") {
      return res.status(400).json({
        ok: false,
        error: "Solo se puede registrar la cancelación de facturas de ingreso.",
      });
    }
    if (factura.estatus === "cancelada") {
      return res.status(409).json({ ok: false, error: "La factura ya estaba cancelada." });
    }

    let sustituta = null;
    if (motivo === "01") {
      const folioTxt = String(sustituidaPorFolio || "").trim().toUpperCase();
      if (!folioTxt) {
        return res.status(400).json({
          ok: false,
          error: "Con el motivo 01 indica el folio de la factura que la sustituye.",
        });
      }
      sustituta = await FacturaCfdi.findOne({
        tipoFactura: "factura",
        estatus: "generada",
        _id: { $ne: factura._id },
        $expr: {
          $eq: [
            { $toUpper: { $concat: [{ $ifNull: ["$serie", ""] }, { $ifNull: ["$folio", ""] }] } },
            folioTxt,
          ],
        },
      })
        .select("serie folio")
        .lean();
      if (!sustituta) {
        return res.status(400).json({
          ok: false,
          error: `No hay una factura vigente con el folio ${folioTxt}. Emítela primero (SAT: la sustituta va antes de cancelar).`,
        });
      }
    }

    const actualizada = await registrarCancelacionFactura(factura._id, {
      motivo,
      sustituta,
      nota,
      user: req.user,
    });
    if (!actualizada) return res.status(409).json({ ok: false, error: "La factura ya estaba cancelada." });

    registrarAccion(req, {
      accion: "FACTURA_CANCELAR",
      entidad: "facturas-cfdi",
      entidadId: factura._id,
      referencia: folioDe(factura),
      detalle: {
        motivo,
        sustituidaPor: sustituta ? folioDe(sustituta) : "",
        nota: String(nota || "").trim(),
      },
    });

    res.json({ ok: true, data: { _id: actualizada._id, estatus: actualizada.estatus, cancelacion: actualizada.cancelacion } });
  } catch (err) {
    console.error("POST /facturas-cfdi/:id/cancelar ERROR:", err);
    res.status(500).json({ ok: false, error: "Error al registrar la cancelación" });
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
