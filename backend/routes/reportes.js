const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Vehiculo = require('../models/Vehiculo');
const Empleado = require('../models/Empleado');
const User = require('../models/User');
const FacturaCfdi = require('../models/FacturaCfdi');
const { streamReporteOriginalesPdf } = require('../service/reporteOriginalesPdf');
const { streamReporteVentasAsesoresPdf } = require('../service/reporteVentasAsesoresPdf');
const { streamReporteOrdenesAbiertasPdf } = require('../service/reporteOrdenesAbiertasPdf');
const { streamReporteOriginalesAbiertasPdf } = require('../service/reporteOriginalesAbiertasPdf');
const { streamReporteGarantiasPdf } = require('../service/reporteGarantiasPdf');
const { streamReporteCajasIngresosPdf } = require('../service/reporteCajasIngresosPdf');
const { streamReporteRemisionesDiarioPdf } = require('../service/reporteRemisionesDiarioPdf');
const { streamReporteRhCxCPdf } = require('../service/reporteRhCxCPdf');
const { streamReporteHorasTecnicoPdf } = require('../service/reporteHorasTecnicoPdf');
const { calcImporteHoras } = require('../utils/manoObra');
const { calcularTotalesOrden } = require('../utils/cajaTotales');

const POPULATE_CLIENTE = 'nombre apellidoPaterno apellidoMaterno tipoCliente empresa gobierno telefonos celulares';
const POPULATE_GRUPO = { path: 'grupoId', select: 'nombre miembros', populate: { path: 'miembros', select: 'name' } };

function buildDateFilter(desde, hasta) {
  // El frontend envía ISO completo con timezone correcto del cliente
  const d = new Date(desde);
  const h = new Date(hasta);
  return {
    $or: [
      { fechaCierre: { $gte: d, $lte: h } },
      { fechaCierre: null, updatedAt: { $gte: d, $lte: h } },
    ],
  };
}

