const express = require('express');
const router = express.Router();

const CierreCaja = require('../models/CierreCaja');
const { DENOMINACIONES_BILLETES, DENOMINACIONES_MONEDAS } = CierreCaja;
const Contador = require('../models/Contador');
const { proteger, requiereRol } = require('../middleware/auth');
const { calcularTotalesCierre, TERMINALES_KEYS, TERMINALES_MANUALES } = require('../utils/cierreCajaTotales');
const { calcularTotalIngresosDia } = require('../utils/totalIngresosDia');
const { listarComprobantesDia, listarValesSalidaDia } = require('../utils/comprobantesDia');
const { restablecerCierreCajaDia } = require('../utils/restablecerCierreCajaDia');
const { streamCierreCajaPdf } = require('../service/cierreCajaPdf');

// Debe coincidir con FONDO_CAJA_CONTADOR en routes/configuracion.js
const FONDO_CAJA_CONTADOR = 'fondoCaja';
const FONDO_CAJA_DEFAULT = 2000;

// Debe coincidir con VALE_CAJA_CONTADOR en routes/configuracion.js. Distinto
// del contador 'valeSalida' (Vale de Salida, ver routes/vales.js): este es
// el folio de los vales capturados en Cierre de Caja.
const VALE_CAJA_CONTADOR = 'valeCaja';

// El fondo de caja ya no se captura a mano por día: es el monto fijo vigente
// en Configuración (mismo mecanismo de "contador" que folios/tipo de cambio).
async function obtenerFondoCajaConfig() {
  const contador = await Contador.findOne({ nombre: FONDO_CAJA_CONTADOR });
  return contador?.valor ?? FONDO_CAJA_DEFAULT;
}

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

// Captura del día = acumulativa: cada "Guardar" SUMA lo recién contado al
// total ya guardado (no lo reemplaza) — el formulario se limpia a 0 después
// de cada guardado, así que lo que llega en `capturado` es solo el
// incremento de esta ronda.
function sumarConteo(denominaciones, existente, capturado) {
  const previo = new Map((existente || []).map((c) => [Number(c.denominacion), Number(c.cantidad) || 0]));
  const nuevo = new Map((capturado || []).map((c) => [Number(c.denominacion), Number(c.cantidad) || 0]));
  return denominaciones.map((denominacion) => ({
    denominacion,
    cantidad: (previo.get(denominacion) || 0) + (nuevo.get(denominacion) || 0),
  }));
}

function normalizarTerminales(terminales = {}) {
  const out = {};
  for (const key of TERMINALES_KEYS) out[key] = Number(terminales[key]) || 0;
  return out;
}

// Para el guardado desde el formulario de captura: las terminales con fuente
// automática (todas menos cheques/transferencias) se conservan tal cual están
// en BD, sin importar lo que traiga el body. Cheques/transferencias sí son
// captura manual y ahora es acumulativa (se suma lo de esta ronda al total
// ya guardado), igual que billetes/monedas — ver sumarConteo.
function sumarTerminalesManual(existente = {}, body = {}) {
  const out = {};
  for (const key of TERMINALES_KEYS) {
    out[key] = TERMINALES_MANUALES.includes(key)
      ? (Number(existente[key]) || 0) + (Number(body[key]) || 0)
      : Number(existente[key]) || 0;
  }
  return out;
}

function normalizarVales(vales = []) {
  return (vales || []).map((v) => ({
    folio: v.folio || '',
    monto: Number(v.monto) || 0,
    motivo: v.motivo || '',
  }));
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
    estado: 'ABIERTA',
    cerradoEn: null,
    cerradoPor: '',
  };
}

