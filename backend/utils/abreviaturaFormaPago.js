'use strict';

/**
 * Abreviatura corta del método de pago de Cajas, para la columna "Notas" de los
 * reportes diarios (Remisiones / Facturas) y para el nombre de la factura global
 * en el Reporte de Facturas.
 *
 * Reglas (acordadas con el cliente):
 *   - Tarjeta: <abrev. terminal>-<C|D>      ej. "BanRegio Crédito" -> "BR-C"
 *   - Efectivo / Cheque / Transferencia: texto completo
 *   - Combinado: cada componente presente, unido con "+"   ej. "EFECTIVO+BR-C"
 *
 * Recibe el sub-objeto `pago.notaVenta` o `pago.reciboProvisional` (comparten
 * forma: { formaPago, banco, combinado }). Devuelve "" si no hay datos
 * utilizables.
 */

// Nombre de terminal (BANCOS_CAJA / TERMINALES_TARJETA_CAJA en
// models/Vehiculo.js) -> abreviatura de 2 letras.
const ABREV_TERMINAL = {
  BANREGIO: 'BR',
  'BBVA BANCOMER': 'BB',
  BANAMEX: 'BX',
  BANORTE: 'BN',
  'AMERICAN EXPRESS': 'AE',
};

const SUFIJO_TARJETA = { CREDITO: 'C', DEBITO: 'D' };

function abrevTerminal(banco) {
  const key = String(banco || '').trim().toUpperCase();
  return ABREV_TERMINAL[key] || '';
}

// Abreviatura de una parte pagada con tarjeta: "<terminal>-<C|D>", o "TC"/"TD"
// si la terminal no se conoce.
function abrevTarjeta(formaPago, banco) {
  const suf = SUFIJO_TARJETA[String(formaPago || '').trim().toUpperCase()] || '';
  const term = abrevTerminal(banco);
  if (term && suf) return `${term}-${suf}`;
  if (suf) return `T${suf}`;
  return term || 'TARJETA';
}

function abreviaturaCombinado(combinado) {
  const c = combinado || {};
  const n = (v) => Number(v) || 0;
  const partes = [];
  if (n(c.efectivo) || n(c.efectivoDolares)) partes.push('EFECTIVO');
  if (n(c.credito)) partes.push(abrevTarjeta('CREDITO', c.banco));
  if (n(c.debito)) partes.push(abrevTarjeta('DEBITO', c.banco));
  if (n(c.cheque)) partes.push('CHEQUE');
  if (n(c.transferencia)) partes.push('TRANSFERENCIA');
  return partes.join('+');
}

function abreviaturaFormaPago(desc) {
  if (!desc || typeof desc !== 'object') return '';
  const forma = String(desc.formaPago || '').trim().toUpperCase();

  if (forma === 'COMBINADO') return abreviaturaCombinado(desc.combinado);
  if (forma === 'CREDITO' || forma === 'DEBITO') return abrevTarjeta(forma, desc.banco);
  if (forma === 'CHEQUE') return 'CHEQUE';
  if (forma === 'TRANSFERENCIA') return 'TRANSFERENCIA';
  if (forma === 'EFECTIVO' || forma === '') {
    // Notas de Venta viejas sin formaPago: si `banco` apunta a una terminal
    // real, en su momento se cobró con tarjeta (tipo desconocido).
    return abrevTerminal(desc.banco) || 'EFECTIVO';
  }
  return forma;
}

module.exports = { abreviaturaFormaPago, ABREV_TERMINAL, abrevTerminal };
