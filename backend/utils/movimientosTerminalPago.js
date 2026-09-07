'use strict';

// Reversa / re-aplicación de los movimientos de terminal (Cierre de Caja) de un
// pago de Cajas. Extraído de routes/cajas.js para que el flujo de generación de
// factura (routes/generar_xml.js) cancele anticipos/remisiones con exactamente
// la misma mecánica que POST /api/cajas/:id/pagos/:pagoId/cancelar.
const { registrarMovimientoTerminal } = require('./cierreCajaTerminales');

// Lee del pago (ANTES de escribir) lo necesario para revertir —o volver a
// aplicar— sus movimientos de terminal del Cierre de Caja. `signo` = -1 al
// cancelar, +1 al deshacer la cancelación.
function datosMovimientosTerminal(pago) {
  const combinado =
    pago.comprobante === 'NOTA_VENTA' ? pago.notaVenta?.combinado : pago.reciboProvisional?.combinado;
  const montoTarjetaCombinado = combinado
    ? (Number(combinado.credito) || 0) + (Number(combinado.debito) || 0)
    : 0;
  return {
    comprobante: pago.comprobante,
    bancoNota: pago.notaVenta?.banco,
    monto: pago.monto,
    fecha: pago.fecha,
    saldoAplicado: pago.saldoAplicado?.monto > 0 ? Number(pago.saldoAplicado.monto) : 0,
    montoTarjetaCombinado,
    bancoCombinado: combinado?.banco,
    reciboBanco: pago.reciboProvisional?.banco || '',
    montoPesos: Number(pago.montoPesos) || 0,
  };
}

// Aplica los movimientos de terminal de un pago con el signo dado (-1 revierte
// al cancelar, +1 los vuelve a poner al deshacer). Best-effort: nunca debe
// tumbar el flujo, cada llamada va en su try/catch como en el resto del archivo.
async function moverTerminalesDePago(d, signo) {
  const s = signo < 0 ? -1 : 1;
  if (d.comprobante === 'NOTA_VENTA' && d.montoTarjetaCombinado <= 0) {
    try {
      await registrarMovimientoTerminal(d.bancoNota, s * (d.monto - d.saldoAplicado), d.fecha);
    } catch (e) {
      console.error('Error moviendo terminal (nota de venta):', e);
    }
  }
  if (['RECIBO_PROVISIONAL', 'NOTA_VENTA'].includes(d.comprobante) && d.montoTarjetaCombinado > 0 && d.bancoCombinado) {
    try {
      await registrarMovimientoTerminal(d.bancoCombinado, s * d.montoTarjetaCombinado, d.fecha);
    } catch (e) {
      console.error('Error moviendo terminal (combinado):', e);
    }
  }
  if (d.comprobante === 'RECIBO_PROVISIONAL' && d.reciboBanco && d.montoPesos > 0) {
    try {
      await registrarMovimientoTerminal(d.reciboBanco, s * d.montoPesos, d.fecha);
    } catch (e) {
      console.error('Error moviendo terminal (recibo provisional tarjeta):', e);
    }
  }
}

module.exports = { datosMovimientosTerminal, moverTerminalesDePago };
