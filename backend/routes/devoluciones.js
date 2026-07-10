const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const EntradaInventario = require('../models/EntradaInventario');
const SalidaInventario  = require('../models/SalidaInventario');
try { Proveedor = require('../models/Proveedor'); } catch {}
const { Devolucion } = require('../models/Devolucion'); // << usar SIEMPRE este
const DevolucionRefaccion = require('../models/DevolucionRefaccion');
const Contador = require('../models/Contador');
const CodigoRefaccion = require('../models/CodigoRefaccion');
const { streamDevolucionRefaccionPdf } = require('../service/devolucionRefaccionPdf');

/* ───────────── Helpers ───────────── */

const toDate = v => {
  if (!v) return undefined;
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + 'T00:00:00.000Z');
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) {
      const [d, m, y] = v.split('/').map(Number);
      return new Date(Date.UTC(y, m - 1, d));
    }
  }
  return new Date(v);
};
const pad5 = n => String(n).padStart(5, '0');

async function generarFolio(tipo = 'DINERO') {
  const y = new Date().getFullYear();
  const from = new Date(`${y}-01-01T00:00:00.000Z`);
  const to   = new Date(`${y + 1}-01-01T00:00:00.000Z`);
  const count = await Devolucion.countDocuments({ tipo, createdAt: { $gte: from, $lt: to } });
  const pref = tipo === 'DINERO' ? 'DIN' : tipo === 'PIEZA' ? 'PIE' : 'VAL';
  return `DEV-${pref}-${y}-${pad5(count + 1)}`;
}

function calcTotales(lineas) {
  return lineas.reduce((acc, l) => {
    const cant = Number(l.cantidad || 0);
    const pu   = Number(l.precioUnitario ?? l.pu ?? 0);
    const ivaP = Number(l.ivaPct ?? l.iva ?? 16);
    const sub = +(cant * pu).toFixed(2);
    const iva = +((sub * ivaP) / 100).toFixed(2);
    acc.subtotal += sub; acc.iva += iva; acc.total += sub + iva;
    return acc;
  }, { subtotal: 0, iva: 0, total: 0 });
}

const asRx = s => new RegExp(String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
const isObjId = v => typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v);

// llave para stock (compat histórica) — prioriza itemId
const takeKey = c => String(
  c.itemId ?? c.codigoInterno ?? c.codigo ?? c.codigoRefaccionId ?? c.refaccionId ?? ''
);

/** Stock = Entradas - Salidas por llave */
async function getStockMap(codigos) {
  const keysStr = [...new Set(codigos.filter(Boolean).map(v => String(v).trim()))];
  const toObjId = (v) => (mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(v) : null);
  const keysObj = keysStr.map(toObjId).filter(Boolean);

  const map = new Map(keysStr.map(k => [k, 0]));

  const buildOr = (arrStr, arrObj) => ([
    { 'captura.itemId':            { $in: arrObj } },
    { 'captura.codigoInterno':     { $in: [...arrStr, ...arrObj] } },
    { 'captura.codigo':            { $in: arrStr } },
    { 'captura.codigoRefaccionId': { $in: [...arrStr, ...arrObj] } },
    { 'captura.refaccionId':       { $in: [...arrStr, ...arrObj] } },
  ]);

  const add = (doc, sign) => {
    for (const c of (doc.captura || [])) {
      const rawKey = c.itemId ?? c.codigoInterno ?? c.codigo ?? c.codigoRefaccionId ?? c.refaccionId ?? '';
      const k = String(rawKey).trim();
      if (!k || !map.has(k)) continue;
      map.set(k, (map.get(k) || 0) + sign * Number(c.cantidad || 0));
    }
  };

  const ent = await EntradaInventario.find({ $or: buildOr(keysStr, keysObj) }, { captura: 1 }).lean();
  ent.forEach(d => add(d, +1));

  const sal = await SalidaInventario.find({ $or: buildOr(keysStr, keysObj) }, { captura: 1 }).lean();
  sal.forEach(d => add(d, -1));

  return map;
}

/* ───────────── Rutas ───────────── */

// Ping
router.get('/_ping', (_req, res) => res.json({ ok: true, now: new Date().toISOString() }));

