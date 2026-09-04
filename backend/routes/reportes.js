const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Vehiculo = require('../models/Vehiculo');
const Empleado = require('../models/Empleado');
const User = require('../models/User');
const FacturaCfdi = require('../models/FacturaCfdi');
const Cliente = require('../models/Cliente');
const { streamReporteOriginalesPdf } = require('../service/reporteOriginalesPdf');
const { streamReporteVentasAsesoresPdf } = require('../service/reporteVentasAsesoresPdf');
const { streamReporteOrdenesAbiertasPdf } = require('../service/reporteOrdenesAbiertasPdf');
const { streamReporteOriginalesAbiertasPdf } = require('../service/reporteOriginalesAbiertasPdf');
const { streamReporteGarantiasPdf } = require('../service/reporteGarantiasPdf');
const { streamReporteRemisionesDiarioPdf } = require('../service/reporteRemisionesDiarioPdf');
const { streamReporteFacturasDiarioPdf } = require('../service/reporteFacturasDiarioPdf');
const { streamReporteRhCxCPdf } = require('../service/reporteRhCxCPdf');
const { streamReporteHorasTecnicoPdf } = require('../service/reporteHorasTecnicoPdf');
const { streamReportePendientesFacturaPdf } = require('../service/reportePendientesFacturaPdf');
const { streamReporteClientesAnticiposPdf } = require('../service/reporteClientesAnticiposPdf');
const { calcImporteHoras } = require('../utils/manoObra');
const { calcularTotalesOrden } = require('../utils/cajaTotales');
const { abreviaturaFormaPago } = require('../utils/abreviaturaFormaPago');

// Adjunta a una nota la abreviatura del método de pago usado (" - BR-C"), a
// partir del sub-objeto pago.notaVenta o pago.reciboProvisional. Mismo estilo
// separador que la banda "Complementos de pago".
function notaConMetodo(notas, formaPagoDesc) {
  const abrev = abreviaturaFormaPago(formaPagoDesc);
  if (!abrev) return notas || '';
  return notas ? `${notas} - ${abrev}` : abrev;
}

const POPULATE_CLIENTE = 'nombre apellidoPaterno apellidoMaterno tipoCliente empresa gobierno telefonos celulares esEmpleado';
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

// Nombre "principal" mostrado en los reportes: para Empresa Privada/Arrendadora
// es el nombre fiscal (razón social), para Empresa Gobierno el Nombre Gobierno
// y para particulares el nombre completo.
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
    return c.empresa?.razonSocial || c.nombre || '';
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
// `tipo` es el mismo enum de pagos.comprobante. Ambos tipos usan el formato
// clásico de 9 columnas: Remisiones vía buildReporteRemisionesDiario, y
// Facturas vía buildReporteFacturasDiario (más abajo).