// Nombre "principal" capturado en Alta de Clientes: para empresas es el campo
// raíz `nombre` (Nombre Contacto Empresa/Arrendadora), para Empresa Gobierno
// el Nombre Gobierno y para particulares el nombre completo. En clientes
// migrados del sistema viejo la raíz `nombre` trae duplicada la razón social;
// en ese caso el contacto real vive en empresa.contacto.nombre.
// apellidoPaterno/apellidoMaterno son campos exclusivos de "Particular": en
// clientes de empresa/gobierno migrados (o editados antes del fix en
// clientes.js que los limpia al guardar) pueden quedar huérfanos con datos
// viejos, así que aquí NUNCA se concatenan fuera de la rama Particular para
// no mostrar basura tipo "Empresa Apellido Apellido" en los reportes.
function nombreCliente(c) {
  if (!c) return '';
  if (c.tipoCliente === 'Empresa Gobierno') {
    return c.gobierno?.nombreGobierno || c.nombre || '';
  }
  if (c.tipoCliente === 'Empresa Privada' || c.tipoCliente === 'Empresa Arrendadora') {
    const nombreRaiz = (c.nombre || '').trim();
    const razonSocial = c.empresa?.razonSocial || '';
    if (nombreRaiz && nombreRaiz !== razonSocial) return nombreRaiz;
    return c.empresa?.contacto?.nombre || nombreRaiz || razonSocial;
  }
  return [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(' ');
}

function telefonoCliente(c) {
  if (!c) return '';
  if (c.celulares?.length) return c.celulares[0].numero || '';
  if (c.telefonos?.length) return c.telefonos[0].numero || '';
  return '';
}

// Precio de servicio asociado a una fila de manoObra: usa el snapshot
// precioServicio (tomado de Venta al Cliente al momento de asignar) y cae a
// buscar en presupuesto[] por presupuestoId solo para filas legado que no
// tienen precioServicio.
function montoServicioManoObra(m, presupuestoPorId) {
  if (m.precioServicio != null && m.precioServicio !== 0) return Number(m.precioServicio);
  const partida = m.presupuestoId ? presupuestoPorId.get(String(m.presupuestoId)) : null;
  return Number(partida?.precioVenta || 0);
}

function calcImporte(v) {
  return (v.ventaCliente || []).reduce(
    (s, i) => s + (i.cant || 1) * (i.precioVenta || 0),
    0
  );
}

const ESTADOS_CERRADOS = ['CERRADA', 'CANCELADA'];

const ESTADO_LABELS = {
  INGRESO:                        'Ingreso',
  PENDIENTE_REFACCIONARIA:        'Pendiente Refaccionaria',
  PENDIENTE_AUTORIZACION_CLIENTE: 'Pendiente Autorización Cliente',
  PENDIENTE_SURTIR:               'Pendiente Surtir',
  PENDIENTE_CIERRE:               'Pendiente de Cierre',
  REPARACION_EN_CURSO:            'Reparación en Curso',
  CALIDAD:                        'Calidad',
  PENDIENTE_CERRAR:               'Pendiente Cerrar',
  CERRADA:                        'Cerrada',
  CANCELADA:                      'Cancelada',
};

function buildDateFilterAbiertas(desde, hasta) {
  const d = new Date(desde);
  const h = new Date(hasta);
  return { fechaRecepcion: { $gte: d, $lte: h } };
}

function observacionesOrden(o) {
  return [o.observacionesExternas, o.observacionesInternas].filter(Boolean).join(' | ');
}

function formatUltVale(o) {
  const uv = o.ultimoVale;
  if (!uv || !uv.noVale) return '';
  return `${uv.noVale}-${uv.dig ?? 0}`;
}

// Asesores que trabajaron una orden: si pertenece a un grupo, el equipo
// completo (el creador va primero, sigue siendo el "principal" para efectos
// de agrupar/sumar); si no, solo el creador. No afecta las sumas/totales,
// que se siguen calculando una sola vez por orden agrupando por creadoPor.
function resolverAsesores(o) {
  const creador = o.creadoPor || '';
  const miembrosGrupo = o.grupoId && Array.isArray(o.grupoId.miembros) ? o.grupoId.miembros : [];
  const nombres = [creador, ...miembrosGrupo.map((m) => m.name)].filter(Boolean);
  return [...new Set(nombres)];
}

// El filtro "asesor" de los reportes sigue recibiendo un nombre (así lo manda
// el <select> del frontend), pero comparar por creadoPor (texto) deja de
// funcionar en cuanto ese usuario se renombra en Personal. Aquí se resuelve
// el nombre al usuario actual y se filtra por creadoPorId (estable) además
// de por creadoPor (para no perder órdenes viejas creadas antes de que
// existiera creadoPorId, o si el asesor ya no tiene cuenta de usuario).
async function filtroAsesor(asesor) {
  if (!asesor) return null;
  const usuario = await User.findOne({
    $or: [{ name: asesor }, { username: asesor }],
  }).select('_id');
  if (usuario) {
    return { $or: [{ creadoPorId: usuario._id }, { creadoPor: asesor }] };
  }
  return { creadoPor: asesor };
}

// GET /api/reportes/originales?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get('/originales', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ ok: false, msg: 'Parámetros desde y hasta requeridos' });
    }

    const dateFilter = buildDateFilter(desde, hasta);
    const ordenes = await Vehiculo.find({ estadoOrden: 'CERRADA', ...dateFilter })
      .sort({ fechaCierre: 1, updatedAt: 1 })
      .populate('cliente', POPULATE_CLIENTE)
      .populate(POPULATE_GRUPO)
      .lean();

    const data = ordenes.map((o) => ({
      ordenServicio: o.ordenServicio || '',
      nombre: nombreCliente(o.cliente),
      telefono: telefonoCliente(o.cliente),
      serie: o.serie || '',
      marca: o.marca || '',
      tipo: o.modelo || '',
      asesor: o.creadoPor || '',
      asesores: resolverAsesores(o),
    }));

    return res.json({ ok: true, data, total: data.length });
  } catch (err) {
    console.error('Error reporte originales:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/reportes/ventas-asesores?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get('/ventas-asesores', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ ok: false, msg: 'Parámetros desde y hasta requeridos' });
    }

    const dateFilter = buildDateFilter(desde, hasta);
    const ordenes = await Vehiculo.find({ estadoOrden: 'CERRADA', ...dateFilter })
      .sort({ creadoPor: 1, fechaCierre: 1, updatedAt: 1 })
      .populate('cliente', POPULATE_CLIENTE)
      .populate(POPULATE_GRUPO)
      .lean();

    // Agrupar por asesor (el creador sigue siendo el "principal" para la
    // suma; asesores del grupo solo se listan de forma informativa)
    const grupos = {};
    for (const o of ordenes) {
      const asesor = o.creadoPor || 'Sin Asesor';
      if (!grupos[asesor]) grupos[asesor] = [];
      grupos[asesor].push({
        ordenServicio: o.ordenServicio || '',
        nombreCliente: nombreCliente(o.cliente),
        marca: o.marca || '',
        tipo: o.modelo || '',
        importe: calcImporte(o),
        asesores: resolverAsesores(o),
      });
    }

    const data = Object.entries(grupos).map(([asesor, items]) => ({
      asesor,
      ordenes: items,
      totalAsesor: items.reduce((s, i) => s + i.importe, 0),
    }));

    const totalGeneral = data.reduce((s, g) => s + g.totalAsesor, 0);
    const totalOrdenes = ordenes.length;

    return res.json({ ok: true, data, totalGeneral, totalOrdenes });
  } catch (err) {
    console.error('Error reporte ventas asesores:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/reportes/originales-pdf?desde=...&hasta=...
router.get('/originales-pdf', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ ok: false, msg: 'Parámetros desde y hasta requeridos' });
    }

    const dateFilter = buildDateFilter(desde, hasta);
    const ordenes = await Vehiculo.find({ estadoOrden: 'CERRADA', ...dateFilter })
      .sort({ fechaCierre: 1, updatedAt: 1 })
      .populate('cliente', POPULATE_CLIENTE)
      .lean();

    const data = ordenes.map((o) => ({
      ordenServicio: o.ordenServicio || '',
      nombre: nombreCliente(o.cliente),
      telefono: telefonoCliente(o.cliente),
      serie: o.serie || '',
      marca: o.marca || '',
      tipo: o.modelo || '',
      asesor: o.creadoPor || '',
    }));

    await streamReporteOriginalesPdf(res, { data, total: data.length }, desde, hasta);
  } catch (err) {
    console.error('Error PDF reporte originales:', err);
    if (!res.headersSent) res.status(500).json({ ok: false, msg: 'Error generando PDF' });
  }
});

// GET /api/reportes/ventas-asesores-pdf?desde=...&hasta=...
router.get('/ventas-asesores-pdf', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ ok: false, msg: 'Parámetros desde y hasta requeridos' });
    }

    const dateFilter = buildDateFilter(desde, hasta);
    const ordenes = await Vehiculo.find({ estadoOrden: 'CERRADA', ...dateFilter })
      .sort({ creadoPor: 1, fechaCierre: 1, updatedAt: 1 })
      .populate('cliente', POPULATE_CLIENTE)
      .lean();

    const grupos = {};
    for (const o of ordenes) {
      const asesor = o.creadoPor || 'Sin Asesor';
      if (!grupos[asesor]) grupos[asesor] = [];
      grupos[asesor].push({
        ordenServicio: o.ordenServicio || '',
        nombreCliente: nombreCliente(o.cliente),
        marca: o.marca || '',
        tipo: o.modelo || '',
        importe: calcImporte(o),
      });
    }

    const data = Object.entries(grupos).map(([asesor, items]) => ({
      asesor,
      ordenes: items,
      totalAsesor: items.reduce((s, i) => s + i.importe, 0),
    }));

    const totalGeneral = data.reduce((s, g) => s + g.totalAsesor, 0);
    const totalOrdenes = ordenes.length;

    await streamReporteVentasAsesoresPdf(res, { data, totalGeneral, totalOrdenes }, desde, hasta);
  } catch (err) {
    console.error('Error PDF ventas asesores:', err);
    if (!res.headersSent) res.status(500).json({ ok: false, msg: 'Error generando PDF' });
  }
});

