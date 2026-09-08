const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const CierreCaja = require('../models/CierreCaja');
const { DENOMINACIONES_BILLETES, DENOMINACIONES_MONEDAS } = CierreCaja;
const Contador = require('../models/Contador');
const { proteger, requiereRol } = require('../middleware/auth');
const { calcularTotalesCierre, TERMINALES_KEYS } = require('../utils/cierreCajaTotales');
const { calcularTotalIngresosRango } = require('../utils/totalIngresosDia');
const { listarComprobantesRango, listarValesSalidaRango } = require('../utils/comprobantesDia');
const { restablecerSesionCaja } = require('../utils/restablecerCierreCajaDia');
const { sesionCajaAbierta, inicioSesionActual, fechaSoloDia } = require('../utils/cierreCajaTerminales');
const { streamCierreCajaPdf } = require('../service/cierreCajaPdf');

// Fin del período que cubre una sesión: su cierre, o "ahora" si sigue abierta.
function finSesion(sesion) {
  return sesion?.cerradoEn ? new Date(sesion.cerradoEn) : new Date();
}

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

function normalizarVales(vales = []) {
  return (vales || []).map((v) => ({
    folio: v.folio || '',
    monto: Number(v.monto) || 0,
    motivo: v.motivo || '',
  }));
}

function cierreVacio(abiertaEn) {
  return {
    fecha: fechaSoloDia(abiertaEn || new Date()),
    abiertaEn: abiertaEn || new Date(),
    billetes: conteoVacio(DENOMINACIONES_BILLETES),
    monedas: conteoVacio(DENOMINACIONES_MONEDAS),
    terminales: normalizarTerminales(),
    dolares: { cantidad: 0, tipoCambio: 0 },
    vales: [],
    capturas: [],
    totalReportes: 0,
    fondoCaja: 0,
    capturadoPor: '',
    estado: 'ABIERTA',
    cerradoEn: null,
    cerradoPor: '',
  };
}

// ===== Historial de capturas del día =====
// La Captura del día se guarda ronda por ronda en `cierre.capturas`; los
// campos agregados (billetes/monedas/dolares/vales y
// terminales.cheques/transferencias) son solo un CACHÉ recalculado a partir de
// las capturas NO canceladas. Así un admin puede cancelar una captura con
// monto equivocado y el corte del día se recompone solo.

function nombreUsuario(user) {
  return user?.name || user?.username || '';
}

// Arma una captura a partir del body de POST / (una ronda del formulario).
function capturaDesdeBody(body = {}, user) {
  return {
    fecha: new Date(),
    capturadoPor: nombreUsuario(user),
    billetes: normalizarConteo(DENOMINACIONES_BILLETES, body.billetes),
    monedas: normalizarConteo(DENOMINACIONES_MONEDAS, body.monedas),
    cheques: Number(body.terminales?.cheques) || 0,
    transferencias: Number(body.terminales?.transferencias) || 0,
    dolares: {
      cantidad: Number(body.dolares?.cantidad) || 0,
      tipoCambio: Number(body.dolares?.tipoCambio) || 0,
    },
    vales: normalizarVales(body.vales),
    sintetica: false,
  };
}

// ¿La captura no aporta nada? (todo en 0 y sin vales). Se usa para no ensuciar
// el historial con "Guardar" vacíos y para no materializar un baseline nulo.
function capturaEstaVacia(c) {
  const hayBilletes = (c.billetes || []).some((b) => Number(b.cantidad) > 0);
  const hayMonedas = (c.monedas || []).some((m) => Number(m.cantidad) > 0);
  return (
    !hayBilletes &&
    !hayMonedas &&
    (c.vales || []).length === 0 &&
    !(Number(c.cheques) > 0) &&
    !(Number(c.transferencias) > 0) &&
    !(Number(c.dolares?.cantidad) > 0)
  );
}