// GET /api/devoluciones/proveedor/dinero/prep?factura=XXX
router.get('/proveedor/dinero/prep', async (req, res) => {
  try {
    const factura = String(req.query.factura || '').trim();
    if (!factura) return res.status(400).json({ error: 'Falta factura' });

    const matchFactura = [
      { numero: String(factura) },
      { numero: asRx(factura) },
      { facturaNumero: asRx(factura) },
      { factura: asRx(factura) },
    ];

    const ent = await EntradaInventario.findOne({ $or: matchFactura })
      .populate({ path: 'proveedorId', select: 'nombreProveedor aliasProveedor rfc' })
      .lean();

    if (!ent) return res.status(404).json({ error: `No hay entradas con la factura ${factura}` });

    const proveedor = ent.proveedorId
      ? { id: ent.proveedorId._id, nombre: ent.proveedorId.nombreProveedor || ent.proveedorId.aliasProveedor || '', rfc: ent.proveedorId.rfc || '' }
      : null;

    const caps = Array.isArray(ent.captura) ? ent.captura : [];
    const keys = caps.map(takeKey).filter(Boolean);
    const stockMap = keys.length ? await getStockMap(keys) : new Map();

    const items = caps.map((cap) => {
      const key = takeKey(cap);
      const comprado = Number(cap.cantidad || 0);
      const pu  = Number(cap.costoUnitario ?? cap.precioUnitario ?? cap.pu ?? 0);
      const iva = Number(cap.ivaPct ?? cap.iva ?? 16);
      const disponible = Number(stockMap.get(String(key)) || 0);

      const codigoHumano =
        (cap.codigo && typeof cap.codigo === 'string') ? cap.codigo :
        (cap.codigoInterno && typeof cap.codigoInterno === 'string') ? cap.codigoInterno :
        '';

      return {
        codigoInterno: codigoHumano,     // UI
        codigoProveedor: cap.codigoProveedor || '',
        marca: cap.marca || cap.descripcion || '',
        unidad: cap.unidad || 'Pieza',
        comprado, pu, iva,
        keyInventario: String(key),      // LLAVE REAL
        stockDisponible: Math.max(0, disponible),
        maxDevolver: Math.max(0, Math.min(comprado, disponible)),
      };
    });

    res.json({
      facturaNumero: ent.numero || factura,
      proveedor,
      fechaEntrada: ent.fechaFactura || ent.createdAt,
      items
    });
  } catch (e) {
    console.error('GET /proveedor/dinero/prep', e);
    res.status(500).json({ error: 'Error preparando datos de factura', detail: e.message });
  }
});

// POST /api/devoluciones/dinero  (sin transacciones; con rollback manual)
router.post('/dinero', async (req, res) => {
  try {
    const {
      fechaDevolucion, proveedor, motivo, fechaRecibe, quienRecibe,
      observaciones, formaPago, facturaNumero, lineas = []
    } = req.body || {};

    if (!Array.isArray(lineas) || lineas.length === 0) {
      return res.status(400).json({ ok: false, error: 'Debes capturar al menos una línea.' });
    }

    // Normaliza líneas
    const lineasNorm = (lineas || []).map(l => {
      const key = String(l.keyInventario || l.itemId || l.codigoInterno || '').trim();
      return {
        keyInventario: key,                           // clave real (stock)
        codigoMostrar: String(l.codigoInterno || ''), // lo visto en la UI
        unidad: l.unidad || 'Pieza',
        marca: l.marca || '',
        cantidad: Number(l.cantidad || 0),
        precioUnitario: Number(l.precioUnitario ?? l.pu ?? 0),
        ivaPct: Number(l.ivaPct ?? l.iva ?? 16),
      };
    });

    // Valida stock
    const codes = lineasNorm.map(l => l.keyInventario).filter(Boolean);
    const stock = await getStockMap(codes);
    const faltantes = [];
    for (const l of lineasNorm) {
      const disp = Number(stock.get(l.keyInventario) || 0);
      if (disp < l.cantidad) faltantes.push({ codigo: l.keyInventario, disponible: disp, solicitado: l.cantidad });
    }
    if (faltantes.length) {
      return res.status(409).json({ ok: false, error: 'Stock insuficiente para devolver', faltantes });
    }

    const folio = await generarFolio('DINERO');
    const totalesSrv = calcTotales(lineasNorm);

    // 1) Crea Devolución (SIEMPRE en colección devoluciones)
    const dev = await Devolucion.create({
      tipo: 'DINERO',
      folio,
      fechaDevolucion: toDate(fechaDevolucion),
      proveedor,
      motivo,
      fechaRecibe: toDate(fechaRecibe),
      quienRecibe,
      observaciones,
      formaPago,
      facturaNumero,
      lineas: lineasNorm.map(l => ({
        itemId: isObjId(l.keyInventario) ? new mongoose.Types.ObjectId(l.keyInventario) : null,
        codigoInterno: l.codigoMostrar || l.keyInventario, // humano para auditoría
        cantidad: l.cantidad,
        unidad: l.unidad,
        precioUnitario: l.precioUnitario,
        ivaPct: l.ivaPct,
        marca: l.marca,
      })),
      totales: totalesSrv
    });

    // 2) Crea SalidaInventario (resta stock) con LA MISMA LLAVE
    const fechaOut = toDate(fechaDevolucion) || new Date();
    const capturaSalida = lineasNorm.map(l => ({
      itemId: isObjId(l.keyInventario) ? new mongoose.Types.ObjectId(l.keyInventario) : undefined,
      codigoInterno: l.keyInventario,   // CLAVE DE STOCK
      cantidad: l.cantidad,
      unidad: l.unidad,
      precioUnitario: l.precioUnitario,
      pu: l.precioUnitario,
      ivaPct: l.ivaPct,
      iva: l.ivaPct,
      marca: l.marca,
      comentarios: `DEVOLUCIÓN DINERO folio ${folio} factura ${facturaNumero || ''} (mostrado:${l.codigoMostrar || '-'})`,
    }));

    try {
      await SalidaInventario.create({
        fechaSalida: fechaOut,
        fecha: fechaOut,
        tipoSalida: 'DEV_PROV_DINERO',
        tipo: 'DEV_PROV_DINERO',
        folioRelacionado: folio,
        folio,
        proveedor: proveedor || '',
        factura: facturaNumero || '',
        partidas: capturaSalida
      });
    } catch (e) {
      // rollback manual si falla la salida
      await Devolucion.deleteOne({ _id: dev._id }).catch(() => {});
      throw e;
    }

    return res.status(201).json({ ok: true, folio, total: totalesSrv.total, devId: dev._id });
  } catch (err) {
    console.error('[POST /dinero] error:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Error al registrar la devolución' });
  }
});

