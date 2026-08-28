// backend/utils/anticiposCliente.js
// Único punto por el que se debe mutar Cliente.saldoAFavor. Ninguna ruta debe
// leer el saldo y luego hacer un `save()` separado para restarlo: eso abre
// una condición de carrera (dos cajeros gastando el mismo saldo a la vez).
// En vez de eso, cada operación que resta saldo usa un solo
// `findOneAndUpdate` con guarda `{ saldoAFavor: { $gte: monto } }` — una
// operación atómica de un solo documento en MongoDB, sin necesitar
// transacciones multi-documento (que requerirían un replica set).
const Cliente = require('../models/Cliente');
const AnticipoCliente = require('../models/AnticipoCliente');

class SaldoInsuficienteError extends Error {
  constructor(saldoDisponible) {
    super('Saldo insuficiente.');
    this.name = 'SaldoInsuficienteError';
    this.saldoDisponible = saldoDisponible;
  }
}

// Redondea a centavos y valida que sea un número finito positivo, para
// evitar NaN/Infinity/negativos inyectados y arrastre de error de punto
// flotante antes de cualquier operación sobre el saldo.
function montoValido(valor) {
  const n = Math.round((Number(valor) || 0) * 100) / 100;
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

// Depositar siempre es válido (no hay guarda de saldo mínimo).
async function aplicarDeposito(clienteId, monto, meta = {}) {
  const montoDeposito = montoValido(monto);
  if (!montoDeposito) throw new Error('El monto del depósito debe ser mayor a 0.');

  const clienteAntes = await Cliente.findById(clienteId).select('saldoAFavor');
  if (!clienteAntes) throw new Error('Cliente no encontrado.');

  const cliente = await Cliente.findByIdAndUpdate(
    clienteId,
    { $inc: { saldoAFavor: montoDeposito } },
    { new: true }
  );

  const movimiento = await AnticipoCliente.create({
    cliente: clienteId,
    tipo: 'DEPOSITO',
    monto: montoDeposito,
    saldoAnterior: clienteAntes.saldoAFavor || 0,
    saldoNuevo: cliente.saldoAFavor,
    fecha: new Date(),
    montoPesos: meta.montoPesos || 0,
    montoDolares: meta.montoDolares || 0,
    tipoCambio: meta.tipoCambio || 0,
    formaPago: meta.formaPago,
    chequeNumero: meta.chequeNumero || '',
    banco: meta.banco || '',
    folioRecibo: meta.folioRecibo,
    referencia: meta.referencia || '',
    observaciones: meta.observaciones || '',
    registradoPor: meta.registradoPor || '',
    registradoPorId: meta.registradoPorId || null,
    // Trazabilidad cuando el depósito nació de un "Anticipo" de caja
    // (POST /api/cajas/:id/pagos con tipoPago ANTICIPO): queda ligado a la
    // orden y al pago que lo originó, aunque el dinero sea saldo a favor.
    ordenAplicada: meta.ordenAplicada || null,
    pagoId: meta.pagoId || null,
  });

  return { cliente, movimiento };
}

// Descuento atómico y con guarda: si el cliente no tiene saldo suficiente en
// el momento exacto de la operación, `findOneAndUpdate` no devuelve nada y se
// lanza SaldoInsuficienteError sin haber tocado el saldo. El backend nunca
// confía en un "saldo disponible" que haya mandado el frontend: siempre
// vuelve a evaluar esta guarda contra el valor real en la base de datos.
async function aplicarUso(clienteId, monto, meta = {}) {
  const montoUso = montoValido(monto);
  if (!montoUso) throw new Error('El monto de saldo a aplicar debe ser mayor a 0.');

  const cliente = await Cliente.findOneAndUpdate(
    { _id: clienteId, saldoAFavor: { $gte: montoUso } },
    { $inc: { saldoAFavor: -montoUso } },
    { new: true }
  );

  if (!cliente) {
    const actual = await Cliente.findById(clienteId).select('saldoAFavor');
    throw new SaldoInsuficienteError(actual?.saldoAFavor || 0);
  }

  const movimiento = await AnticipoCliente.create({
    cliente: clienteId,
    tipo: 'USO',
    monto: montoUso,
    saldoAnterior: cliente.saldoAFavor + montoUso,
    saldoNuevo: cliente.saldoAFavor,
    fecha: new Date(),
    ordenAplicada: meta.ordenAplicada || null,
    pagoId: meta.pagoId || null,
    registradoPor: meta.registradoPor || '',
    registradoPorId: meta.registradoPorId || null,
  });

  return { cliente, movimiento };
}

// Reembolsa al cliente un uso de saldo previamente aplicado (p. ej. se
// canceló el pago de caja que lo consumió). Siempre válido: regresar dinero
// nunca puede dejar el saldo negativo.
async function revertirUso(clienteId, monto, meta = {}) {
  const montoReembolso = montoValido(monto);
  if (!montoReembolso) throw new Error('El monto a reembolsar debe ser mayor a 0.');

  const clienteAntes = await Cliente.findById(clienteId).select('saldoAFavor');
  if (!clienteAntes) throw new Error('Cliente no encontrado.');

  const cliente = await Cliente.findByIdAndUpdate(
    clienteId,
    { $inc: { saldoAFavor: montoReembolso } },
    { new: true }
  );

  const movimiento = await AnticipoCliente.create({
    cliente: clienteId,
    tipo: 'REEMBOLSO_USO',
    monto: montoReembolso,
    saldoAnterior: clienteAntes.saldoAFavor || 0,
    saldoNuevo: cliente.saldoAFavor,
    fecha: new Date(),
    ordenAplicada: meta.ordenAplicada || null,
    pagoId: meta.pagoId || null,
    registradoPor: meta.registradoPor || '',
    registradoPorId: meta.registradoPorId || null,
  });

  return { cliente, movimiento };
}

// Cliente.saldoAFavor es una sola bolsa (no hay lotes por depósito), así que
// un USO no queda ligado a un depósito específico. Para poder mostrar en un
// recibo "de qué forma de pago viene" el saldo que se está aplicando ahora,
// se reconstruye una cola FIFO a partir del historial de AnticipoCliente:
// los depósitos entran a la cola en el orden en que se hicieron, y cada USO
// pasado ya consumió de los más antiguos primero. Un REEMBOLSO_USO no sabe
// de qué depósito salió el uso que se revierte, así que el dinero regresa al
// frente de la cola (se gasta primero) con forma de pago desconocida
// (formaPago null) en vez de inventar un origen. Devuelve el desglose por
// forma de pago del monto que se está a punto de aplicar en este momento
// (ANTES de registrar ese nuevo USO).
async function calcularOrigenSaldo(clienteId, monto) {
  const montoTotal = montoValido(monto);
  if (!montoTotal) return [];

  const movimientos = await AnticipoCliente.find({ cliente: clienteId })
    .sort({ fecha: 1, _id: 1 })
    .select('tipo monto formaPago cancelado')
    .lean();

  const lotes = []; // { formaPago, restante }, más antiguo primero
  for (const m of movimientos) {
    if (m.tipo === 'DEPOSITO') {
      if (m.cancelado) continue;
      lotes.push({ formaPago: m.formaPago || null, restante: m.monto });
    } else if (m.tipo === 'USO') {
      let pendiente = m.monto;
      while (pendiente > 0 && lotes.length) {
        const lote = lotes[0];
        const consumido = Math.min(lote.restante, pendiente);
        lote.restante -= consumido;
        pendiente -= consumido;
        if (lote.restante <= 0) lotes.shift();
      }
    } else if (m.tipo === 'REEMBOLSO_USO') {
      lotes.unshift({ formaPago: null, restante: m.monto });
    }
  }

  // Consume el monto que se va a aplicar AHORA de la cola ya reconstruida,
  // agrupando por forma de pago.
  let pendiente = montoTotal;
  const porForma = new Map();
  while (pendiente > 0 && lotes.length) {
    const lote = lotes[0];
    const consumido = Math.min(lote.restante, pendiente);
    porForma.set(lote.formaPago, (porForma.get(lote.formaPago) || 0) + consumido);
    lote.restante -= consumido;
    pendiente -= consumido;
    if (lote.restante <= 0) lotes.shift();
  }
  // Si el ledger no alcanza a cubrir montoTotal (no debería pasar si está
  // sano: aplicarUso ya garantiza que Cliente.saldoAFavor alcanza), el
  // faltante se etiqueta como origen desconocido en vez de perderlo.
  if (pendiente > 0.005) porForma.set(null, (porForma.get(null) || 0) + pendiente);

  return [...porForma.entries()].map(([formaPago, montoOrigen]) => ({
    formaPago,
    monto: Math.round(montoOrigen * 100) / 100,
  }));
}

// Cancela un DEPOSITO ya registrado (corrección de captura por admin). Usa la
// misma guarda atómica que aplicarUso: solo se puede cancelar si el cliente
// todavía tiene disponible el monto completo de ese depósito — no se puede
// recuperar dinero que el cliente ya gastó en otra orden. El movimiento
// original no se borra ni se reduce: se marca `cancelado` (deja de contar
// como saldo disponible en el historial), igual que un pago cancelado en
// Vehiculo.pagos.
async function cancelarDeposito(movimientoId, motivo, user) {
  const movimiento = await AnticipoCliente.findById(movimientoId);
  if (!movimiento) throw new Error('Movimiento no encontrado.');
  if (movimiento.tipo !== 'DEPOSITO') throw new Error('Solo se puede cancelar un depósito.');
  if (movimiento.cancelado) throw new Error('Este depósito ya está cancelado.');

  const cliente = await Cliente.findOneAndUpdate(
    { _id: movimiento.cliente, saldoAFavor: { $gte: movimiento.monto } },
    { $inc: { saldoAFavor: -movimiento.monto } },
    { new: true }
  );

  if (!cliente) {
    const actual = await Cliente.findById(movimiento.cliente).select('saldoAFavor');
    const err = new SaldoInsuficienteError(actual?.saldoAFavor || 0);
    err.message = `No se puede cancelar: el cliente ya usó parte de este saldo. Saldo actual: ${actual?.saldoAFavor || 0}, se requieren ${movimiento.monto}.`;
    throw err;
  }

  movimiento.cancelado = true;
  movimiento.canceladoEn = new Date();
  movimiento.canceladoPor = user?.name || user?.username || '';
  movimiento.motivoCancelacion = motivo;
  await movimiento.save();

  return { cliente, movimiento };
}

module.exports = {
  SaldoInsuficienteError,
  montoValido,
  aplicarDeposito,
  aplicarUso,
  revertirUso,
  cancelarDeposito,
  calcularOrigenSaldo,
};
