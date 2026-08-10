const express = require('express');
const router = express.Router();

const Vehiculo = require('../models/Vehiculo');
const Cliente = require('../models/Cliente');
const Contador = require('../models/Contador');
const { proteger, requiereRol } = require('../middleware/auth');
const { regexBusquedaOS } = require('../utils/ordenServicio');
const { calcularTotalesOrden } = require('../utils/cajaTotales');
const { registrarMovimientoTerminal } = require('../utils/cierreCajaTerminales');
const { generarComprobanteCajaPDF } = require('../service/cajaComprobantePdf');
const { generarReciboProvisionalPDF, generarReciboDolaresPDF } = require('../service/cajaRecibosPdf');

const POPULATE_CLIENTE = 'nombre apellidoPaterno apellidoMaterno tipoCliente empresa gobierno telefonos celulares emails rfc direccion asesorResponsable';
const POPULATE_GRUPO = { path: 'grupoId', select: 'nombre miembros', populate: { path: 'miembros', select: 'name' } };
const CONTADOR_NOTA_VENTA = 'notaVenta';
const CONTADOR_REMISION = 'remision';
const CONTADOR_RECIBO_PROVISIONAL = 'reciboProvisional';
const CONTADOR_RECIBO_DOLARES = 'reciboDolares';

// Tolerancia de centavos para dar por liquidada una orden (los totales se
// recalculan con floats: IVA y descuentos en porcentaje).
const TOLERANCIA_SALDO = 0.01;

// La Fecha de Pagada de una Remisión no se captura a mano: el sistema la marca
// en cuanto la orden se queda sin saldo pendiente, y la vuelve a limpiar si el
// saldo reaparece (p. ej. al cancelar un pago o quitar un descuento). Recibe el
// documento ya hidratado de Mongoose y solo guarda si algo cambió.
async function sincronizarFechaPagadaRemisiones(vehiculo, fecha = new Date()) {
  const { saldoPendiente } = calcularTotalesOrden(vehiculo);
  const liquidada = saldoPendiente <= TOLERANCIA_SALDO;

  let cambio = false;
  for (const p of vehiculo.pagos || []) {
    if (p.comprobante !== 'REMISION' || p.cancelado || !p.remision) continue;
    if (liquidada && !p.remision.fechaPagada) {
      p.remision.fechaPagada = fecha;
      cambio = true;
    } else if (!liquidada && p.remision.fechaPagada) {
      p.remision.fechaPagada = null;
      cambio = true;
    }
  }

  if (cambio) await vehiculo.save();
  return vehiculo;
}

// GET /api/cajas -> lista de órdenes para el módulo de Cajas. A diferencia de
// /vehiculos/ordenes (que Cajas usaba antes), aquí se listan las órdenes sin
// importar su estadoOrden, porque un cobro puede llegar en cualquier etapa;
// solo se ocultan las canceladas y las que ya quedaron liquidadas.
// vista=activas (default) -> todo excepto CANCELADA y ya liquidadas (incluye
//                              órdenes abiertas y cerradas con saldo pendiente)
// vista=cerradas           -> solo CERRADA, sin importar el saldo
// vista=liquidadas         -> solo CERRADA con saldo pendiente <= 0
// vista=pendientes         -> solo CERRADA con saldo pendiente > 0
// vista=garantias          -> solo órdenes de garantía, sin filtrar por liquidada
//                              (una garantía cerrada sigue siendo relevante para Cajas)
// sort=recientes (default) -> por fecha de creación descendente
// sort=os_asc / os_desc    -> por folio de Orden de Servicio
const VISTAS_SOLO_CERRADA = ['cerradas', 'liquidadas', 'pendientes'];

