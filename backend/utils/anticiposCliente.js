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
// Requerido solo por sincronizarAnticiposAplicados (abajo). Vehiculo.js no
// importa nada de este archivo, así que no hay ciclo.
const Vehiculo = require('../models/Vehiculo');
const { calcularTotalesOrden } = require('./cajaTotales');

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

  // El movimiento se arma y se valida ANTES de tocar Cliente.saldoAFavor: si
  // el payload es inválido (enum, folio duplicado, etc.), esto lanza aquí sin
  // haber incrementado el saldo. De lo contrario un $inc + create fallido deja
  // saldo a favor "fantasma" sin respaldo en el ledger, y el llamador no puede
  // revertirlo porque nunca recibió el movimiento.
  const movimiento = new AnticipoCliente({
    cliente: clienteId,
    tipo: 'DEPOSITO',
    monto: montoDeposito,
    saldoAnterior: clienteAntes.saldoAFavor || 0,
    saldoNuevo: (clienteAntes.saldoAFavor || 0) + montoDeposito,
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
  await movimiento.validate();

  const cliente = await Cliente.findByIdAndUpdate(
    clienteId,
    { $inc: { saldoAFavor: montoDeposito } },
    { new: true }
  );

  // El saldo real (con movimientos concurrentes) es el que devolvió el $inc
  // atómico, no la estimación de arriba.
  movimiento.saldoAnterior = cliente.saldoAFavor - montoDeposito;
  movimiento.saldoNuevo = cliente.saldoAFavor;

  try {
    await movimiento.save();
  } catch (err) {
    // El $inc ya se aplicó pero el movimiento no quedó guardado: se revierte
    // el saldo para no dejarlo inflado sin respaldo en el ledger.
    await Cliente.findByIdAndUpdate(clienteId, { $inc: { saldoAFavor: -montoDeposito } });
    throw err;
  }

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

// Convierte en "abonado" el saldo a favor que generó un Anticipo de ESTA
// MISMA orden, en cuanto la orden ya tiene precio (Total de la Orden > 0):
// el cajero no tiene que acordarse de aplicar "saldo a favor" a mano en
// Registrar Pago para que el anticipo cuente en Total Abonado (ver POST
// /api/cajas/:id/pagos en cajas.js, sección "Un Anticipo no se abona a la
// orden..."). Se llama desde GET /api/cajas/:id, justo antes de calcular los
// totales que ve la pantalla de la orden.
//
// Por cada pago tipoPago=ANTICIPO sin cancelar que sigue con aSaldoAFavor
// (o sea: todavía no se aplicó), se intenta un aplicarUso por el monto
// completo de ese anticipo — el mismo helper atómico que usa un cajero al
// marcar "Usar saldo a favor del cliente" a mano. Si el cliente ya gastó ese
// saldo en otra orden mientras tanto (SaldoInsuficienteError), se deja tal
// cual: sigue disponible para aplicarse manualmente o la próxima vez que
// alcance saldo. Si se aplica, el pago pasa a contar como abonado
// (aSaldoAFavor=false) y guarda saldoAplicado igual que un pago manual con
// saldo, para que cancelarlo después (POST /:id/pagos/:pagoId/cancelar) lo
// revierta con el mismo camino (revertirUso) que cualquier otro pago.
//
// Esta función se llama desde un GET (varias pestañas pueden abrir la misma
// orden casi al mismo tiempo), así que por cada pago primero se hace un
// "reclamo" atómico (aSaldoAFavor: true -> false condicionado a que siga en
// true) antes de tocar el saldo del cliente: solo la petición que gana ese
// $set sigue adelante y llama aplicarUso; las demás simplemente lo saltan.
// Si aplicarUso falla después de ganar el reclamo, se revierte el flag para
// no dejar el pago marcado como aplicado sin haber consumido saldo real.
async function sincronizarAnticiposAplicados(vehiculo) {
  const { totalOrden } = calcularTotalesOrden(vehiculo);
  if (!(totalOrden > 0)) return vehiculo;

  const clienteId = vehiculo.cliente?._id || vehiculo.cliente;
  if (!clienteId) return vehiculo;

  const pendientes = (vehiculo.pagos || []).filter(
    (p) => p.tipoPago === 'ANTICIPO' && p.aSaldoAFavor && !p.cancelado
  );
  if (!pendientes.length) return vehiculo;

  for (const pago of pendientes) {
    const reclamo = await Vehiculo.updateOne(
      {
        _id: vehiculo._id,
        pagos: { $elemMatch: { _id: pago._id, aSaldoAFavor: true, cancelado: { $ne: true } } },
      },
      { $set: { 'pagos.$.aSaldoAFavor': false } }
    );
    if (!reclamo.modifiedCount) continue; // otra petición ya lo está procesando (o ya se procesó)

    try {
      // Desglose FIFO ANTES de aplicarUso (mismo orden que POST /:id/pagos).
      const origenes = await calcularOrigenSaldo(clienteId, pago.monto);
      const { movimiento } = await aplicarUso(clienteId, pago.monto, {
        ordenAplicada: vehiculo._id,
        pagoId: pago._id,
        registradoPor: 'Sistema (anticipo aplicado al tener precio la orden)',
        registradoPorId: null,
      });

      // $set puntual sobre el subdocumento, sin vehiculo.save(): igual que en
      // POST /:id/pagos/:pagoId/cancelar, un save() revalida TODO el
      // documento contra el esquema actual y en órdenes antiguas puede
      // tronar por datos que no tienen nada que ver con este ajuste.
      const saldoAplicado = { monto: pago.monto, movimientoId: movimiento._id, origenes };
      await Vehiculo.updateOne(
        { _id: vehiculo._id, 'pagos._id': pago._id },
        { $set: { 'pagos.$.saldoAplicado': saldoAplicado } }
      );

      // Refleja el cambio también en el documento en memoria, para que el
      // llamador (GET /:id) calcule los totales ya actualizados sin tener
      // que releer de la base de datos.
      pago.aSaldoAFavor = false;
      pago.saldoAplicado = saldoAplicado;
    } catch (err) {
      // No se pudo consumir el saldo real (p. ej. el cliente ya lo gastó en
      // otra orden): se libera el reclamo para poder reintentar después.
      await Vehiculo.updateOne(
        { _id: vehiculo._id, 'pagos._id': pago._id },
        { $set: { 'pagos.$.aSaldoAFavor': true } }
      );
      if (!(err instanceof SaldoInsuficienteError)) {
        console.error('Error auto-aplicando anticipo a la orden:', err);
      }
    }
  }

  return vehiculo;
}

module.exports = {
  SaldoInsuficienteError,
  montoValido,
  aplicarDeposito,
  aplicarUso,
  revertirUso,
  cancelarDeposito,
  calcularOrigenSaldo,
  sincronizarAnticiposAplicados,
};
