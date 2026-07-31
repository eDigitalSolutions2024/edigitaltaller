const express = require('express');
const router = express.Router();

const Vehiculo = require('../models/Vehiculo');
const Cliente = require('../models/Cliente');
const Contador = require('../models/Contador');
const { proteger } = require('../middleware/auth');
const { regexBusquedaOS } = require('../utils/ordenServicio');
const { calcularTotalesOrden } = require('../utils/cajaTotales');
const { generarComprobanteCajaPDF } = require('../service/cajaComprobantePdf');
const { generarReciboProvisionalPDF, generarReciboDolaresPDF } = require('../service/cajaRecibosPdf');

const POPULATE_CLIENTE = 'nombre apellidoPaterno apellidoMaterno tipoCliente empresa gobierno telefonos celulares emails rfc direccion asesorResponsable';
const POPULATE_GRUPO = { path: 'grupoId', select: 'nombre miembros', populate: { path: 'miembros', select: 'name' } };
const CONTADOR_NOTA_VENTA = 'notaVenta';
const CONTADOR_REMISION = 'remision';
const CONTADOR_RECIBO_PROVISIONAL = 'reciboProvisional';
const CONTADOR_RECIBO_DOLARES = 'reciboDolares';

// GET /api/cajas -> lista de órdenes para el módulo de Cajas. A diferencia de
// /vehiculos/ordenes (que Cajas usaba antes), aquí se listan las órdenes sin
// importar su estadoOrden, porque un cobro puede llegar en cualquier etapa;
// solo se ocultan las canceladas y las que ya quedaron liquidadas.
// vista=activas (default) -> todo excepto CANCELADA y ya liquidadas
// vista=liquidadas         -> solo CERRADA con saldo pendiente <= 0
// vista=garantias          -> solo órdenes de garantía, sin filtrar por liquidada
//                              (una garantía cerrada sigue siendo relevante para Cajas)
router.get('/', proteger, async (req, res) => {
  try {
    const {
      vista = 'activas',
      search = '',
      fechaDesde = '',
      fechaHasta = '',
      page = 1,
      limit = 10,
    } = req.query;

    const q = { estadoOrden: { $ne: 'CANCELADA' } };
    const andConditions = [];

    if (vista === 'garantias') {
      q.garantia = { $ne: null };
    }

    if (search) {
      const rxSearch = { $regex: search, $options: 'i' };
      const rxOS = regexBusquedaOS(search);
      const clientesMatch = await Cliente.find({
        $or: [
          { nombre: rxSearch },
          { apellidoPaterno: rxSearch },
          { apellidoMaterno: rxSearch },
          { 'empresa.razonSocial': rxSearch },
          { 'gobierno.nombreGobierno': rxSearch },
        ],
      }).select('_id');
      const clienteIdsMatch = clientesMatch.map((c) => c._id);

      andConditions.push({
        $or: [
          { serie: rxSearch },
          { placas: rxSearch },
          { marca: rxSearch },
          { modelo: rxSearch },
          ...(rxOS ? [{ ordenServicio: rxOS }] : []),
          ...(clienteIdsMatch.length ? [{ cliente: { $in: clienteIdsMatch } }] : []),
        ],
      });
    }

    if (fechaDesde || fechaHasta) {
      q.fechaRecepcion = {};
      if (fechaDesde) q.fechaRecepcion.$gte = new Date(fechaDesde);
      if (fechaHasta) {
        const hasta = new Date(fechaHasta);
        hasta.setHours(23, 59, 59, 999);
        q.fechaRecepcion.$lte = hasta;
      }
    }

    if (andConditions.length) q.$and = andConditions;

    const ordenes = await Vehiculo.find(q)
      .sort({ createdAt: -1 })
      .populate('cliente', POPULATE_CLIENTE)
      .populate(POPULATE_GRUPO);

    // El saldo pendiente no se persiste (se recalcula siempre, ver
    // calcularTotalesOrden), así que decidir si una orden ya está "liquidada"
    // obliga a calcularlo aquí y paginar en memoria en vez de con skip/limit.
    const conTotales = ordenes.map((orden) => ({ orden, totales: calcularTotalesOrden(orden) }));

    const filtradas = conTotales.filter(({ orden, totales }) => {
      if (vista === 'garantias') return true;
      const liquidada = orden.estadoOrden === 'CERRADA' && totales.saldoPendiente <= 0;
      return vista === 'liquidadas' ? liquidada : !liquidada;
    });

    const total = filtradas.length;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    const data = filtradas.slice(skip, skip + limitNum).map(({ orden }) => orden);

    return res.json({ ok: true, data, total, page: pageNum, limit: limitNum });
  } catch (err) {
    console.error('Error listando ordenes (cajas):', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/cajas/:id -> detalle de la orden + totales ya calculados
router.get('/:id', proteger, async (req, res) => {
  try {
    const vehiculo = await Vehiculo.findById(req.params.id)
      .populate('cliente', POPULATE_CLIENTE)
      .populate(POPULATE_GRUPO);
    if (!vehiculo) return res.status(404).json({ ok: false, msg: 'Orden no encontrada' });
    return res.json({ ok: true, vehiculo, totales: calcularTotalesOrden(vehiculo) });
  } catch (err) {
    console.error('Error obteniendo orden (cajas):', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// POST /api/cajas/:id/pagos -> registra un pago/abono/anticipo. Cada pago trae
// su propio comprobante (Nota de Venta o Remisión), al cual se le asigna un
// folio nuevo en el momento (escritura atómica $push).
router.post('/:id/pagos', proteger, async (req, res) => {
  try {
    const {
      tipoPago = 'ABONO',
      comprobante,
      montoPesos = 0,
      montoDolares = 0,
      tipoCambio = 0,
      referencia = '',
      observaciones = '',
      notas = '',
      banco = '',
      tipoNota = 'Contado',
      tipoRemision = 'Contado',
      fechaPagada,
      formaPago = 'EFECTIVO',
      chequeNumero = '',
      reciboConcepto = '',
      reciboRazon = '',
      reciboRecibio = '',
      reciboAutorizo = '',
    } = req.body || {};

    if (!['COMPLETO', 'ABONO', 'ANTICIPO'].includes(tipoPago)) {
      return res.status(400).json({ ok: false, msg: 'Tipo de pago inválido.' });
    }
    if (!['NOTA_VENTA', 'REMISION', 'RECIBO_PROVISIONAL'].includes(comprobante)) {
      return res.status(400).json({ ok: false, msg: 'Debes elegir un comprobante.' });
    }
    // Un abono/anticipo siempre se documenta con Recibo Provisional; Nota de
    // Venta y Remisión son exclusivas de un pago Liquida (COMPLETO).
    if (['ABONO', 'ANTICIPO'].includes(tipoPago) && comprobante !== 'RECIBO_PROVISIONAL') {
      return res.status(400).json({ ok: false, msg: 'Un Abono o Anticipo se documenta con Recibo Provisional.' });
    }
    if (tipoPago === 'COMPLETO' && comprobante === 'RECIBO_PROVISIONAL') {
      return res.status(400).json({ ok: false, msg: 'Un pago Liquida requiere Nota de Venta o Remisión.' });
    }

    const ordenExistente = await Vehiculo.findById(req.params.id).select('garantia pagos.comprobante');
    if (!ordenExistente) return res.status(404).json({ ok: false, msg: 'Orden no encontrada' });
    if (ordenExistente.garantia) {
      return res.status(400).json({ ok: false, msg: 'No se puede registrar un pago para una orden de garantía.' });
    }

    // Una vez que la orden tiene una Remisión, ya no se puede generar otra
    // Remisión ni una Nota de Venta (evita duplicar/mezclar comprobantes fiscales).
    const yaTieneRemision = (ordenExistente.pagos || []).some((p) => p.comprobante === 'REMISION');
    if (yaTieneRemision && ['NOTA_VENTA', 'REMISION'].includes(comprobante)) {
      return res.status(400).json({
        ok: false,
        msg: 'Esta orden ya tiene una Remisión registrada; no se puede generar otra Remisión ni una Nota de Venta.',
      });
    }

    const monto = Number(montoPesos || 0) + Number(montoDolares || 0) * Number(tipoCambio || 0);
    if (monto <= 0) {
      return res.status(400).json({ ok: false, msg: 'El monto del pago debe ser mayor a 0.' });
    }

    const pago = {
      fecha: new Date(),
      tipoPago,
      comprobante,
      montoPesos: Number(montoPesos) || 0,
      montoDolares: Number(montoDolares) || 0,
      tipoCambio: Number(tipoCambio) || 0,
      monto,
      referencia,
      observaciones,
      notas,
      registradoPor: req.user?.name || req.user?.username || '',
    };

    if (comprobante === 'NOTA_VENTA') {
      const contador = await Contador.findOneAndUpdate(
        { nombre: CONTADOR_NOTA_VENTA },
        { $inc: { valor: 1 } },
        { new: true, upsert: true }
      );
      pago.notaVenta = { numero: contador.valor, banco, tipo: tipoNota };
    } else if (comprobante === 'REMISION') {
      const contador = await Contador.findOneAndUpdate(
        { nombre: CONTADOR_REMISION },
        { $inc: { valor: 1 } },
        { new: true, upsert: true }
      );
      pago.remision = {
        numero: contador.valor,
        tipo: tipoRemision,
        fechaPagada: fechaPagada ? new Date(fechaPagada) : null,
      };
    }

    // Recibo Provisional: automático en cada abono/anticipo (único comprobante permitido).
    if (['ABONO', 'ANTICIPO'].includes(tipoPago)) {
      const contadorProvisional = await Contador.findOneAndUpdate(
        { nombre: CONTADOR_RECIBO_PROVISIONAL },
        { $inc: { valor: 1 } },
        { new: true, upsert: true }
      );
      pago.reciboProvisional = {
        numero: contadorProvisional.valor,
        formaPago,
        chequeNumero: formaPago === 'CHEQUE' ? chequeNumero : '',
        concepto: reciboConcepto,
        razon: reciboRazon,
        recibio: reciboRecibio,
        autorizo: reciboAutorizo,
      };
    }

    // Recibo de Dólares: automático siempre que el pago incluya dólares.
    if (Number(montoDolares) > 0) {
      const contadorDolares = await Contador.findOneAndUpdate(
        { nombre: CONTADOR_RECIBO_DOLARES },
        { $inc: { valor: 1 } },
        { new: true, upsert: true }
      );
      pago.reciboDolares = { numero: contadorDolares.valor };
    }

    const vehiculo = await Vehiculo.findByIdAndUpdate(
      req.params.id,
      { $push: { pagos: pago } },
      { new: true }
    ).populate('cliente', POPULATE_CLIENTE);
    if (!vehiculo) return res.status(404).json({ ok: false, msg: 'Orden no encontrada' });

    return res.status(201).json({ ok: true, vehiculo, totales: calcularTotalesOrden(vehiculo) });
  } catch (err) {
    console.error('Error registrando pago:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// POST /api/cajas/:id/descuentos -> agrega un descuento (global o sobre una
// pieza/servicio de ventaCliente vía lineaId); queda activo por defecto.
router.post('/:id/descuentos', proteger, async (req, res) => {
  try {
    const { tipo, valor = 0, motivo = '', lineaId = null } = req.body || {};
    if (!['PORCENTAJE', 'MONTO'].includes(tipo)) {
      return res.status(400).json({ ok: false, msg: 'Tipo de descuento inválido.' });
    }

    const descuento = {
      tipo,
      valor: Number(valor) || 0,
      motivo,
      activo: true,
      lineaId: lineaId || null,
      aplicadoPor: req.user?.name || req.user?.username || '',
      fecha: new Date(),
    };

    const vehiculo = await Vehiculo.findByIdAndUpdate(
      req.params.id,
      { $push: { descuentos: descuento } },
      { new: true }
    ).populate('cliente', POPULATE_CLIENTE);
    if (!vehiculo) return res.status(404).json({ ok: false, msg: 'Orden no encontrada' });

    return res.status(201).json({ ok: true, vehiculo, totales: calcularTotalesOrden(vehiculo) });
  } catch (err) {
    console.error('Error agregando descuento:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// PUT /api/cajas/:id/descuentos/:descuentoId -> edita o activa/desactiva un descuento existente
router.put('/:id/descuentos/:descuentoId', proteger, async (req, res) => {
  try {
    const { tipo, valor, motivo, activo, lineaId } = req.body || {};
    if (tipo !== undefined && !['PORCENTAJE', 'MONTO'].includes(tipo)) {
      return res.status(400).json({ ok: false, msg: 'Tipo de descuento inválido.' });
    }

    const sets = {};
    if (tipo !== undefined) sets['descuentos.$.tipo'] = tipo;
    if (valor !== undefined) sets['descuentos.$.valor'] = Number(valor) || 0;
    if (motivo !== undefined) sets['descuentos.$.motivo'] = motivo;
    if (activo !== undefined) sets['descuentos.$.activo'] = !!activo;
    if (lineaId !== undefined) sets['descuentos.$.lineaId'] = lineaId || null;

    const vehiculo = await Vehiculo.findOneAndUpdate(
      { _id: req.params.id, 'descuentos._id': req.params.descuentoId },
      { $set: sets },
      { new: true }
    ).populate('cliente', POPULATE_CLIENTE);
    if (!vehiculo) return res.status(404).json({ ok: false, msg: 'Orden o descuento no encontrado' });

    return res.json({ ok: true, vehiculo, totales: calcularTotalesOrden(vehiculo) });
  } catch (err) {
    console.error('Error actualizando descuento:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// DELETE /api/cajas/:id/descuentos/:descuentoId -> elimina un descuento
router.delete('/:id/descuentos/:descuentoId', proteger, async (req, res) => {
  try {
    const vehiculo = await Vehiculo.findByIdAndUpdate(
      req.params.id,
      { $pull: { descuentos: { _id: req.params.descuentoId } } },
      { new: true }
    ).populate('cliente', POPULATE_CLIENTE);
    if (!vehiculo) return res.status(404).json({ ok: false, msg: 'Orden no encontrada' });

    return res.json({ ok: true, vehiculo, totales: calcularTotalesOrden(vehiculo) });
  } catch (err) {
    console.error('Error eliminando descuento:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// ===== PDFs =====
// Sin `proteger`: se abren vía window.open() y ese request no puede llevar el header Authorization,
// igual que operativo-pdf/presupuesto-pdf/venta-cliente-pdf en routes/vehiculos.js.
// ?pagoId= identifica cuál pago (con su comprobante) se debe imprimir; sin él se
// imprime el pago más reciente con ese tipo de comprobante.
function pagoParaImprimir(vehiculo, pagoId, comprobante) {
  const pagos = vehiculo.pagos || [];
  if (pagoId) {
    const pago = pagos.id(pagoId);
    return pago && pago.comprobante === comprobante ? pago : null;
  }
  return (
    [...pagos]
      .filter((p) => p.comprobante === comprobante)
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0] || null
  );
}

async function imprimirComprobante(req, res, comprobante) {
  const etiqueta = comprobante === 'NOTA_VENTA' ? 'Nota de Venta' : 'Remisión';
  try {
    const vehiculo = await Vehiculo.findById(req.params.id).populate('cliente', POPULATE_CLIENTE);
    if (!vehiculo) return res.status(404).json({ ok: false, msg: 'Orden no encontrada' });

    const pago = pagoParaImprimir(vehiculo, req.query.pagoId, comprobante);
    if (!pago) {
      return res.status(404).json({ ok: false, msg: `La orden no tiene un pago con ${etiqueta}.` });
    }

    await generarComprobanteCajaPDF(res, vehiculo, pago, comprobante);
  } catch (err) {
    console.error(`Error generando PDF de ${etiqueta}:`, err);
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, msg: `Error al generar el PDF de ${etiqueta}` });
    }
  }
}

router.get('/:id/nota-venta-pdf', (req, res) => imprimirComprobante(req, res, 'NOTA_VENTA'));

router.get('/:id/remision-pdf', (req, res) => imprimirComprobante(req, res, 'REMISION'));

// Recibo Provisional / Recibo de Dólares: no dependen del comprobante (Nota de
// Venta o Remisión), sino de si el pago trae reciboProvisional/reciboDolares
// asignado (ver POST /:id/pagos). ?pagoId= identifica cuál pago imprimir; sin
// él se imprime el más reciente que tenga ese recibo asignado.
function pagoConRecibo(vehiculo, pagoId, campo) {
  const pagos = vehiculo.pagos || [];
  if (pagoId) {
    const pago = pagos.id(pagoId);
    return pago && pago[campo]?.numero ? pago : null;
  }
  return (
    [...pagos]
      .filter((p) => p[campo]?.numero)
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0] || null
  );
}

router.get('/:id/recibo-provisional-pdf', async (req, res) => {
  try {
    const vehiculo = await Vehiculo.findById(req.params.id).populate('cliente', POPULATE_CLIENTE);
    if (!vehiculo) return res.status(404).json({ ok: false, msg: 'Orden no encontrada' });

    const pago = pagoConRecibo(vehiculo, req.query.pagoId, 'reciboProvisional');
    if (!pago) {
      return res.status(404).json({ ok: false, msg: 'La orden no tiene un Recibo Provisional.' });
    }

    await generarReciboProvisionalPDF(res, vehiculo, pago);
  } catch (err) {
    console.error('Error generando PDF de Recibo Provisional:', err);
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, msg: 'Error al generar el PDF del Recibo Provisional' });
    }
  }
});

router.get('/:id/recibo-dolares-pdf', async (req, res) => {
  try {
    const vehiculo = await Vehiculo.findById(req.params.id).populate('cliente', POPULATE_CLIENTE);
    if (!vehiculo) return res.status(404).json({ ok: false, msg: 'Orden no encontrada' });

    const pago = pagoConRecibo(vehiculo, req.query.pagoId, 'reciboDolares');
    if (!pago) {
      return res.status(404).json({ ok: false, msg: 'La orden no tiene un Recibo de Dólares.' });
    }

    await generarReciboDolaresPDF(res, vehiculo, pago);
  } catch (err) {
    console.error('Error generando PDF de Recibo de Dólares:', err);
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, msg: 'Error al generar el PDF del Recibo de Dólares' });
    }
  }
});

module.exports = router;
