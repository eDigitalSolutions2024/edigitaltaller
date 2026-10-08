const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Vehiculo = require('../models/Vehiculo');
const Empleado = require('../models/Empleado');
const User = require('../models/User');
const FacturaCfdi = require('../models/FacturaCfdi');
const Cliente = require('../models/Cliente');
const ReporteCajasSnapshot = require('../models/ReporteCajasSnapshot');
const { proteger, requiereRol } = require('../middleware/auth');
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
const { esAbonoSobreRemisionCredito } = require('../utils/anticiposAlFacturar');
const { abreviaturaFormaPago, joinMetodos } = require('../utils/abreviaturaFormaPago');
const { TERMINALES_TARJETA } = require('../utils/bancos');
const { dayjsFecha } = require('../utils/fechas');
const { filtroReporte } = require('../utils/lineaNegocio');

// Adjunta a una nota la abreviatura del método de pago usado ("... BR-C"), a
// partir del sub-objeto pago.notaVenta o pago.reciboProvisional. Solo texto,
// sin símbolos "+" ni "-" como separadores.
function notaConMetodo(notas, formaPagoDesc) {
  const abrev = abreviaturaFormaPago(formaPagoDesc);
  if (!abrev) return notas || '';
  return notas ? `${notas} ${abrev}` : abrev;
}

// Notas de un pago cancelado para los reportes. El motivo de una cancelación
// (ERROR / REEMPLAZADO) es solo interno: cancelaciones viejas lo guardaron
// pisando `notas`, así que en esos casos se usan las notas originales
// (notasAntesCancelar). El resto de las cancelaciones nunca pisó `notas`.
function notasDePagoCancelado(p) {
  const pisadas = ['ERROR', 'REEMPLAZADO'].includes(p.motivoCancelacionTipo);
  return (pisadas ? p.notasAntesCancelar : p.notas) || '';
}

// Desglosa el monto de un pago COMBINADO por cada método presente, con la
// misma abreviatura de terminal/transferencia que abreviaturaFormaPago usa
// para un método simple: "$5,000.00 EFECTIVO Y $4,180.00 BR-C". Se usa en el
// desglose de PUBLICO GENERAL (Factura Global) para que una Nota de Venta
// pagada con varios métodos no se vea solo como su total con la lista de
// métodos, sin decir cuánto fue con cada uno. Los dólares en efectivo entran
// ya convertidos a pesos (`dolaresPesos`, con el tipo de cambio del pago) y se
// SUMAN al Efectivo (no llevan renglón propio), para que las partes sumen el
// monto de la nota; su cantidad en USD y el folio del Recibo de Dólares van
// aparte, en Notas.
function desgloseMontosCombinado(combinado, fmtMonto, dolaresPesos = 0) {
  const c = combinado || {};
  const n = (v) => Number(v) || 0;
  // Cada tarjeta con su propia terminal ("$1,000.00 BR-C"): con más de una
  // terminal el `banco` legacy del combinado queda vacío (no hay una
  // representativa) y saldría solo "TC"/"TD". Sin desglose por tarjeta (pagos
  // viejos) se usa el total con ese `banco`.
  const tarjetas = (lista, formaPago, total) => {
    const filas = Array.isArray(lista) ? lista.filter((t) => n(t.monto) > 0) : [];
    if (filas.length) {
      return filas.map((t) => `$${fmtMonto(t.monto)} ${abreviaturaFormaPago({ formaPago, banco: t.terminal })}`);
    }
    return [`$${fmtMonto(total)} ${abreviaturaFormaPago({ formaPago, banco: c.banco })}`];
  };
  const partes = [];
  const efectivoTotal = n(c.efectivo) + n(dolaresPesos);
  if (efectivoTotal > 0) partes.push(`$${fmtMonto(efectivoTotal)} EFECTIVO`);
  if (n(c.credito) > 0) partes.push(...tarjetas(c.tarjetasCredito, 'CREDITO', c.credito));
  if (n(c.debito) > 0) partes.push(...tarjetas(c.tarjetasDebito, 'DEBITO', c.debito));
  if (n(c.cheque) > 0) partes.push(`$${fmtMonto(c.cheque)} CHEQUE`);
  if (n(c.transferencia) > 0) {
    partes.push(
      `$${fmtMonto(c.transferencia)} ${abreviaturaFormaPago({
        formaPago: 'TRANSFERENCIA',
        tipoTransferencia: c.transferenciaTipo,
        bancoTransferencia: c.transferenciaBanco,
      })}`
    );
  }
  return joinMetodos(partes);
}

// Notas de la banda "Anticipos" del Reporte de Facturas: solo cómo se cobró el
// anticipo y el folio del recibo, p. ej. "BR-C REC#1234". No se incluye la
// descripción libre del pago (no repetir "Anticipo").
function notaAnticipoFactura(p) {
  const desc = p.comprobante === 'RECIBO_PROVISIONAL' ? p.reciboProvisional : p.notaVenta;
  const abrev = abreviaturaFormaPago(desc);
  const numRecibo = desc?.numero;
  return [abrev, numRecibo != null ? `REC#${numRecibo}` : ''].filter(Boolean).join(' ');
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

// NOTA: los reportes incluyen todas las líneas de negocio (Servicompacto y
// Chirey) por igual; ya no se filtra por lineaNegocio.

// GET /api/reportes/originales?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get('/originales', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ ok: false, msg: 'Parámetros desde y hasta requeridos' });
    }

    const dateFilter = buildDateFilter(desde, hasta);
    const ordenes = await Vehiculo.find({ estadoOrden: 'CERRADA', ...dateFilter, ...filtroReporte(req.query.lineaNegocio) })
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
    const ordenes = await Vehiculo.find({ estadoOrden: 'CERRADA', ...dateFilter, ...filtroReporte(req.query.lineaNegocio) })
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
    const ordenes = await Vehiculo.find({ estadoOrden: 'CERRADA', ...dateFilter, ...filtroReporte(req.query.lineaNegocio) })
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
    const ordenes = await Vehiculo.find({ estadoOrden: 'CERRADA', ...dateFilter, ...filtroReporte(req.query.lineaNegocio) })
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
    const ordenes = await Vehiculo.find({ estadoOrden: { $nin: ESTADOS_CERRADOS }, ...dateFilter, ...filtroReporte(req.query.lineaNegocio) })
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
    const query = { estadoOrden: { $nin: ESTADOS_CERRADOS }, ...dateFilter, ...filtroReporte(req.query.lineaNegocio) };
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

