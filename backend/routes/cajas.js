const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const Vehiculo = require('../models/Vehiculo');
const Cliente = require('../models/Cliente');
const Contador = require('../models/Contador');
const { proteger, requiereRol } = require('../middleware/auth');
const { regexBusquedaOS } = require('../utils/ordenServicio');
const { calcularTotalesOrden, sincronizarFechaPagadaRemisiones } = require('../utils/cajaTotales');
const { registrarMovimientoTerminal } = require('../utils/cierreCajaTerminales');
const { generarComprobanteCajaPDF } = require('../service/cajaComprobantePdf');
const { generarReciboProvisionalPDF, generarReciboDolaresPDF } = require('../service/cajaRecibosPdf');
const { aplicarUso, aplicarDeposito, cancelarDeposito, revertirUso, calcularOrigenSaldo, SaldoInsuficienteError, sincronizarAnticiposAplicados } = require('../utils/anticiposCliente');

// saldoAFavor: necesario para que Cajas muestre "Saldo disponible del
// cliente" y pueda aplicarlo a un pago (ver POST /:id/pagos abajo).
const POPULATE_CLIENTE = 'nombre apellidoPaterno apellidoMaterno tipoCliente empresa gobierno telefonos celulares emails rfc direccion asesorResponsable esEmpleado saldoAFavor';
const POPULATE_GRUPO = { path: 'grupoId', select: 'nombre miembros', populate: { path: 'miembros', select: 'name' } };
const CONTADOR_NOTA_VENTA = 'notaVenta';
const CONTADOR_REMISION = 'remision';
const CONTADOR_RECIBO_PROVISIONAL = 'reciboProvisional';
const CONTADOR_RECIBO_DOLARES = 'reciboDolares';

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
    } else if (vista === 'pendientes_factura') {
      q.pendienteFactura = true;
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
      if (vista === 'garantias' || vista === 'cerradas' || vista === 'pendientes_factura') return true;
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

    // Si la orden ya tomó precio y tiene anticipos propios sin aplicar
    // (dejados cuando aún no había servicios), se convierten aquí solos en
    // abonado, antes de calcular los totales que ve la pantalla.
    try {
      await sincronizarAnticiposAplicados(vehiculo);
    } catch (errAnticipo) {
      console.error('Error sincronizando anticipos aplicados:', errAnticipo);
    }

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
  // Declarados fuera del try para que el catch pueda revertir el saldo si
  // aplicarUso / aplicarDeposito ya se ejecutó pero algo después falló (ver
  // catch al final).
  let movimientoSaldo = null;
  let movimientoDeposito = null;
  let clienteParaRevertirSaldo = null;
  try {
    const {
      tipoPago = 'ABONO',
      comprobante,
      montoPesos = 0,
      montoDolares = 0,
      tipoCambio = 0,
      montoSaldoAplicado = 0,
      referencia = '',
      observaciones = '',
      notas = '',
      banco = '',
      tipoNota = 'Contado',
      tipoRemision = 'Contado',
      formaPago = 'EFECTIVO',
      chequeNumero = '',
      reciboConcepto = '',
      reciboRecibio = '',
      anticipoDestino = '',
      combinado = null,
      // Terminal por la que se cobró un Recibo Provisional SIMPLE con tarjeta
      // (T. Crédito / T. Débito). El Combinado trae la suya en combinado.banco;
      // la Nota de Venta, en `banco`.
      terminal = '',
    } = req.body || {};

    const TERMINALES_TARJETA = ['BANREGIO', 'AMERICAN EXPRESS', 'BANAMEX', 'BANORTE', 'BBVA BANCOMER'];

    if (!['COMPLETO', 'ABONO', 'ANTICIPO'].includes(tipoPago)) {
      return res.status(400).json({ ok: false, msg: 'Tipo de pago inválido.' });
    }
    if (!['NOTA_VENTA', 'REMISION', 'RECIBO_PROVISIONAL'].includes(comprobante)) {
      return res.status(400).json({ ok: false, msg: 'Debes elegir un comprobante.' });
    }
    // Un Anticipo se documenta con Recibo Provisional, pero igual debe saber
    // a cuál de los dos reportes diarios de Cajas se suma (ver
    // buildReporteFacturasDiario / buildReporteRemisionesDiario).
    if (tipoPago === 'ANTICIPO' && !['NOTA_VENTA', 'REMISION'].includes(anticipoDestino)) {
      return res.status(400).json({ ok: false, msg: 'Selecciona a qué reporte (Factura o Remisión) aplica este anticipo.' });
    }
    // Un abono/anticipo siempre se documenta con Recibo Provisional; Nota de
    // Venta y Remisión son exclusivas de un pago Liquida (COMPLETO).
    if (['ABONO', 'ANTICIPO'].includes(tipoPago) && comprobante !== 'RECIBO_PROVISIONAL') {
      return res.status(400).json({ ok: false, msg: 'Un Abono o Anticipo se documenta con Recibo Provisional.' });
    }
    if (tipoPago === 'COMPLETO' && comprobante === 'RECIBO_PROVISIONAL') {
      return res.status(400).json({ ok: false, msg: 'Un pago de Remisión o Factura requiere Nota de Venta o Remisión.' });
    }

    // Cualquier cobro con tarjeta en Cajas debe registrar en qué terminal se
    // cobró, para que el Cierre de Caja del día cuadre por terminal.
    if (comprobante === 'NOTA_VENTA' && !banco) {
      return res.status(400).json({ ok: false, msg: 'Selecciona el banco / terminal de la Nota de Venta.' });
    }
    if (comprobante === 'RECIBO_PROVISIONAL' && ['CREDITO', 'DEBITO'].includes(formaPago) && !TERMINALES_TARJETA.includes(terminal)) {
      return res.status(400).json({ ok: false, msg: 'Selecciona la terminal donde se cobró la tarjeta.' });
    }
    if (
      comprobante === 'RECIBO_PROVISIONAL' &&
      formaPago === 'COMBINADO' &&
      ((Number(combinado?.credito) || 0) > 0 || (Number(combinado?.debito) || 0) > 0) &&
      !TERMINALES_TARJETA.includes(combinado?.banco)
    ) {
      return res.status(400).json({ ok: false, msg: 'Selecciona la terminal donde se cobró la parte con tarjeta del pago combinado.' });
    }

    const ordenExistente = await Vehiculo.findById(req.params.id).select('cliente garantia pagos.comprobante pagos.cancelado');
    if (!ordenExistente) return res.status(404).json({ ok: false, msg: 'Orden no encontrada' });
    if (ordenExistente.garantia) {
      return res.status(400).json({ ok: false, msg: 'No se puede registrar un pago para una orden de garantía.' });
    }
    clienteParaRevertirSaldo = ordenExistente.cliente;

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
    // se salda con abonos posteriores) — por lo mismo no admite saldo aplicado.
    const esRemisionCredito = comprobante === 'REMISION' && tipoRemision === 'Credito';
    // Un "Anticipo" no se abona a la orden: su dinero se guarda como saldo a
    // favor del cliente (ver más abajo). Por lo mismo no admite "usar saldo a
    // favor" (no tiene sentido consumir saldo para volver a depositarlo).
    const esAnticipoSaldo = tipoPago === 'ANTICIPO';
    const montoSaldo = esRemisionCredito || esAnticipoSaldo ? 0 : Number(montoSaldoAplicado) || 0;
    if (montoSaldo < 0) {
      return res.status(400).json({ ok: false, msg: 'El saldo aplicado no puede ser negativo.' });
    }
    if (esRemisionCredito && Number(montoSaldoAplicado) > 0) {
      return res.status(400).json({ ok: false, msg: 'Una Remisión a Crédito no recibe dinero: no se puede aplicar saldo.' });
    }
    const monto = esRemisionCredito
      ? 0
      : Number(montoPesos || 0) + Number(montoDolares || 0) * Number(tipoCambio || 0) + montoSaldo;
    if (monto <= 0 && !esRemisionCredito) {
      return res.status(400).json({ ok: false, msg: 'El monto del pago debe ser mayor a 0.' });
    }

    // Id pre-generado del pago: si se aplica saldo, el movimiento del ledger
    // (AnticipoCliente) necesita poder ligarse a este pago desde antes de que
    // exista en Vehiculo.pagos (el $push todavía no se ejecuta en este punto).
    const pagoId = new mongoose.Types.ObjectId();

    const pago = {
      _id: pagoId,
      fecha: new Date(),
      tipoPago,
      comprobante,
      ...(tipoPago === 'ANTICIPO' ? { anticipoDestino } : {}),
      ...(esAnticipoSaldo ? { aSaldoAFavor: true } : {}),
      montoPesos: esRemisionCredito ? 0 : Number(montoPesos) || 0,
      montoDolares: esRemisionCredito ? 0 : Number(montoDolares) || 0,
      tipoCambio: Number(tipoCambio) || 0,
      monto,
      referencia: esRemisionCredito ? '' : referencia,
      observaciones,
      notas,
      registradoPor: req.user?.name || req.user?.username || '',
    };

    // Aplicar el saldo del cliente ANTES de tocar Vehiculo.pagos: si no hay
    // saldo suficiente en este instante (condición de carrera con otro cobro
    // simultáneo), se corta aquí sin registrar nada. El backend nunca confía
    // en un "saldo disponible" que haya mandado el frontend — vuelve a
    // evaluarlo contra el valor real en la base de datos (ver aplicarUso).
    if (montoSaldo > 0) {
      // Con qué forma(s) de pago se depositó originalmente el saldo que se
      // está a punto de aplicar (para mostrarlo en el Recibo Provisional):
      // se calcula ANTES de aplicarUso, sobre el ledger tal como está antes
      // de este nuevo USO.
      const origenesSaldo = await calcularOrigenSaldo(ordenExistente.cliente, montoSaldo);
      try {
        const resultado = await aplicarUso(ordenExistente.cliente, montoSaldo, {
          ordenAplicada: req.params.id,
          pagoId,
          registradoPor: req.user?.name || req.user?.username || '',
          registradoPorId: req.user?._id || null,
        });
        movimientoSaldo = resultado.movimiento;
      } catch (errSaldo) {
        if (errSaldo instanceof SaldoInsuficienteError) {
          return res.status(400).json({
            ok: false,
            msg: `El cliente no tiene saldo suficiente. Saldo disponible: ${errSaldo.saldoDisponible}.`,
          });
        }
        throw errSaldo;
      }
      pago.saldoAplicado = { monto: montoSaldo, movimientoId: movimientoSaldo._id, origenes: origenesSaldo };
    }

    // Un "Anticipo" guarda su dinero como saldo a favor del cliente
    // (Cliente.saldoAFavor, movimiento AnticipoCliente tipo DEPOSITO), ligado a
    // esta orden. Se hace ANTES del $push para poder guardar el id del
    // movimiento en el pago y para que el .populate('cliente') de abajo traiga
    // el saldo ya actualizado. El pago igual queda registrado (Recibo
    // Provisional + reporte diario), solo que no cuenta como abonado de la
    // orden (ver pago.aSaldoAFavor / calcularTotalesOrden).
    if (esAnticipoSaldo) {
      const { movimiento } = await aplicarDeposito(ordenExistente.cliente, monto, {
        montoPesos: Number(montoPesos) || 0,
        montoDolares: Number(montoDolares) || 0,
        tipoCambio: Number(tipoCambio) || 0,
        formaPago: formaPago === 'COMBINADO' ? undefined : formaPago,
        chequeNumero: formaPago === 'CHEQUE' ? chequeNumero : '',
        banco: ['CREDITO', 'DEBITO'].includes(formaPago)
          ? terminal
          : formaPago === 'COMBINADO'
          ? combinado?.banco || ''
          : '',
        referencia,
        observaciones,
        registradoPor: req.user?.name || req.user?.username || '',
        registradoPorId: req.user?._id || null,
        ordenAplicada: req.params.id,
        pagoId,
      });
      movimientoDeposito = movimiento;
      pago.saldoAFavorMovimientoId = movimiento._id;
    }

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
      const combinadoMontos = formaPago === 'COMBINADO'
        ? {
            credito: Number(combinado?.credito) || 0,
            efectivo: Number(combinado?.efectivo) || 0,
            efectivoDolares: Number(combinado?.efectivoDolares) || 0,
            debito: Number(combinado?.debito) || 0,
            cheque: Number(combinado?.cheque) || 0,
            transferencia: Number(combinado?.transferencia) || 0,
            banco: combinado?.banco || '',
          }
        : null;
      pago.reciboProvisional = {
        numero: contadorProvisional.valor,
        formaPago,
        chequeNumero: (formaPago === 'CHEQUE' || combinadoMontos?.cheque > 0) ? chequeNumero : '',
        banco: ['CREDITO', 'DEBITO'].includes(formaPago) ? terminal : '',
        concepto: reciboConcepto,
        recibio: reciboRecibio,
        ...(combinadoMontos ? { combinado: combinadoMontos } : {}),
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
        // El saldo aplicado no es un movimiento bancario/de efectivo del día
        // (ese dinero ya se recibió antes, al depositar el anticipo): solo la
        // parte realmente cobrada hoy en este banco/terminal se registra en
        // el cierre de caja.
        await registrarMovimientoTerminal(banco, pago.monto - montoSaldo, pago.fecha);
      } catch (errTerminal) {
        console.error('Error actualizando terminal del cierre de caja:', errTerminal);
      }
    }

    // La parte de T. Crédito/T. Débito de un Recibo Provisional Combinado
    // también pasa por una terminal física y debe sumarse al Cierre de Caja,
    // igual que una Nota de Venta.
    const montoTarjetaCombinado = (Number(combinado?.credito) || 0) + (Number(combinado?.debito) || 0);
    if (comprobante === 'RECIBO_PROVISIONAL' && formaPago === 'COMBINADO' && montoTarjetaCombinado > 0 && combinado?.banco) {
      try {
        await registrarMovimientoTerminal(combinado.banco, montoTarjetaCombinado, pago.fecha);
      } catch (errTerminal) {
        console.error('Error actualizando terminal del cierre de caja (combinado):', errTerminal);
      }
    }

    // Recibo Provisional SIMPLE con tarjeta (incluye un Anticipo cobrado con
    // tarjeta): su monto en pesos también pasa por una terminal física y suma
    // al Cierre de Caja, igual que la Nota de Venta.
    if (comprobante === 'RECIBO_PROVISIONAL' && ['CREDITO', 'DEBITO'].includes(formaPago) && terminal) {
      try {
        await registrarMovimientoTerminal(terminal, Number(montoPesos) || 0, pago.fecha);
      } catch (errTerminal) {
        console.error('Error actualizando terminal del cierre de caja (recibo provisional tarjeta):', errTerminal);
      }
    }

    return res.status(201).json({ ok: true, vehiculo, totales: calcularTotalesOrden(vehiculo) });
  } catch (err) {
    console.error('Error registrando pago:', err);
    // Si ya se había deducido saldo del cliente (aplicarUso) pero el pago no
    // llegó a quedar registrado en la orden (falló algo después, p. ej. el
    // $push), hay que regresarle el saldo: si no, quedaría descontado sin
    // ningún pago real que lo respalde.
    if (movimientoSaldo && clienteParaRevertirSaldo) {
      try {
        await revertirUso(clienteParaRevertirSaldo, movimientoSaldo.monto, {
          ordenAplicada: req.params.id,
          pagoId: movimientoSaldo.pagoId,
          registradoPor: req.user?.name || req.user?.username || '',
          registradoPorId: req.user?._id || null,
        });
      } catch (errRevertir) {
        console.error('Error revirtiendo saldo tras fallo al registrar pago:', errRevertir);
      }
    }
    // Simétrico para el DEPOSITO de un "Anticipo": si el saldo a favor ya se
    // acreditó pero el pago no llegó a registrarse, se revierte el depósito.
    if (movimientoDeposito && clienteParaRevertirSaldo) {
      try {
        await cancelarDeposito(movimientoDeposito._id, 'Reversión automática: falló el registro del pago', req.user);
      } catch (errRevertir) {
        console.error('Error revirtiendo depósito de anticipo tras fallo al registrar pago:', errRevertir);
      }
    }
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// POST /api/cajas/:id/pagos/:pagoId/cancelar -> cancela un pago ya registrado
// (solo admin), EXCLUSIVAMENTE para corregir errores de captura (ver ticket
// RESTABLECER_COBRO en Soporte). Cancelar un anticipo/remisión porque la
// orden se facturó ya NO pasa por aquí: eso lo hace automáticamente
// generar_xml.js al generar la factura, enlazando el pago con
// pago.facturaId. Un pago cancelado por este endpoint deja facturaId en
// null a propósito, para que el Reporte de Facturas no lo confunda con una
// cancelación real por facturación. El pago no se borra (su folio ya se
// consumió y los reportes lo necesitan): queda marcado como cancelado y deja
// de contar como abonado. En las remisiones además se marca remision.tipo =
// 'Cancelada'.
router.post('/:id/pagos/:pagoId/cancelar', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { motivo = '' } = req.body || {};
    const motivoFinal = String(motivo).trim();
    if (!motivoFinal) {
      return res.status(400).json({ ok: false, msg: 'Captura el motivo de la cancelación.' });
    }

    const vehiculo = await Vehiculo.findById(req.params.id);
    if (!vehiculo) return res.status(404).json({ ok: false, msg: 'Orden no encontrada' });

    const pago = (vehiculo.pagos || []).id(req.params.pagoId);
    if (!pago) return res.status(404).json({ ok: false, msg: 'Pago no encontrado' });
    if (pago.cancelado) {
      return res.status(400).json({ ok: false, msg: 'Este pago ya está cancelado.' });
    }

    // Si este "Anticipo" se había guardado como saldo a favor del cliente, se
    // revierte ese depósito ANTES de tocar el pago: cancelarDeposito solo
    // procede (guarda atómica) si el cliente todavía tiene ese saldo
    // disponible — no se puede recuperar dinero que ya gastó en otra orden. Si
    // ya lo usó, se aborta sin cancelar el pago.
    if (pago.aSaldoAFavor && pago.saldoAFavorMovimientoId) {
      try {
        await cancelarDeposito(pago.saldoAFavorMovimientoId, motivoFinal, req.user);
      } catch (errDep) {
        if (errDep instanceof SaldoInsuficienteError) {
          return res.status(400).json({
            ok: false,
            msg: 'No se puede cancelar: el cliente ya usó parte o todo este saldo a favor en otra orden.',
          });
        }
        throw errDep;
      }
    }

    const esRemision = pago.comprobante === 'REMISION';

    // Datos del pago que se necesitan DESPUÉS para revertir movimientos de
    // terminal / saldo a favor: se leen del pago en memoria ANTES de escribir.
    const pagoComprobante = pago.comprobante;
    const pagoBanco = pago.notaVenta?.banco;
    const pagoMonto = pago.monto;
    const pagoFecha = pago.fecha;
    const pagoSaldoAplicado = pago.saldoAplicado?.monto > 0 ? Number(pago.saldoAplicado.monto) : 0;
    const pagoCombinado = pago.reciboProvisional?.combinado;
    const pagoMontoTarjetaCombinado = pagoCombinado
      ? (Number(pagoCombinado.credito) || 0) + (Number(pagoCombinado.debito) || 0)
      : 0;
    const pagoBancoCombinado = pagoCombinado?.banco;
    // Recibo Provisional SIMPLE con tarjeta: terminal a nivel reciboProvisional.
    const pagoReciboBanco = pago.reciboProvisional?.banco || '';
    const pagoMontoPesos = Number(pago.montoPesos) || 0;

    // Se marca cancelado con un $set puntual a esos campos, NO con
    // vehiculo.save(): un save() re-valida TODO el documento de la orden contra
    // el esquema actual, y en órdenes antiguas eso puede fallar por datos que
    // ya no cumplen validaciones nuevas (enums de banco/terminal, etc.) y que
    // nada tienen que ver con este pago. El alta de pagos ya usa este mismo
    // enfoque atómico ($push sin validators).
    const setCancelacion = {
      'pagos.$.cancelado': true,
      'pagos.$.canceladoEn': new Date(),
      'pagos.$.canceladoPor': req.user?.name || req.user?.username || '',
      'pagos.$.motivoCancelacion': motivoFinal,
      'pagos.$.notas': motivoFinal,
    };
    if (esRemision) setCancelacion['pagos.$.remision.tipo'] = 'Cancelada';

    const upd = await Vehiculo.updateOne(
      { _id: vehiculo._id, 'pagos._id': pago._id },
      { $set: setCancelacion }
    );
    if (!upd.matchedCount) return res.status(404).json({ ok: false, msg: 'Pago no encontrado' });

    // Documento ya actualizado, para sincronizar remisiones y para responder.
    const vehiculoActualizado = await Vehiculo.findById(vehiculo._id).populate('cliente', POPULATE_CLIENTE);

    // Al dejar de contar como abonado puede reaparecer saldo: las remisiones
    // vigentes de la orden vuelven a quedar sin Fecha de Pagada. Best-effort:
    // la cancelación ya quedó registrada aunque este ajuste falle.
    try {
      await sincronizarFechaPagadaRemisiones(vehiculoActualizado);
    } catch (errSync) {
      console.error('Error sincronizando Fecha de Pagada de remisiones al cancelar pago:', errSync);
    }

    // Si este pago había usado saldo a favor del cliente, se le regresa
    // ahora que el pago quedó cancelado (el dinero ya no cuenta como
    // aplicado a esta orden).
    if (pagoSaldoAplicado > 0) {
      try {
        await revertirUso(vehiculoActualizado.cliente?._id || vehiculoActualizado.cliente, pagoSaldoAplicado, {
          ordenAplicada: vehiculoActualizado._id,
          pagoId: pago._id,
          registradoPor: req.user?.name || req.user?.username || '',
          registradoPorId: req.user?._id || null,
        });
      } catch (errRevertir) {
        console.error('Error revirtiendo saldo al cancelar pago:', errRevertir);
      }
    }

    if (pagoComprobante === 'NOTA_VENTA') {
      try {
        // Simétrico al registro original: solo se revierte la parte que en
        // su momento sí se contó como movimiento bancario/de efectivo (el
        // saldo aplicado nunca se registró ahí, ver arriba).
        await registrarMovimientoTerminal(pagoBanco, -(pagoMonto - pagoSaldoAplicado), pagoFecha);
      } catch (errTerminal) {
        console.error('Error revirtiendo terminal del cierre de caja:', errTerminal);
      }
    }

    if (pagoComprobante === 'RECIBO_PROVISIONAL' && pagoMontoTarjetaCombinado > 0 && pagoBancoCombinado) {
      try {
        await registrarMovimientoTerminal(pagoBancoCombinado, -pagoMontoTarjetaCombinado, pagoFecha);
      } catch (errTerminal) {
        console.error('Error revirtiendo terminal del cierre de caja (combinado):', errTerminal);
      }
    }

    if (pagoComprobante === 'RECIBO_PROVISIONAL' && pagoReciboBanco && pagoMontoPesos > 0) {
      try {
        await registrarMovimientoTerminal(pagoReciboBanco, -pagoMontoPesos, pagoFecha);
      } catch (errTerminal) {
        console.error('Error revirtiendo terminal del cierre de caja (recibo provisional tarjeta):', errTerminal);
      }
    }

    return res.json({ ok: true, vehiculo: vehiculoActualizado, totales: calcularTotalesOrden(vehiculoActualizado) });
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

// PATCH /api/cajas/:id/pendiente-factura -> marca o desmarca la orden como
// pendiente de facturar (al cliente le faltan datos fiscales). Mientras esté
// marcada aparece en el apartado "Pendientes de Factura" de Cajas; se limpia
// sola al generar la factura real (ver generar_xml.js) o se puede desmarcar
// a mano con este mismo endpoint.
router.patch('/:id/pendiente-factura', proteger, async (req, res) => {
  try {
    const { pendienteFactura } = req.body || {};

    const vehiculo = await Vehiculo.findById(req.params.id);
    if (!vehiculo) return res.status(404).json({ ok: false, msg: 'Orden no encontrada' });

    vehiculo.pendienteFactura = !!pendienteFactura;
    vehiculo.pendienteFacturaEn = vehiculo.pendienteFactura ? new Date() : null;
    vehiculo.pendienteFacturaPor = vehiculo.pendienteFactura ? (req.user?.name || req.user?.username || '') : '';
    await vehiculo.save();
    await vehiculo.populate('cliente', POPULATE_CLIENTE);

    return res.json({ ok: true, vehiculo, totales: calcularTotalesOrden(vehiculo) });
  } catch (err) {
    console.error('Error actualizando pendiente de factura:', err);
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