// GET /api/reportes/ordenes-abiertas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get('/ordenes-abiertas', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ ok: false, msg: 'Parámetros desde y hasta requeridos' });
    }

    const dateFilter = buildDateFilterAbiertas(desde, hasta);
    const ordenes = await Vehiculo.find({ estadoOrden: { $nin: ESTADOS_CERRADOS }, ...dateFilter })
      .sort({ creadoPor: 1, fechaRecepcion: 1 })
      .populate('cliente', POPULATE_CLIENTE)
      .populate(POPULATE_GRUPO)
      .lean();

    const grupos = {};
    for (const o of ordenes) {
      const asesor = o.creadoPor || 'Sin Asesor';
      if (!grupos[asesor]) grupos[asesor] = [];
      grupos[asesor].push({
        ultVale: formatUltVale(o),
        ordenServicio: o.ordenServicio || '',
        statusOrden: ESTADO_LABELS[o.estadoOrden] || o.estadoOrden || '',
        fecha: o.fechaRecepcion || null,
        nombre: nombreCliente(o.cliente),
        placas: o.placas || '',
        serie: o.serie || '',
        marca: o.marca || '',
        tipo: o.modelo || '',
        observaciones: observacionesOrden(o),
        asesores: resolverAsesores(o),
      });
    }

    const data = Object.entries(grupos).map(([asesor, items]) => ({
      asesor,
      ordenes: items,
      totalAsesor: items.length,
    }));

    const totalOrdenes = ordenes.length;

    return res.json({ ok: true, data, totalGeneral: totalOrdenes, totalOrdenes });
  } catch (err) {
    console.error('Error reporte ordenes abiertas:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/reportes/originales-abiertas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&asesor=Nombre
router.get('/originales-abiertas', async (req, res) => {
  try {
    const { desde, hasta, asesor } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ ok: false, msg: 'Parámetros desde y hasta requeridos' });
    }

    const dateFilter = buildDateFilterAbiertas(desde, hasta);
    const query = { estadoOrden: { $nin: ESTADOS_CERRADOS }, ...dateFilter };
    const filtroAsesorQuery = await filtroAsesor(asesor);
    if (filtroAsesorQuery) Object.assign(query, filtroAsesorQuery);
    const ordenes = await Vehiculo.find(query)
      .sort({ fechaRecepcion: 1 })
      .populate('cliente', POPULATE_CLIENTE)
      .populate(POPULATE_GRUPO)
      .lean();

    const data = ordenes.map((o) => ({
      ordenServicio: o.ordenServicio || '',
      fecha: o.fechaRecepcion || null,
      nombre: nombreCliente(o.cliente),
      telefono: telefonoCliente(o.cliente),
      placas: o.placas || '',
      serie: o.serie || '',
      marca: o.marca || '',
      tipo: o.modelo || '',
      asesor: o.creadoPor || '',
      asesores: resolverAsesores(o),
      ultVale: formatUltVale(o),
    }));

    return res.json({ ok: true, data, total: data.length });
  } catch (err) {
    console.error('Error reporte originales abiertas:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// ===== Reporte de Garantías =====
// Órdenes cuya garantía fue autorizada (APROBADA), agrupadas por asesor.
// Costo = Venta al Cliente (sin IVA) + mano de obra (horas * tarifa).

async function buildReporteGarantias({ desde, hasta, asesor }) {
  const query = {
    'garantia.estado': 'APROBADA',
    // Solo se reportan garantías cuya orden nueva ya está cerrada
    estadoOrden: 'CERRADA',
    ...buildDateFilterAbiertas(desde, hasta),
  };
  const filtroAsesorQuery = await filtroAsesor(asesor);
  if (filtroAsesorQuery) Object.assign(query, filtroAsesorQuery);

  const ordenes = await Vehiculo.find(query)
    .sort({ creadoPor: 1, fechaRecepcion: 1 })
    .populate('cliente', POPULATE_CLIENTE)
    .populate(POPULATE_GRUPO)
    .lean();

  // Mapa id → nombre para mecánicos / carroceros de la mano de obra
  const idsEmpleados = [
    ...new Set(
      ordenes
        .flatMap((o) => (o.manoObra || []).map((m) => m.esCarroceria ? m.carrocero : m.mecanico))
        .filter((id) => id && mongoose.Types.ObjectId.isValid(id))
    ),
  ];
  const empleados = idsEmpleados.length
    ? await Empleado.find({ _id: { $in: idsEmpleados } }).select('nombre').lean()
    : [];
  const nombreEmpleado = new Map(empleados.map((e) => [String(e._id), e.nombre]));

  const grupos = {};
  let totalCosto = 0;

  for (const o of ordenes) {
    const g = o.garantia || {};
    const subtotalVenta = calcImporte(o);
    // IVA aplicado solo a la Venta al Cliente (la mano de obra va sin IVA)
    const ivaVentaPct = Number(o.ivaVenta ?? 8) || 0;
    const ivaVentaMonto = subtotalVenta * (ivaVentaPct / 100);
    const totalManoObra = (o.manoObra || []).reduce(
      (s, m) => s + calcImporteHoras(m.horas),
      0
    );
    const costo = subtotalVenta + ivaVentaMonto + totalManoObra;
    totalCosto += costo;

    const mecanicos = (o.manoObra || []).map((m) => {
      const id = m.esCarroceria ? m.carrocero : m.mecanico;
      const nombre = nombreEmpleado.get(String(id)) || id || 'Sin asignar';
      return `${nombre} - Hrs: ${Number(m.horas || 0)}`;
    });

    const nombreAsesor = o.creadoPor || 'Sin Asesor';
    if (!grupos[nombreAsesor]) grupos[nombreAsesor] = [];
    grupos[nombreAsesor].push({
      ordenServicio: o.ordenServicio || '',
      cliente: nombreCliente(o.cliente),
      ordenAnterior: g.ordenAnteriorFolio || '',
      fecha: o.fechaRecepcion || null,
      marca: o.marca || '',
      modelo: o.anio || '',
      serie: o.serie || '',
      asesor: nombreAsesor,
      asesores: resolverAsesores(o),
      costo,
      motivo: g.motivo || '',
      fechaGarantia: g.fechaResolucion || g.fechaSolicitud || null,
      autorizaCarreon: !!g.autorizaCarreon,
      mecanicos,
    });
  }

  const data = Object.entries(grupos).map(([nombreAsesor, items]) => ({
    asesor: nombreAsesor,
    ordenes: items,
    totalAsesor: items.length,
  }));

  return { data, totalOrdenes: ordenes.length, totalCosto };
}

// GET /api/reportes/garantias?desde=...&hasta=...&asesor=Nombre
router.get('/garantias', async (req, res) => {
  try {
    const { desde, hasta, asesor } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ ok: false, msg: 'Parámetros desde y hasta requeridos' });
    }

    const resultado = await buildReporteGarantias({ desde, hasta, asesor });
    return res.json({ ok: true, ...resultado });
  } catch (err) {
    console.error('Error reporte garantías:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/reportes/garantias-pdf?desde=...&hasta=...&asesor=Nombre
router.get('/garantias-pdf', async (req, res) => {
  try {
    const { desde, hasta, asesor } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ ok: false, msg: 'Parámetros desde y hasta requeridos' });
    }

    const resultado = await buildReporteGarantias({ desde, hasta, asesor });
    await streamReporteGarantiasPdf(res, resultado, desde, hasta, asesor);
  } catch (err) {
    console.error('Error PDF reporte garantías:', err);
    if (!res.headersSent) res.status(500).json({ ok: false, msg: 'Error generando PDF' });
  }
});

// ===== Reporte de Cajas: Ingresos (Facturas / Remisiones) =====
// Aplana los pagos de todas las órdenes cuyo comprobante y fecha caigan en el
// rango pedido. `tipo` es el mismo enum de pagos.comprobante.

const TIPOS_COMPROBANTE_CAJA = ['NOTA_VENTA', 'REMISION'];

async function buildReporteCajasIngresos({ desde, hasta, tipo }) {
  const d = new Date(desde);
  const h = new Date(hasta);

  const ordenes = await Vehiculo.find({
    pagos: { $elemMatch: { comprobante: tipo, fecha: { $gte: d, $lte: h } } },
  })
    .populate('cliente', POPULATE_CLIENTE)
    .lean();

  const data = [];
  for (const o of ordenes) {
    for (const p of o.pagos || []) {
      if (p.comprobante !== tipo) continue;
      // Un comprobante cancelado (p. ej. la remisión que pasó a factura) ya no
      // es un ingreso: se factura aparte y contarlo aquí lo duplicaría.
      if (p.cancelado) continue;
      const f = new Date(p.fecha);
      if (f < d || f > h) continue;
      data.push({
        fecha: p.fecha,
        ordenServicio: o.ordenServicio || '',
        cliente: nombreCliente(o.cliente),
        folio: tipo === 'NOTA_VENTA' ? p.notaVenta?.numero ?? null : p.remision?.numero ?? null,
        tipoPago: p.tipoPago || '',
        montoPesos: p.montoPesos || 0,
        montoDolares: p.montoDolares || 0,
        tipoCambio: p.tipoCambio || 0,
        monto: p.monto || 0,
        referencia: p.referencia || '',
        registradoPor: p.registradoPor || '',
      });
    }
  }

  data.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  const totalMonto = data.reduce((s, r) => s + r.monto, 0);

  return { data, total: data.length, totalMonto };
}

// ===== Reporte Diario de Remisiones (formato clásico de 9 columnas) =====
// Reconstruye, a partir de pagos[] (comprobante=REMISION), las 4 secciones
// del reporte viejo, en este orden:
//   1. Anticipos del día (tipoPago=ANTICIPO)
//   2. Canceladas y pasan a factura (remision.tipo=Cancelada, de una venta de
//      un período anterior): Venta del Día y Cuentas por Cobrar en negativo.
//   3. Abonos/Liquidaciones a remisiones anteriores (tipoPago=ABONO) — sin
//      Cuentas por Cobrar, igual que en el reporte original.
//   4. Nueva venta del día (tipoPago=COMPLETO). Si esa misma orden también se
//      cancela dentro del mismo rango, la cancelación se muestra aquí mismo
//      como fila informativa sin montos, en vez de en la sección 2.
//   5. Órdenes canceladas del día (estadoOrden=CANCELADA): la orden completa
//      se canceló, muy distinto de la sección 2 (una remisión que se cancela
//      porque pasó a factura). Fila informativa sin folio de remisión ni
//      montos, con notas="CANCELADA".
// Las ventas 100% a crédito sí aparecen el día en que se remisionan: Cajas
// permite registrarlas con monto 0 (única excepción a monto > 0), y se
// reportan con Venta del Día = total de la orden y esa misma cantidad en
// Cuentas por Cobrar.
async function buildReporteRemisionesDiario({ desde, hasta }) {
  const d = new Date(desde);
  const h = new Date(hasta);

  const ordenes = await Vehiculo.find({
    pagos: { $elemMatch: { comprobante: 'REMISION', fecha: { $gte: d, $lte: h } } },
  })
    .populate('cliente', POPULATE_CLIENTE)
    .lean();

  const anticipos = [];
  const canceladas = [];
  const abonos = [];
  const nuevaVenta = [];
  // Filas de cancelación pendientes de completar con el folio de la factura
  // a la que pasó la remisión (se resuelve en bloque al final)
  const filasCancel = [];

  let totalVentaDia = 0;
  let totalContado = 0;
  let totalCredito = 0;
  let totalAnticipo = 0;
  let totalPorCobrar = 0;

  for (const o of ordenes) {
    const pagosRemision = (o.pagos || []).filter((p) => p.comprobante === 'REMISION');

    const tieneVentaEnRango = pagosRemision.some((p) => {
      if (p.tipoPago !== 'COMPLETO' || p.remision?.tipo === 'Cancelada') return false;
      const f = new Date(p.fecha);
      return f >= d && f <= h;
    });

    for (const p of pagosRemision) {
      const f = new Date(p.fecha);
      if (f < d || f > h) continue;

      const base = {
        folio: p.remision?.numero ?? null,
        ordenServicio: o.ordenServicio || '',
        cliente: nombreCliente(o.cliente),
        fecha: p.fecha,
        notas: p.notas || '',
      };

      if (p.remision?.tipo === 'Cancelada') {
        totalVentaDia -= p.monto;
        totalPorCobrar -= p.monto;
        // La leyenda de la fila ya dice que se canceló: no repetirla en Notas
        const notasCancel = /se cancela/i.test(base.notas) ? '' : base.notas;
        const filaCancel = tieneVentaEnRango
          ? { ...base, cliente: 'SE CANCELA REMISIÓN Y PASA A FACTURA', notas: notasCancel }
          : {
              ...base,
              cliente: 'SE CANCELA REMISIÓN Y PASA A FACTURA',
              notas: notasCancel,
              ventaDia: -p.monto,
              cuentasPorCobrar: -p.monto,
            };
        (tieneVentaEnRango ? nuevaVenta : canceladas).push(filaCancel);
        filasCancel.push({ fila: filaCancel, vehiculoId: String(o._id) });
        continue;
      }

      if (p.tipoPago === 'ANTICIPO') {
        anticipos.push({ ...base, anticipo: p.monto });
        totalAnticipo += p.monto;
      } else if (p.tipoPago === 'ABONO') {
        abonos.push({ ...base, ingresoCredito: p.monto });
        totalCredito += p.monto;
      } else {
        // Una remisión a Crédito documenta la venta completa aunque no entre
        // dinero (o entre solo una parte): la venta del día es el total de la
        // orden y lo no cobrado queda como cuenta por cobrar.
        const esCredito = p.remision?.tipo === 'Credito';
        const ventaDia = esCredito ? calcularTotalesOrden(o).totalOrden : p.monto;
        const porCobrar = Math.max(0, ventaDia - p.monto);
        nuevaVenta.push({
          ...base,
          ventaDia,
          ingresoContado: p.monto || undefined,
          cuentasPorCobrar: porCobrar || undefined,
        });
        totalVentaDia += ventaDia;
        totalContado += p.monto;
        totalPorCobrar += porCobrar;
      }
    }
  }

  // "SE CANCELA REMISIÓN Y PASA A FACTURA A64739": la leyenda incluye el folio
  // (serie+folio) del CFDI vigente de esa orden, igual que el reporte original.
  if (filasCancel.length) {
    const ids = [...new Set(filasCancel.map((f) => f.vehiculoId))];
    const facturas = await FacturaCfdi.find({
      tipoFactura: 'factura',
      estatus: 'generada',
      $or: [{ 'orden.vehiculoId': { $in: ids } }, { 'ordenes.vehiculoId': { $in: ids } }],
    })
      .select('serie folio fecha orden ordenes')
      .sort({ fecha: 1 })
      .lean();

    // fecha ascendente: si la orden se refacturó, prevalece el CFDI más reciente
    const folioPorVehiculo = new Map();
    for (const f of facturas) {
      const folioCfdi = `${f.serie || ''}${f.folio || ''}`;
      if (!folioCfdi) continue;
      const vids = [f.orden?.vehiculoId, ...(f.ordenes || []).map((x) => x.vehiculoId)];
      for (const vid of vids) if (vid) folioPorVehiculo.set(String(vid), folioCfdi);
    }
    for (const { fila, vehiculoId } of filasCancel) {
      const folioCfdi = folioPorVehiculo.get(vehiculoId);
      if (folioCfdi) fila.cliente += ` ${folioCfdi}`;
    }
  }

  // Órdenes canceladas del día: la orden completa se canceló (estadoOrden),
  // a diferencia de una remisión cancelada que pasa a factura. No tienen
  // folio de remisión propio (vive en pagos[].remision, no a nivel orden) ni
  // movimientos monetarios; solo informan que la orden se canceló ese día.
  // No hay campo de fecha de cancelación dedicado: se usa updatedAt, igual
  // que en VehiculosConsultaCanceladas.jsx.
  const ordenesCancelSrc = await Vehiculo.find({
    estadoOrden: 'CANCELADA',
    updatedAt: { $gte: d, $lte: h },
  })
    .populate('cliente', POPULATE_CLIENTE)
    .lean();

  const ordenesCanceladas = ordenesCancelSrc.map((o) => ({
    ordenServicio: o.ordenServicio || '',
    cliente: nombreCliente(o.cliente),
    fecha: o.updatedAt,
    notas: 'CANCELADA',
  }));

  anticipos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  canceladas.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  abonos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  nuevaVenta.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  ordenesCanceladas.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  const totalIngreso = totalContado + totalCredito + totalAnticipo;

  return {
    anticipos,
    canceladas,
    abonos,
    nuevaVenta,
    ordenesCanceladas,
    totales: { totalVentaDia, totalContado, totalCredito, totalAnticipo, totalPorCobrar, totalIngreso },
  };
}

// ===== Resumen diario de Remisiones (para rangos de más de un día) =====
// Devuelve el Total Ingreso (y demás totales) de cada día del rango, en vez
// del detalle completo, reusando buildReporteRemisionesDiario día por día
// para garantizar que el total mostrado en la lista coincida exactamente con
// lo que se ve al entrar al detalle de ese día. Días sin movimientos no se
// incluyen.
function enumerarDiasLocal(desde, hasta) {
  const DIA_MS = 24 * 60 * 60 * 1000;
  const fin = new Date(hasta);
  const dias = [];
  let inicio = new Date(desde);
  while (inicio <= fin) {
    const finDiaMs = Math.min(inicio.getTime() + DIA_MS - 1, fin.getTime());
    dias.push({ desde: inicio, hasta: new Date(finDiaMs) });
    inicio = new Date(inicio.getTime() + DIA_MS);
  }
  return dias;
}

async function buildResumenDiarioRemisiones({ desde, hasta }) {
  const dias = enumerarDiasLocal(new Date(desde), new Date(hasta));

  const porDia = await Promise.all(
    dias.map(async (dia) => {
      const rep = await buildReporteRemisionesDiario({
        desde: dia.desde.toISOString(),
        hasta: dia.hasta.toISOString(),
      });
      const totalMovimientos =
        rep.anticipos.length +
        rep.canceladas.length +
        rep.abonos.length +
        rep.nuevaVenta.length +
        rep.ordenesCanceladas.length;
      return {
        desde: dia.desde.toISOString(),
        hasta: dia.hasta.toISOString(),
        totalMovimientos,
        totales: rep.totales,
      };
    })
  );

  return porDia.filter((d) => d.totalMovimientos > 0);
}

// GET /api/reportes/cajas-ingresos-dias?desde=...&hasta=...&tipo=REMISION
router.get('/cajas-ingresos-dias', async (req, res) => {
  try {
    const { desde, hasta, tipo } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ ok: false, msg: 'Parámetros desde y hasta requeridos' });
    }
    if (tipo !== 'REMISION') {
      return res.status(400).json({ ok: false, msg: 'Este resumen solo aplica a tipo REMISION' });
    }

    const dias = await buildResumenDiarioRemisiones({ desde, hasta });
    return res.json({ ok: true, dias });
  } catch (err) {
    console.error('Error resumen diario remisiones:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/reportes/cajas-ingresos?desde=...&hasta=...&tipo=NOTA_VENTA|REMISION
router.get('/cajas-ingresos', async (req, res) => {
  try {
    const { desde, hasta, tipo } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ ok: false, msg: 'Parámetros desde y hasta requeridos' });
    }
    if (!TIPOS_COMPROBANTE_CAJA.includes(tipo)) {
      return res.status(400).json({ ok: false, msg: 'Parámetro tipo inválido' });
    }

    if (tipo === 'REMISION') {
      const resultado = await buildReporteRemisionesDiario({ desde, hasta });
      return res.json({ ok: true, tipo, ...resultado });
    }

    const resultado = await buildReporteCajasIngresos({ desde, hasta, tipo });
    return res.json({ ok: true, tipo, ...resultado });
  } catch (err) {
    console.error('Error reporte cajas ingresos:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/reportes/cajas-ingresos-pdf?desde=...&hasta=...&tipo=NOTA_VENTA|REMISION
router.get('/cajas-ingresos-pdf', async (req, res) => {
  try {
    const { desde, hasta, tipo } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ ok: false, msg: 'Parámetros desde y hasta requeridos' });
    }
    if (!TIPOS_COMPROBANTE_CAJA.includes(tipo)) {
      return res.status(400).json({ ok: false, msg: 'Parámetro tipo inválido' });
    }

    if (tipo === 'REMISION') {
      const resultado = await buildReporteRemisionesDiario({ desde, hasta });
      await streamReporteRemisionesDiarioPdf(res, resultado, desde, hasta);
      return;
    }

    const resultado = await buildReporteCajasIngresos({ desde, hasta, tipo });
    await streamReporteCajasIngresosPdf(res, resultado, desde, hasta, tipo);
  } catch (err) {
    console.error('Error PDF reporte cajas ingresos:', err);
    if (!res.headersSent) res.status(500).json({ ok: false, msg: 'Error generando PDF' });
  }
});

