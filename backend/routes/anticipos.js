// backend/routes/anticipos.js
// Anticipos de clientes (saldo a favor): depositar dinero por adelantado sin
// ligarlo a una orden, y consultar/cancelar esos depósitos. El "uso" del
// saldo para pagar una orden vive en backend/routes/cajas.js (POST
// /:id/pagos), que llama a los mismos helpers atómicos de
// utils/anticiposCliente.js.
const express = require('express');
const router = express.Router();

const Cliente = require('../models/Cliente');
const AnticipoCliente = require('../models/AnticipoCliente');
const Contador = require('../models/Contador');
const { proteger, requiereRol } = require('../middleware/auth');
const { aplicarDeposito, cancelarDeposito, montoValido, SaldoInsuficienteError } = require('../utils/anticiposCliente');
const { registrarMovimientoTerminal } = require('../utils/cierreCajaTerminales');
const { generarAnticipoReciboPDF } = require('../service/anticipoReciboPdf');

const CONTADOR_RECIBO_ANTICIPO = 'reciboAnticipo';
const FORMAS_PAGO = ['EFECTIVO', 'CREDITO', 'DEBITO', 'CHEQUE', 'TRANSFERENCIA'];
const TERMINALES_TARJETA = ['BANREGIO', 'AMERICAN EXPRESS', 'BANAMEX', 'BANORTE', 'BBVA BANCOMER'];

