'use strict';

/**
 * Abreviatura corta del método de pago de Cajas, para la columna "Notas" de los
 * reportes diarios (Remisiones / Facturas) y para el nombre de la factura global
 * en el Reporte de Facturas.
 *
 * Reglas (acordadas con el cliente):
 *   - Tarjeta: <abrev. terminal>-<C|D>      ej. "BanRegio Crédito" -> "BR-C"
 *   - Tarjeta dividida en más de una (ver `tarjetas`/`tarjetasCredito`/
 *     `tarjetasDebito`): una abreviatura por terminal, unidas con "+"
 *     ej. "BR-C+BX-C"
 *   - Transferencia con tipo y banco capturados: <SPEI|TEF>-<abrev. banco>
 *     ej. "SPEI-BR". Sin esos datos (pagos viejos): texto completo "TRANSFERENCIA".
 *   - Efectivo / Cheque: texto completo
 *   - Combinado: cada componente presente, separado por "Y" (o comas si son
 *     más de dos), para que se lea claro que fue un pago combinado
 *     ej. "EFECTIVO Y BR-C", "EFECTIVO, BR-C Y SPEI-BX"
 *
 * Recibe el sub-objeto `pago.notaVenta` / `pago.reciboProvisional` /
 * `pago.liquidacion` (comparten forma: { formaPago, banco, tarjetas,
 * tipoTransferencia, bancoTransferencia, combinado }). Devuelve "" si no hay
 * datos utilizables.
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

// Igual que abrevTarjeta, pero para un cobro dividido en más de una tarjeta
// (ver models/Vehiculo.js `tarjetas`): una abreviatura por terminal, unidas
// con "+". Con una sola fila (o sin desglose) cae a abrevTarjeta(formaPago, banco).
function abrevTarjetaMulti(formaPago, tarjetas, banco) {
  if (Array.isArray(tarjetas) && tarjetas.length === 1) {
    return abrevTarjeta(formaPago, tarjetas[0].terminal);
  }
  if (Array.isArray(tarjetas) && tarjetas.length > 1) {
    return tarjetas.map((t) => abrevTarjeta(formaPago, t.terminal)).join(' + ');
  }
  return abrevTarjeta(formaPago, banco);
}

// Abreviatura de una parte pagada por transferencia: "<SPEI|TEF>-<banco>",
// ej. "SPEI-BR". Si falta el tipo o el banco (pagos viejos, previos a este
// catálogo) cae a "TRANSFERENCIA".
function abrevTransferencia(tipo, banco) {
  const t = String(tipo || '').trim().toUpperCase();
  const term = abrevTerminal(banco);
  if (t && term) return `${t}-${term}`;
  return 'TRANSFERENCIA';
}

// Une los métodos de un pago combinado como lista en español: "A Y B" para
// dos, "A, B Y C" para tres o más.
function joinMetodos(partes) {
  if (partes.length <= 1) return partes.join('');
  if (partes.length === 2) return partes.join(' Y ');
  return `${partes.slice(0, -1).join(', ')} Y ${partes[partes.length - 1]}`;
}

function abreviaturaCombinado(combinado) {
  const c = combinado || {};
  const n = (v) => Number(v) || 0;
  const partes = [];
  if (n(c.efectivo) || n(c.efectivoDolares)) partes.push('EFECTIVO');
  if (n(c.credito)) partes.push(abrevTarjetaMulti('CREDITO', c.tarjetasCredito, c.banco));
  if (n(c.debito)) partes.push(abrevTarjetaMulti('DEBITO', c.tarjetasDebito, c.banco));
  if (n(c.cheque)) partes.push('CHEQUE');
  if (n(c.transferencia)) partes.push(abrevTransferencia(c.transferenciaTipo, c.transferenciaBanco));
  return joinMetodos(partes);
}

function abreviaturaFormaPago(desc) {
  if (!desc || typeof desc !== 'object') return '';
  const forma = String(desc.formaPago || '').trim().toUpperCase();

  if (forma === 'COMBINADO') return abreviaturaCombinado(desc.combinado);
  if (forma === 'CREDITO' || forma === 'DEBITO') return abrevTarjetaMulti(forma, desc.tarjetas, desc.banco);
  if (forma === 'CHEQUE') return 'CHEQUE';
  if (forma === 'TRANSFERENCIA') return abrevTransferencia(desc.tipoTransferencia, desc.bancoTransferencia);
  if (forma === 'EFECTIVO' || forma === '') {
    // Notas de Venta viejas sin formaPago: si `banco` apunta a una terminal
    // real, en su momento se cobró con tarjeta (tipo desconocido).
    return abrevTerminal(desc.banco) || 'EFECTIVO';
  }
  return forma;
}

module.exports = { abreviaturaFormaPago, ABREV_TERMINAL, abrevTerminal };
