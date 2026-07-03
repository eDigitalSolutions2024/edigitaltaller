// routes/inventario.js
const router = require('express').Router();
const mongoose = require('mongoose');
const EntradaInventario = require('../models/EntradaInventario');
const SalidaInventario  = require('../models/SalidaInventario');
const AjusteInventario  = require('../models/AjusteInventario');
const { proteger, requiereRol } = require('../middleware/auth');

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
          // $toString unifica ObjectId y string del mismo ID en un único grupo
          _id: { $toString: '$captura.codigoInterno' },
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
                _id: { $toString: '$partidas.codigoInterno' },
                cantidad: { $multiply: [ { $ifNull: ['$partidas.cantidad', 0] }, -1 ] },
                descripcion: '$partidas.descripcion',
                unidad: '$partidas.unidad',
                fecha: '$fechaSalida',
              }
            }
          ]
      }},

      // === AJUSTES MANUALES (positivo = entrada, negativo = salida)
      { $unionWith: {
          coll: 'ajusteinventarios',
          pipeline: [
            { $match: { codigoInterno: { $nin: [null, ''] } } },
            {
              $project: {
                _id: { $toString: '$codigoInterno' },
                cantidad: { $ifNull: ['$cantidad', 0] },
                descripcion: '$descripcion',
                unidad: '$unidad',
                fecha: '$fecha',
              }
            }
          ]
      }},

      // === SUMA entradas - salidas + ajustes
      {
        $group: {
          _id: '$_id',
          cantidad:   { $sum: '$cantidad' },
          // $first toma la descripción/unidad de EntradaInventario (llega antes vía pipeline)
          descripcion:{ $first: '$descripcion' },
          unidad:     { $first: '$unidad' },
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
            { $project: { numeroParte:1, marca:1, descripcion:1, precioUnitario:1, _idStr: { $toString: '$_id' } } },
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
          descripcion:{
            $cond: [
              { $and: [{ $ne: ['$descripcion', null] }, { $ne: ['$descripcion', ''] }] },
              '$descripcion',
              '$code.descripcion'
            ]
          },
          unidad:     1,
          cantidad:   1,
          ultFecha:   1,
          marca:          '$code.marca',
          precioUnitario: '$code.precioUnitario',
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

/**
 * GET /api/inventario/:codigo/historial-usos
 * Devuelve salidas de OS + ajustes manuales para un producto.
 * Respuesta: [{ fecha, tipo, cantidad, referencia, usuario }]
 */
router.get('/:codigo/historial-usos', async (req, res) => {
  try {
    const { codigo } = req.params;
    const strCodigo = String(codigo);

    // Construir el $in para salidas (puede ser ObjectId o string)
    const idsParaSalidas = [strCodigo];
    if (isObjId(strCodigo)) {
      idsParaSalidas.push(new mongoose.Types.ObjectId(strCodigo));
    }

    const [salidas, ajustes] = await Promise.all([
      // Salidas: cada partida que coincida con el código
      SalidaInventario.aggregate([
        { $unwind: '$partidas' },
        { $match: { 'partidas.codigoInterno': { $in: idsParaSalidas } } },
        {
          $project: {
            _id: 0,
            fecha:      '$fechaSalida',
            tipo:       { $literal: 'SALIDA' },
            cantidad:   { $multiply: ['$partidas.cantidad', -1] },
            referencia: { $ifNull: ['$ordenServicio', ''] },
            usuario:    { $ifNull: ['$surtidoPor', ''] },
          }
        },
        { $sort: { fecha: -1 } },
      ]),

      // Ajustes manuales
      AjusteInventario.find(
        { codigoInterno: strCodigo },
        { fecha: 1, cantidad: 1, motivo: 1, usuario: 1 }
      )
        .sort({ fecha: -1 })
        .lean()
        .then(rows => rows.map(r => ({
          fecha:      r.fecha,
          tipo:       r.cantidad >= 0 ? 'AJUSTE_ENTRADA' : 'AJUSTE_SALIDA',
          cantidad:   r.cantidad,
          referencia: r.motivo || '',
          usuario:    r.usuario || '',
        }))),
    ]);

    // Mezclar y ordenar por fecha desc
    const data = [...salidas, ...ajustes].sort(
      (a, b) => new Date(b.fecha) - new Date(a.fecha)
    );

    res.json({ success: true, data });
  } catch (err) {
    console.error('GET /inventario/:codigo/historial-usos error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/inventario/ajuste  (solo admin)
 * Ajuste manual de inventario. cantidad positiva = entrada, negativa = salida.
 */
router.post('/ajuste', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { codigoInterno, cantidad, motivo, descripcion, unidad } = req.body;

    if (!codigoInterno || String(codigoInterno).trim() === '') {
      return res.status(400).json({ success: false, message: 'codigoInterno requerido' });
    }
    const qty = Number(cantidad);
    if (!qty || qty === 0) {
      return res.status(400).json({ success: false, message: 'La cantidad debe ser diferente de 0' });
    }

    const ajuste = await AjusteInventario.create({
      codigoInterno: String(codigoInterno).trim(),
      descripcion:   (descripcion || '').trim(),
      unidad:        (unidad || '').trim(),
      cantidad:      qty,
      motivo:        (motivo || '').trim(),
      usuario:       req.user?.email || req.user?.name || 'admin',
      fecha:         new Date(),
    });

    res.status(201).json({ success: true, data: ajuste });
  } catch (err) {
    console.error('POST /inventario/ajuste error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