// POST /api/anticipos -> registra un depósito de anticipo para un cliente.
// Mismo criterio de autorización que registrar un pago de caja (POST
// /api/cajas/:id/pagos): cualquier usuario autenticado puede registrarlo; la
// UI ya está restringida al módulo Cajas por rol (ver frontend/src/utils/roles.js).
router.post('/', proteger, async (req, res) => {
  try {
    const {
      clienteId,
      montoPesos = 0,
      montoDolares = 0,
      tipoCambio = 0,
      formaPago = 'EFECTIVO',
      chequeNumero = '',
      banco = '',
      referencia = '',
      observaciones = '',
    } = req.body || {};

    if (!clienteId) {
      return res.status(400).json({ ok: false, msg: 'Falta el cliente.' });
    }
    if (!FORMAS_PAGO.includes(formaPago)) {
      return res.status(400).json({ ok: false, msg: 'Forma de pago inválida.' });
    }
    // Cualquier cobro con tarjeta en Cajas debe registrar en qué terminal se
    // cobró, para que el Cierre de Caja del día cuadre por terminal.
    if (['CREDITO', 'DEBITO'].includes(formaPago) && !TERMINALES_TARJETA.includes(banco)) {
      return res.status(400).json({ ok: false, msg: 'Selecciona la terminal donde se cobró la tarjeta.' });
    }

    const cliente = await Cliente.findById(clienteId);
    if (!cliente) return res.status(404).json({ ok: false, msg: 'Cliente no encontrado.' });

    const monto = Number(montoPesos || 0) + Number(montoDolares || 0) * Number(tipoCambio || 0);
    if (!montoValido(monto)) {
      return res.status(400).json({ ok: false, msg: 'Captura una cantidad en pesos o en dólares mayor a 0.' });
    }
    if (Number(montoDolares) > 0 && !Number(tipoCambio)) {
      return res.status(400).json({ ok: false, msg: 'No hay un tipo de cambio configurado.' });
    }

    const contador = await Contador.findOneAndUpdate(
      { nombre: CONTADOR_RECIBO_ANTICIPO },
      { $inc: { valor: 1 } },
      { new: true, upsert: true }
    );

    const { cliente: clienteActualizado, movimiento } = await aplicarDeposito(clienteId, monto, {
      montoPesos: Number(montoPesos) || 0,
      montoDolares: Number(montoDolares) || 0,
      tipoCambio: Number(tipoCambio) || 0,
      formaPago,
      chequeNumero: formaPago === 'CHEQUE' ? chequeNumero : '',
      banco: ['CREDITO', 'DEBITO'].includes(formaPago) ? banco : '',
      folioRecibo: contador.valor,
      referencia,
      observaciones,
      registradoPor: req.user?.name || req.user?.username || '',
      registradoPorId: req.user?._id || null,
    });

    // La parte cobrada con tarjeta pasa por una terminal física: suma al
    // Cierre de Caja del día, igual que en routes/cajas.js. No debe tumbar el
    // registro del anticipo si falla.
    if (['CREDITO', 'DEBITO'].includes(formaPago)) {
      try {
        await registrarMovimientoTerminal(banco, Number(montoPesos) || 0, movimiento.fecha);
      } catch (errTerminal) {
        console.error('Error actualizando terminal del cierre de caja (anticipo):', errTerminal);
      }
    }

    return res.status(201).json({ ok: true, cliente: clienteActualizado, movimiento });
  } catch (err) {
    console.error('Error registrando anticipo:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/anticipos/clientes -> lista operativa de clientes con saldo a
// favor disponible (>0), para mostrarla de entrada en la pantalla de Cajas.
// A diferencia del Reporte de Clientes con Anticipos (routes/reportes.js,
// restringido a admin/finanzas), este endpoint solo requiere sesión, igual
// que el resto de /api/anticipos: cualquier rol con acceso al módulo Cajas
// (ver frontend/src/utils/roles.js) debe poder verlo para saber a quién
// aplicarle saldo.
router.get('/clientes', proteger, async (req, res) => {
  try {
    const clientes = await Cliente.find({ saldoAFavor: { $gt: 0 } })
      .sort({ saldoAFavor: -1 })
      .select('nombre apellidoPaterno apellidoMaterno tipoCliente empresa gobierno telefonos celulares saldoAFavor updatedAt');

    return res.json({ ok: true, data: clientes });
  } catch (err) {
    console.error('Error listando clientes con saldo disponible:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/anticipos/cliente/:clienteId -> historial de movimientos de saldo
// de un cliente (depósitos, usos y reembolsos), más recientes primero.
router.get('/cliente/:clienteId', proteger, async (req, res) => {
  try {
    const cliente = await Cliente.findById(req.params.clienteId).select('saldoAFavor nombre apellidoPaterno apellidoMaterno tipoCliente empresa gobierno');
    if (!cliente) return res.status(404).json({ ok: false, msg: 'Cliente no encontrado.' });

    const movimientos = await AnticipoCliente.find({ cliente: req.params.clienteId })
      .sort({ fecha: -1 })
      .populate('ordenAplicada', 'ordenServicio');

    return res.json({ ok: true, cliente, movimientos });
  } catch (err) {
    console.error('Error consultando historial de anticipos:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// POST /api/anticipos/:id/cancelar -> cancela un depósito (solo admin, para
// corregir errores de captura). Solo procede si el cliente todavía tiene
// disponible el monto completo del depósito (ver cancelarDeposito).
router.post('/:id/cancelar', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { motivo = '' } = req.body || {};
    const motivoFinal = String(motivo).trim();
    if (!motivoFinal) {
      return res.status(400).json({ ok: false, msg: 'Captura el motivo de la cancelación.' });
    }

    const { cliente, movimiento } = await cancelarDeposito(req.params.id, motivoFinal, req.user);

    // Simétrico al registro: si el depósito se cobró con tarjeta, se resta esa
    // cantidad de la terminal en el Cierre de Caja de su día.
    if (['CREDITO', 'DEBITO'].includes(movimiento.formaPago) && movimiento.banco) {
      try {
        await registrarMovimientoTerminal(movimiento.banco, -(Number(movimiento.montoPesos) || 0), movimiento.fecha);
      } catch (errTerminal) {
        console.error('Error revirtiendo terminal del cierre de caja (cancelar anticipo):', errTerminal);
      }
    }

    return res.json({ ok: true, cliente, movimiento });
  } catch (err) {
    if (err instanceof SaldoInsuficienteError) {
      return res.status(400).json({ ok: false, msg: err.message });
    }
    if (err.message === 'Movimiento no encontrado.') {
      return res.status(404).json({ ok: false, msg: err.message });
    }
    if (err.message === 'Solo se puede cancelar un depósito.' || err.message === 'Este depósito ya está cancelado.') {
      return res.status(400).json({ ok: false, msg: err.message });
    }
    console.error('Error cancelando anticipo:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/anticipos/:id/recibo-pdf -> SIN proteger: se abre con
// window.open()/en un <iframe>, ese request no puede llevar el header
// Authorization (mismo criterio que los *-pdf de routes/cajas.js).
router.get('/:id/recibo-pdf', async (req, res) => {
  try {
    const movimiento = await AnticipoCliente.findById(req.params.id);
    if (!movimiento || movimiento.tipo !== 'DEPOSITO') {
      return res.status(404).json({ ok: false, msg: 'Recibo de anticipo no encontrado.' });
    }
    const cliente = await Cliente.findById(movimiento.cliente);
    if (!cliente) return res.status(404).json({ ok: false, msg: 'Cliente no encontrado.' });

    await generarAnticipoReciboPDF(res, movimiento, cliente);
  } catch (err) {
    console.error('Error generando PDF de Recibo de Anticipo:', err);
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, msg: 'Error al generar el PDF del Recibo de Anticipo' });
    }
  }
});

module.exports = router;
