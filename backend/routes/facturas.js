const router = require('express').Router();
const EntradaInventario = require('../models/EntradaInventario');

// GET /api/facturas-proveedor
// Query: numero, proveedor, q, desde, hasta, page, limit, sort
router.get('/facturas-proveedor', async (req, res) => {
  try {
    let { numero, proveedor, q, desde, hasta, page = 1, limit = 10, sort = '-fecha' } = req.query;
    page  = Math.max(parseInt(page)||1, 1);
    limit = Math.min(Math.max(parseInt(limit)||10, 1), 200);

    const rx = (s) => new RegExp(String(s).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const match = { factura: { $nin: [null, ''] } };
    if (numero)    match.factura   = rx(numero);
    if (proveedor) match.proveedor = rx(proveedor);
    if (desde || hasta) {
      match.fecha = {};
      if (desde) match.fecha.$gte = desde;
      if (hasta) match.fecha.$lte = hasta;
    }
    if (q) {
      match.$or = [
        { factura: rx(q) },
        { proveedor: rx(q) },
        { folioRelacionado: rx(q) }
      ];
    }

    const sortStage = sort.startsWith('-') ? { fecha: -1 } : { fecha: 1 };

    const pipeline = [
      { $match: match },
      { $group: {
          _id: { factura: "$factura", proveedor: "$proveedor" },
          fecha: { $max: "$fecha" },   // última fecha en que se registró esa factura
        }
      },
      { $sort: sortStage },
      { $facet: {
          docs: [
            { $skip: (page-1)*limit },
            { $limit: limit },
            { $project: {
                _id: 0,
                factura: "$_id.factura",
                proveedor: "$_id.proveedor",
                fecha: 1
            }}
          ],
          count: [ { $count: "total" } ]
      }}
    ];

    const result = await EntradaInventario.aggregate(pipeline);
    const facet = result[0] || { docs: [], count: [] };
    const totalDocs = facet.count[0]?.total || 0;
    const totalPages = Math.max(Math.ceil(totalDocs/limit), 1);

    res.json({ ok:true, page, limit, totalDocs, totalPages, docs: facet.docs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok:false, msg:"Error al listar facturas de proveedor" });
  }
});

module.exports = router;