// El folio (ordenServicio) es LETRAS-NÚMERO (ver utils/ordenServicio.js) y se
// captura a mano, así que un sort de Mongo por string ordenaría "P-10" antes
// que "P-9"; se ordena en memoria comparando letras y número por separado.
function compararOrdenServicio(a, b) {
  const partes = (os) => {
    const m = String(os || '').match(/^([A-Za-z]+)-?(\d+)$/);
    return m ? { letras: m[1].toUpperCase(), numero: parseInt(m[2], 10) } : { letras: String(os || '').toUpperCase(), numero: 0 };
  };
  const pa = partes(a);
  const pb = partes(b);
  if (pa.letras !== pb.letras) return pa.letras.localeCompare(pb.letras);
  return pa.numero - pb.numero;
}

router.get('/', proteger, async (req, res) => {
  try {
    const {
      vista = 'activas',
      search = '',
      fechaDesde = '',
      fechaHasta = '',
      sort = 'recientes',
      page = 1,
      limit = 10,
    } = req.query;

    const q = { estadoOrden: { $ne: 'CANCELADA' } };
    const andConditions = [];

    if (vista === 'garantias') {
      q.garantia = { $ne: null };
    } else if (VISTAS_SOLO_CERRADA.includes(vista)) {
      q.estadoOrden = 'CERRADA';
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
      if (vista === 'garantias' || vista === 'cerradas') return true;
      const liquidada = orden.estadoOrden === 'CERRADA' && totales.saldoPendiente <= 0;
      if (vista === 'liquidadas') return liquidada;
      if (vista === 'pendientes') return !liquidada;
      return !liquidada; // activas
    });

    if (sort === 'os_asc' || sort === 'os_desc') {
      const signo = sort === 'os_desc' ? -1 : 1;
      filtradas.sort((x, y) => signo * compararOrdenServicio(x.orden.ordenServicio, y.orden.ordenServicio));
    }

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
      return res.status(400).json({ ok: false, msg: 'Un pago de Remisión o Factura requiere Nota de Venta o Remisión.' });
    }

    const ordenExistente = await Vehiculo.findById(req.params.id).select('garantia pagos.comprobante pagos.cancelado');
    if (!ordenExistente) return res.status(404).json({ ok: false, msg: 'Orden no encontrada' });
    if (ordenExistente.garantia) {
      return res.status(400).json({ ok: false, msg: 'No se puede registrar un pago para una orden de garantía.' });
    }

    // Una vez que la orden tiene una Remisión, ya no se puede generar otra
    // Remisión ni una Nota de Venta (evita duplicar/mezclar comprobantes fiscales).
    // Una remisión cancelada no cuenta: precisamente se cancela para poder
    // volver a facturar/remisionar la orden.
    const yaTieneRemision = (ordenExistente.pagos || []).some(
      (p) => p.comprobante === 'REMISION' && !p.cancelado
    );
    if (yaTieneRemision && ['NOTA_VENTA', 'REMISION'].includes(comprobante)) {
      return res.status(400).json({
        ok: false,
        msg: 'Esta orden ya tiene una Remisión registrada; no se puede generar otra Remisión ni una Nota de Venta.',
      });
    }

    // Una Remisión a Crédito documenta la venta sin recibir dinero: es el único
    // pago que puede registrarse en 0 (la orden queda como cuenta por cobrar y
    // se salda con abonos posteriores).
    const esRemisionCredito = comprobante === 'REMISION' && tipoRemision === 'Credito';
    const monto = esRemisionCredito
      ? 0
      : Number(montoPesos || 0) + Number(montoDolares || 0) * Number(tipoCambio || 0);
    if (monto <= 0 && !esRemisionCredito) {
      return res.status(400).json({ ok: false, msg: 'El monto del pago debe ser mayor a 0.' });
    }

    const pago = {
      fecha: new Date(),
      tipoPago,
      comprobante,
      montoPesos: esRemisionCredito ? 0 : Number(montoPesos) || 0,
      montoDolares: esRemisionCredito ? 0 : Number(montoDolares) || 0,
      tipoCambio: Number(tipoCambio) || 0,
      monto,
      referencia: esRemisionCredito ? '' : referencia,
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
      // fechaPagada arranca en null: la marca sincronizarFechaPagadaRemisiones
      // en cuanto la orden queda sin saldo pendiente.
      pago.remision = { numero: contador.valor, tipo: tipoRemision, fechaPagada: null };
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

    await sincronizarFechaPagadaRemisiones(vehiculo, pago.fecha);

    if (comprobante === 'NOTA_VENTA') {
      try {
        await registrarMovimientoTerminal(banco, pago.monto, pago.fecha);
      } catch (errTerminal) {
        console.error('Error actualizando terminal del cierre de caja:', errTerminal);
      }
    }

    return res.status(201).json({ ok: true, vehiculo, totales: calcularTotalesOrden(vehiculo) });
  } catch (err) {
    console.error('Error registrando pago:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// POST /api/cajas/:id/pagos/:pagoId/cancelar -> cancela un pago ya registrado
// (solo admin). Casos de uso: la orden se cobró con Anticipo o Remisión y el
// cliente pide factura, o el pago se restablece porque se registró por error
// (ver ticket RESTABLECER_COBRO en Soporte). El pago no se borra (su folio ya
// se consumió y los reportes lo necesitan): queda marcado como cancelado y
// deja de contar como abonado. En las remisiones además se marca
// remision.tipo = 'Cancelada', que es lo que ya leía el Reporte Diario de
// Remisiones para mostrarlas como "SE CANCELA REMISIÓN Y PASA A FACTURA".
router.post('/:id/pagos/:pagoId/cancelar', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { motivo = '' } = req.body || {};

    const vehiculo = await Vehiculo.findById(req.params.id);
    if (!vehiculo) return res.status(404).json({ ok: false, msg: 'Orden no encontrada' });

    const pago = (vehiculo.pagos || []).id(req.params.pagoId);
    if (!pago) return res.status(404).json({ ok: false, msg: 'Pago no encontrado' });
    if (pago.cancelado) {
      return res.status(400).json({ ok: false, msg: 'Este pago ya está cancelado.' });
    }

    const esRemision = pago.comprobante === 'REMISION';
    const motivoFinal =
      String(motivo).trim() ||
      (esRemision ? 'Se cancela remisión y pasa a factura' : 'Se cancela anticipo y pasa a factura');

    pago.cancelado = true;
    pago.canceladoEn = new Date();
    pago.canceladoPor = req.user?.name || req.user?.username || '';
    pago.motivoCancelacion = motivoFinal;
    pago.notas = motivoFinal;

    if (esRemision) pago.remision.tipo = 'Cancelada';

    const pagoComprobante = pago.comprobante;
    const pagoBanco = pago.notaVenta?.banco;
    const pagoMonto = pago.monto;
    const pagoFecha = pago.fecha;

    await vehiculo.save();
    // Al dejar de contar como abonado puede reaparecer saldo: las remisiones
    // vigentes de la orden vuelven a quedar sin Fecha de Pagada.
    await sincronizarFechaPagadaRemisiones(vehiculo);
    await vehiculo.populate('cliente', POPULATE_CLIENTE);

    if (pagoComprobante === 'NOTA_VENTA') {
      try {
        await registrarMovimientoTerminal(pagoBanco, -pagoMonto, pagoFecha);
      } catch (errTerminal) {
        console.error('Error revirtiendo terminal del cierre de caja:', errTerminal);
      }
    }

    return res.json({ ok: true, vehiculo, totales: calcularTotalesOrden(vehiculo) });
  } catch (err) {
    console.error('Error cancelando pago:', err);
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

    // Un descuento cambia el total de la orden y puede dejarla (o sacarla de)
    // saldo cero, que es lo que dispara la Fecha de Pagada de la Remisión.
    await sincronizarFechaPagadaRemisiones(vehiculo);

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

    await sincronizarFechaPagadaRemisiones(vehiculo);

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

    await sincronizarFechaPagadaRemisiones(vehiculo);

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
