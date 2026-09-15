'use strict';

// Reversa / re-aplicación de los movimientos de terminal (Cierre de Caja) de un
// pago de Cajas. Extraído de routes/cajas.js para que el flujo de generación de
// factura (routes/generar_xml.js) cancele anticipos/remisiones con exactamente
// la misma mecánica que POST /api/cajas/:id/pagos/:pagoId/cancelar.
const { registrarMovimientoTerminal } = require('./cierreCajaTerminales');

// [{monto,terminal}] -> movimientos limpios (descarta filas sin terminal o
// con monto <= 0; puede pasar con filas a medio capturar en el front).
function movimientosDeTarjetas(tarjetas) {
  return (tarjetas || [])
    .filter((t) => t?.terminal && Number(t.monto) > 0)
    .map((t) => ({ terminal: t.terminal, monto: Number(t.monto) || 0 }));
}

// Lee del pago (ANTES de escribir) los movimientos de terminal que hay que
// revertir —o volver a aplicar— en el Cierre de Caja: uno por cada tarjeta
// física que participó en el cobro. Un pago puede combinar la parte de
// tarjeta simple (formaPago CREDITO/DEBITO) o la de un Combinado, cada una ya
// dividida en 1+ tarjetas (ver tarjetas/tarjetasCredito/tarjetasDebito en
// models/Vehiculo.js). `signo` = -1 al cancelar, +1 al deshacer la cancelación.
function datosMovimientosTerminal(pago) {
  const sub =
    pago.comprobante === 'NOTA_VENTA'
      ? pago.notaVenta
      : pago.comprobante === 'SIN_COMPROBANTE'
      ? pago.liquidacion
      : pago.comprobante === 'RECIBO_PROVISIONAL'
      ? pago.reciboProvisional
      : null;
  const combinado = sub?.combinado;
  const movimientos = [];

  if (combinado) {
    const montoTarjetaCombinado = (Number(combinado.credito) || 0) + (Number(combinado.debito) || 0);
    if (montoTarjetaCombinado > 0) {
      const desglose = [...(combinado.tarjetasCredito || []), ...(combinado.tarjetasDebito || [])];
      const limpio = movimientosDeTarjetas(desglose);
      if (limpio.length) {
        movimientos.push(...limpio);
      } else if (combinado.banco) {
        // Compatibilidad con pagos viejos: una sola terminal para toda la
        // parte de tarjeta del combinado.
        movimientos.push({ terminal: combinado.banco, monto: montoTarjetaCombinado });
      }
    }
  } else if (sub && ['CREDITO', 'DEBITO'].includes(sub.formaPago)) {
    const limpio = movimientosDeTarjetas(sub.tarjetas);
    if (limpio.length) {
      movimientos.push(...limpio);
    } else if (sub.banco) {
      // Compatibilidad con pagos viejos: una sola terminal para todo el pago.
      // La Nota de Venta descuenta el saldo a favor aplicado (no es dinero
      // que entró hoy a la terminal); Recibo Provisional/Liquidar usan el
      // monto en pesos tal cual, igual que al registrar el pago.
      const montoLegacy =
        pago.comprobante === 'NOTA_VENTA'
          ? (Number(pago.monto) || 0) - (Number(pago.saldoAplicado?.monto) || 0)
          : Number(pago.montoPesos) || 0;
      if (montoLegacy > 0) movimientos.push({ terminal: sub.banco, monto: montoLegacy });
    }
  }

  return { fecha: pago.fecha, movimientos };
}

// Aplica los movimientos de terminal de un pago con el signo dado (-1 revierte
// al cancelar, +1 los vuelve a poner al deshacer). Best-effort: nunca debe
// tumbar el flujo, cada movimiento va en su propio try/catch.
async function moverTerminalesDePago(d, signo) {
  const s = signo < 0 ? -1 : 1;
  for (const m of d.movimientos || []) {
    try {
      await registrarMovimientoTerminal(m.terminal, s * m.monto, d.fecha);
    } catch (e) {
      console.error('Error moviendo terminal:', e);
    }
  }
}

// Registra en el Cierre de Caja las tarjetas de un cobro recién dado de alta
// (ya limpias/validadas con limpiarYValidarTarjetas, ver utils/tarjetasCaja.js):
// una llamada a registrarMovimientoTerminal por tarjeta. Best-effort, igual
// que moverTerminalesDePago — nunca debe tumbar el alta del pago.
async function registrarMovimientosTarjetas(tarjetas, fecha) {
  for (const t of tarjetas || []) {
    try {
      await registrarMovimientoTerminal(t.terminal, t.monto, fecha);
    } catch (e) {
      console.error('Error actualizando terminal del cierre de caja (tarjeta):', e);
    }
  }
}

module.exports = { datosMovimientosTerminal, moverTerminalesDePago, registrarMovimientosTarjetas };
