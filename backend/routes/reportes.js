const express = require('express');
const router = express.Router();
const Vehiculo = require('../models/Vehiculo');
const { streamReporteOriginalesPdf } = require('../service/reporteOriginalesPdf');
const { streamReporteVentasAsesoresPdf } = require('../service/reporteVentasAsesoresPdf');

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

module.exports = router;