// GET /api/reportes/ordenes-abiertas-pdf?desde=...&hasta=...
router.get('/ordenes-abiertas-pdf', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ ok: false, msg: 'Parámetros desde y hasta requeridos' });
    }

    const dateFilter = buildDateFilterAbiertas(desde, hasta);
    const ordenes = await Vehiculo.find({ estadoOrden: { $nin: ESTADOS_CERRADOS }, ...dateFilter })
      .sort({ creadoPor: 1, fechaRecepcion: 1 })
      .populate('cliente', POPULATE_CLIENTE)
      .lean();

    const grupos = {};
    for (const o of ordenes) {
      const asesor = o.creadoPor || 'Sin Asesor';
      if (!grupos[asesor]) grupos[asesor] = [];
      grupos[asesor].push({
        ultVale: formatUltVale(o),
        ordenServicio: o.ordenServicio || '',
        statusOrden: ESTADO_LABELS[o.estadoOrden] || o.estadoOrden || '',
        fecha: o.fechaRecepcion || null,
        nombre: nombreCliente(o.cliente),
        placas: o.placas || '',
        serie: o.serie || '',
        marca: o.marca || '',
        tipo: o.modelo || '',
        observaciones: observacionesOrden(o),
      });
    }

    const data = Object.entries(grupos).map(([asesor, items]) => ({
      asesor,
      ordenes: items,
      totalAsesor: items.length,
    }));

    const totalOrdenes = ordenes.length;

    await streamReporteOrdenesAbiertasPdf(res, { data, totalGeneral: totalOrdenes, totalOrdenes }, desde, hasta);
  } catch (err) {
    console.error('Error PDF ordenes abiertas:', err);
    if (!res.headersSent) res.status(500).json({ ok: false, msg: 'Error generando PDF' });
  }
});

