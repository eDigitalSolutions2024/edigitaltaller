const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const EntradaInventario = require('../models/EntradaInventario');
const SalidaInventario  = require('../models/SalidaInventario');
try { Proveedor = require('../models/Proveedor'); } catch {}
const { Devolucion } = require('../models/Devolucion'); // << usar SIEMPRE este

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

module.exports = router;