async function buildReporteGarantias({ desde, hasta, asesor, lineaNegocio }) {
  const query = {
    'garantia.estado': 'APROBADA',
    // Solo se reportan garantías cuya orden nueva ya está cerrada
    estadoOrden: 'CERRADA',
    ...filtroReporte(lineaNegocio),
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

    const resultado = await buildReporteGarantias({ desde, hasta, asesor, lineaNegocio: req.query.lineaNegocio });
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

    const resultado = await buildReporteGarantias({ desde, hasta, asesor, lineaNegocio: req.query.lineaNegocio });
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

// diaKey (YYYY-MM-DD) si el rango es UN solo día que ya terminó — el único caso
// que se congela —; null si abarca varios días o toca hoy (siempre en vivo).
function diaKeyCongelable(desde, hasta) {
  const diaKey = dayjsFecha(new Date(desde)).format('YYYY-MM-DD');
  if (diaKey !== dayjsFecha(new Date(hasta)).format('YYYY-MM-DD')) return null;
  const hoyKey = dayjsFecha(new Date()).format('YYYY-MM-DD');
  return diaKey < hoyKey ? diaKey : null;
}

// ===== Reporte Diario de Remisiones (formato clásico de 9 columnas) =====
// Sirve un Reporte Diario de Ingresos (Remisiones o Facturas) congelado para
// cualquier día que ya haya terminado: se calcula (con `builder`) la primera
// vez que se pide y de ahí se guarda; las siguientes consultas de ese mismo
// día devuelven el mismo resultado siempre, aunque después pase algo
// relacionado (p. ej. se cancele una remisión de ese día hasta el día
// siguiente) — ese evento posterior corrige el reporte de SU PROPIO día, no
// reabre uno que ya cerró. Un rango de más de un día, o cualquier rango que
// toque el día de hoy (todavía en curso), siempre se calcula en vivo: nunca
// se cachea "hoy" a medias.
//
// Si algo llega tarde y pertenece a un día ya congelado (p. ej. una Factura
// Global de ese día que se timbró días después), un admin puede regenerar ese
// día a mano con su motivo: POST /cajas-ingresos/regenerar (más abajo).
async function reporteDiaConCache(tipo, desde, hasta, builder) {
  const d = new Date(desde);
  const h = new Date(hasta);
  const diaKey = diaKeyCongelable(desde, hasta);
  if (!diaKey) return builder({ desde, hasta });

  const existente = await ReporteCajasSnapshot.findOne({ tipo, diaKey }).lean();
  if (existente) return existente.data;

  const data = await builder({ desde, hasta });
  try {
    await ReporteCajasSnapshot.findOneAndUpdate(
      { tipo, diaKey },
      { tipo, diaKey, desde: d, hasta: h, data, generadoEn: new Date() },
      { upsert: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    // Carrera con otra petición guardando el mismo día (índice único): ya
    // quedó guardado por la otra, no hay nada que corregir aquí. No debe
    // tumbar la respuesta de este request.
    console.error('No se pudo guardar el snapshot del reporte de caja:', err);
  }
  return data;
}

// Lo que hay que REVERTIR cuando una Remisión se cancela para pasar a factura:
// exactamente lo que esa remisión aportó al reporte el día que se creó (misma
// cuenta que la rama "vigente" de buildReporteRemisionesDiarioImpl) — venta,
// ingreso de contado y, lo que no se cobró en ese momento, cuentas por cobrar.
// Sin revertir el contado, un cobro ya contado el día de la remisión volvería a
// contarse el día que se factura (la factura lo trae otra vez como ingreso de
// contado). Una Remisión a Crédito se guarda con monto 0 (o con solo lo
// cobrado): la venta a revertir es el total de la orden. Un anticipo o abono
// cancelado nunca aportó "ingreso de contado", así que no lo revierte.
function reversaRemisionCancelada(orden, pago) {
  const esCredito = pago.remisionTipoAntesCancelar === 'Credito';
  const venta = esCredito ? calcularTotalesOrden(orden).totalOrden : pago.monto || 0;
  const esVenta = pago.tipoPago !== 'ANTICIPO' && pago.tipoPago !== 'ABONO';
  const contado = esVenta ? pago.monto || 0 : 0;
  return { venta, contado, porCobrar: Math.max(0, venta - contado) };
}

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
async function buildReporteRemisionesDiarioImpl({ desde, hasta }) {
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

    // Una Remisión no captura forma de pago (se concilia aparte); si la orden
    // se terminó de saldar directo en Cajas con la opción "Liquidar" (sin
    // pasar por Factura), esa captura sí trae forma de pago — se usa para
    // anotar en Notas cómo se cobró, sobre todo para las Remisiones a
    // Crédito que nunca se facturaron. "Liquidar" siempre cubre el saldo
    // completo en una sola captura, así que basta la primera no cancelada.
    const pagoLiquidacionOrden = (o.pagos || []).find(
      (pg) => pg.comprobante === 'SIN_COMPROBANTE' && !pg.cancelado && !pg.facturaId
    );
    const notaMetodoLiquidacion = pagoLiquidacionOrden ? abreviaturaFormaPago(pagoLiquidacionOrden.liquidacion) : '';

    // Cancelada DESPUÉS de este rango = para este reporte es como si siguiera
    // vigente: ese día ya cerró (ver reporteDiaConCache) tal como se vio
    // entonces, no se corrige retroactivamente cuando algo pasa un día
    // posterior (la cancelación se documenta en el reporte de SU PROPIO día,
    // más abajo).
    const tieneVentaEnRango = pagosRemision.some((p) => {
      if (p.tipoPago !== 'COMPLETO') return false;
      if (p.remision?.tipo === 'Cancelada' && (!p.canceladoEn || new Date(p.canceladoEn) <= h)) return false;
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
        // Cancelada (aunque sea después de este día): sin el motivo interno.
        notas: p.remision?.tipo === 'Cancelada' ? notasDePagoCancelado(p) : p.notas || '',
      };

      // Cancelada DESPUÉS de este rango (ver tieneVentaEnRango arriba): para
      // el reporte de este día se trata como si siguiera vigente.
      const canceladaParaEsteDia =
        p.remision?.tipo === 'Cancelada' && (!p.canceladoEn || new Date(p.canceladoEn) <= h);

      if (canceladaParaEsteDia) {
        // Se revierte lo que se reportó el día que se creó (mismo cálculo que la
        // rama "vigente" de abajo): ver reversaRemisionCancelada.
        const reversa = reversaRemisionCancelada(o, p);
        // Si se canceló el MISMO día en que se creó (p. ej. se facturó de
        // inmediato), el neto de ese día es cero: no debe aparecer ningún
        // importe (columnas vacías), ni afectar los totales. Si se canceló un
        // día POSTERIOR, el reporte de este día (el de la creación) ya cerró
        // contando ese importe, así que debe corregirse aquí en negativo.
        const canceladaMismoDia =
          !!p.canceladoEn &&
          dayjsFecha(p.fecha).format('YYYY-MM-DD') === dayjsFecha(p.canceladoEn).format('YYYY-MM-DD');
        if (!canceladaMismoDia) {
          totalVentaDia -= reversa.venta;
          totalContado -= reversa.contado;
          totalPorCobrar -= reversa.porCobrar;
        }
        // La leyenda de la fila ya dice que se canceló (y, más abajo, a qué
        // factura): no repetir "se cancela..."/"pasa a..." como texto suelto
        // en Notas, aunque así lo haya escrito el cajero como motivo.
        const notasCancel = /se cancela|pasa a/i.test(base.notas) ? '' : base.notas;
        const filaCancel = tieneVentaEnRango || canceladaMismoDia
          ? { ...base, cliente: 'SE CANCELA REMISIÓN Y PASA A FACTURA', notas: notasCancel }
          : {
              ...base,
              cliente: 'SE CANCELA REMISIÓN Y PASA A FACTURA',
              notas: notasCancel,
              ventaDia: -reversa.venta,
              ingresoContado: reversa.contado ? -reversa.contado : undefined,
              cuentasPorCobrar: reversa.porCobrar ? -reversa.porCobrar : undefined,
            };
        // Creada y cancelada el MISMO día: va con las remisiones del día, sin
        // ningún importe (neto cero). Si se creó en un día anterior del rango
        // y se canceló después, va a "Canceladas" con el importe en negativo.
        (tieneVentaEnRango || canceladaMismoDia ? nuevaVenta : canceladas).push(filaCancel);
        // Si esta remisión se canceló porque la orden ya tenía otro
        // comprobante (REEMPLAZADO, ver pasaAPagoId / POST /cajas/:id/pagos),
        // ese comprobante puede ser una Nota de Venta que después se agrupó
        // en una Factura Global: se resuelve más abajo, junto con el cruce
        // directo por factura normal.
        const pagoDestino =
          p.motivoCancelacionTipo === 'REEMPLAZADO' && p.pasaAPagoId
            ? (o.pagos || []).find((pg) => String(pg._id) === String(p.pasaAPagoId))
            : null;
        filasCancel.push({
          fila: filaCancel,
          vehiculoId: String(o._id),
          facturaGlobalId: pagoDestino?.facturaGlobalId || null,
        });
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
        // orden y lo no cobrado queda como cuenta por cobrar. Si ya se
        // canceló pero para este día se trata como vigente (arriba), el tipo
        // real es 'Cancelada': se usa el que tenía antes de cancelarse.
        const tipoEfectivo =
          p.remision?.tipo === 'Cancelada' ? p.remisionTipoAntesCancelar || 'Contado' : p.remision?.tipo;
        const esCredito = tipoEfectivo === 'Credito';
        const ventaDia = esCredito ? calcularTotalesOrden(o).totalOrden : p.monto;
        const porCobrar = Math.max(0, ventaDia - p.monto);
        // Si al liquidar entró parte en dólares en efectivo, la nota lo dice
        // junto con el folio del Recibo de Dólares que se generó (ver POST
        // /cajas/:id/pagos), además de lo que ya haya escrito el cajero
        // (p. ej. "Liquida Efectivo").
        const notaDolares =
          Number(p.montoDolares) > 0
            ? `Y DLLS${p.reciboDolares?.numero != null ? ` REC.DLS#${p.reciboDolares.numero}` : ''}`
            : '';
        nuevaVenta.push({
          ...base,
          notas: [base.notas, notaDolares, notaMetodoLiquidacion].filter(Boolean).join(' '),
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

  // ---- Remisiones a Crédito liquidadas directo en Cajas (sin pasar por
  // Factura) ----
  // "Liquidar" (comprobante SIN_COMPROBANTE) cubre, por diseño, el saldo
  // COMPLETO de la orden (ver la validación en routes/cajas.js). Para una
  // Remisión a Crédito (monto 0 al crearse, ver el bucle de arriba: todo su
  // total cae en Cuentas por Cobrar el día que se creó) ese dinero real se
  // cobra un día que puede ser distinto, y sin esto nunca se contaba como
  // Ingreso en NINGÚN reporte (ni el día de la Remisión, que solo anotaba el
  // método en Notas — ver pagoLiquidacionOrden arriba —, ni el día real del
  // cobro, que ni se consultaba). Se suma como Ingreso de CRÉDITO (no de
  // Contado: la venta fue a crédito, esto es la cobranza) en el día real del
  // pago — Cuentas por Cobrar NO se toca (pedido explícito del usuario): esa
  // columna documenta lo que quedó pendiente el día de la venta, no se
  // corrige retroactivamente cuando se cobra; mismo criterio que ya usa la
  // banda "abonos" de aquí abajo para un Abono con Recibo Provisional sobre
  // una Remisión a Crédito.
  const ordenesLiquidadasSinFactura = await Vehiculo.find({
    pagos: {
      $elemMatch: {
        comprobante: 'SIN_COMPROBANTE',
        cancelado: { $ne: true },
        facturaId: null,
        fecha: { $gte: d, $lte: h },
      },
    },
  })
    .populate('cliente', POPULATE_CLIENTE)
    .lean();

  for (const o of ordenesLiquidadasSinFactura) {
    // Solo si lo que se liquidó fue, en efecto, una Remisión a Crédito aún
    // vigente de esta orden (nunca más de una activa a la vez): un "Liquidar"
    // sin ninguna Remisión detrás no es parte de este reporte.
    const remisionCredito = (o.pagos || []).find(
      (p) => p.comprobante === 'REMISION' && !p.cancelado && p.remision?.tipo === 'Credito'
    );
    if (!remisionCredito) continue;

    for (const p of o.pagos || []) {
      if (p.comprobante !== 'SIN_COMPROBANTE' || p.cancelado || p.facturaId) continue;
      const f = new Date(p.fecha);
      if (f < d || f > h) continue;

      // Nota fija "LIQUIDA" (pedido del usuario) — sin forma de pago ni
      // desglose de dólares: esos ya están en el pago mismo (Historial de
      // Pagos de la orden), aquí solo se marca qué fue este movimiento.
      abonos.push({
        folio: remisionCredito.remision?.numero ?? null,
        ordenServicio: o.ordenServicio || '',
        cliente: nombreCliente(o.cliente),
        fecha: p.fecha,
        notas: 'LIQUIDA',
        ingresoCredito: p.monto || undefined,
      });
      totalCredito += p.monto;
    }
  }

  // Remisiones canceladas EN ESTE RANGO pero creadas otro día (fuera de él):
  // el reporte de su propio día de creación ya no las corrige (arriba se
  // tratan como si siguieran vigentes, canceladaParaEsteDia), así que la
  // reversa se documenta aquí, en el día en que de verdad se canceló (p. ej.
  // el día que se generó la factura), en "Canceladas y pasan a factura" con
  // el importe en negativo y descontándolo de los totales de este día. La
  // venta original ya quedó contada, para siempre, en el reporte congelado
  // del día en que se creó.
  const ordenesConCancelacionEnRango = await Vehiculo.find({
    pagos: {
      $elemMatch: {
        comprobante: 'REMISION',
        'remision.tipo': 'Cancelada',
        canceladoEn: { $gte: d, $lte: h },
      },
    },
  })
    .populate('cliente', POPULATE_CLIENTE)
    .lean();

  for (const o of ordenesConCancelacionEnRango) {
    for (const p of o.pagos || []) {
      if (p.comprobante !== 'REMISION' || p.remision?.tipo !== 'Cancelada' || !p.canceladoEn) continue;
      const ce = new Date(p.canceladoEn);
      if (ce < d || ce > h) continue;
      const fCreacion = new Date(p.fecha);
      if (fCreacion >= d && fCreacion <= h) continue; // ya se documentó arriba (creada en este mismo rango)

      const notasOriginales = notasDePagoCancelado(p);
      const notasCancel = /se cancela|pasa a/i.test(notasOriginales) ? '' : notasOriginales;
      // Igual que la reversa de la rama de arriba (ver reversaRemisionCancelada).
      const reversa = reversaRemisionCancelada(o, p);
      totalVentaDia -= reversa.venta;
      totalContado -= reversa.contado;
      totalPorCobrar -= reversa.porCobrar;
      const filaCancel = {
        folio: p.remision?.numero ?? null,
        ordenServicio: o.ordenServicio || '',
        cliente: 'SE CANCELA REMISIÓN Y PASA A FACTURA',
        fecha: p.canceladoEn,
        notas: notasCancel,
        ventaDia: -reversa.venta,
        ingresoContado: reversa.contado ? -reversa.contado : undefined,
        cuentasPorCobrar: reversa.porCobrar ? -reversa.porCobrar : undefined,
      };
      canceladas.push(filaCancel);
      const pagoDestino =
        p.motivoCancelacionTipo === 'REEMPLAZADO' && p.pasaAPagoId
          ? (o.pagos || []).find((pg) => String(pg._id) === String(p.pasaAPagoId))
          : null;
      filasCancel.push({
        fila: filaCancel,
        vehiculoId: String(o._id),
        facturaGlobalId: pagoDestino?.facturaGlobalId || null,
      });
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
  // (serie+folio) del CFDI vigente de esa orden, igual que el reporte
  // original. Cubre dos casos: la orden se facturó directo (cruce por
  // vehiculoId) o la remisión se reemplazó por una Nota de Venta que después
  // se agrupó en una Factura Global (cruce por facturaGlobalId, resuelto
  // arriba vía pasaAPagoId).
  if (filasCancel.length) {
    const ids = [...new Set(filasCancel.map((f) => f.vehiculoId))];
    const facturaGlobalIds = [
      ...new Set(filasCancel.map((f) => f.facturaGlobalId).filter(Boolean).map(String)),
    ];

    const [facturas, facturasGlobales] = await Promise.all([
      FacturaCfdi.find({
        tipoFactura: 'factura',
        estatus: 'generada',
        $or: [{ 'orden.vehiculoId': { $in: ids } }, { 'ordenes.vehiculoId': { $in: ids } }],
      })
        .select('serie folio fecha orden ordenes')
        .sort({ fecha: 1 })
        .lean(),
      facturaGlobalIds.length
        ? FacturaCfdi.find({ _id: { $in: facturaGlobalIds }, estatus: 'generada' })
            .select('serie folio')
            .lean()
        : [],
    ]);

    // fecha ascendente: si la orden se refacturó, prevalece el CFDI más reciente
    const folioPorVehiculo = new Map();
    for (const f of facturas) {
      const folioCfdi = `${f.serie || ''}${f.folio || ''}`;
      if (!folioCfdi) continue;
      const vids = [f.orden?.vehiculoId, ...(f.ordenes || []).map((x) => x.vehiculoId)];
      for (const vid of vids) if (vid) folioPorVehiculo.set(String(vid), folioCfdi);
    }
    const folioPorFacturaGlobalId = new Map();
    for (const f of facturasGlobales) {
      folioPorFacturaGlobalId.set(String(f._id), `${f.serie || ''}${f.folio || ''}`);
    }
    for (const { fila, vehiculoId, facturaGlobalId } of filasCancel) {
      const folioCfdi =
        folioPorVehiculo.get(vehiculoId) ||
        (facturaGlobalId ? folioPorFacturaGlobalId.get(String(facturaGlobalId)) : null);
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
  // Remisiones por número (menor a mayor); sin folio o empate, por fecha.
  nuevaVenta.sort((a, b) => {
    const fa = Number(a.folio);
    const fb = Number(b.folio);
    const va = Number.isFinite(fa) && a.folio != null && a.folio !== '';
    const vb = Number.isFinite(fb) && b.folio != null && b.folio !== '';
    if (va && vb && fa !== fb) return fa - fb;
    if (va !== vb) return va ? -1 : 1;
    return new Date(a.fecha) - new Date(b.fecha);
  });
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

function buildReporteRemisionesDiario({ desde, hasta }) {
  return reporteDiaConCache('REMISION', desde, hasta, buildReporteRemisionesDiarioImpl);
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
const BANCOS_TARJETA_CD = TERMINALES_TARJETA;
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
  // "Por definir": la factura se generó a crédito, sin capturar cómo pagó el
  // cliente en Cajas (ver "Facturar a crédito" en Nueva Factura).
  '99': 'CREDITO',
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

// Cuánto de un pago NOTA_VENTA entró por transferencia (0 si nada). Se usa en
// el Reporte de Facturas para NO contar ese monto como Ingreso de Contado:
// a diferencia de efectivo/tarjeta, una transferencia no se confirma en el
// acto, así que se reporta en Cuentas por Cobrar hasta que se concilie.
function montoTransferenciaNotaVenta(pago) {
  const nv = pago.notaVenta || {};
  if (nv.formaPago === 'COMBINADO' && nv.combinado) {
    return Number(nv.combinado.transferencia) || 0;
  }
  const bucket = formaPagoProvisionalADeposito(nv.formaPago) || bancoADeposito(nv.banco);
  return bucket === 'transferencias' ? Number(pago.monto) || 0 : 0;
}

function sumarDepositoReciboProvisional(sumarDeposito, pago) {
  const rp = pago.reciboProvisional || {};
  if (rp.formaPago === 'COMBINADO' && rp.combinado) {
    sumarDepositoCombinado(sumarDeposito, rp.combinado, pago.tipoCambio);
    return;
  }
  sumarDeposito(formaPagoProvisionalADeposito(rp.formaPago), pago.monto);
}

// Pago "Liquidar (sin comprobante)": misma forma que reciboProvisional
// (formaPago + combinado), solo que en `pago.liquidacion`. Se usa cuando una
// orden se facturó directo, sin Nota de Venta/Remisión previa (ver
// crearPagosSinComprobante en backend/routes/generar_xml.js).
function sumarDepositoLiquidacion(sumarDeposito, pago) {
  const l = pago.liquidacion || {};
  if (l.formaPago === 'COMBINADO' && l.combinado) {
    sumarDepositoCombinado(sumarDeposito, l.combinado, pago.tipoCambio);
    return;
  }
  sumarDeposito(formaPagoProvisionalADeposito(l.formaPago), pago.monto);
}

async function buildReporteFacturasDiarioImpl({ desde, hasta }) {
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
        notas: notaAnticipoFactura(p),
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
        notas: notaAnticipoFactura(p),
      });
      totalAnticipo += p.monto;
      sumarDepositoReciboProvisional(sumarDeposito, p);
    }
  }

  // ---- 1c: Abonos capturados sobre una Remisión a Crédito ----
  // La orden ya tiene un comprobante (la Remisión, a crédito, con monto 0), así
  // que el cajero paga lo adelantado con "Abonar" en vez de "Anticipo" (esa
  // opción es para antes de cualquier comprobante). Es dinero real cobrado
  // antes de facturar: se reporta igual que un anticipo (ver
  // esAbonoSobreRemisionCredito en utils/anticiposAlFacturar.js, que también
  // decide su cancelación al facturar).
  const ordenesAbonoRemisionCredito = await Vehiculo.find({
    pagos: {
      $elemMatch: {
        comprobante: 'RECIBO_PROVISIONAL',
        tipoPago: 'ABONO',
        cancelado: { $ne: true },
        fecha: { $gte: d, $lte: h },
      },
    },
  })
    .populate('cliente', POPULATE_CLIENTE)
    .lean();

  for (const o of ordenesAbonoRemisionCredito) {
    for (const p of o.pagos || []) {
      if (!esAbonoSobreRemisionCredito(p, o.pagos) || p.cancelado) continue;
      const f = new Date(p.fecha);
      if (f < d || f > h) continue;

      anticipos.push({
        folio: 'ANT',
        ordenServicio: o.ordenServicio || '',
        cliente: nombreCliente(o.cliente),
        fecha: p.fecha,
        anticipo: p.monto,
        notas: notaAnticipoFactura(p),
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
      // igual aquí. Un Recibo Provisional de un ABONO cuenta también, pero
      // solo si es de los que se tratan como anticipo: uno capturado sobre
      // una Remisión a Crédito (ver esAbonoSobreRemisionCredito, sección 1c
      // arriba) — cualquier otro Abono sigue sin pertenecer a esta banda.
      const esAnticipo =
        ((p.comprobante === 'NOTA_VENTA' || p.comprobante === 'RECIBO_PROVISIONAL') && p.tipoPago === 'ANTICIPO') ||
        esAbonoSobreRemisionCredito(p, o.pagos);
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
  // el desglose de PUBLICO GENERAL). La remisión cancelada NO se lista en
  // este reporte (ni banda propia ni nota): esa historia vive solo en el
  // Reporte de Remisiones ("SE CANCELA REMISIÓN Y PASA A FACTURA ..."), este
  // cruce solo sirve para no repetirla aquí como texto suelto.
  const cruceAnticipoPorOrdenFactura = new Map(); // `${facturaId}_${vehiculoId}` -> { tipo, monto }

  if (candidatosCancelados.length) {
    // Enlace real (pago.facturaId), disponible para todo lo cancelado desde
    // que se generó la factura (ver generar_xml.js).
    const idsDirectos = [
      ...new Set(candidatosCancelados.filter((c) => c.p.facturaId).map((c) => String(c.p.facturaId))),
    ];
    const facturasDirectas = idsDirectos.length
      ? await FacturaCfdi.find({ _id: { $in: idsDirectos } }).select('serie folio tipoFactura').lean()
      : [];
    const folioPorFacturaId = new Map(
      facturasDirectas.map((f) => [String(f._id), `${f.serie || ''}${f.folio || ''}`])
    );
    // Tipo de cada factura resuelta — solo para distinguir, abajo, el caso
    // Factura Global (ver el `continue` tras "Esta banda solo lista...").
    const tipoFacturaPorFacturaId = new Map(facturasDirectas.map((f) => [String(f._id), f.tipoFactura]));

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

      // Forma de pago abreviada del anticipo/remisión ORIGINAL (ej. "EFECTIVO", "BR-C") —
      // se guarda en el cruce para que la factura que lo canceló pueda mencionarla junto
      // al monto en su propia nota ("CON ANTICIPO CANCELADO ANTES MENCIONADO (EFECTIVO
      // $4,300.00)"), no solo la cantidad.
      const formaPagoDesc = p.comprobante === 'RECIBO_PROVISIONAL' ? p.reciboProvisional : p.notaVenta;
      const tipoPagoTxt = abreviaturaFormaPago(formaPagoDesc);

      cruceAnticipoPorOrdenFactura.set(`${facturaIdResuelta}_${String(o._id)}`, {
        tipo: esRemision ? 'REMISION' : 'ANTICIPO',
        monto: p.monto,
        formaPago: tipoPagoTxt,
      });

      // Esta banda solo lista anticipos cancelados: una remisión cancelada no
      // es un anticipo (nunca sumó a totalAnticipo), y su cancelación ya
      // queda documentada en el Reporte de Remisiones, no aquí.
      if (esRemision) continue;

      // Un anticipo ligado a una Nota de Venta (notaVentaLigadaId) que pasó a
      // una Factura GLOBAL se revierte en la banda "Factura global" (sección
      // 7 más abajo), anclado al día de ESA nota — no aquí, anclado a
      // canceladoEn/fechaEvento: una Global puede timbrarse días después de
      // la nota (ver el comentario de la sección 7), así que casi nunca cae
      // en el mismo día que la nota, y la reversa de aquí nunca coincidiría
      // con la mención "CON ANTICIPO CANCELADO ANTES MENCIONADO" de esa misma
      // Global. Una Factura directa sí cancela el mismo día que factura (no
      // hace falta distinguir el caso: tipoFacturaPorFacturaId solo da
      // 'facturaGlobal' cuando de verdad lo es).
      if (p.notaVentaLigadaId && tipoFacturaPorFacturaId.get(facturaIdResuelta) === 'facturaGlobal') continue;

      // Notas del anticipo cancelado: forma de pago + fecha en que se hizo el anticipo (p. ej.
      // "EFECTIVO 17/09/2026"). Sin nombre del cliente — ya está la orden en otra columna. La
      // fecha es la del anticipo original (p.fecha), no la de esta cancelación (fechaEvento).
      const fechaAnticipoTxt = dayjsFecha(p.fecha).format('DD/MM/YYYY');
      anticiposCancelados.push({
        folio: 'ANT',
        ordenServicio: o.ordenServicio || '',
        cliente: `SE CANCELÓ ANTICIPO Y PASA A FACTURA ${folioCfdi}`,
        fecha: fechaEvento,
        anticipo: -p.monto,
        notas: [tipoPagoTxt, fechaAnticipoTxt].filter(Boolean).join(' ').toUpperCase(),
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
    // Folio en dos líneas: el del Complemento (CP…) arriba y el de la factura
    // a la que abona debajo. El renderer parte por el salto de línea.
    const folioCp = `${f.serie || ''}${f.folio || ''}`;
    const folioFactura = rel ? `${rel.serie || ''}${rel.folio || ''}` : '';
    return {
      folio: folioFactura ? `${folioCp}\n${folioFactura}` : folioCp,
      ordenServicio: f.orden?.ordenServicio || (f.ordenes || []).map((x) => x.ordenServicio).join('\n'),
      cliente: f.cliente?.nombre || '',
      fecha: f.fecha,
      ingresoCredito: monto,
      // Notas: solo la forma de pago del complemento.
      notas: formaPagoLabel,
    };
  });

  // ---- 4: Notas de crédito ----
  const notasCreditoDocs = await FacturaCfdi.find({
    tipoFactura: 'notaCredito',
    fecha: { $gte: d, $lte: h },
  })
    .select('serie folio fecha cliente totales relacionadas orden ordenes notasLiberadas')
    .lean();

  // Nota de crédito CONTRA UNA FACTURA GLOBAL (libera notas de venta para facturarlas a su cliente,
  // ver utils/notaCreditoGlobal.js): reversa hoy lo que esas notas sumaron en la Global el día de
  // la nota, con el MISMO reparto (contado / transferencia -> por cobrar, o todo por cobrar si la
  // Global fue PPD). La factura nominativa que se emita después suma lo mismo y no vuelve a
  // sumar Depósito, así el día queda neto cero. Las demás NC siguen restando por cobrar.
  const globalesDeNc = [
    ...new Set(
      notasCreditoDocs
        .filter((f) => (f.notasLiberadas || []).length)
        .map((f) => String(f.relacionadas?.[0]?.facturaId || ''))
        .filter(Boolean)
    ),
  ];
  const metodoPagoPorGlobal = new Map(
    (globalesDeNc.length
      ? await FacturaCfdi.find({ _id: { $in: globalesDeNc } }).select('cfdi.metodoPago').lean()
      : []
    ).map((g) => [String(g._id), g.cfdi?.metodoPago || 'PUE'])
  );
  const vehiculoIdsNcGlobal = [
    ...new Set(
      notasCreditoDocs.flatMap((f) => (f.notasLiberadas || []).map((n) => String(n.vehiculoId)))
    ),
  ];
  const pagoNcPorId = new Map();
  if (vehiculoIdsNcGlobal.length) {
    const vehiculosNc = await Vehiculo.find({ _id: { $in: vehiculoIdsNcGlobal } }).select('pagos').lean();
    for (const v of vehiculosNc) for (const p of v.pagos || []) pagoNcPorId.set(String(p._id), p);
  }

  const notasCredito = notasCreditoDocs.map((f) => {
    const rel = f.relacionadas?.[0];
    const total = f.totales?.total || 0;
    const liberadas = f.notasLiberadas || [];
    const fila = {
      folio: `${f.serie || ''}${f.folio || ''}`,
      // Una NC contra Global lista todas las órdenes de las notas que libera (una por línea).
      ordenServicio: (f.ordenes || []).length
        ? f.ordenes.map((x) => x.ordenServicio).filter(Boolean).join('\n')
        : f.orden?.ordenServicio || '',
      cliente: rel
        ? `NOTA DE CREDITO APLICADA A FACTURA ${rel.serie || ''}${rel.folio || ''}`
        : 'NOTA DE CREDITO',
      fecha: f.fecha,
      ventaDia: -total,
      cuentasPorCobrar: -total,
      notas: f.cliente?.nombre || '',
    };

    totalVentaDia -= total;
    if (!liberadas.length) {
      totalPorCobrar -= total;
      return fila;
    }

    const esPueGlobal = (metodoPagoPorGlobal.get(String(rel?.facturaId)) || 'PUE') !== 'PPD';
    const montoTransf = esPueGlobal
      ? Math.min(
          total,
          liberadas.reduce((s, n) => {
            const pago = pagoNcPorId.get(String(n.pagoId));
            return s + (pago ? montoTransferenciaNotaVenta(pago) : 0);
          }, 0)
        )
      : 0;
    const contado = esPueGlobal ? total - montoTransf : 0;
    const porCobrar = esPueGlobal ? montoTransf : total;
    totalContado -= contado;
    totalPorCobrar -= porCobrar;
    fila.ingresoContado = contado > 0 ? -contado : undefined;
    fila.cuentasPorCobrar = porCobrar > 0 ? -porCobrar : undefined;
    fila.notas = `NOTAS DE VENTA ${liberadas.map((n) => `P${n.numero}`).join(', ')}`;
    return fila;
  });

  // ---- 5: Facturas del día (la banda 7, Factura global, se arma más abajo) ----
  // Una factura cancelada DESPUÉS de este día sigue contando en su propio día (era vigente
  // al cierre); su cancelación se resta el día en que se registra (banda "Facturas
  // canceladas", más abajo). Una cancelada el mismo día en que se emitió no cuenta en ninguno.
  const facturaDocs = await FacturaCfdi.find({
    tipoFactura: 'factura',
    fecha: { $gte: d, $lte: h },
    $or: [{ estatus: 'generada' }, { estatus: 'cancelada', 'cancelacion.fecha': { $gt: h } }],
  })
    .select('serie folio fecha cliente totales cfdi orden ordenes sustituye cancelacion')
    .lean();

  // Refacturación: una factura que sustituye a otra de un día ANTERIOR hereda un cobro que
  // ya entró (y se contó en el Depósito) ese día: no se vuelve a sumar al Depósito hoy.
  const idsSustituidas = [
    ...new Set(facturaDocs.flatMap((f) => (f.sustituye || []).map((x) => String(x.facturaId)))),
  ].filter((x) => x && x !== 'null');
  const fechaPorFacturaSustituida = new Map(
    (idsSustituidas.length
      ? await FacturaCfdi.find({ _id: { $in: idsSustituidas } }).select('fecha').lean()
      : []
    ).map((x) => [String(x._id), x.fecha])
  );

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
  function notaCanceladoPrevio(idsFactura, ordenes) {
    // Un anticipo por orden (lo normal); si la factura agrupa varias órdenes, cada una
    // aporta el suyo — se listan todos, con su propia forma de pago y monto.
    const anticipos = [];
    for (const o of ordenes) {
      if (!o.vehiculoId) continue;
      for (const idF of idsFactura) {
        const cruce = cruceAnticipoPorOrdenFactura.get(`${idF}_${String(o.vehiculoId)}`);
        if (cruce?.tipo === 'ANTICIPO' && cruce.monto > 0.01) anticipos.push(cruce);
      }
    }
    if (anticipos.length) {
      const totalAnticipo = anticipos.reduce((s, a) => s + (a.monto || 0), 0);
      const totalTxt = totalAnticipo.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const detalle = joinMetodos(
        anticipos.map((a) => {
          const montoTxt = (a.monto || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          return a.formaPago ? `${a.formaPago} $${montoTxt}` : `$${montoTxt}`;
        })
      );
      return `CON ANTICIPO CANCELADO ANTES MENCIONADO (${detalle})${anticipos.length > 1 ? ` — TOTAL $${totalTxt}` : ''}`;
    }
    // Una remisión cancelada NO se menciona en este reporte (esa historia
    // vive solo en el Reporte de Remisiones): las Notas de esta fila quedan
    // libres para mostrar solo el método de pago real (ver más abajo).
    return '';
  }

  for (const f of facturaDocs) {
    const ordenes = f.ordenes?.length ? f.ordenes : f.orden?.vehiculoId ? [f.orden] : [];
    const total = f.totales?.total || 0;
    const esPue = (f.cfdi?.metodoPago || 'PUE') !== 'PPD';

    totalVentaDia += total;
    if (esPue) totalContado += total;
    else totalPorCobrar += total;

    const facturaIdStr = String(f._id);
    // Los pagos de Cajas de esta factura pueden apuntar a ella o, si la sustituyó otra
    // (refacturación, ver generar_xml.js), a la que la sustituyó.
    const idsCruce = new Set([facturaIdStr]);
    if (f.cancelacion?.sustituidaPorId) idsCruce.add(String(f.cancelacion.sustituidaPorId));
    if (f.cancelacion?.cobroHeredadoPorId) idsCruce.add(String(f.cancelacion.cobroHeredadoPorId));
    const sinDeposito = (f.sustituye || []).some((x) => {
      const fecha1 = fechaPorFacturaSustituida.get(String(x.facturaId));
      return fecha1 && new Date(fecha1) < d;
    });

    const fila = {
      folio: `${f.serie || ''}${f.folio || ''}`,
      ordenServicio: ordenes.map((o) => o.ordenServicio).filter(Boolean).join('\n'),
      cliente: f.cliente?.nombre || '',
      fecha: f.fecha,
      ventaDia: total,
      ingresoContado: esPue ? total : undefined,
      cuentasPorCobrar: esPue ? undefined : total,
      notas: notaCanceladoPrevio([...idsCruce], ordenes),
    };

    // Facturas normales, agrupen una o varias órdenes, van todas a la banda
    // "Facturas". La última banda se reserva para la factura global real.
    facturas.push(fila);
    facturasConOrdenes.push({
      fila,
      ordenes,
      facturaIdStr,
      idsCruce,
      sinDeposito,
      signo: 1,
      cfdiFormaPago: f.cfdi?.formaPago,
      esPue,
      total,
      metodos: new Set(),
      montoTransferencia: 0,
    });
    for (const o of ordenes) if (o.vehiculoId) vehiculoIdsFacturas.push(String(o.vehiculoId));
  }

  // ---- 5b: Facturas canceladas (registradas hoy, emitidas un día anterior) ----
  // Resta hoy lo que la factura sumó el día que se emitió (ese día ya cerró): Venta del día
  // y Contado/Por cobrar en negativo, con el mismo reparto (transferencia -> por cobrar) que
  // tuvo. No toca el Depósito: el dinero no sale de caja por cancelar la factura. Si la
  // sustituye otra, esa suma hoy o después con su propio día y el neto queda en cero.
  const facturasCanceladas = [];
  const facturaCanceladaDocs = await FacturaCfdi.find({
    tipoFactura: 'factura',
    estatus: 'cancelada',
    'cancelacion.fecha': { $gte: d, $lte: h },
    fecha: { $lt: d },
  })
    .select('serie folio fecha cliente totales cfdi orden ordenes cancelacion')
    .sort({ 'cancelacion.fecha': 1 })
    .lean();

  for (const f of facturaCanceladaDocs) {
    const ordenes = f.ordenes?.length ? f.ordenes : f.orden?.vehiculoId ? [f.orden] : [];
    const total = f.totales?.total || 0;
    const esPue = (f.cfdi?.metodoPago || 'PUE') !== 'PPD';

    totalVentaDia -= total;
    if (esPue) totalContado -= total;
    else totalPorCobrar -= total;

    const facturaIdStr = String(f._id);
    const idsCruce = new Set([facturaIdStr]);
    if (f.cancelacion?.sustituidaPorId) idsCruce.add(String(f.cancelacion.sustituidaPorId));
    if (f.cancelacion?.cobroHeredadoPorId) idsCruce.add(String(f.cancelacion.cobroHeredadoPorId));

    const fila = {
      folio: `${f.serie || ''}${f.folio || ''}`,
      ordenServicio: ordenes.map((o) => o.ordenServicio).filter(Boolean).join('\n'),
      cliente: f.cliente?.nombre || '',
      fecha: f.cancelacion?.fecha || f.fecha,
      ventaDia: -total,
      ingresoContado: esPue ? -total : undefined,
      cuentasPorCobrar: esPue ? undefined : -total,
      notas: '',
    };
    facturasCanceladas.push(fila);
    facturasConOrdenes.push({
      fila,
      ordenes,
      facturaIdStr,
      idsCruce,
      sinDeposito: true,
      signo: -1,
      textoNotas: `CANCELADA${
        f.cancelacion?.sustituidaPorFolio ? ` · SUSTITUIDA POR ${f.cancelacion.sustituidaPorFolio}` : ''
      }`,
      cfdiFormaPago: f.cfdi?.formaPago,
      esPue,
      total,
      metodos: new Set(),
      montoTransferencia: 0,
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
      const { fila, ordenes, idsCruce, metodos } = entry;
      // Una factura cancelada, o una que hereda un cobro de un día anterior, no vuelve a
      // sumar al Depósito: el dinero ya entró (y se contó) el día original.
      const depositar = entry.sinDeposito ? () => {} : sumarDeposito;
      const partes = [];
      for (const o of ordenes) {
        const vehiculoIdStr = String(o.vehiculoId);
        const pagos = pagosPorVehiculo.get(vehiculoIdStr) || [];
        const cruce = [...idsCruce]
          .map((idF) => cruceAnticipoPorOrdenFactura.get(`${idF}_${vehiculoIdStr}`))
          .find(Boolean);

        for (const p of pagos) {
          // Pago "Liquidar" creado al facturar esta orden directo, sin Nota de
          // Venta/Remisión previa (ver crearPagosSinComprobante en
          // generar_xml.js). Se liga por facturaId (no solo por vehiculoId):
          // un mismo vehículo puede tener más de una factura en fechas
          // distintas, cada una con su propio Liquidar.
          if (p.comprobante === 'SIN_COMPROBANTE' && !p.cancelado && idsCruce.has(String(p.facturaId || ''))) {
            sumarDepositoLiquidacion(depositar, p);
            const abrevLiq = abreviaturaFormaPago(p.liquidacion);
            if (abrevLiq) metodos.add(abrevLiq);
            continue;
          }

          if (p.comprobante !== 'NOTA_VENTA' || p.tipoPago !== 'COMPLETO' || p.cancelado) continue;
          // Una nota liberada de la Global (nota de crédito) ya sumó su Depósito el día de la
          // nota, en la banda Factura global: la factura nominativa no lo repite.
          sumarDepositoNotaVenta(p.facturaGlobalLiberada?.notaCreditoId ? () => {} : depositar, p);
          entry.montoTransferencia += montoTransferenciaNotaVenta(p);
          const abrevNota = abreviaturaFormaPago(p.notaVenta);
          if (abrevNota) metodos.add(abrevNota);
          if (ordenes.length <= 1) continue;

          const folioNota = p.notaVenta?.numero != null ? `P${p.notaVenta.numero}` : 'S/N';
          const montoNotaVenta = p.monto || 0;
          // Texto para el desglose "PUBLICO GENERAL": método de pago con la
          // terminal abreviada (BANREGIO -> BR-C / BR-D), o la combinación.
          const formaNotaTexto = abreviaturaFormaPago(p.notaVenta) || 'S/D';
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
  //   - Notas: el método de pago y la terminal abreviada de los pagos
  //     NOTA_VENTA cruzados (p. ej. "BR-C"); si no hubo pago cruzado, la forma
  //     SAT del CFDI. Solo texto, sin símbolos "+" ni "-" como separadores.
  //   - Depósito: si la factura es de contado (PUE) y NO tuvo pago de Cajas que
  //     ya alimentó la tabla, se aporta su total al bucket según cfdi.formaPago
  //     (una factura fiscal normal se cobra en el mismo acto, sin Nota de Venta).
  for (const entry of facturasConOrdenes) {
    const { fila, cfdiFormaPago, esPue, total, metodos, montoTransferencia } = entry;
    const signo = entry.signo || 1;
    if (!/PUBLICO GENERAL/.test(fila.notas || '')) {
      const abrev = metodos.size
        ? [...metodos].join(' ')
        : SAT_FORMA_PAGO_ABREV[cfdiFormaPago] || '';
      if (abrev) fila.notas = fila.notas ? `${fila.notas} ${abrev}` : abrev;
    }
    if (entry.textoNotas) fila.notas = entry.textoNotas;
    if (esPue && metodos.size === 0 && !entry.sinDeposito) {
      sumarDeposito(SAT_FORMA_PAGO_A_DEPOSITO[cfdiFormaPago], total);
    }

    // Una factura de contado (PUE) cobrada por transferencia no cuenta como
    // Ingreso de Contado: el dinero no se confirma en el acto como efectivo o
    // tarjeta, así que ese monto pasa a Cuentas por Cobrar hasta conciliarse
    // (igual que una factura a crédito). Si no hubo pago de Cajas cruzado, se
    // usa la forma de pago del propio CFDI.
    if (esPue) {
      const montoTransf = metodos.size
        ? montoTransferencia
        : SAT_FORMA_PAGO_A_DEPOSITO[cfdiFormaPago] === 'transferencias'
          ? total
          : 0;
      if (montoTransf > 0) {
        const restante = total - montoTransf;
        fila.ingresoContado = restante > 0 ? signo * restante : undefined;
        fila.cuentasPorCobrar = signo * montoTransf;
        totalContado -= signo * montoTransf;
        totalPorCobrar += signo * montoTransf;
      }
    }
  }

  // ---- 7: Factura global (CFDI al público en general) ----
  // Última banda del reporte. En la columna Cliente lleva el desglose de sus
  // notas de venta: "PUBLICO GENERAL.=(P<folio> $<monto> CON <método>)", y si
  // agrupó varias notas, separadas por "--".
  //
  // La banda se arma por la fecha REAL de cada Nota de Venta (pago.fecha en
  // Cajas), no por la fecha de timbrado del CFDI: una Factura Global puede
  // generarse cualquier día y agrupar "lo pendiente" de días anteriores (ver
  // /api/facturacion/notas-venta-pendientes), así que timbrarla hoy no
  // significa que el dinero se cobró hoy. generar_xml.js ya NO permite crear
  // una factura global que mezcle notas de más de un día, pero facturas
  // globales viejas (de antes de esa validación) sí pudieron mezclar días:
  // para esas, cada reporte diario muestra solo la porción de notas de ese
  // día (con su propio total), para no duplicar el ingreso en dos reportes.
  const vehiculosNotasGlobalDia = await Vehiculo.find({
    pagos: {
      $elemMatch: {
        comprobante: 'NOTA_VENTA',
        facturaGlobalId: { $ne: null },
        cancelado: { $ne: true },
        fecha: { $gte: d, $lte: h },
      },
    },
  })
    .select('pagos ordenServicio')
    .lean();

  // notasDelDiaPorFacturaGlobal: facturaGlobalId -> Map(notaVentaNumero -> info)
  const notasDelDiaPorFacturaGlobal = new Map();
  for (const v of vehiculosNotasGlobalDia) {
    for (const p of v.pagos || []) {
      if (p.comprobante !== 'NOTA_VENTA' || !p.facturaGlobalId || p.cancelado) continue;
      const fechaPago = new Date(p.fecha);
      if (fechaPago < d || fechaPago > h) continue;
      const num = p.notaVenta?.numero;
      if (num == null) continue;

      // Estas notas de venta (público en general) también son dinero real
      // cobrado en Cajas: igual que en las facturas normales (banda 5),
      // deben alimentar la tabla Depósito con la forma real de cobro
      // (tarjeta, transferencia, etc.), no solo aparecer en el desglose.
      sumarDepositoNotaVenta(sumarDeposito, p);

      const key = String(p.facturaGlobalId);
      if (!notasDelDiaPorFacturaGlobal.has(key)) notasDelDiaPorFacturaGlobal.set(key, new Map());
      notasDelDiaPorFacturaGlobal.get(key).set(num, {
        // _id de este mismo pago (Nota de Venta): así se cruza el anticipo que
        // haya quedado ligado a ÉL (pago.notaVentaLigadaId), ver
        // anticiposPorNotaLigada más abajo.
        pagoId: String(p._id),
        fecha: p.fecha,
        metodo: abreviaturaFormaPago(p.notaVenta),
        // Si la nota se pagó Combinado, se guarda el desglose crudo para
        // poder mostrar cuánto fue con cada método (no solo la lista de
        // métodos): ver desgloseMontosCombinado más abajo.
        combinado: p.notaVenta?.formaPago === 'COMBINADO' ? p.notaVenta.combinado : null,
        montoTransferencia: montoTransferenciaNotaVenta(p),
        // Si parte del pago entró en dólares en efectivo, el desglose de
        // PUBLICO GENERAL debe decirlo junto con el folio del Recibo de
        // Dólares que se generó para esa nota (ver POST /cajas/:id/pagos).
        montoDolares: Number(p.montoDolares) > 0 ? Number(p.montoDolares) : 0,
        tipoCambio: Number(p.tipoCambio) || 0,
        reciboDolaresNumero: p.reciboDolares?.numero ?? null,
      });
    }
  }

  // Anticipos que pasaron a una Factura Global al generarla (ver
  // generar_xml.js / utils/anticiposAlFacturar.js): parte de la misma venta
  // que la Nota de Venta a la que quedaron ligados al registrarse (ver
  // notaVentaLigadaId en models/Vehiculo.js, se pone sola en POST
  // /api/cajas/:id/pagos si la orden ya tenía el anticipo vigente). Se busca
  // por ese link, NO por "cualquier anticipo cancelado de la misma orden": una
  // orden puede tener más de una Nota de Venta y el anticipo es de UNA sola.
  // pago._id de la Nota de Venta -> monto del anticipo ligado a ella.
  const anticiposPorNotaLigada = new Map();
  // Mismo cruce, pero con el pago/orden completos — para poder revertirlo
  // más abajo en la banda "Anticipos cancelados" de ESTE día (el de la Nota
  // de Venta, no el de la cancelación: ver el `continue` de la sección 2
  // arriba). Al ser 1 anticipo por Nota de Venta (comentario de arriba), no
  // hace falta sumar aquí como en el mapa de montos.
  const anticipoDetallePorNotaLigada = new Map();
  for (const v of vehiculosNotasGlobalDia) {
    for (const p of v.pagos || []) {
      if (!p.cancelado || p.tipoPago !== 'ANTICIPO' || p.comprobante !== 'RECIBO_PROVISIONAL') continue;
      if (p.motivoCancelacionTipo !== 'PASA_A_FACTURA' || !p.notaVentaLigadaId) continue;
      const key = String(p.notaVentaLigadaId);
      anticiposPorNotaLigada.set(key, (anticiposPorNotaLigada.get(key) || 0) + (Number(p.monto) || 0));
      anticipoDetallePorNotaLigada.set(key, { monto: Number(p.monto) || 0, pago: p, ordenServicio: v.ordenServicio });
    }
  }

  if (notasDelDiaPorFacturaGlobal.size) {
    const facturasGlobalDocs = await FacturaCfdi.find({
      _id: { $in: [...notasDelDiaPorFacturaGlobal.keys()] },
      tipoFactura: 'facturaGlobal',
      estatus: 'generada',
    })
      .select('serie folio notasVenta cfdi')
      .lean();

    const fmtMonto = (n) =>
      Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    for (const f of facturasGlobalDocs) {
      const infoPorNota = notasDelDiaPorFacturaGlobal.get(String(f._id));
      // Solo las notas de ESTE día: f.notasVenta puede traer más si el CFDI
      // agrupó varios días (dato viejo, de antes de la validación).
      const notasDia = (f.notasVenta || []).filter((n) => infoPorNota?.has(n.numero));
      if (!notasDia.length) continue;

      const folioGlobal = `${f.serie || ''}${f.folio || ''}`;

      // El anticipo que quedó ligado a una de estas notas (notaVentaLigadaId)
      // pasó a esta Global junto con ella. `n.monto` (FacturaCfdi.notasVenta,
      // ver POST /api/facturacion/notas-venta-pendientes) YA lo trae sumado
      // desde que se generó la Global — aquí solo se recupera CUÁNTO de ese
      // monto es anticipo, para el desglose de abajo (texto y "lo cobrado con
      // la nota" = n.monto − anticipo). Una Global vieja, de antes de este
      // cambio, no traía el anticipo sumado en n.monto: para esas, el
      // anticipo simplemente no se desglosa (queda como si no lo tuviera).
      const anticipoPorNota = new Map(); // numero de nota -> monto del anticipo
      for (const n of notasDia) {
        const pagoIdNota = infoPorNota.get(n.numero)?.pagoId;
        const montoAnticipo = pagoIdNota ? anticiposPorNotaLigada.get(pagoIdNota) || 0 : 0;
        if (montoAnticipo > 0) anticipoPorNota.set(n.numero, montoAnticipo);

        // Reversa del anticipo en la banda "Anticipos cancelados" de ESTE
        // mismo día (el de la Nota de Venta): el bloque de arriba (sección 2)
        // deliberadamente lo salta cuando pasa a una Factura Global, porque
        // esa cancelación puede timbrarse días después de la nota — anclar
        // la reversa a canceladoEn haría que nunca coincidiera, en el
        // reporte, con la mención "CON ANTICIPO CANCELADO ANTES MENCIONADO"
        // de esta misma Global (ver más abajo). Sin esto, ese monto cuenta
        // como Ingreso de HOY (dentro del total de la nota) sin nunca
        // revertirse de la columna Anticipo del día en que en verdad se
        // capturó.
        const detalle = anticipoDetallePorNotaLigada.get(pagoIdNota);
        if (detalle) {
          const fechaAnticipoTxt = dayjsFecha(detalle.pago.fecha).format('DD/MM/YYYY');
          const tipoPagoTxt = abreviaturaFormaPago(detalle.pago.reciboProvisional);
          anticiposCancelados.push({
            folio: 'ANT',
            ordenServicio: detalle.ordenServicio || '',
            cliente: `SE CANCELÓ ANTICIPO Y PASA A FACTURA ${folioGlobal}`,
            fecha: infoPorNota.get(n.numero)?.fecha,
            anticipo: -detalle.monto,
            notas: [tipoPagoTxt, fechaAnticipoTxt].filter(Boolean).join(' ').toUpperCase(),
          });
          totalAnticipo -= detalle.monto;
        }
      }

      // "Venta del día" debe cuadrar centavo a centavo con el desglose que se
      // muestra junto a ella (columna Cliente): la suma de lo que cada nota
      // ya trae en su propio monto (nota + su anticipo, si tiene).
      const total = notasDia.reduce((s, n) => s + (Number(n.monto) || 0), 0);
      const esPue = (f.cfdi?.metodoPago || 'PUE') !== 'PPD';
      totalVentaDia += total;

      // Igual que en las facturas normales (banda 5): lo cobrado por
      // transferencia no cuenta como Ingreso de Contado, pasa a Cuentas por
      // Cobrar hasta conciliarse.
      const montoTransf = esPue
        ? notasDia.reduce((s, n) => s + (infoPorNota.get(n.numero)?.montoTransferencia || 0), 0)
        : 0;
      const restante = total - montoTransf;
      const ingresoContado = esPue ? (restante > 0 ? restante : undefined) : undefined;
      const cuentasPorCobrar = esPue ? (montoTransf > 0 ? montoTransf : undefined) : total;

      if (esPue) {
        totalContado += restante;
        totalPorCobrar += montoTransf;
      } else {
        totalPorCobrar += total;
      }

      // Dólares en efectivo de la nota, convertidos a pesos con el tipo de
      // cambio con el que se cobró (0 si no hubo o no se conoce el T.C.).
      const dolaresEnPesos = (info) =>
        info?.montoDolares > 0 && info?.tipoCambio > 0
          ? Math.round(info.montoDolares * info.tipoCambio * 100) / 100
          : 0;

      // Cada línea: primero la orden y el monto COMPLETO de esa nota (lo
      // capturado con ella + su anticipo, si tiene uno ligado), y hasta
      // después el desglose de cómo se pagó — nunca al revés. Solo lleva
      // coma (deja de ser una sola frase) cuando hay algo que enumerar:
      // varios métodos (Combinado) y/o un anticipo. Un pago simple sin
      // anticipo no repite el monto, ya salió en el total.
      //   • Simple, sin anticipo:      "(A-37 $2,592.00 CON EFECTIVO)"
      //   • Combinado, sin anticipo:   "(A-47 $2,592.00, $174.00 EFECTIVO,
      //                                  $1,000.00 BB-C, $500.00 BR-D Y
      //                                  $918.00 SPEI-BN)"
      //   • Simple, con anticipo:      "(A-43 $904.00, $500.00 CON ANTICIPO
      //                                  CANCELADO ANTES MENCIONADO Y
      //                                  $404.00 CON EFECTIVO)"
      const partes = notasDia.map((n) => {
        const info = infoPorNota.get(n.numero);
        // Referencia de cada nota dentro del desglose: el folio de la Nota de Venta (P#), no la
        // orden de servicio — una Factura Global puede agrupar notas de varias órdenes, y este
        // texto es "por nota", no "por orden" (la columna No. Orden ya lista las órdenes).
        const orden = n.numero != null ? String(n.numero) : 'S/N';
        const dolaresPesos = dolaresEnPesos(info);
        // n.monto es el total de esta nota (lo capturado con ella + su
        // anticipo, si tiene uno ligado, ver arriba); lo que de verdad se
        // cobró CON la nota (lo que va después de "CON …") es sin el
        // anticipo.
        const anticipo = anticipoPorNota.get(n.numero) || 0;
        const propioNota = (Number(n.monto) || 0) - anticipo;
        // Combinado: en vez de "$total CON EFECTIVO Y BR-C" (que no dice
        // cuánto fue de cada uno), se desglosa el monto por método. Pago
        // simple con parte en dólares (solo puede ser Efectivo): propioNota
        // ya trae los dólares convertidos, así que sale como un Efectivo por
        // el total; los dólares en sí van en Notas.
        const cobroCombinado = info?.combinado
          ? desgloseMontosCombinado(info.combinado, fmtMonto, dolaresPesos)
          : null;

        let desglose = null;
        if (anticipo) {
          const cobro = cobroCombinado || (info?.metodo ? `$${fmtMonto(propioNota)} CON ${info.metodo}` : `$${fmtMonto(propioNota)}`);
          desglose = `$${fmtMonto(anticipo)} CON ANTICIPO CANCELADO ANTES MENCIONADO Y ${cobro}`;
        } else if (cobroCombinado) {
          desglose = cobroCombinado;
        }

        const totalTxt = `$${fmtMonto(n.monto)}`;
        if (desglose) return `(${orden} ${totalTxt}, ${desglose})`;
        if (info?.metodo) return `(${orden} ${totalTxt} CON ${info.metodo})`;
        return `(${orden} ${totalTxt})`;
      });

      // Notas: el Recibo de Dólares y la cantidad en USD de las notas que
      // incluyeron dólares (con su folio de nota si son varias).
      const conDolares = notasDia.filter((n) => infoPorNota.get(n.numero)?.montoDolares > 0);
      const notasDolares = conDolares
        .map((n) => {
          const info = infoPorNota.get(n.numero);
          const texto = [
            info.reciboDolaresNumero != null ? `REC.DLS#${info.reciboDolaresNumero}` : '',
            `$${fmtMonto(info.montoDolares)} USD`,
          ]
            .filter(Boolean)
            .join(' ');
          return conDolares.length > 1 ? `P${n.numero} ${texto}` : texto;
        })
        .join(', ');

      facturaGlobal.push({
        folio: folioGlobal,
        ordenServicio: notasDia.map((n) => n.ordenServicio).filter(Boolean).join('\n'),
        // Una nota de venta por línea (el renderer parte por el salto de línea).
        cliente: `PUBLICO GENERAL.=${partes.join('\n')}`,
        fecha: notasDia
          .map((n) => infoPorNota.get(n.numero)?.fecha)
          .sort((a, b) => new Date(a) - new Date(b))[0],
        ventaDia: total,
        ingresoContado,
        cuentasPorCobrar,
        notas: notasDolares,
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
    facturasCanceladas,
    facturas,
    facturaGlobal,
    totales: { totalVentaDia, totalContado, totalCredito, totalAnticipo, totalPorCobrar, totalIngreso },
    deposito: { ...deposito, total: totalDeposito },
  };
}

function buildReporteFacturasDiario({ desde, hasta }) {
  return reporteDiaConCache('NOTA_VENTA', desde, hasta, buildReporteFacturasDiarioImpl);
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

// Info del snapshot de un día ya congelado, para que la pantalla sepa si puede
// ofrecer "Regenerar día" y mostrar la última regeneración. null si el rango no
// es un día ya terminado (o todavía no quedó guardado).
async function metaSnapshotDia(tipo, desde, hasta) {
  const diaKey = diaKeyCongelable(desde, hasta);
  if (!diaKey) return null;
  // `dataAntes` (la copia completa de respaldo) se deja FUERA de esta
  // proyección a propósito: puede ser tan pesada como el reporte mismo y
  // aquí solo hace falta la lista ligera para mostrar el historial — el
  // propio endpoint de restaurar relee el documento completo cuando de
  // verdad necesita ese respaldo.
  const snap = await ReporteCajasSnapshot.findOne({ tipo, diaKey })
    .select(
      'generadoEn regeneraciones.fecha regeneraciones.usuario regeneraciones.motivo ' +
        'regeneraciones.accion regeneraciones.totalesAntes regeneraciones.totalesDespues'
    )
    .lean();
  if (!snap) return null;
  const regs = snap.regeneraciones || [];
  const ultima = regs[regs.length - 1];
  return {
    generadoEn: snap.generadoEn,
    regeneraciones: regs.length,
    ultimaRegeneracion: ultima
      ? { fecha: ultima.fecha, usuario: ultima.usuario, motivo: ultima.motivo, accion: ultima.accion || 'regenerar' }
      : null,
    // Historial completo (ligero, sin `dataAntes`) para que la pantalla
    // pueda listar cada regeneración/restauración con sus totales de antes
    // y de después, y ofrecer "Restaurar" apuntando a `version` (su índice
    // en este arreglo, estable porque regeneraciones solo crece).
    historial: regs.map((r, i) => ({
      version: i,
      fecha: r.fecha,
      usuario: r.usuario,
      motivo: r.motivo,
      accion: r.accion || 'regenerar',
      totalesAntes: r.totalesAntes,
      totalesDespues: r.totalesDespues,
    })),
  };
}

// POST /api/reportes/cajas-ingresos/regenerar   body: { desde, hasta, tipo, motivo }
// Solo admin, con motivo obligatorio. Descarta la foto de UN día que ya
// terminó y lo recalcula con los datos de hoy (p. ej. una Factura Global de ese
// día se timbró después de que el reporte se congeló). Recalcula el día
// COMPLETO, no solo agrega lo que faltaba: cualquier otro cambio posterior que
// afecte a ese día también entra. Deja la bitácora en el propio snapshot
// (quién, cuándo, motivo, totales de antes y de después).
router.post('/cajas-ingresos/regenerar', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { desde, hasta, tipo } = req.body || {};
    const motivo = String(req.body?.motivo || '').trim().slice(0, 300);
    if (!desde || !hasta) {
      return res.status(400).json({ ok: false, msg: 'Parámetros desde y hasta requeridos' });
    }
    if (!TIPOS_COMPROBANTE_CAJA.includes(tipo)) {
      return res.status(400).json({ ok: false, msg: 'Parámetro tipo inválido' });
    }
    if (!motivo) {
      return res.status(400).json({ ok: false, msg: 'Captura el motivo para regenerar el reporte.' });
    }
    const diaKey = diaKeyCongelable(desde, hasta);
    if (!diaKey) {
      return res.status(400).json({
        ok: false,
        msg: 'Solo se puede regenerar el reporte de un día que ya terminó. Un rango de varios días o el de hoy siempre se calcula en vivo.',
      });
    }

    const builder = tipo === 'REMISION' ? buildReporteRemisionesDiarioImpl : buildReporteFacturasDiarioImpl;
    const data = await builder({ desde, hasta });
    // Se guarda COMPLETO (no solo los totales) como `dataAntes`: es el
    // respaldo que permite restaurar este día exactamente a como estaba
    // justo antes de esta regeneración (ver POST /cajas-ingresos/restaurar).
    const previo = await ReporteCajasSnapshot.findOne({ tipo, diaKey }).select('data').lean();
    const dataAntes = previo?.data || null;
    const totalesAntes = dataAntes?.totales || null;

    await ReporteCajasSnapshot.findOneAndUpdate(
      { tipo, diaKey },
      {
        $set: { desde: new Date(desde), hasta: new Date(hasta), data, generadoEn: new Date() },
        $push: {
          regeneraciones: {
            fecha: new Date(),
            usuario: req.user?.name || req.user?.username || '',
            usuarioId: req.user?._id || null,
            motivo,
            accion: 'regenerar',
            dataAntes,
            totalesAntes,
            totalesDespues: data.totales || null,
          },
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );

    return res.json({
      ok: true,
      tipo,
      ...data,
      cache: await metaSnapshotDia(tipo, desde, hasta),
      cambio: { antes: totalesAntes, despues: data.totales || null },
    });
  } catch (err) {
    console.error('Error regenerando reporte cajas ingresos:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// POST /api/reportes/cajas-ingresos/restaurar   body: { desde, hasta, tipo, motivo, version? }
// Solo admin, con motivo obligatorio. Deshace una regeneración (o una
// restauración previa) equivocada: reemplaza `data` por el respaldo
// `dataAntes` guardado en `regeneraciones[version]` — "cómo estaba el
// reporte justo antes de esa acción". Sin `version`, deshace la ÚLTIMA
// acción (regenerar o restaurar) registrada. La propia restauración queda
// en la misma bitácora (con su propio `dataAntes`, lo que había ANTES de
// restaurar), así que también se puede deshacer si hace falta.
router.post('/cajas-ingresos/restaurar', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { desde, hasta, tipo } = req.body || {};
    const motivo = String(req.body?.motivo || '').trim().slice(0, 300);
    if (!desde || !hasta) {
      return res.status(400).json({ ok: false, msg: 'Parámetros desde y hasta requeridos' });
    }
    if (!TIPOS_COMPROBANTE_CAJA.includes(tipo)) {
      return res.status(400).json({ ok: false, msg: 'Parámetro tipo inválido' });
    }
    if (!motivo) {
      return res.status(400).json({ ok: false, msg: 'Captura el motivo para restaurar el reporte.' });
    }
    const diaKey = diaKeyCongelable(desde, hasta);
    if (!diaKey) {
      return res.status(400).json({
        ok: false,
        msg: 'Solo se puede restaurar el reporte de un día que ya terminó.',
      });
    }

    const actual = await ReporteCajasSnapshot.findOne({ tipo, diaKey }).select('data regeneraciones').lean();
    const regs = actual?.regeneraciones || [];
    if (!actual || !regs.length) {
      return res.status(400).json({ ok: false, msg: 'Este día no tiene ninguna regeneración que deshacer.' });
    }
    const versionBody = req.body?.version;
    const version = versionBody === undefined || versionBody === null ? regs.length - 1 : Number(versionBody);
    const entrada = regs[version];
    if (!entrada || !Number.isInteger(version) || version < 0) {
      return res.status(400).json({ ok: false, msg: 'Esa versión del reporte no existe.' });
    }
    if (!entrada.dataAntes) {
      return res.status(400).json({
        ok: false,
        msg: 'Esa versión no tiene respaldo guardado (regenerada antes de que existiera esta función), no se puede restaurar.',
      });
    }

    const dataRestaurada = entrada.dataAntes;
    const dataActual = actual.data || null;
    const totalesAntes = dataActual?.totales || null;
    const totalesDespues = dataRestaurada?.totales || null;

    await ReporteCajasSnapshot.updateOne(
      { tipo, diaKey },
      {
        $set: { data: dataRestaurada, generadoEn: new Date() },
        $push: {
          regeneraciones: {
            fecha: new Date(),
            usuario: req.user?.name || req.user?.username || '',
            usuarioId: req.user?._id || null,
            motivo,
            accion: 'restaurar',
            dataAntes: dataActual,
            totalesAntes,
            totalesDespues,
          },
        },
      }
    );

    return res.json({
      ok: true,
      tipo,
      ...dataRestaurada,
      cache: await metaSnapshotDia(tipo, desde, hasta),
      cambio: { antes: totalesAntes, despues: totalesDespues },
    });
  } catch (err) {
    console.error('Error restaurando reporte cajas ingresos:', err);
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
      return res.json({ ok: true, tipo, ...resultado, cache: await metaSnapshotDia(tipo, desde, hasta) });
    }

    const resultado = await buildReporteFacturasDiario({ desde, hasta });
    return res.json({ ok: true, tipo, ...resultado, cache: await metaSnapshotDia(tipo, desde, hasta) });
  } catch (err) {
    console.error('Error reporte cajas ingresos:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// Texto del banner amarillo que se imprime arriba del PDF cuando se pide una
// versión anterior (ver `version` más abajo) en vez del reporte vigente —
// para que no se confunda con el PDF actual si alguien lo descarga.
function avisoVersionAnterior(entrada) {
  const cuando = dayjsFecha(entrada.fecha).format('DD/MM/YYYY HH:mm');
  const accion = entrada.accion === 'restaurar' ? 'restaurarse' : 'regenerarse';
  const quien = entrada.usuario ? ` por ${entrada.usuario}` : '';
  const motivo = entrada.motivo ? ` — Motivo: ${entrada.motivo}` : '';
  return `VERSIÓN ANTERIOR DEL REPORTE — así estaba antes de ${accion} el ${cuando}${quien}${motivo}`;
}

// GET /api/reportes/cajas-ingresos-pdf?desde=...&hasta=...&tipo=NOTA_VENTA|REMISION[&version=N]
// `version` (opcional): en vez del reporte vigente, el respaldo guardado en
// regeneraciones[N].dataAntes — "cómo se veía el PDF antes de ese cambio" (ver
// POST /cajas-ingresos/restaurar). Sin `version`, comportamiento de siempre.
router.get('/cajas-ingresos-pdf', async (req, res) => {
  try {
    const { desde, hasta, tipo } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ ok: false, msg: 'Parámetros desde y hasta requeridos' });
    }
    if (!TIPOS_COMPROBANTE_CAJA.includes(tipo)) {
      return res.status(400).json({ ok: false, msg: 'Parámetro tipo inválido' });
    }

    let resultado;
    let aviso;
    if (req.query.version !== undefined) {
      const version = Number(req.query.version);
      const diaKey = diaKeyCongelable(desde, hasta);
      if (!diaKey || !Number.isInteger(version) || version < 0) {
        return res.status(400).json({ ok: false, msg: 'Parámetro version inválido.' });
      }
      const snap = await ReporteCajasSnapshot.findOne({ tipo, diaKey })
        .select('regeneraciones.fecha regeneraciones.usuario regeneraciones.motivo regeneraciones.accion regeneraciones.dataAntes')
        .lean();
      const entrada = snap?.regeneraciones?.[version];
      if (!entrada?.dataAntes) {
        return res.status(404).json({ ok: false, msg: 'Esa versión del reporte no está disponible.' });
      }
      resultado = entrada.dataAntes;
      aviso = avisoVersionAnterior(entrada);
    } else if (tipo === 'REMISION') {
      resultado = await buildReporteRemisionesDiario({ desde, hasta });
    } else {
      resultado = await buildReporteFacturasDiario({ desde, hasta });
    }

    if (tipo === 'REMISION') {
      await streamReporteRemisionesDiarioPdf(res, resultado, desde, hasta, aviso);
      return;
    }
    await streamReporteFacturasDiarioPdf(res, resultado, desde, hasta, aviso);
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
    const ordenes = await Vehiculo.find({ estadoOrden: { $nin: ESTADOS_CERRADOS }, ...dateFilter, ...filtroReporte(req.query.lineaNegocio) })
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
    const query = { estadoOrden: { $nin: ESTADOS_CERRADOS }, ...dateFilter, ...filtroReporte(req.query.lineaNegocio) };
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
async function buildReporteRhCxC({ desde, hasta, mecanico, lineaNegocio }) {
  const query = {
    estadoOrden: 'CERRADA',
    ...filtroReporte(lineaNegocio),
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

    const resultado = await buildReporteRhCxC({ desde, hasta, mecanico, lineaNegocio: req.query.lineaNegocio });
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

    const resultado = await buildReporteRhCxC({ desde, hasta, mecanico, lineaNegocio: req.query.lineaNegocio });
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

async function buildReporteHorasTecnico({ desde, hasta, estado, lineaNegocio }) {
  const d = new Date(desde);
  const h = new Date(hasta);
  const filtroAbiertas = { estadoOrden: { $nin: ESTADOS_CERRADOS }, fechaRecepcion: { $gte: d, $lte: h } };
  const filtroCerradas = { estadoOrden: 'CERRADA', fechaCierre: { $gte: d, $lte: h } };

  let query;
  if (estado === 'cerradas') query = filtroCerradas;
  else if (estado === 'abiertas') query = filtroAbiertas;
  else query = { $or: [filtroAbiertas, filtroCerradas] }; // 'todas' (o sin valor)

  const ordenes = await Vehiculo.find({ $and: [query, filtroReporte(lineaNegocio)] })
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

    const resultado = await buildReporteHorasTecnico({ desde, hasta, estado, lineaNegocio: req.query.lineaNegocio });
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

    const resultado = await buildReporteHorasTecnico({ desde, hasta, estado, lineaNegocio: req.query.lineaNegocio });
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
async function buildReportePendientesFactura({ desde, hasta, lineaNegocio }) {
  const d = new Date(desde);
  const h = new Date(hasta);

  const ordenes = await Vehiculo.find({
    pendienteFactura: true,
    ...filtroReporte(lineaNegocio),
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

    const resultado = await buildReportePendientesFactura({ desde, hasta, lineaNegocio: req.query.lineaNegocio });
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

    const resultado = await buildReportePendientesFactura({ desde, hasta, lineaNegocio: req.query.lineaNegocio });
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