// Reconstruye una captura "inicial" a partir de lo ya agregado en el doc: para
// días guardados antes de que existiera este historial (o traídos solo por la
// suma automática de terminales). Es exacta porque cheques/transferencias/
// billetes/monedas/dolares/vales son 100% captura manual.
function baselineDesdeAgregados(cierre) {
  return {
    fecha: cierre.updatedAt || cierre.createdAt || new Date(),
    capturadoPor: cierre.capturadoPor || '',
    billetes: normalizarConteo(DENOMINACIONES_BILLETES, cierre.billetes),
    monedas: normalizarConteo(DENOMINACIONES_MONEDAS, cierre.monedas),
    cheques: Number(cierre.terminales?.cheques) || 0,
    transferencias: Number(cierre.terminales?.transferencias) || 0,
    dolares: {
      cantidad: Number(cierre.dolares?.cantidad) || 0,
      tipoCambio: Number(cierre.dolares?.tipoCambio) || 0,
    },
    vales: normalizarVales(cierre.vales),
    sintetica: true,
  };
}

// Si el doc todavía no tiene ninguna captura pero ya trae captura acumulada,
// la materializa como un único movimiento inicial sintético (para que el admin
// pueda cancelarlo desde la interfaz). Muta el doc de Mongoose recibido.
function asegurarCapturaBaseline(cierre) {
  if ((cierre.capturas || []).length > 0) return;
  const base = baselineDesdeAgregados(cierre);
  if (capturaEstaVacia(base)) return;
  cierre.capturas.push(base);
}

// Suma las capturas NO canceladas -> agregados del día. El T.C. de dólares
// queda como promedio ponderado por cantidad, para que cantidad * tipoCambio
// siga dando el total exacto en calcularTotalesCierre.
function sumarCapturasActivas(capturas) {
  let billetes = conteoVacio(DENOMINACIONES_BILLETES);
  let monedas = conteoVacio(DENOMINACIONES_MONEDAS);
  let cheques = 0;
  let transferencias = 0;
  let dolaresCantidad = 0;
  let dolaresPesos = 0;
  let vales = [];
  for (const c of capturas || []) {
    if (c.cancelada) continue;
    billetes = sumarConteo(DENOMINACIONES_BILLETES, billetes, c.billetes);
    monedas = sumarConteo(DENOMINACIONES_MONEDAS, monedas, c.monedas);
    cheques += Number(c.cheques) || 0;
    transferencias += Number(c.transferencias) || 0;
    const cant = Number(c.dolares?.cantidad) || 0;
    dolaresCantidad += cant;
    dolaresPesos += cant * (Number(c.dolares?.tipoCambio) || 0);
    vales = vales.concat(normalizarVales(c.vales));
  }
  return {
    billetes,
    monedas,
    cheques,
    transferencias,
    dolares: { cantidad: dolaresCantidad, tipoCambio: dolaresCantidad > 0 ? dolaresPesos / dolaresCantidad : 0 },
    vales,
  };
}

// Vuelca la suma de capturas activas sobre los campos agregados del doc de
// Mongoose. NO toca las terminales automáticas (bancomer…banorte).
function rebuildAgregadosCaptura(cierre) {
  const s = sumarCapturasActivas(cierre.capturas);
  cierre.billetes = s.billetes;
  cierre.monedas = s.monedas;
  if (!cierre.terminales) cierre.terminales = {};
  cierre.terminales.cheques = s.cheques;
  cierre.terminales.transferencias = s.transferencias;
  cierre.dolares = s.dolares;
  cierre.vales = s.vales;
}

// Normaliza las capturas para respuesta al cliente. Si el doc no tiene ninguna
// pero sí captura acumulada, agrega una fila "baseline" (id string 'baseline')
// que el front puede cancelar — el endpoint la materializa en ese momento.
function capturasParaLectura(cierre) {
  const arr = (cierre.capturas || []).map((c) => ({
    _id: String(c._id),
    fecha: c.fecha,
    capturadoPor: c.capturadoPor || '',
    billetes: normalizarConteo(DENOMINACIONES_BILLETES, c.billetes),
    monedas: normalizarConteo(DENOMINACIONES_MONEDAS, c.monedas),
    cheques: Number(c.cheques) || 0,
    transferencias: Number(c.transferencias) || 0,
    dolares: { cantidad: Number(c.dolares?.cantidad) || 0, tipoCambio: Number(c.dolares?.tipoCambio) || 0 },
    vales: normalizarVales(c.vales),
    sintetica: !!c.sintetica,
    cancelada: !!c.cancelada,
    canceladaEn: c.canceladaEn || null,
    canceladaPor: c.canceladaPor || '',
    motivoCancelacion: c.motivoCancelacion || '',
  }));
  if (arr.length === 0) {
    const base = baselineDesdeAgregados(cierre);
    if (!capturaEstaVacia(base)) {
      arr.push({
        _id: 'baseline',
        ...base,
        canceladaEn: null,
        canceladaPor: '',
        motivoCancelacion: '',
        cancelada: false,
      });
    }
  }
  return arr;
}