/* ───────────── Devolución de Refacciones (formato impreso) ───────────── */

// GET /api/devoluciones/refaccion/facturas?q=XXX
// Búsqueda incremental de facturas en Entrada Inventario (typeahead).
router.get('/refaccion/facturas', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json([]);

    const ents = await EntradaInventario.find({ numero: asRx(q) })
      .populate({ path: 'proveedorId', select: 'nombreProveedor aliasProveedor' })
      .sort({ fechaFactura: -1 })
      .limit(10)
      .select('numero fechaFactura proveedorId')
      .lean();

    res.json(ents.map(e => ({
      _id: e._id,
      numero: e.numero || '',
      proveedor: e.proveedorId ? (e.proveedorId.nombreProveedor || e.proveedorId.aliasProveedor || '') : '',
      fechaFactura: e.fechaFactura || null,
    })));
  } catch (e) {
    console.error('GET /refaccion/facturas', e);
    res.status(500).json({ error: 'Error buscando facturas' });
  }
});

// GET /api/devoluciones/refaccion/prefill?factura=XXX
// Prellenado desde Entrada Inventario; los datos siguen siendo editables en la UI.
router.get('/refaccion/prefill', async (req, res) => {
  try {
    const factura = String(req.query.factura || '').trim();
    if (!factura) return res.status(400).json({ error: 'Falta factura' });

    const ent = await EntradaInventario.findOne({ $or: [{ numero: factura }, { numero: asRx(factura) }] })
      .populate({ path: 'proveedorId', select: 'nombreProveedor aliasProveedor' })
      .lean();

    if (!ent) return res.status(404).json({ error: `No hay entradas con la factura ${factura}` });

    // captura.codigoInterno puede traer el _id del catálogo; se resuelve al
    // código humano (numeroParte/codigo) de CodigoRefaccion.
    const caps = ent.captura || [];
    const idsCatalogo = caps.map(c => String(c.codigoInterno || '')).filter(isObjId);
    let catMap = new Map();
    if (idsCatalogo.length) {
      const cats = await CodigoRefaccion.find({ _id: { $in: idsCatalogo } })
        .select('codigo numeroParte descripcion')
        .lean();
      catMap = new Map(cats.map(c => [String(c._id), c]));
    }

    res.json({
      numeroFactura: ent.numero || factura,
      proveedor: ent.proveedorId ? (ent.proveedorId.nombreProveedor || ent.proveedorId.aliasProveedor || '') : '',
      fechaFactura: ent.fechaFactura || ent.createdAt,
      moneda: ent.moneda || 'MXN',
      numeroOrdenServicio: ent.ordenVinculada?.numeroOrden || '',
      // Tabla completa de la entrada: cada renglón editable pieza por pieza.
      refacciones: caps.map(c => {
        const raw = String(c.codigoInterno || '');
        const cat = catMap.get(raw);
        const cantidad = Number(c.cantidad || 0);
        const costoUnitario = Number(c.costoUnitario ?? c.precioUnitario ?? c.pu ?? 0);
        const descuentoPct = Number(c.descuentoPct ?? 0);
        // La captura guarda el descuento en %; en la devolución se maneja como monto ($).
        const descuento = +((cantidad * costoUnitario) * (descuentoPct / 100)).toFixed(2);
        return {
          codigo: cat ? (cat.numeroParte || cat.codigo || '') : (isObjId(raw) ? '' : raw),
          nombre: c.descripcion || cat?.descripcion || '',
          tipo: c.tipo || '',
          unidad: c.unidad || 'Pieza',
          cantidad,
          costoUnitario,
          ivaPct: Number(c.ivaPct ?? 16),
          descuento,
        };
      }),
    });
  } catch (e) {
    console.error('GET /refaccion/prefill', e);
    res.status(500).json({ error: 'Error preparando datos de factura', detail: e.message });
  }
});