// GET /api/reportes/originales-abiertas-pdf?desde=...&hasta=...&asesor=Nombre
router.get('/originales-abiertas-pdf', async (req, res) => {
  try {
    const { desde, hasta, asesor } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ ok: false, msg: 'Parámetros desde y hasta requeridos' });
    }

    const dateFilter = buildDateFilterAbiertas(desde, hasta);
    const query = { estadoOrden: { $nin: ESTADOS_CERRADOS }, ...dateFilter };
    const filtroAsesorQuery = await filtroAsesor(asesor);
    if (filtroAsesorQuery) Object.assign(query, filtroAsesorQuery);
    const ordenes = await Vehiculo.find(query)
      .sort({ fechaRecepcion: 1 })
      .populate('cliente', POPULATE_CLIENTE)
      .lean();

    const data = ordenes.map((o) => ({
      ordenServicio: o.ordenServicio || '',
      fecha: o.fechaRecepcion || null,
      nombre: nombreCliente(o.cliente),
      telefono: telefonoCliente(o.cliente),
      placas: o.placas || '',
      serie: o.serie || '',
      marca: o.marca || '',
      tipo: o.modelo || '',
      asesor: o.creadoPor || '',
      ultVale: formatUltVale(o),
    }));

    await streamReporteOriginalesAbiertasPdf(res, { data, total: data.length }, desde, hasta, asesor);
  } catch (err) {
    console.error('Error PDF originales abiertas:', err);
    if (!res.headersSent) res.status(500).json({ ok: false, msg: 'Error generando PDF' });
  }
});

