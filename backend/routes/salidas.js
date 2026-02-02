const router = require('express').Router();
const mongoose = require('mongoose');
const EntradaInventario = require('../models/EntradaInventario');
const SalidaInventario  = require('../models/SalidaInventario');
const Vehiculo          = require('../models/Vehiculo');


/* ===== Helpers ===== */
const toObjId = (v) => {
  try { return new mongoose.Types.ObjectId(v); } catch { return null; }
};

/** Devuelve un arreglo que contiene:
 *  - cada id como string
 *  - y si es 24-hex, también su ObjectId
 *  Así los $match con $in funcionan sin importar cómo se guardó (string u ObjectId).
 */
function expandIds(codigos) {
  const out = [];
  for (const c of codigos) {
    const s = String(c);
    out.push(s);
    const oid = toObjId(s);
    if (oid) out.push(oid);
  }
  return out;
}

/** Obtiene stock actual de una lista de códigos (entradas - salidas) */
async function getStockMap(codigos) {
  const ids = expandIds(codigos);

  // 1) Entradas (positivas)
  const entradas = await EntradaInventario.aggregate([
    { $unwind: '$captura' },
    { $match: { 'captura.codigoInterno': { $in: ids } } },
    { $group: {
        _id: '$captura.codigoInterno',
        cant: { $sum: { $ifNull: ['$captura.cantidad', 0] } }
    } },
  ]);

  // 2) Salidas (negativas)
  const salidas = await SalidaInventario.aggregate([
    { $unwind: '$partidas' },
    { $match: { 'partidas.codigoInterno': { $in: ids } } },
    { $group: {
        _id: '$partidas.codigoInterno',
        cant: { $sum: { $multiply: [ { $ifNull: ['$partidas.cantidad', 0] }, -1 ] } }
    } },
  ]);

  // 3) Merge
  const map = new Map();
  for (const d of [...entradas, ...salidas]) {
    const k = String(d._id);
    map.set(k, (map.get(k) || 0) + (d.cant || 0));
  }
  return map; // Map<string, number>
}

/** Obtiene la última "unidad" usada por código en las ENTRADAS */
async function getUnidadMap(codigos) {
  const ids = expandIds(codigos);
  const rows = await EntradaInventario.aggregate([
    { $unwind: '$captura' },
    { $match: { 'captura.codigoInterno': { $in: ids } } },
    { $sort: { fechaFactura: 1 } },
    { $group: { _id: '$captura.codigoInterno', unidad: { $last: '$captura.unidad' } } }
  ]);
  const map = new Map();
  rows.forEach(r => map.set(String(r._id), r.unidad || 'Pieza'));
  return map;
}

/* ===== Routes ===== */