const TIPOS_COMPROBANTE_CAJA = ['NOTA_VENTA', 'REMISION'];

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

  // Anticipos documentados con Recibo Provisional (no con Remisión real) que
  // el cajero marcó para sumarse a este reporte (ver CajaModalPago /
  // pago.anticipoDestino). No participan de la banda "Anticipos cancelados"
  // ni del cruce con FacturaCfdi: al cancelarse (POST /:id/pagos/:pagoId/cancelar)
  // simplemente dejan de sumar, igual que cualquier otro Abono/Anticipo.
  const ordenesAnticipoProvisionalRemision = await Vehiculo.find({
    pagos: {
      $elemMatch: {
        comprobante: 'RECIBO_PROVISIONAL',
        tipoPago: 'ANTICIPO',
        anticipoDestino: 'REMISION',
        cancelado: { $ne: true },
        fecha: { $gte: d, $lte: h },
      },
    },
  })
    .populate('cliente', POPULATE_CLIENTE)
    .lean();

  for (const o of ordenesAnticipoProvisionalRemision) {
    for (const p of o.pagos || []) {
      if (p.comprobante !== 'RECIBO_PROVISIONAL' || p.tipoPago !== 'ANTICIPO' || p.anticipoDestino !== 'REMISION' || p.cancelado) continue;
      const f = new Date(p.fecha);
      if (f < d || f > h) continue;

      anticipos.push({
        folio: 'ANT',
        ordenServicio: o.ordenServicio || '',
        cliente: nombreCliente(o.cliente),
        fecha: p.fecha,
        anticipo: p.monto,
        notas: notaConMetodo(p.notas, p.reciboProvisional),
      });
      totalAnticipo += p.monto;
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

// ===== Reporte Diario de Facturas (formato clásico de 9 columnas) =====
// Análogo a buildReporteRemisionesDiario, pero para el comprobante NOTA_VENTA
// combinado con los documentos fiscales reales (FacturaCfdi). Bandas, en
// orden:
//   1. Anticipos del día (pagos NOTA_VENTA, tipoPago=ANTICIPO, activos)
//   2. Anticipos cancelados (mismos pagos, cancelado=true: se cancelan porque
//      la orden ya se facturó) — igual columna Anticipo, en negativo.
//   3. Complementos de pago (FacturaCfdi tipoFactura=complementoPago): dinero
//      cobrado hoy de una factura a crédito (PPD) emitida antes.
//   4. Notas de crédito (FacturaCfdi tipoFactura=notaCredito): descuentan de
//      la Venta del Día y de Cuentas por Cobrar, igual que una cancelación.
//   5. Facturas del día (FacturaCfdi tipoFactura=factura, agrupen una o varias
//      órdenes).
//   6. Factura global del día (FacturaCfdi tipoFactura=facturaGlobal, CFDI al
//      público en general): banda propia al final, con el desglose de las
//      notas de venta agrupadas ("PUBLICO GENERAL.=(P.. $.. CON ..)--(..)").
const BANCOS_TARJETA_CD = ['BANREGIO', 'AMERICAN EXPRESS', 'BANAMEX', 'BANORTE', 'BBVA BANCOMER'];
// Catálogo SAT c_FormaPago usado en FacturaCfdi.pago.formaPago (complementos
// de pago): solo se mapean los códigos que representan un depósito real.
const SAT_FORMA_PAGO_A_DEPOSITO = {
  '01': 'efectivo',
  '02': 'cheques',
  '03': 'transferencias',
  '04': 'tarjetasCD',
  '28': 'tarjetasCD',
  '29': 'tarjetasCD',
};

// Etiqueta legible de la forma de pago SAT para las Notas del Complemento de
// Pago (un complemento no tiene "banco" como los pagos de Cajas, solo el
// código c_FormaPago del SAT).
const SAT_FORMA_PAGO_LABEL = {
  '01': 'EFECTIVO',
  '02': 'CHEQUE',
  '03': 'TRANSFERENCIA',
  '04': 'TARJETA DE CRÉDITO',
  '28': 'TARJETA DE DÉBITO',
  '29': 'TARJETA DE SERVICIOS',
};

// Abreviatura corta de la forma de pago SAT para la columna Notas de una
// factura, cuando no hay un pago de Cajas cruzado del que sacar la terminal
// (un CFDI no guarda "banco", solo el código c_FormaPago).
const SAT_FORMA_PAGO_ABREV = {
  '01': 'EFECTIVO',
  '02': 'CHEQUE',
  '03': 'TRANSFERENCIA',
  '04': 'TC',
  '28': 'TD',
  '29': 'TARJ-SERV',
};

function bancoADeposito(banco) {
  if (banco === 'EFECTIVOS' || banco === 'DOLARES') return 'efectivo';
  if (banco === 'CHEQUE') return 'cheques';
  if (banco === 'TRANSFERENCIA') return 'transferencias';
  if (BANCOS_TARJETA_CD.includes(banco)) return 'tarjetasCD';
  return null;
}

// Reparte el monto de un pago NOTA_VENTA entre los buckets de Depósito.
// Un pago COMBINADO se desglosa por método; cualquier otra forma cae en
// bancoADeposito(notaVenta.banco), que sigue sirviendo para Notas viejas y
// para las nuevas simples (banco guarda EFECTIVOS/CHEQUE/TRANSFERENCIA o la
// terminal). `sumarDeposito` es el helper local de cada reporte.
function formaPagoProvisionalADeposito(formaPago) {
  if (formaPago === 'EFECTIVO') return 'efectivo';
  if (formaPago === 'CHEQUE') return 'cheques';
  if (formaPago === 'TRANSFERENCIA') return 'transferencias';
  if (formaPago === 'CREDITO' || formaPago === 'DEBITO') return 'tarjetasCD';
  return null;
}

// Desglose COMBINADO -> buckets de Depósito (mismo cálculo para Nota de Venta y
// Recibo Provisional: comparten la forma del sub-objeto `combinado`).
function sumarDepositoCombinado(sumarDeposito, combinado, tipoCambio) {
  const c = combinado || {};
  const tc = Number(tipoCambio) || 0;
  sumarDeposito('efectivo', (Number(c.efectivo) || 0) + (Number(c.efectivoDolares) || 0) * tc);
  sumarDeposito('tarjetasCD', (Number(c.credito) || 0) + (Number(c.debito) || 0));
  sumarDeposito('cheques', Number(c.cheque) || 0);
  sumarDeposito('transferencias', Number(c.transferencia) || 0);
}

function sumarDepositoNotaVenta(sumarDeposito, pago) {
  const nv = pago.notaVenta || {};
  if (nv.formaPago === 'COMBINADO' && nv.combinado) {
    sumarDepositoCombinado(sumarDeposito, nv.combinado, pago.tipoCambio);
    return;
  }
  // Preferir formaPago (dato confiable en Notas de Venta nuevas); `banco` solo
  // trae terminal para tarjeta y '' para todo lo demás, así que las Notas
  // viejas siguen resolviéndose por banco (EFECTIVOS/CHEQUE/TRANSFERENCIA/…).
  const bucket = formaPagoProvisionalADeposito(nv.formaPago) || bancoADeposito(nv.banco);
  sumarDeposito(bucket, pago.monto);
}

function sumarDepositoReciboProvisional(sumarDeposito, pago) {
  const rp = pago.reciboProvisional || {};
  if (rp.formaPago === 'COMBINADO' && rp.combinado) {
    sumarDepositoCombinado(sumarDeposito, rp.combinado, pago.tipoCambio);
    return;
  }
  sumarDeposito(formaPagoProvisionalADeposito(rp.formaPago), pago.monto);
}

async function buildReporteFacturasDiario({ desde, hasta }) {
  const d = new Date(desde);
  const h = new Date(hasta);

  const deposito = { efectivo: 0, cheques: 0, transferencias: 0, tarjetasCD: 0 };
  const sumarDeposito = (bucket, monto) => {
    if (bucket) deposito[bucket] += monto;
  };

  let totalVentaDia = 0;
  let totalContado = 0;
  let totalCredito = 0;
  let totalAnticipo = 0;
  let totalPorCobrar = 0;

  // ---- 1: Anticipos vigentes (NOTA_VENTA + ANTICIPO, no cancelados) ----
  const ordenesAnticipoVigente = await Vehiculo.find({
    pagos: {
      $elemMatch: {
        comprobante: 'NOTA_VENTA',
        tipoPago: 'ANTICIPO',
        cancelado: { $ne: true },
        fecha: { $gte: d, $lte: h },
      },
    },
  })
    .populate('cliente', POPULATE_CLIENTE)
    .lean();

  const anticipos = [];
  for (const o of ordenesAnticipoVigente) {
    for (const p of o.pagos || []) {
      if (p.comprobante !== 'NOTA_VENTA' || p.tipoPago !== 'ANTICIPO' || p.cancelado) continue;
      const f = new Date(p.fecha);
      if (f < d || f > h) continue;

      anticipos.push({
        folio: 'ANT',
        ordenServicio: o.ordenServicio || '',
        cliente: nombreCliente(o.cliente),
        fecha: p.fecha,
        anticipo: p.monto,
        notas: notaConMetodo(p.notas, p.notaVenta),
      });
      totalAnticipo += p.monto;
      sumarDepositoNotaVenta(sumarDeposito, p);
    }
  }

  // ---- 1b: Anticipos con Recibo Provisional marcados para este reporte ----
  // (ver pago.anticipoDestino en CajaModalPago); no tienen folio de Nota de
  // Venta real, solo el del Recibo Provisional.
  const ordenesAnticipoProvisionalFactura = await Vehiculo.find({
    pagos: {
      $elemMatch: {
        comprobante: 'RECIBO_PROVISIONAL',
        tipoPago: 'ANTICIPO',
        anticipoDestino: 'NOTA_VENTA',
        cancelado: { $ne: true },
        fecha: { $gte: d, $lte: h },
      },
    },
  })
    .populate('cliente', POPULATE_CLIENTE)
    .lean();

  for (const o of ordenesAnticipoProvisionalFactura) {
    for (const p of o.pagos || []) {
      if (p.comprobante !== 'RECIBO_PROVISIONAL' || p.tipoPago !== 'ANTICIPO' || p.anticipoDestino !== 'NOTA_VENTA' || p.cancelado) continue;
      const f = new Date(p.fecha);
      if (f < d || f > h) continue;

      anticipos.push({
        folio: 'ANT',
        ordenServicio: o.ordenServicio || '',
        cliente: nombreCliente(o.cliente),
        fecha: p.fecha,
        anticipo: p.monto,
        notas: notaConMetodo(p.notas, p.reciboProvisional),
      });
      totalAnticipo += p.monto;
      sumarDepositoReciboProvisional(sumarDeposito, p);
    }
  }

  // ---- 2: Anticipos y remisiones cancelados que pasaron a factura ----
  // A diferencia de la sección anterior, se filtran por la fecha en que se
  // canceló el comprobante (cuando se facturó la orden), no la fecha en que
  // se generó: es ese evento el que corresponde al día de este reporte.
  const ordenesConCancelados = await Vehiculo.find({
    pagos: {
      $elemMatch: {
        cancelado: true,
        comprobante: { $in: ['NOTA_VENTA', 'REMISION', 'RECIBO_PROVISIONAL'] },
        $or: [
          { canceladoEn: { $gte: d, $lte: h } },
          { canceladoEn: null, fecha: { $gte: d, $lte: h } },
        ],
      },
    },
  })
    .populate('cliente', POPULATE_CLIENTE)
    .lean();

  const candidatosCancelados = [];
  for (const o of ordenesConCancelados) {
    for (const p of o.pagos || []) {
      if (!p.cancelado) continue;
      // Cancelación por error de captura (solo admin): no es "pasa a factura",
      // no pertenece a esta banda.
      if (p.motivoCancelacionTipo === 'ERROR') continue;
      // Un anticipo puede documentarse con Nota de Venta (histórico) o con
      // Recibo Provisional (ver anticipoDestino en cajas.js); ambos cuentan
      // igual aquí. Un Recibo Provisional de un ABONO (no anticipo) no.
      const esAnticipo =
        (p.comprobante === 'NOTA_VENTA' || p.comprobante === 'RECIBO_PROVISIONAL') && p.tipoPago === 'ANTICIPO';
      const esRemision = p.comprobante === 'REMISION';
      if (!esAnticipo && !esRemision) continue;
      const fechaEvento = new Date(p.canceladoEn || p.fecha);
      if (fechaEvento < d || fechaEvento > h) continue;
      candidatosCancelados.push({ o, p, esRemision, fechaEvento });
    }
  }

  const anticiposCancelados = [];
  // Factura a la que pasó cada anticipo/remisión cancelado, para cruzar con
  // Facturas/Factura general más abajo (marca la nota de cancelado previo y
  // el desglose de PUBLICO GENERAL). El tipo (ANTICIPO/REMISION) decide la
  // redacción: solo los anticipos quedan listados arriba en "Anticipos
  // cancelados", así que solo ellos pueden decir "ANTES MENCIONADO".
  const cruceAnticipoPorOrdenFactura = new Map(); // `${facturaId}_${vehiculoId}` -> { tipo, monto }

  if (candidatosCancelados.length) {
    // Enlace real (pago.facturaId), disponible para todo lo cancelado desde
    // que se generó la factura (ver generar_xml.js).
    const idsDirectos = [
      ...new Set(candidatosCancelados.filter((c) => c.p.facturaId).map((c) => String(c.p.facturaId))),
    ];
    const facturasDirectas = idsDirectos.length
      ? await FacturaCfdi.find({ _id: { $in: idsDirectos } }).select('serie folio').lean()
      : [];
    const folioPorFacturaId = new Map(
      facturasDirectas.map((f) => [String(f._id), `${f.serie || ''}${f.folio || ''}`])
    );

    // Fallback por vehiculoId, solo para pagos cancelados antes de que
    // existiera pago.facturaId.
    const vehiculoIdsSinFacturaId = [
      ...new Set(candidatosCancelados.filter((c) => !c.p.facturaId).map((c) => String(c.o._id))),
    ];
    const folioYFacturaIdPorVehiculo = new Map();
    if (vehiculoIdsSinFacturaId.length) {
      const facturasVigentes = await FacturaCfdi.find({
        tipoFactura: 'factura',
        estatus: 'generada',
        $or: [
          { 'orden.vehiculoId': { $in: vehiculoIdsSinFacturaId } },
          { 'ordenes.vehiculoId': { $in: vehiculoIdsSinFacturaId } },
        ],
      })
        .select('serie folio fecha orden ordenes')
        .sort({ fecha: 1 })
        .lean();
      for (const f of facturasVigentes) {
        const folioCfdi = `${f.serie || ''}${f.folio || ''}`;
        if (!folioCfdi) continue;
        const vids = [f.orden?.vehiculoId, ...(f.ordenes || []).map((x) => x.vehiculoId)];
        for (const vid of vids) {
          if (vid && !folioYFacturaIdPorVehiculo.has(String(vid))) {
            folioYFacturaIdPorVehiculo.set(String(vid), { facturaId: String(f._id), folio: folioCfdi });
          }
        }
      }
    }

    for (const { o, p, esRemision, fechaEvento } of candidatosCancelados) {
      let facturaIdResuelta = p.facturaId ? String(p.facturaId) : null;
      let folioCfdi = facturaIdResuelta ? folioPorFacturaId.get(facturaIdResuelta) : null;
      if (!folioCfdi) {
        const legado = folioYFacturaIdPorVehiculo.get(String(o._id));
        if (legado) {
          facturaIdResuelta = legado.facturaId;
          folioCfdi = legado.folio;
        }
      }
      // Sin factura resuelta = se canceló por error de captura (ver
      // cajas.js): no es una cancelación por facturación, no pertenece aquí.
      if (!folioCfdi) continue;

      cruceAnticipoPorOrdenFactura.set(`${facturaIdResuelta}_${String(o._id)}`, {
        tipo: esRemision ? 'REMISION' : 'ANTICIPO',
        monto: p.monto,
      });

      // Esta banda solo lista anticipos cancelados: una remisión cancelada
      // no es un anticipo (nunca sumó a totalAnticipo en la sección de
      // Anticipos vigentes), solo sirve arriba para el cruce con Facturas.
      if (esRemision) continue;

      anticiposCancelados.push({
        folio: 'ANT',
        ordenServicio: o.ordenServicio || '',
        cliente: `SE CANCELÓ ANTICIPO Y PASA A FACTURA ${folioCfdi}`,
        fecha: fechaEvento,
        anticipo: -p.monto,
        notas: notaConMetodo(p.notas, p.comprobante === 'RECIBO_PROVISIONAL' ? p.reciboProvisional : p.notaVenta),
      });
      totalAnticipo -= p.monto;
    }
  }

  // ---- 3: Complementos de pago ----
  const complementosPagoDocs = await FacturaCfdi.find({
    tipoFactura: 'complementoPago',
    fecha: { $gte: d, $lte: h },
  })
    .select('serie folio fecha cliente pago relacionadas orden ordenes')
    .lean();

  const complementosPago = complementosPagoDocs.map((f) => {
    const rel = f.relacionadas?.[0];
    const monto = f.pago?.monto || 0;
    totalCredito += monto;
    sumarDeposito(SAT_FORMA_PAGO_A_DEPOSITO[f.pago?.formaPago], monto);
    const formaPagoLabel = SAT_FORMA_PAGO_LABEL[f.pago?.formaPago] || '';
    const notaFactura = rel
      ? `COMPLEMENTO DE PAGO FACTURA ${rel.serie || ''}${rel.folio || ''}`
      : 'COMPLEMENTO DE PAGO';
    return {
      folio: `${f.serie || ''}${f.folio || ''}`,
      ordenServicio: f.orden?.ordenServicio || (f.ordenes || []).map((x) => x.ordenServicio).join(', '),
      cliente: f.cliente?.nombre || '',
      fecha: f.fecha,
      ingresoCredito: monto,
      notas: formaPagoLabel ? `${notaFactura} - ${formaPagoLabel}` : notaFactura,
    };
  });

  // ---- 4: Notas de crédito ----
  const notasCreditoDocs = await FacturaCfdi.find({
    tipoFactura: 'notaCredito',
    fecha: { $gte: d, $lte: h },
  })
    .select('serie folio fecha cliente totales relacionadas orden ordenes')
    .lean();

  const notasCredito = notasCreditoDocs.map((f) => {
    const rel = f.relacionadas?.[0];
    const total = f.totales?.total || 0;
    totalVentaDia -= total;
    totalPorCobrar -= total;
    return {
      folio: `${f.serie || ''}${f.folio || ''}`,
      ordenServicio: f.orden?.ordenServicio || (f.ordenes || []).map((x) => x.ordenServicio).join(', '),
      cliente: rel
        ? `NOTA DE CREDITO APLICADA A FACTURA ${rel.serie || ''}${rel.folio || ''}`
        : 'NOTA DE CREDITO',
      fecha: f.fecha,
      ventaDia: -total,
      cuentasPorCobrar: -total,
      notas: f.cliente?.nombre || '',
    };
  });

  // ---- 5: Facturas del día (la banda 7, Factura global, se arma más abajo) ----
  const facturaDocs = await FacturaCfdi.find({
    tipoFactura: 'factura',
    estatus: 'generada',
    fecha: { $gte: d, $lte: h },
  })
    .select('serie folio fecha cliente totales cfdi orden ordenes')
    .lean();

  const facturas = [];
  // Bandas 5 y 7: facturas normales del día (agrupen una o varias órdenes) y,
  // al final, las facturas globales al público en general (banda propia).
  const facturaGlobal = [];

  // Cada factura (agrupe una o varias órdenes) se cruza con los pagos
  // NOTA_VENTA (Liquida) de esas órdenes: alimenta la tabla Depósito con la
  // forma en que realmente entró el dinero, y si agrupa varias órdenes,
  // además arma el desglose que va en Notas.
  const vehiculoIdsFacturas = [];
  const facturasConOrdenes = [];

  // Solo los anticipos cancelados quedan listados arriba en "Anticipos
  // cancelados" (las remisiones canceladas no), así que solo ellos pueden
  // decir "ANTES MENCIONADO"; una remisión cancelada se explica sola.
  function notaCanceladoPrevio(facturaIdStr, ordenes) {
    const tipos = new Set();
    for (const o of ordenes) {
      if (!o.vehiculoId) continue;
      const cruce = cruceAnticipoPorOrdenFactura.get(`${facturaIdStr}_${String(o.vehiculoId)}`);
      if (cruce) tipos.add(cruce.tipo);
    }
    if (!tipos.size) return '';
    if (tipos.has('ANTICIPO')) return 'CON ANTICIPO CANCELADO ANTES MENCIONADO';
    return 'CON REMISIÓN CANCELADA';
  }

  for (const f of facturaDocs) {
    const ordenes = f.ordenes?.length ? f.ordenes : f.orden?.vehiculoId ? [f.orden] : [];
    const total = f.totales?.total || 0;
    const esPue = (f.cfdi?.metodoPago || 'PUE') !== 'PPD';

    totalVentaDia += total;
    if (esPue) totalContado += total;
    else totalPorCobrar += total;

    const facturaIdStr = String(f._id);

    const fila = {
      folio: `${f.serie || ''}${f.folio || ''}`,
      ordenServicio: ordenes.map((o) => o.ordenServicio).filter(Boolean).join(', '),
      cliente: f.cliente?.nombre || '',
      fecha: f.fecha,
      ventaDia: total,
      ingresoContado: esPue ? total : undefined,
      cuentasPorCobrar: esPue ? undefined : total,
      notas: notaCanceladoPrevio(facturaIdStr, ordenes),
    };

    // Facturas normales, agrupen una o varias órdenes, van todas a la banda
    // "Facturas". La última banda se reserva para la factura global real.
    facturas.push(fila);
    facturasConOrdenes.push({
      fila,
      ordenes,
      facturaIdStr,
      cfdiFormaPago: f.cfdi?.formaPago,
      esPue,
      total,
      metodos: new Set(),
    });
    for (const o of ordenes) if (o.vehiculoId) vehiculoIdsFacturas.push(String(o.vehiculoId));
  }

  // Pagos NOTA_VENTA (Liquida, vigentes) de cada orden facturada: alimentan
  // la tabla Depósito con la forma real de cobro; cuando la factura agrupa
  // varias órdenes, además arman el desglose en Notas con el mismo estilo
  // del reporte en papel: "(folio $monto CON banco)--(folio $monto CON banco)".
  // Si esa orden además tuvo un anticipo/remisión cancelado y enlazado a esta
  // misma factura, se combina en una sola parte con el monto total de la
  // orden, igual que en el reporte de referencia.
  if (vehiculoIdsFacturas.length) {
    const vehiculosNotaVenta = await Vehiculo.find({ _id: { $in: vehiculoIdsFacturas } })
      .select('pagos')
      .lean();
    const pagosPorVehiculo = new Map(vehiculosNotaVenta.map((v) => [String(v._id), v.pagos || []]));

    for (const entry of facturasConOrdenes) {
      const { fila, ordenes, facturaIdStr, metodos } = entry;
      const partes = [];
      for (const o of ordenes) {
        const vehiculoIdStr = String(o.vehiculoId);
        const pagos = pagosPorVehiculo.get(vehiculoIdStr) || [];
        const cruce = cruceAnticipoPorOrdenFactura.get(`${facturaIdStr}_${vehiculoIdStr}`);

        for (const p of pagos) {
          if (p.comprobante !== 'NOTA_VENTA' || p.tipoPago !== 'COMPLETO' || p.cancelado) continue;
          sumarDepositoNotaVenta(sumarDeposito, p);
          const abrevNota = abreviaturaFormaPago(p.notaVenta);
          if (abrevNota) metodos.add(abrevNota);
          if (ordenes.length <= 1) continue;

          const folioNota = p.notaVenta?.numero != null ? `P${p.notaVenta.numero}` : 'S/N';
          const montoNotaVenta = p.monto || 0;
          // Texto para el desglose "PUBLICO GENERAL": la terminal/método, o
          // 'COMBINADO' cuando el pago se repartió entre varios métodos.
          const formaNotaTexto =
            p.notaVenta?.formaPago === 'COMBINADO' ? 'COMBINADO' : p.notaVenta?.banco || 'S/D';
          if (cruce) {
            const totalOrden = montoNotaVenta + cruce.monto;
            const textoCruce =
              cruce.tipo === 'ANTICIPO' ? 'CON ANTICIPO CANCELADO ANTES MENCIONADO' : 'CON REMISIÓN CANCELADA';
            partes.push(
              `(${folioNota} $${totalOrden.toFixed(2)}, $${cruce.monto.toFixed(2)} ${textoCruce} Y $${montoNotaVenta.toFixed(2)} CON ${formaNotaTexto})`
            );
          } else {
            partes.push(`(${folioNota} $${montoNotaVenta.toFixed(2)} CON ${formaNotaTexto})`);
          }
        }
      }
      if (partes.length) fila.notas = `PUBLICO GENERAL. = ${partes.join('--')}`;
    }
  }

  // Por cada factura, dos cosas a partir del cruce con pagos de Cajas:
  //   - Notas: la(s) forma(s) de los pagos NOTA_VENTA cruzados (terminal
  //     abreviada, p. ej. "BR-C"); si no hubo pago cruzado, la forma SAT del CFDI.
  //   - Depósito: si la factura es de contado (PUE) y NO tuvo pago de Cajas que
  //     ya alimentó la tabla, se aporta su total al bucket según cfdi.formaPago
  //     (una factura fiscal normal se cobra en el mismo acto, sin Nota de Venta).
  for (const { fila, cfdiFormaPago, esPue, total, metodos } of facturasConOrdenes) {
    if (!/PUBLICO GENERAL/.test(fila.notas || '')) {
      const abrev = metodos.size
        ? [...metodos].join(', ')
        : SAT_FORMA_PAGO_ABREV[cfdiFormaPago] || '';
      if (abrev) fila.notas = fila.notas ? `${fila.notas} - ${abrev}` : abrev;
    }
    if (esPue && metodos.size === 0) {
      sumarDeposito(SAT_FORMA_PAGO_A_DEPOSITO[cfdiFormaPago], total);
    }
  }

  // ---- 7: Factura global (CFDI al público en general) ----
  // Última banda del reporte. En la columna Cliente lleva el desglose de sus
  // notas de venta: "PUBLICO GENERAL.=(P<folio> $<monto> CON <método>)", y si
  // agrupó varias notas, separadas por "--".
  const facturasGlobalDocs = await FacturaCfdi.find({
    tipoFactura: 'facturaGlobal',
    estatus: 'generada',
    fecha: { $gte: d, $lte: h },
  })
    .select('serie folio fecha totales notasVenta cfdi')
    .lean();

  if (facturasGlobalDocs.length) {
    // Cruce con Cajas: el método de pago de cada nota de venta agrupada vive en
    // el pago NOTA_VENTA cuyo facturaGlobalId apunta a este CFDI.
    const globalIds = facturasGlobalDocs.map((f) => f._id);
    const vehiculosNotasGlobal = await Vehiculo.find({
      'pagos.facturaGlobalId': { $in: globalIds },
    })
      .select('pagos')
      .lean();
    const metodoPorNotaGlobal = new Map(); // `${facturaGlobalId}_${notaVentaNumero}` -> abreviatura
    for (const v of vehiculosNotasGlobal) {
      for (const p of v.pagos || []) {
        if (!p.facturaGlobalId || p.comprobante !== 'NOTA_VENTA') continue;
        const num = p.notaVenta?.numero;
        if (num == null) continue;
        metodoPorNotaGlobal.set(`${String(p.facturaGlobalId)}_${num}`, abreviaturaFormaPago(p.notaVenta));
      }
    }

    const fmtMonto = (n) =>
      Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    for (const f of facturasGlobalDocs) {
      const total = f.totales?.total || 0;
      const esPue = (f.cfdi?.metodoPago || 'PUE') !== 'PPD';
      totalVentaDia += total;
      if (esPue) totalContado += total;
      else totalPorCobrar += total;

      const partes = (f.notasVenta || []).map((n) => {
        const metodo = metodoPorNotaGlobal.get(`${String(f._id)}_${n.numero}`);
        const folio = n.numero != null ? `P${n.numero}` : 'S/N';
        return metodo
          ? `(${folio} $${fmtMonto(n.monto)} CON ${metodo})`
          : `(${folio} $${fmtMonto(n.monto)})`;
      });

      facturaGlobal.push({
        folio: `${f.serie || ''}${f.folio || ''}`,
        ordenServicio: (f.notasVenta || []).map((n) => n.ordenServicio).filter(Boolean).join(', '),
        cliente: `PUBLICO GENERAL.=${partes.join('--')}`,
        fecha: f.fecha,
        ventaDia: total,
        ingresoContado: esPue ? total : undefined,
        cuentasPorCobrar: esPue ? undefined : total,
        notas: '',
      });
    }
  }

  anticipos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  anticiposCancelados.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  complementosPago.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  notasCredito.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  facturas.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  facturaGlobal.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  const totalIngreso = totalContado + totalCredito + totalAnticipo;
  const totalDeposito = deposito.efectivo + deposito.cheques + deposito.transferencias + deposito.tarjetasCD;

  return {
    anticipos,
    anticiposCancelados,
    complementosPago,
    notasCredito,
    facturas,
    facturaGlobal,
    totales: { totalVentaDia, totalContado, totalCredito, totalAnticipo, totalPorCobrar, totalIngreso },
    deposito: { ...deposito, total: totalDeposito },
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

async function buildResumenDiarioFacturas({ desde, hasta }) {
  const dias = enumerarDiasLocal(new Date(desde), new Date(hasta));

  const porDia = await Promise.all(
    dias.map(async (dia) => {
      const rep = await buildReporteFacturasDiario({
        desde: dia.desde.toISOString(),
        hasta: dia.hasta.toISOString(),
      });
      const totalMovimientos =
        rep.anticipos.length +
        rep.anticiposCancelados.length +
        rep.complementosPago.length +
        rep.notasCredito.length +
        rep.facturas.length +
        rep.facturaGlobal.length;
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

// GET /api/reportes/cajas-ingresos-dias?desde=...&hasta=...&tipo=REMISION|NOTA_VENTA
router.get('/cajas-ingresos-dias', async (req, res) => {
  try {
    const { desde, hasta, tipo } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ ok: false, msg: 'Parámetros desde y hasta requeridos' });
    }
    if (tipo !== 'REMISION' && tipo !== 'NOTA_VENTA') {
      return res.status(400).json({ ok: false, msg: 'Tipo inválido: usa REMISION o NOTA_VENTA' });
    }

    const dias =
      tipo === 'REMISION'
        ? await buildResumenDiarioRemisiones({ desde, hasta })
        : await buildResumenDiarioFacturas({ desde, hasta });
    return res.json({ ok: true, dias });
  } catch (err) {
    console.error('Error resumen diario cajas-ingresos:', err);
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

    const resultado = await buildReporteFacturasDiario({ desde, hasta });
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

    const resultado = await buildReporteFacturasDiario({ desde, hasta });
    await streamReporteFacturasDiarioPdf(res, resultado, desde, hasta);
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
// Agrupa por técnico (mecánico) las órdenes en el período, pudiendo
// filtrarse por estado: cerradas, abiertas o todas. Un renglón por
// asignación de mano de obra; "total" es la suma de los montos de servicio
// de ESE técnico dentro de ESA misma orden (se repite si la orden tiene más
// de una asignación para el mismo técnico).
//
// "Horas a pagar" (horasAPagar) depende del estado de la orden: en las
// ABIERTAS son solo las horas asignadas al técnico que además se le
// anticiparon; en las CERRADAS son las horas − anticipadas (esas anticipadas
// ya se pagaron mientras la orden estaba abierta). "Horas T" es siempre el
// total de horas de la asignación.
//
// El período se aplica sobre fecha de recepción para las abiertas (una orden
// abierta no tiene fecha de cierre) y sobre fecha de cierre para las
// cerradas: así "Hoy + Cerradas" muestra lo que se cerró hoy, aunque la
// orden se haya recibido otro día. "Todas" combina ambos criterios.
function tieneRemision(o) {
  return (o.pagos || []).some((p) => p.comprobante === 'REMISION' && !p.cancelado);
}

async function buildReporteHorasTecnico({ desde, hasta, estado }) {
  const d = new Date(desde);
  const h = new Date(hasta);
  const filtroAbiertas = { estadoOrden: { $nin: ESTADOS_CERRADOS }, fechaRecepcion: { $gte: d, $lte: h } };
  const filtroCerradas = { estadoOrden: 'CERRADA', fechaCierre: { $gte: d, $lte: h } };

  let query;
  if (estado === 'cerradas') query = filtroCerradas;
  else if (estado === 'abiertas') query = filtroAbiertas;
  else query = { $or: [filtroAbiertas, filtroCerradas] }; // 'todas' (o sin valor)

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
      const horas = Number(m.horas || 0);
      const horasAnticipadas = Math.min(horas, Number(m.horasAnticipadas || 0));
      const horasPendientes = Math.max(0, horas - horasAnticipadas);
      // "Horas a pagar" según el estado de la orden: en una orden ABIERTA al
      // técnico se le paga justo lo que se le anticipó (horas asignadas y
      // anticipadas); en una CERRADA esas horas anticipadas ya se pagaron, así
      // que solo quedan por pagar las pendientes (horas − anticipadas).
      const horasAPagar = cerrada ? horasPendientes : horasAnticipadas;

      if (!grupos[nombreMec]) {
        grupos[nombreMec] = {
          mecanico: nombreMec,
          items: [],
          totalServicio: 0,
          totalIva: 0,
          totalHoras: 0,
          totalHorasAnticipadas: 0,
          totalHorasPendientes: 0,
          totalHorasAPagar: 0,
        };
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
        horas,
        horasAnticipadas,
        horasPendientes,
        horasAPagar,
      });
      grupos[nombreMec].totalServicio += montoServicio;
      grupos[nombreMec].totalIva += iva;
      grupos[nombreMec].totalHoras += horas;
      grupos[nombreMec].totalHorasAnticipadas += horasAnticipadas;
      grupos[nombreMec].totalHorasPendientes += horasPendientes;
      grupos[nombreMec].totalHorasAPagar += horasAPagar;
    }
  }

  const data = Object.values(grupos).sort((a, b) => a.mecanico.localeCompare(b.mecanico));
  const totalGeneralServicio = data.reduce((s, g) => s + g.totalServicio, 0);
  const totalGeneralIva = data.reduce((s, g) => s + g.totalIva, 0);
  const totalGeneralHoras = data.reduce((s, g) => s + g.totalHoras, 0);
  const totalGeneralHorasAnticipadas = data.reduce((s, g) => s + g.totalHorasAnticipadas, 0);
  const totalGeneralHorasPendientes = data.reduce((s, g) => s + g.totalHorasPendientes, 0);
  const totalGeneralHorasAPagar = data.reduce((s, g) => s + g.totalHorasAPagar, 0);

  return {
    data,
    totalGeneralServicio,
    totalGeneralIva,
    totalGeneralHoras,
    totalGeneralHorasAnticipadas,
    totalGeneralHorasPendientes,
    totalGeneralHorasAPagar,
  };
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

// ===== Reporte de Pendientes de Factura =====
// Órdenes marcadas "Pendiente de Factura" desde Cajas (al cliente le
// faltaron datos fiscales) que todavía no se facturan; se limpian solas en
// cuanto se genera la factura real (ver generar_xml.js).
async function buildReportePendientesFactura({ desde, hasta }) {
  const d = new Date(desde);
  const h = new Date(hasta);

  const ordenes = await Vehiculo.find({
    pendienteFactura: true,
    pendienteFacturaEn: { $gte: d, $lte: h },
  })
    .sort({ pendienteFacturaEn: 1 })
    .populate('cliente', POPULATE_CLIENTE)
    .lean();

  const data = ordenes.map((o) => ({
    ordenServicio: o.ordenServicio || '',
    cliente: nombreCliente(o.cliente),
    marca: o.marca || '',
    modelo: o.modelo || '',
    serie: o.serie || '',
    fechaCierre: o.fechaCierre || null,
    pendienteFacturaEn: o.pendienteFacturaEn || null,
    pendienteFacturaPor: o.pendienteFacturaPor || '',
    total: calcularTotalesOrden(o).totalOrden,
  }));

  return { data, total: data.length };
}

// GET /api/reportes/pendientes-factura?desde=...&hasta=...
router.get('/pendientes-factura', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ ok: false, msg: 'Parámetros desde y hasta requeridos' });
    }

    const resultado = await buildReportePendientesFactura({ desde, hasta });
    return res.json({ ok: true, ...resultado });
  } catch (err) {
    console.error('Error reporte pendientes de factura:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/reportes/pendientes-factura-pdf?desde=...&hasta=...
router.get('/pendientes-factura-pdf', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ ok: false, msg: 'Parámetros desde y hasta requeridos' });
    }

    const resultado = await buildReportePendientesFactura({ desde, hasta });
    await streamReportePendientesFacturaPdf(res, resultado, desde, hasta);
  } catch (err) {
    console.error('Error PDF reporte pendientes de factura:', err);
    if (!res.headersSent) res.status(500).json({ ok: false, msg: 'Error generando PDF' });
  }
});