// GET /api/devoluciones/refaccion?q=&tipo=&desde=&hasta=&limit=
// Consulta unificada (dinero / pieza x pieza / vale) y listado para reimpresión.
router.get('/refaccion', async (req, res) => {
  try {
    const { q, tipo, desde, hasta } = req.query;
    const filtro = {};

    if (tipo && ['DINERO', 'PIEZA', 'VALE'].includes(String(tipo))) {
      filtro.tipoDevolucion = String(tipo);
    }

    if (desde || hasta) {
      filtro.fechaDevolucion = {};
      if (desde) filtro.fechaDevolucion.$gte = toDate(desde);
      if (hasta) {
        const h = toDate(hasta);
        h.setUTCDate(h.getUTCDate() + 1); // incluye todo el día "hasta"
        filtro.fechaDevolucion.$lt = h;
      }
    }

    const texto = String(q || '').trim();
    if (texto) {
      const rx = asRx(texto);
      filtro.$or = [
        { proveedor: rx },
        { numeroFactura: rx },
        { numeroComprobante: rx },
        { numeroOrdenServicio: rx },
        { 'refacciones.codigo': rx },
        { 'refacciones.nombre': rx },
      ];
      const n = Number(texto);
      if (Number.isInteger(n) && n > 0) filtro.$or.push({ folio: n });
    }

    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const docs = await DevolucionRefaccion.find(filtro)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json(docs);
  } catch (e) {
    console.error('GET /refaccion', e);
    res.status(500).json({ error: 'Error consultando devoluciones' });
  }
});

// POST /api/devoluciones/refaccion
router.post('/refaccion', async (req, res) => {
  try {
    const b = req.body || {};

    if (!b.tipoDevolucion) return res.status(400).json({ ok: false, error: 'Falta el tipo de devolución.' });
    if (!b.fechaDevolucion) return res.status(400).json({ ok: false, error: 'Falta la fecha de la devolución.' });
    if (!String(b.proveedor || '').trim()) return res.status(400).json({ ok: false, error: 'Falta el proveedor.' });

    const contador = await Contador.findOneAndUpdate(
      { nombre: 'devolucionRefaccion' },
      { $inc: { valor: 1 } },
      { new: true, upsert: true }
    );

    const dev = await DevolucionRefaccion.create({
      folio: contador.valor,
      tipoDevolucion: b.tipoDevolucion,
      proveedor: b.proveedor,
      fechaFactura: toDate(b.fechaFactura),
      fechaDevolucion: toDate(b.fechaDevolucion),
      numeroFactura: b.numeroFactura,
      numeroComprobante: b.numeroComprobante,
      refacciones: (b.refacciones || [])
        .filter(r => (r.codigo || r.nombre))
        .map(r => ({
          codigo: r.codigo || '',
          nombre: r.nombre || '',
          tipo: r.tipo || '',
          unidad: r.unidad || '',
          cantidad: Number(r.cantidad || 0),
          costoUnitario: Number(r.costoUnitario || 0),
          ivaPct: Number(r.ivaPct || 0),
          descuento: Number(r.descuento || 0),
        })),
      numeroOrdenServicio: b.numeroOrdenServicio,
      cantidadRecuperar: b.cantidadRecuperar || {},
      destinoDevolucion: b.destinoDevolucion || {},
      motivoDevolucion: b.motivoDevolucion || {},
      firmas: b.firmas || {},
    });

    res.status(201).json({ ok: true, folio: dev.folio, devId: dev._id });
  } catch (e) {
    console.error('POST /refaccion', e);
    res.status(500).json({ ok: false, error: e.message || 'Error al registrar la devolución' });
  }
});

// GET /api/devoluciones/refaccion/:id/pdf
router.get('/refaccion/:id/pdf', async (req, res) => {
  try {
    const dev = await DevolucionRefaccion.findById(req.params.id).lean();
    if (!dev) return res.status(404).json({ error: 'Devolución no encontrada' });
    await streamDevolucionRefaccionPdf(res, dev);
  } catch (e) {
    console.error('GET /refaccion/:id/pdf', e);
    if (!res.headersSent) res.status(500).json({ error: 'Error generando PDF' });
  }
});

module.exports = router;