/** POST /api/salidas  (crear una salida completa) */
router.post('/', async (req, res) => {
  try {
    const { fechaSalida, ordenServicio, partidas = [] } = req.body || {};

    if (!fechaSalida) {
      return res.status(400).json({ success:false, message:'fechaSalida requerida' });
    }

    if (!Array.isArray(partidas) || partidas.length === 0) {
      return res.status(400).json({ success:false, message:'Agrega al menos una partida' });
    }

    // Normaliza partidas
    const limpias = partidas.map(p => ({
      codigoInterno: p.codigoInterno,
      descripcion: (p.descripcion || '').trim(),
      marca: (p.marca || '').trim(),
      unidad: (p.unidad || '').trim(),
      cantidad: Number(p.cantidad || 0),
    })).filter(p => p.codigoInterno && p.cantidad > 0);

    if (limpias.length === 0) {
      return res.status(400).json({ success:false, message:'Partidas inválidas' });
    }

    const cods = [...new Set(limpias.map(p => String(p.codigoInterno)))];

    // 1) Completar UNIDAD desde últimas entradas
    const unidadMap = await getUnidadMap(cods);
    for (const p of limpias) {
      if (!p.unidad) p.unidad = unidadMap.get(String(p.codigoInterno)) || 'Pieza';
    }

    // 2) Verificar stock disponible
    const stockMap = await getStockMap(cods);
    const faltantes = [];
    for (const p of limpias) {
      const disp = stockMap.get(String(p.codigoInterno)) || 0;
      if (disp < p.cantidad) {
        faltantes.push({ codigoInterno: p.codigoInterno, disponible: disp, solicitado: p.cantidad });
      }
    }
    if (faltantes.length) {
      return res.status(409).json({
        success:false,
        message:'Stock insuficiente para uno o más códigos',
        data: faltantes
      });
    }

    // 3) Crear salida
    const salida = await SalidaInventario.create({
      fechaSalida: new Date(fechaSalida),
      ordenServicio: (ordenServicio || '').trim(),
      partidas: limpias,
      estatus: 'cerrada',
    });

    // 4) (NUEVO) Registrar cargos en la OS correspondiente
    if (ordenServicio) {
      // armamos los "cargos" a partir de las partidas
      const cargos = limpias.map(p => ({
        cant: p.cantidad,
        unidad: p.unidad,
        refaccion: p.descripcion,
        tipo: 'INVENTARIO',      // etiqueta para saber que viene de inventario
        marca: p.marca,
        proveedor: '',           // no lo tenemos ahorita
        codigo: p.codigoInterno,
        precioUnitario: 0,       // si quieres luego puedes meter costo promedio
        importeTotal: 0,
        moneda: 'MN',
        estatus: 'CARGADO_INVENTARIO',
        origen: 'INVENTARIO',
        salidaId: salida._id,    // referencia por si luego quieres rastrearla
      }));

      // Empuja estos cargos al arreglo cargosEnOrden de la OS
      const os = await Vehiculo.findOneAndUpdate(
        { ordenServicio: String(ordenServicio).trim() },
        { $push: { cargosEnOrden: { $each: cargos } } },
        { new: true }
      );

      if (!os) {
        console.warn('No se encontró OS para registrar cargos en orden:', ordenServicio);
      }
    }

    // 5) Respuesta
    res.status(201).json({ success:true, data: salida });
  } catch (e) {
    console.error('POST /salidas error', e);
    res.status(500).json({ success:false, message: e?.message || 'Error al crear salida' });
  }
});

/**
 * GET /api/salidas/ordenes
 * Devuelve órdenes de servicio ya iniciadas (ordenIniciada = true)
 * Opcionalmente filtradas por estadoOrden (?estado=PENDIENTE_REFACCIONARIA)
 */
/**
 * GET /api/salidas/ordenes
 * Devuelve órdenes de servicio YA iniciadas (ordenIniciada = true),
 * independientemente del estado que tengan.
 * Se puede filtrar opcionalmente por número de OS o por texto libre.
 */
router.get('/ordenes', async (req, res) => {
  try {
    const {
      searchOs = '',   // buscar por número OS
      search   = '',   // buscar por cliente/marca/modelo/placas
      limit    = 100,
    } = req.query;

    // 🔵 Solo queremos que hayan sido iniciadas
    const q = { ordenIniciada: true };

    // Filtro opcional por número de OS
    if (searchOs) {
      q.ordenServicio = { $regex: searchOs.trim(), $options: 'i' };
    }

    // Filtro opcional por texto (cliente, marca, modelo, placas)
    if (search) {
      q.$or = [
        { nombreGobierno: { $regex: search.trim(), $options: 'i' } },
        { placas:         { $regex: search.trim(), $options: 'i' } },
        { marca:          { $regex: search.trim(), $options: 'i' } },
        { modelo:         { $regex: search.trim(), $options: 'i' } },
      ];
    }

    console.log('GET /salidas/ordenes -> q =', q);

    const docs = await Vehiculo.find(q)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit, 10) || 100)
      .select({
        ordenServicio: 1,
        nombreGobierno: 1,
        marca: 1,
        modelo: 1,
        placas: 1,
        fechaRecepcion: 1,
        estadoOrden: 1,
      });

    console.log('GET /salidas/ordenes -> encontrados =', docs.length);

    const data = docs.map(v => {
      const cliente = v.nombreGobierno || '';
      const descVeh = [v.marca, v.modelo].filter(Boolean).join(' / ');
      const placas  = v.placas ? ` - ${v.placas}` : '';
      return {
        _id: v._id,
        ordenServicio: v.ordenServicio,
        estadoOrden: v.estadoOrden, // por si quieres mostrarlo
        label: `${v.ordenServicio} - ${cliente} - ${descVeh}${placas}`.trim(),
      };
    });

    return res.json({ success: true, data });
  } catch (e) {
    console.error('GET /salidas/ordenes error', e);
    return res.status(500).json({
      success: false,
      message: e?.message || 'Error al obtener órdenes de servicio',
    });
  }
});


module.exports = router;