// ===== Recursos Humanos: C x C de mano de obra por mecánico =====
// Por cada asignación de mano de obra (no carrocería), reporta el monto del
// servicio ligado del presupuesto (lo que se le cobra al cliente) y el monto
// de mano de obra a pagar (horas x tarifa fija, misma fórmula que el resto
// del sistema). Se agrupa por mecánico y se filtra por fecha de cierre.
async function buildReporteRhCxC({ desde, hasta, mecanico }) {
  const query = {
    estadoOrden: 'CERRADA',
    ...buildDateFilter(desde, hasta),
  };

  const ordenes = await Vehiculo.find(query)
    .sort({ fechaCierre: 1, updatedAt: 1 })
    .populate('cliente', POPULATE_CLIENTE)
    .lean();

  const idsEmpleados = [
    ...new Set(
      ordenes
        .flatMap((o) => o.manoObra || [])
        .filter((m) => !m.esCarroceria && m.mecanico && mongoose.Types.ObjectId.isValid(m.mecanico))
        .map((m) => m.mecanico)
    ),
  ];
  const empleados = idsEmpleados.length
    ? await Empleado.find({ _id: { $in: idsEmpleados } }).select('nombre').lean()
    : [];
  const nombreEmpleado = new Map(empleados.map((e) => [String(e._id), e.nombre]));

  const grupos = {};
  let totalServiciosGeneral = 0;
  let totalManoObraGeneral = 0;

  for (const o of ordenes) {
    const presupuestoPorId = new Map(
      (o.presupuesto || []).map((p) => [String(p._id), p])
    );

    for (const m of o.manoObra || []) {
      if (m.esCarroceria) continue; // reporte de mecánicos; carrocería tiene su propio precio manual

      const idMecanico = String(m.mecanico || '');
      if (mecanico && idMecanico !== mecanico) continue;
      if (!idMecanico) continue;

      const nombreMec = nombreEmpleado.get(idMecanico) || m.mecanico || 'Sin asignar';
      const montoServicio = montoServicioManoObra(m, presupuestoPorId);
      const montoManoObra = calcImporteHoras(m.horas);

      if (!grupos[nombreMec]) {
        grupos[nombreMec] = { mecanico: nombreMec, items: [], totalServicios: 0, totalManoObra: 0 };
      }
      grupos[nombreMec].items.push({
        ordenServicio: o.ordenServicio || '',
        cliente: nombreCliente(o.cliente),
        fechaCierre: o.fechaCierre || o.updatedAt || null,
        concepto: m.concepto || '',
        horas: Number(m.horas || 0),
        montoServicio,
        montoManoObra,
      });
      grupos[nombreMec].totalServicios += montoServicio;
      grupos[nombreMec].totalManoObra += montoManoObra;
      totalServiciosGeneral += montoServicio;
      totalManoObraGeneral += montoManoObra;
    }
  }

  const data = Object.values(grupos).sort((a, b) => a.mecanico.localeCompare(b.mecanico));

  return { data, totalServiciosGeneral, totalManoObraGeneral };
}