// GET /api/reportes/cierre-caja           -> la sesión de caja ABIERTA actual
// GET /api/reportes/cierre-caja?id=<id>   -> una sesión concreta (historial/detalle)
router.get('/', proteger, async (req, res) => {
  try {
    let cierre = null;
    let base;
    if (req.query.id && mongoose.isValidObjectId(req.query.id)) {
      cierre = await CierreCaja.findById(req.query.id).lean();
      if (!cierre) return res.status(404).json({ ok: false, msg: 'No se encontró esa sesión de caja.' });
      base = cierre;
    } else {
      const sesion = await sesionCajaAbierta();
      cierre = sesion ? sesion.toObject() : null;
      base = cierre || cierreVacio(await inicioSesionActual());
    }

    // Se normaliza siempre (exista o no el doc): un doc creado solo por la
    // suma automática de terminales puede traer billetes/monedas/vales vacíos.
    const data = {
      ...base,
      billetes: normalizarConteo(DENOMINACIONES_BILLETES, base.billetes),
      monedas: normalizarConteo(DENOMINACIONES_MONEDAS, base.monedas),
      terminales: normalizarTerminales(base.terminales),
      vales: normalizarVales(base.vales),
      capturas: capturasParaLectura(base),
      estado: base.estado || 'ABIERTA',
    };

    const desdeSesion = new Date(base.abiertaEn || base.fecha);
    const hastaSesion = finSesion(base);

    // Mientras la sesión siga abierta, "Total Reportes" y "Fondo de Caja" no se
    // capturan a mano: se toman en vivo (todo lo cobrado desde que abrió la
    // sesión / Configuración). Una sesión CERRADA conserva los valores
    // congelados al momento del cierre.
    if (data.estado !== 'CERRADA') {
      [data.totalReportes, data.fondoCaja] = await Promise.all([
        calcularTotalIngresosRango(desdeSesion, hastaSesion),
        obtenerFondoCajaConfig(),
      ]);
    }

    // Listado (no solo total) de lo que se generó en la sesión, para que el
    // resumen de Gestión de Caja / Cierre de Caja muestre abajo cada Nota de
    // Venta, Remisión, Recibo Provisional y Vale de Salida — siempre en vivo,
    // no se congela al cerrar (es informativo, no afecta los totales).
    [data.comprobantes, data.valesSalida] = await Promise.all([
      listarComprobantesRango(desdeSesion, hastaSesion),
      listarValesSalidaRango(desdeSesion, hastaSesion),
    ]);

    return res.json({ ok: true, data, totales: calcularTotalesCierre(data), guardado: !!cierre });
  } catch (err) {
    console.error('Error obteniendo cierre de caja:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/reportes/cierre-caja/historial?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// Una fila por SESIÓN cerrada; el rango filtra por la fecha de cierre.
router.get('/historial', proteger, async (req, res) => {
  try {
    const desde = normalizarFecha(req.query.desde);
    const hasta = normalizarFecha(req.query.hasta);
    if (!desde || !hasta) {
      return res.status(400).json({ ok: false, msg: 'Parámetros desde y hasta requeridos (YYYY-MM-DD).' });
    }
    // Los límites llegan como medianoche UTC del día local; el fin abarca todo
    // ese último día.
    const finRango = new Date(hasta.getTime() + 24 * 60 * 60 * 1000 - 1);

    const cierres = await CierreCaja.find({
      estado: 'CERRADA',
      $or: [
        { cerradoEn: { $gte: desde, $lte: finRango } },
        { cerradoEn: null, fecha: { $gte: desde, $lte: hasta } }, // docs viejos
      ],
    })
      .sort({ cerradoEn: -1, fecha: -1 })
      .lean();

    const data = cierres.map((c) => ({
      _id: String(c._id),
      fecha: c.fecha,
      abiertaEn: c.abiertaEn || c.fecha,
      cerradoEn: c.cerradoEn || null,
      cerradoPor: c.cerradoPor || '',
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

// POST /api/reportes/cierre-caja -> registra una ronda de Captura en la sesión
// de caja ABIERTA (la crea si aún no existe).
router.post('/', proteger, async (req, res) => {
  try {
    // Cada "Guardar" se registra como una captura propia en `cierre.capturas`
    // y los campos agregados se recalculan como suma de las NO canceladas. Así
    // el admin puede cancelar una captura con monto equivocado desde el historial.
    const captura = capturaDesdeBody(req.body, req.user);
    if (capturaEstaVacia(captura)) {
      return res.status(400).json({ ok: false, msg: 'No capturaste ningún monto en esta ronda.' });
    }

    const cierre = await sesionCajaAbierta({ crear: true });
    if (cierre.estado === 'CERRADA') {
      return res.status(400).json({ ok: false, msg: 'La caja ya está cerrada.' });
    }

    const desdeSesion = new Date(cierre.abiertaEn || cierre.fecha);
    // totalReportes y fondoCaja no se aceptan del cliente: siempre se
    // recalculan server-side (todo lo cobrado en la sesión / Configuración).
    const [totalReportes, fondoCaja] = await Promise.all([
      calcularTotalIngresosRango(desdeSesion, new Date()),
      obtenerFondoCajaConfig(),
    ]);

    // Docs traídos solo por la suma automática de terminales: materializa lo ya
    // acumulado como un movimiento inicial antes de sumarle la ronda nueva.
    asegurarCapturaBaseline(cierre);
    cierre.capturas.push(captura);
    rebuildAgregadosCaptura(cierre);
    cierre.totalReportes = totalReportes;
    cierre.fondoCaja = fondoCaja;
    cierre.capturadoPor = nombreUsuario(req.user);
    await cierre.save();

    const data = cierre.toObject();
    return res.json({ ok: true, data, totales: calcularTotalesCierre(data) });
  } catch (err) {
    console.error('Error guardando cierre de caja:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// POST /api/reportes/cierre-caja/captura/:capturaId/cancelar -> cancela una
// captura mal hecha (monto equivocado) y recompone el corte. Solo admin, y solo
// mientras la caja siga ABIERTA (si ya cerró, primero se Restablece).
// `capturaId` puede ser 'baseline' para el movimiento inicial de una sesión
// que aún no se había materializado.
router.post('/captura/:capturaId/cancelar', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const cierre = await CierreCaja.findOne({ estado: 'ABIERTA' }).sort({ abiertaEn: -1 });
    if (!cierre) {
      return res.status(400).json({
        ok: false,
        msg: 'No hay una caja abierta. Restablece la sesión para poder cancelar una captura.',
      });
    }

    asegurarCapturaBaseline(cierre);

    const { capturaId } = req.params;
    let captura = null;
    if (capturaId === 'baseline') {
      captura = cierre.capturas.find((c) => c.sintetica);
    } else if (/^[a-f\d]{24}$/i.test(String(capturaId))) {
      captura = cierre.capturas.id(capturaId);
    }
    if (!captura) return res.status(404).json({ ok: false, msg: 'No se encontró esa captura.' });
    if (captura.cancelada) return res.status(400).json({ ok: false, msg: 'Esa captura ya está cancelada.' });

    captura.cancelada = true;
    captura.canceladaEn = new Date();
    captura.canceladaPor = nombreUsuario(req.user);
    captura.motivoCancelacion = String(req.body?.motivo || '').trim().slice(0, 300);

    rebuildAgregadosCaptura(cierre);
    await cierre.save();

    const data = cierre.toObject();
    return res.json({ ok: true, data, totales: calcularTotalesCierre(data) });
  } catch (err) {
    console.error('Error cancelando captura de cierre de caja:', err);
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

// POST /api/reportes/cierre-caja/cerrar -> congela la sesión de caja abierta:
// ya no se puede editar ni sumar terminales, y aparece en el historial de
// Reportes > Cajas. La siguiente actividad abre una sesión nueva.
router.post('/cerrar', proteger, async (req, res) => {
  try {
    const cierre = await sesionCajaAbierta({ crear: false });
    if (!cierre) {
      return res.status(400).json({ ok: false, msg: 'No hay una caja abierta para cerrar.' });
    }

    const desdeSesion = new Date(cierre.abiertaEn || cierre.fecha);
    const [totalReportes, fondoCaja] = await Promise.all([
      calcularTotalIngresosRango(desdeSesion, new Date()),
      obtenerFondoCajaConfig(),
    ]);
    const base = cierre.toObject();

    // Congela también el historial de capturas. Una sesión sin capturas se
    // cierra con su movimiento inicial ya materializado.
    let capturasCierre = base.capturas || [];
    if (capturasCierre.length === 0) {
      const baseline = baselineDesdeAgregados(base);
      if (!capturaEstaVacia(baseline)) capturasCierre = [baseline];
    }

    const cerrado = await CierreCaja.findByIdAndUpdate(
      cierre._id,
      {
        $set: {
          billetes: normalizarConteo(DENOMINACIONES_BILLETES, base.billetes),
          monedas: normalizarConteo(DENOMINACIONES_MONEDAS, base.monedas),
          terminales: normalizarTerminales(base.terminales),
          dolares: {
            cantidad: Number(base.dolares?.cantidad) || 0,
            tipoCambio: Number(base.dolares?.tipoCambio) || 0,
          },
          vales: normalizarVales(base.vales),
          capturas: capturasCierre,
          totalReportes,
          fondoCaja,
          estado: 'CERRADA',
          cerradoEn: new Date(),
          cerradoPor: req.user?.name || req.user?.username || '',
        },
      },
      { new: true }
    ).lean();

    return res.json({ ok: true, data: cerrado, totales: calcularTotalesCierre(cerrado) });
  } catch (err) {
    console.error('Error cerrando caja:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// POST /api/reportes/cierre-caja/restablecer -> reabre una sesión ya cerrada
// (solo admin, y solo si no hay otra abierta). El rol cajas no puede llamar
// esto directo: debe solicitarlo vía ticket RESTABLECER_CAJA (ver
// PUT /tickets/:id/resolver-restablecer-caja).
router.post('/restablecer', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const id = req.body?.id;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, msg: 'Selecciona la sesión de caja a restablecer.' });
    }
    const cierre = await restablecerSesionCaja(id, req.user?.name || req.user?.username || '');
    return res.json({ ok: true, data: cierre.toObject(), totales: calcularTotalesCierre(cierre) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ ok: false, msg: err.message });
    console.error('Error restableciendo cierre de caja:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/reportes/cierre-caja/pdf?id=<id>   (compat: ?fecha=YYYY-MM-DD)
// Sin `proteger`: se abre vía window.open() y ese request no puede llevar el
// header Authorization, igual que el resto de los PDFs de Cajas.
router.get('/pdf', async (req, res) => {
  try {
    let cierre = null;
    if (req.query.id && mongoose.isValidObjectId(req.query.id)) {
      cierre = await CierreCaja.findById(req.query.id).lean();
    } else if (req.query.fecha) {
      const fecha = normalizarFecha(req.query.fecha);
      if (fecha) {
        cierre = await CierreCaja.findOne({ fecha }).sort({ cerradoEn: -1 }).lean();
      }
    } else {
      // Sin parámetros: la sesión abierta actual.
      cierre = await CierreCaja.findOne({ estado: 'ABIERTA' }).sort({ abiertaEn: -1 }).lean();
    }
    if (!cierre) {
      return res.status(404).json({ ok: false, msg: 'No se encontró esa sesión de caja.' });
    }

    await streamCierreCajaPdf(res, cierre);
  } catch (err) {
    console.error('Error generando PDF de cierre de caja:', err);
    if (!res.headersSent) res.status(500).json({ ok: false, msg: 'Error generando PDF' });
  }
});

module.exports = router;
