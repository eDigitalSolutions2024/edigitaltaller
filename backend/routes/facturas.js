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

    const match = { numero: { $nin: [null, ''] } }; // ← era "factura"
    if (numero)    match.numero     = rx(numero);    // ← era "factura"
    if (desde || hasta) {
      match.fechaFactura = {};
      if (desde) match.fechaFactura.$gte = new Date(desde);  // ✅ convierte a Date
      if (hasta) {
        const hastaDate = new Date(hasta);
        hastaDate.setHours(23, 59, 59, 999);                 // ✅ incluye todo el día
        match.fechaFactura.$lte = hastaDate;
      }
    }
    if (q) {
      match.$or = [
        { numero: rx(q) },                           // ← era "factura"
        { proveedorId: rx(q) },                      // ← era "proveedor"
      ];
    }



    const sortStage = sort.startsWith('-') ? { fecha: -1 } : { fecha: 1 };

    
    const pipeline = [
      { $match: match },
      { $group: {
          _id: { factura: "$numero", proveedor: "$proveedorId" },
          fecha: { $max: "$fechaFactura" },
      }},
      { $sort: sortStage },
      { $lookup: {
          from: "proveedors",
          localField: "_id.proveedor",  // ← ya es ObjectId, sin conversión
          foreignField: "_id",
          as: "provInfo"
      }},
      { $addFields: {
          proveedorNombre: {
            $ifNull: [
              { $arrayElemAt: ["$provInfo.nombreProveedor", 0] },
              "Sin nombre"
            ]
          }
      }},
      ...(proveedor ? [{ $match: { proveedorNombre: rx(proveedor) } }] : []),
      { $facet: {
          docs: [
            { $skip: (page-1)*limit },
            { $limit: limit },
            { $project: {
                _id: 0,
                factura: "$_id.factura",
                proveedor: "$proveedorNombre",
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