// GET /api/reportes/rh-cxc?desde=...&hasta=...&mecanico=EmpleadoId
router.get('/rh-cxc', async (req, res) => {
  try {
    const { desde, hasta, mecanico } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ ok: false, msg: 'Parámetros desde y hasta requeridos' });
    }

    const resultado = await buildReporteRhCxC({ desde, hasta, mecanico });
    return res.json({ ok: true, ...resultado });
  } catch (err) {
    console.error('Error reporte RH C x C:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/reportes/rh-cxc-pdf?desde=...&hasta=...&mecanico=EmpleadoId
router.get('/rh-cxc-pdf', async (req, res) => {
  try {
    const { desde, hasta, mecanico } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ ok: false, msg: 'Parámetros desde y hasta requeridos' });
    }

    const resultado = await buildReporteRhCxC({ desde, hasta, mecanico });
    await streamReporteRhCxCPdf(res, resultado, desde, hasta, mecanico);
  } catch (err) {
    console.error('Error PDF reporte RH C x C:', err);
    if (!res.headersSent) res.status(500).json({ ok: false, msg: 'Error generando PDF' });
  }
});

// ===== Reporte de Horas Trabajadas por Técnico =====
// Agrupa por técnico (mecánico) las órdenes en el período (filtrado por
// fecha de recepción), pudiendo filtrarse por estado: cerradas, abiertas o
// todas. Un renglón por asignación de mano de obra; "total" es la suma de
// los montos de servicio de ESE técnico dentro de ESA misma orden (se repite
// si la orden tiene más de una asignación para el mismo técnico).
function tieneRemision(o) {
  return (o.pagos || []).some((p) => p.comprobante === 'REMISION' && !p.cancelado);
}

