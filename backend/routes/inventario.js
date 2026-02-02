// routes/inventario.js
const router = require('express').Router();
const mongoose = require('mongoose');
const EntradaInventario = require('../models/EntradaInventario');

// (opcional) si tienes modelo Proveedor para mostrar nombre en historial
let Proveedor = null;
try { Proveedor = require('../models/Proveedor'); } catch { /* opcional */ }

// Helper
const isObjId = (v) => /^[a-f\d]{24}$/i.test(String(v || ''));

/**
 * GET /api/inventario
 * Saca el inventario a partir de todas las entradas (arreglo captura):
 * agrupa por captura.codigoInterno y suma cantidades.
 * Devuelve: [{ _id, codigo, descripcion, unidad, cantidad }]
 *
 * Query opcional:
 *   - estatus=cerrada | abierta | todas (default: todas)
 */
router.get('/', async (req, res) => {
  try {
    const { estatus } = req.query;

    const matchEntradas = {};
    if (estatus && estatus !== 'todas') matchEntradas.estatus = estatus;

    const pipeline = [
      // === ENTRADAS (positivas)
      { $match: matchEntradas },
      { $unwind: '$captura' },
      { $match: { 'captura.codigoInterno': { $nin: [null, ''] } } },
      {
        $project: {
          _id: '$captura.codigoInterno',                 // puede ser ObjectId o string
          cantidad: { $ifNull: ['$captura.cantidad', 0] },
          descripcion: '$captura.descripcion',
          unidad: '$captura.unidad',
          fecha: '$fechaFactura',
        }
      },

      // === SALIDAS (negativas)
      { $unionWith: {
          coll: 'salidainventarios',
          pipeline: [
            { $unwind: '$partidas' },
            { $match: { 'partidas.codigoInterno': { $nin: [null, ''] } } },
            {
              $project: {
                _id: '$partidas.codigoInterno',
                cantidad: { $multiply: [ { $ifNull: ['$partidas.cantidad', 0] }, -1 ] },
                descripcion: '$partidas.descripcion',
                unidad: '$partidas.unidad',
                fecha: '$fechaSalida',
              }
            }
          ]
      }},

      // === SUMA entradas - salidas
      {
        $group: {
          _id: '$_id',
          cantidad:   { $sum: '$cantidad' },
          descripcion:{ $last: '$descripcion' },
          unidad:     { $last: '$unidad' },
          ultFecha:   { $last: '$fecha' },
        }
      },

      // === JOIN con BDCodigos SIN $toObjectId
      // Comparamos por: (string _id) == (string _id de código)  OR  numeroParte == (string _id)
      {
        $lookup: {
          from: 'codigorefaccions',
          let: { cidStr: { $toString: '$_id' } },          // nuestro id siempre como string
          pipeline: [
            { $project: { numeroParte:1, marca:1, descripcion:1, _idStr: { $toString: '$_id' } } },
            { $match: { $expr: { $or: [
              { $eq: ['$_idStr', '$$cidStr'] },            // cuando captura.codigoInterno fue ObjectId
              { $eq: ['$numeroParte', '$$cidStr'] }        // cuando captura.codigoInterno fue string (P-1001)
            ] } } }
          ],
          as: 'code'
        }
      },
      { $addFields: { code: { $arrayElemAt: ['$code', 0] } } },
      {
        $project: {
          _id:        { $toString: '$_id' },
          codigo:     { $ifNull: ['$code.numeroParte', { $toString: '$_id' }] },
          descripcion:{ $ifNull: ['$descripcion', '$code.descripcion'] },
          unidad:     1,
          cantidad:   1,
          ultFecha:   1,
        }
      },
      { $sort: { descripcion: 1 } },
    ];

    const data = await EntradaInventario.aggregate(pipeline);
    res.json({ success: true, data });
  } catch (err) {
    console.error('GET /inventario error:', err);
    res.status(500).json({ success: false, message: 'No se pudo obtener el inventario', error: err.message });
  }
});


/**
 * GET /api/inventario/:codigo/historial
 * Devuelve el historial de compra (todas las partidas captura) para un producto.
 * :codigo puede ser un ObjectId (de Producto) o un string que guardaste en codigoInterno.
 *
 * Respuesta: [{ fechaFactura, proveedorId, proveedorNombre, tipoComprobante, numero, cantidad, costoUnitario, ivaPct, total }]
 */
router.get('/:codigo/historial', async (req, res) => {
  try {
    const { codigo } = req.params;

    const matchCodigo = isObjId(codigo)
      ? { $or: [ { 'captura.codigoInterno': new mongoose.Types.ObjectId(codigo) }, { 'captura.codigoInterno': codigo } ] }
      : { 'captura.codigoInterno': codigo };

    const pipeline = [
      { $unwind: '$captura' },
      { $match: matchCodigo },
      {
        $project: {
          _id: 0,
          fechaFactura: '$fechaFactura',
          proveedorId: '$proveedorId',
          tipoComprobante: '$tipoComprobante',
          numero: '$numero',
          cantidad: '$captura.cantidad',
          costoUnitario: '$captura.costoUnitario',
          ivaPct: { $ifNull: ['$captura.ivaPct', 0] },
          total: {
            $ifNull: [
              '$captura.total',
              { $multiply: ['$captura.cantidad', '$captura.costoUnitario'] }
            ]
          }
        }
      },
      { $sort: { fechaFactura: -1 } },
    ];

    let rows = await EntradaInventario.aggregate(pipeline);

    // Anexa nombre de proveedor si existe el modelo
    if (Proveedor && rows.length) {
      const ids = [...new Set(rows.map(r => String(r.proveedorId)).filter(Boolean))];
      const mapa = new Map();
      const provs = await Proveedor.find({ _id: { $in: ids } }, { nombreProveedor: 1, nombre: 1 }).lean();
      provs.forEach(p => mapa.set(String(p._id), p.nombreProveedor || p.nombre || ''));
      rows = rows.map(r => ({ ...r, proveedorNombre: mapa.get(String(r.proveedorId)) || '' }));
    }

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /inventario/:codigo/historial error:', err);
    res.status(500).json({ success: false, message: 'No se pudo obtener el historial', error: err.message });
  }
});

module.exports = router;