// ===== Reporte de Clientes con Anticipos =====
// A diferencia de los demás reportes de este archivo, no es un rango de
// fechas: es una fotografía del saldo a favor ACTUAL de cada cliente (un
// balance, no un movimiento), así que no filtra por período.
async function buildReporteClientesAnticipos() {
  const clientes = await Cliente.find({ saldoAFavor: { $gt: 0 } })
    .sort({ saldoAFavor: -1 })
    .select('nombre apellidoPaterno apellidoMaterno tipoCliente empresa gobierno telefonos celulares saldoAFavor updatedAt')
    .lean();

  const data = clientes.map((c) => ({
    cliente: nombreCliente(c),
    telefono: (c.celulares?.[0] || c.telefonos?.[0]) ? [
      (c.celulares?.[0] || c.telefonos?.[0]).lada,
      (c.celulares?.[0] || c.telefonos?.[0]).numero,
    ].filter(Boolean).join(' ') : '',
    saldoAFavor: c.saldoAFavor || 0,
    ultimoMovimiento: c.updatedAt || null,
  }));

  const totalSaldo = data.reduce((s, it) => s + it.saldoAFavor, 0);

  return { data, total: data.length, totalSaldo };
}

// GET /api/reportes/clientes-anticipos
router.get('/clientes-anticipos', async (req, res) => {
  try {
    const resultado = await buildReporteClientesAnticipos();
    return res.json({ ok: true, ...resultado });
  } catch (err) {
    console.error('Error reporte de clientes con anticipos:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/reportes/clientes-anticipos-pdf
router.get('/clientes-anticipos-pdf', async (req, res) => {
  try {
    const resultado = await buildReporteClientesAnticipos();
    await streamReporteClientesAnticiposPdf(res, resultado);
  } catch (err) {
    console.error('Error PDF reporte de clientes con anticipos:', err);
    if (!res.headersSent) res.status(500).json({ ok: false, msg: 'Error generando PDF' });
  }
});

module.exports = router;
