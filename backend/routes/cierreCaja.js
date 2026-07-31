const express = require('express');
const router = express.Router();

const CierreCaja = require('../models/CierreCaja');
const { DENOMINACIONES_BILLETES, DENOMINACIONES_MONEDAS } = CierreCaja;
const { proteger } = require('../middleware/auth');
const { calcularTotalesCierre, TERMINALES_KEYS } = require('../utils/cierreCajaTotales');
const { streamCierreCajaPdf } = require('../service/cierreCajaPdf');

// El día se identifica por su medianoche UTC, igual que fechaRecepcion y
// demás campos "solo día" del resto de la app (ver PeriodoSelector.jsx).
function normalizarFecha(fecha) {
  if (!fecha) return null;
  const soloFecha = String(fecha).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(soloFecha)) return null;
  return new Date(`${soloFecha}T00:00:00.000Z`);
}

function conteoVacio(denominaciones) {
  return denominaciones.map((denominacion) => ({ denominacion, cantidad: 0 }));
}

// Alinea lo capturado por el usuario contra las denominaciones fijas, para no
// persistir denominaciones arbitrarias.
function normalizarConteo(denominaciones, capturado) {
  const porDenominacion = new Map((capturado || []).map((c) => [Number(c.denominacion), Number(c.cantidad) || 0]));
  return denominaciones.map((denominacion) => ({
    denominacion,
    cantidad: porDenominacion.get(denominacion) || 0,
  }));
}

function normalizarTerminales(terminales = {}) {
  const out = {};
  for (const key of TERMINALES_KEYS) out[key] = Number(terminales[key]) || 0;
  return out;
}

function cierreVacio(fecha) {
  return {
    fecha,
    billetes: conteoVacio(DENOMINACIONES_BILLETES),
    monedas: conteoVacio(DENOMINACIONES_MONEDAS),
    terminales: normalizarTerminales(),
    dolares: { cantidad: 0, tipoCambio: 0 },
    vales: [],
    totalReportes: 0,
    fondoCaja: 0,
    capturadoPor: '',
  };
}

// GET /api/reportes/cierre-caja?fecha=YYYY-MM-DD
router.get('/', proteger, async (req, res) => {
  try {
    const fecha = normalizarFecha(req.query.fecha);
    if (!fecha) return res.status(400).json({ ok: false, msg: 'Parámetro fecha requerido (YYYY-MM-DD).' });

    const cierre = await CierreCaja.findOne({ fecha }).lean();
    const data = cierre || cierreVacio(fecha);

    return res.json({ ok: true, data, totales: calcularTotalesCierre(data), guardado: !!cierre });
  } catch (err) {
    console.error('Error obteniendo cierre de caja:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/reportes/cierre-caja/historial?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get('/historial', proteger, async (req, res) => {
  try {
    const desde = normalizarFecha(req.query.desde);
    const hasta = normalizarFecha(req.query.hasta);
    if (!desde || !hasta) {
      return res.status(400).json({ ok: false, msg: 'Parámetros desde y hasta requeridos (YYYY-MM-DD).' });
    }

    const cierres = await CierreCaja.find({ fecha: { $gte: desde, $lte: hasta } })
      .sort({ fecha: -1 })
      .lean();

    const data = cierres.map((c) => ({
      fecha: c.fecha,
      capturadoPor: c.capturadoPor,
      ...calcularTotalesCierre(c),
    }));

    return res.json({ ok: true, data });
  } catch (err) {
    console.error('Error obteniendo historial de cierres de caja:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// POST /api/reportes/cierre-caja -> crea o actualiza (upsert) el cierre de una fecha
router.post('/', proteger, async (req, res) => {
  try {
    const fecha = normalizarFecha(req.body?.fecha);
    if (!fecha) return res.status(400).json({ ok: false, msg: 'Parámetro fecha requerido (YYYY-MM-DD).' });

    const body = req.body || {};
    const update = {
      fecha,
      billetes: normalizarConteo(DENOMINACIONES_BILLETES, body.billetes),
      monedas: normalizarConteo(DENOMINACIONES_MONEDAS, body.monedas),
      terminales: normalizarTerminales(body.terminales),
      dolares: {
        cantidad: Number(body.dolares?.cantidad) || 0,
        tipoCambio: Number(body.dolares?.tipoCambio) || 0,
      },
      vales: (body.vales || []).map((v) => ({ folio: v.folio || '', monto: Number(v.monto) || 0 })),
      totalReportes: Number(body.totalReportes) || 0,
      fondoCaja: Number(body.fondoCaja) || 0,
      capturadoPor: req.user?.name || req.user?.username || '',
    };

    const cierre = await CierreCaja.findOneAndUpdate(
      { fecha },
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json({ ok: true, data: cierre, totales: calcularTotalesCierre(cierre) });
  } catch (err) {
    console.error('Error guardando cierre de caja:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/reportes/cierre-caja/pdf?fecha=YYYY-MM-DD
// Sin `proteger`: se abre vía window.open() y ese request no puede llevar el
// header Authorization, igual que el resto de los PDFs de Cajas.
router.get('/pdf', async (req, res) => {
  try {
    const fecha = normalizarFecha(req.query.fecha);
    if (!fecha) return res.status(400).json({ ok: false, msg: 'Parámetro fecha requerido (YYYY-MM-DD).' });

    const cierre = await CierreCaja.findOne({ fecha }).lean();
    if (!cierre) {
      return res.status(404).json({ ok: false, msg: 'No hay un cierre de caja guardado para esta fecha.' });
    }

    await streamCierreCajaPdf(res, cierre);
  } catch (err) {
    console.error('Error generando PDF de cierre de caja:', err);
    if (!res.headersSent) res.status(500).json({ ok: false, msg: 'Error generando PDF' });
  }
});

module.exports = router;