// GET /api/reportes/cierre-caja?fecha=YYYY-MM-DD
router.get('/', proteger, async (req, res) => {
  try {
    const fecha = normalizarFecha(req.query.fecha);
    if (!fecha) return res.status(400).json({ ok: false, msg: 'Parámetro fecha requerido (YYYY-MM-DD).' });

    const cierre = await CierreCaja.findOne({ fecha }).lean();
    const base = cierre || cierreVacio(fecha);

    // Se normaliza siempre (exista o no el doc): un doc creado solo por la
    // suma automática de terminales puede traer billetes/monedas/vales vacíos.
    const data = {
      ...base,
      billetes: normalizarConteo(DENOMINACIONES_BILLETES, base.billetes),
      monedas: normalizarConteo(DENOMINACIONES_MONEDAS, base.monedas),
      terminales: normalizarTerminales(base.terminales),
      vales: normalizarVales(base.vales),
      estado: base.estado || 'ABIERTA',
    };

    // Mientras el día siga abierto, "Total Reportes" y "Fondo de Caja" no se
    // capturan a mano: se toman en vivo (pagos del día / Configuración). Un
    // día ya CERRADA conserva los valores congelados al momento del cierre.
    if (data.estado !== 'CERRADA') {
      [data.totalReportes, data.fondoCaja] = await Promise.all([
        calcularTotalIngresosDia(fecha),
        obtenerFondoCajaConfig(),
      ]);
    }

    // Listado (no solo total) de lo que se generó ese día, para que el
    // resumen de Gestión de Caja / Cierre de Caja muestre abajo cada Nota de
    // Venta, Remisión, Recibo Provisional y Vale de Salida — siempre en vivo,
    // no se congela al cerrar (es informativo, no afecta los totales).
    [data.comprobantes, data.valesSalida] = await Promise.all([
      listarComprobantesDia(fecha),
      listarValesSalidaDia(fecha),
    ]);

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

    const cierres = await CierreCaja.find({ fecha: { $gte: desde, $lte: hasta }, estado: 'CERRADA' })
      .sort({ fecha: -1 })
      .lean();

    const data = cierres.map((c) => ({
      fecha: c.fecha,
      capturadoPor: c.capturadoPor,
      totalReportes: Number(c.totalReportes || 0),
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

    const existente = await CierreCaja.findOne({ fecha }).select('estado terminales billetes monedas dolares vales');
    if (existente?.estado === 'CERRADA') {
      return res.status(400).json({ ok: false, msg: 'La caja de este día ya está cerrada.' });
    }

    const body = req.body || {};
    // totalReportes y fondoCaja ya no se aceptan del cliente: siempre se
    // recalculan server-side (pagos del día / Configuración).
    const [totalReportes, fondoCaja] = await Promise.all([
      calcularTotalIngresosDia(fecha),
      obtenerFondoCajaConfig(),
    ]);
    // Acumulativo: cada "Guardar" suma esta ronda de captura (billetes,
    // monedas, cheques, transferencias, dólares, vales) al total ya guardado
    // del día — GestionCaja.jsx limpia el formulario a 0 después de guardar.
    const update = {
      fecha,
      billetes: sumarConteo(DENOMINACIONES_BILLETES, existente?.billetes, body.billetes),
      monedas: sumarConteo(DENOMINACIONES_MONEDAS, existente?.monedas, body.monedas),
      terminales: sumarTerminalesManual(existente?.terminales, body.terminales),
      dolares: {
        cantidad: (Number(existente?.dolares?.cantidad) || 0) + (Number(body.dolares?.cantidad) || 0),
        tipoCambio: Number(body.dolares?.tipoCambio) || Number(existente?.dolares?.tipoCambio) || 0,
      },
      vales: [...(existente?.vales || []), ...normalizarVales(body.vales)],
      totalReportes,
      fondoCaja,
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

// GET /api/reportes/cierre-caja/vale-siguiente-folio -> folio automático y
// consecutivo para un nuevo vale de caja, se consume al abrir el modal
// "Generar Vale" en Gestión de Caja (ver CajaModalVale.jsx).
router.get('/vale-siguiente-folio', proteger, async (req, res) => {
  try {
    const contador = await Contador.findOneAndUpdate(
      { nombre: VALE_CAJA_CONTADOR },
      { $inc: { valor: 1 } },
      { new: true, upsert: true }
    );
    return res.json({ ok: true, folio: contador.valor });
  } catch (err) {
    console.error('Error generando folio de vale de caja:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// POST /api/reportes/cierre-caja/cerrar -> congela el cierre del día: ya no
// se puede editar desde Gestión de Caja ni sumar terminales automáticamente,
// y a partir de aquí aparece en el historial de Reportes > Cajas.
router.post('/cerrar', proteger, async (req, res) => {
  try {
    const fecha = normalizarFecha(req.body?.fecha);
    if (!fecha) return res.status(400).json({ ok: false, msg: 'Parámetro fecha requerido (YYYY-MM-DD).' });

    const existente = await CierreCaja.findOne({ fecha });
    if (existente?.estado === 'CERRADA') {
      return res.status(400).json({ ok: false, msg: 'La caja de este día ya está cerrada.' });
    }

    const [totalReportes, fondoCaja] = await Promise.all([
      calcularTotalIngresosDia(fecha),
      obtenerFondoCajaConfig(),
    ]);
    const base = existente ? existente.toObject() : cierreVacio(fecha);

    const cierre = await CierreCaja.findOneAndUpdate(
      { fecha },
      {
        $set: {
          fecha,
          billetes: normalizarConteo(DENOMINACIONES_BILLETES, base.billetes),
          monedas: normalizarConteo(DENOMINACIONES_MONEDAS, base.monedas),
          terminales: normalizarTerminales(base.terminales),
          dolares: {
            cantidad: Number(base.dolares?.cantidad) || 0,
            tipoCambio: Number(base.dolares?.tipoCambio) || 0,
          },
          vales: normalizarVales(base.vales),
          totalReportes,
          fondoCaja,
          estado: 'CERRADA',
          cerradoEn: new Date(),
          cerradoPor: req.user?.name || req.user?.username || '',
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json({ ok: true, data: cierre, totales: calcularTotalesCierre(cierre) });
  } catch (err) {
    console.error('Error cerrando caja:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// POST /api/reportes/cierre-caja/restablecer -> reabre un día ya cerrado
// (solo admin). El rol cajas no puede llamar esto directo: debe solicitarlo
// vía ticket RESTABLECER_CAJA (ver PUT /tickets/:id/resolver-restablecer-caja),
// que internamente usa el mismo helper cuando el admin aprueba.
router.post('/restablecer', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const fecha = normalizarFecha(req.body?.fecha);
    if (!fecha) return res.status(400).json({ ok: false, msg: 'Parámetro fecha requerido (YYYY-MM-DD).' });

    const cierre = await restablecerCierreCajaDia(fecha, req.user?.name || req.user?.username || '');
    return res.json({ ok: true, data: cierre.toObject(), totales: calcularTotalesCierre(cierre) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ ok: false, msg: err.message });
    console.error('Error restableciendo cierre de caja:', err);
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
