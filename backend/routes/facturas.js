const router = require('express').Router();
const EntradaInventario = require('../models/EntradaInventario');

// GET /api/facturas-proveedor
router.get('/facturas-proveedor', async (req, res) => {
  try {
    let { numero, proveedor, q, estado, desde, hasta, page = 1, limit = 10, sort = '-fecha' } = req.query;
    page  = Math.max(parseInt(page)  || 1,  1);
    limit = Math.min(Math.max(parseInt(limit) || 10, 1), 200);

    const rx = (s) => new RegExp(String(s).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    // ── Filtros base ──────────────────────────────────────────────────────────
    const match = { numero: { $nin: [null, ''] } };

    if (estado && estado !== 'todos') match.estado = estado;

    if (numero) match.numero = rx(numero);

    if (desde || hasta) {
      match.fechaFactura = {};
      if (desde) match.fechaFactura.$gte = new Date(desde);
      if (hasta) {
        const hastaDate = new Date(hasta);
        hastaDate.setHours(23, 59, 59, 999);
        match.fechaFactura.$lte = hastaDate;
      }
    }

    const sortStage = sort.startsWith('-') ? { fecha: -1 } : { fecha: 1 };

    const pipeline = [
      { $match: match },

      // ✅ NO agrupamos — cada entrada es una fila independiente
      // Así conservamos el _id real de MongoDB para el botón "Continuar"
      { $sort: sortStage },

      // Join con proveedores para obtener el nombre
      {
        $lookup: {
          from: 'proveedors',
          localField: 'proveedorId',
          foreignField: '_id',
          as: 'provInfo'
        }
      },
      {
        $addFields: {
          proveedorNombre: {
            $ifNull: [
              { $arrayElemAt: ['$provInfo.nombreProveedor', 0] },
              { $ifNull: [
                { $arrayElemAt: ['$provInfo.nombre', 0] },
                'Sin nombre'
              ]}
            ]
          }
        }
      },

      // Filtro por nombre de proveedor (si se especificó)
      ...(proveedor ? [{ $match: { proveedorNombre: rx(proveedor) } }] : []),

      // Filtro de búsqueda general
      ...(q ? [{ $match: { $or: [{ numero: rx(q) }, { proveedorNombre: rx(q) }] } }] : []),

      {
        $facet: {
          docs: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $project: {
                _id: 1,           // ✅ _id real de MongoDB — necesario para "Continuar captura"
                factura: '$numero',
                proveedor: '$proveedorNombre',
                fecha: '$fechaFactura',
                estado: 1,
                fotoFactura: 1,
              }
            }
          ],
          count: [{ $count: 'total' }]
        }
      }
    ];

    const result = await EntradaInventario.aggregate(pipeline);
    const facet = result[0] || { docs: [], count: [] };
    const totalDocs = facet.count[0]?.total || 0;
    const totalPages = Math.max(Math.ceil(totalDocs / limit), 1);

    res.json({ ok: true, page, limit, totalDocs, totalPages, docs: facet.docs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Error al listar facturas de proveedor' });
  }
});

module.exports = router;