const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Vehiculo = require('../models/Vehiculo');
const Empleado = require('../models/Empleado');
const { streamReporteOriginalesPdf } = require('../service/reporteOriginalesPdf');
const { streamReporteVentasAsesoresPdf } = require('../service/reporteVentasAsesoresPdf');
const { streamReporteOrdenesAbiertasPdf } = require('../service/reporteOrdenesAbiertasPdf');
const { streamReporteOriginalesAbiertasPdf } = require('../service/reporteOriginalesAbiertasPdf');
const { streamReporteGarantiasPdf } = require('../service/reporteGarantiasPdf');
const { calcImporteHoras } = require('../utils/manoObra');

const POPULATE_CLIENTE = 'nombre apellidoPaterno apellidoMaterno tipoCliente empresa gobierno telefonos celulares';

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

function nombreCliente(c) {
  if (!c) return '';
  if (c.tipoCliente === 'Empresa') return c.empresa || '';
  if (c.tipoCliente === 'Gobierno') return c.gobierno?.nombreGobierno || '';
  return [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(' ');
}

function telefonoCliente(c) {
  if (!c) return '';
  if (c.celulares?.length) return c.celulares[0].numero || '';
  if (c.telefonos?.length) return c.telefonos[0].numero || '';
  return '';
}

function calcImporte(v) {
  return (v.ventaCliente || []).reduce(
    (s, i) => s + (i.cant || 1) * (i.precioVenta || 0),
    0
  );
}

const ESTADOS_CERRADOS = ['CERRADA', 'CANCELADA'];

const ESTADO_LABELS = {
  PENDIENTE_CAPTURA:              'Pendiente Captura',
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
      .lean();

    // Agrupar por asesor
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
    if (asesor) query.creadoPor = asesor;
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
    ...buildDateFilterAbiertas(desde, hasta),
  };
  if (asesor) query.creadoPor = asesor;

  const ordenes = await Vehiculo.find(query)
    .sort({ creadoPor: 1, fechaRecepcion: 1 })
    .populate('cliente', POPULATE_CLIENTE)
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
    const totalManoObra = (o.manoObra || []).reduce(
      (s, m) => s + calcImporteHoras(m.horas),
      0
    );
    const costo = subtotalVenta + totalManoObra;
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
    if (asesor) query.creadoPor = asesor;
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

module.exports = router;