async function buildReporteHorasTecnico({ desde, hasta, estado }) {
  const query = { ...buildDateFilterAbiertas(desde, hasta) };
  if (estado === 'cerradas') query.estadoOrden = 'CERRADA';
  else if (estado === 'abiertas') query.estadoOrden = { $nin: ESTADOS_CERRADOS };
  // 'todas' (o sin valor): sin filtro de estado

  const ordenes = await Vehiculo.find(query)
    .sort({ fechaRecepcion: 1 })
    .populate('cliente', POPULATE_CLIENTE)
    .lean();

  const idsEmpleados = [
    ...new Set(
      ordenes
        .flatMap((o) => o.manoObra || [])
        .filter((m) => !m.esCarroceria && m.mecanico && mongoose.Types.ObjectId.isValid(m.mecanico))
        .map((m) => m.mecanico)
    ),
  ];
  const empleados = idsEmpleados.length
    ? await Empleado.find({ _id: { $in: idsEmpleados } }).select('nombre').lean()
    : [];
  const nombreEmpleado = new Map(empleados.map((e) => [String(e._id), e.nombre]));

  const grupos = {};

  for (const o of ordenes) {
    const presupuestoPorId = new Map((o.presupuesto || []).map((p) => [String(p._id), p]));
    const cerrada = o.estadoOrden === 'CERRADA';
    const remision = tieneRemision(o);
    const ivaPct = Number(o.ivaPresupuesto ?? 8) || 0;

    const manoObraValida = (o.manoObra || []).filter((m) => !m.esCarroceria && m.mecanico);

    // Total de servicio por técnico dentro de esta orden (para la columna "Total")
    const totalPorMecanico = {};
    for (const m of manoObraValida) {
      const idMecanico = String(m.mecanico);
      const montoServicio = montoServicioManoObra(m, presupuestoPorId);
      totalPorMecanico[idMecanico] = (totalPorMecanico[idMecanico] || 0) + montoServicio;
    }

    for (const m of manoObraValida) {
      const idMecanico = String(m.mecanico);
      const nombreMec = nombreEmpleado.get(idMecanico) || m.mecanico || 'Sin asignar';
      const montoServicio = montoServicioManoObra(m, presupuestoPorId);
      const iva = montoServicio * (ivaPct / 100);

      if (!grupos[nombreMec]) {
        grupos[nombreMec] = { mecanico: nombreMec, items: [], totalServicio: 0, totalIva: 0, totalHoras: 0 };
      }
      grupos[nombreMec].items.push({
        ordenServicio: o.ordenServicio || '',
        fechaOrden: o.fechaRecepcion || null,
        serie: o.serie || '',
        nombre: nombreCliente(o.cliente),
        cerrada,
        fechaCierre: o.fechaCierre || null,
        remision,
        montoServicio,
        total: totalPorMecanico[idMecanico] || 0,
        iva,
        horas: Number(m.horas || 0),
      });
      grupos[nombreMec].totalServicio += montoServicio;
      grupos[nombreMec].totalIva += iva;
      grupos[nombreMec].totalHoras += Number(m.horas || 0);
    }
  }

  const data = Object.values(grupos).sort((a, b) => a.mecanico.localeCompare(b.mecanico));
  const totalGeneralServicio = data.reduce((s, g) => s + g.totalServicio, 0);
  const totalGeneralIva = data.reduce((s, g) => s + g.totalIva, 0);
  const totalGeneralHoras = data.reduce((s, g) => s + g.totalHoras, 0);

  return { data, totalGeneralServicio, totalGeneralIva, totalGeneralHoras };
}

// GET /api/reportes/horas-tecnico?desde=...&hasta=...&estado=cerradas|abiertas|todas
router.get('/horas-tecnico', async (req, res) => {
  try {
    const { desde, hasta, estado } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ ok: false, msg: 'Parámetros desde y hasta requeridos' });
    }

    const resultado = await buildReporteHorasTecnico({ desde, hasta, estado });
    return res.json({ ok: true, ...resultado });
  } catch (err) {
    console.error('Error reporte horas por técnico:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/reportes/horas-tecnico-pdf?desde=...&hasta=...&estado=cerradas|abiertas|todas
router.get('/horas-tecnico-pdf', async (req, res) => {
  try {
    const { desde, hasta, estado } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ ok: false, msg: 'Parámetros desde y hasta requeridos' });
    }

    const resultado = await buildReporteHorasTecnico({ desde, hasta, estado });
    await streamReporteHorasTecnicoPdf(res, resultado, desde, hasta, estado);
  } catch (err) {
    console.error('Error PDF reporte horas por técnico:', err);
    if (!res.headersSent) res.status(500).json({ ok: false, msg: 'Error generando PDF' });
  }
});

module.exports = router;
