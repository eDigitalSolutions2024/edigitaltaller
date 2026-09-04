'use strict';

// Catálogo de Cajas (FORMAS_PAGO_CAJA en models/Vehiculo.js) -> código SAT
// c_FormaPago del CFDI 4.0.
const CAJA_A_SAT_FORMA_PAGO = {
  EFECTIVO: '01',
  CHEQUE: '02',
  TRANSFERENCIA: '03',
  CREDITO: '04',
  DEBITO: '28',
};

/**
 * Código SAT c_FormaPago que corresponde al pago de una Nota de Venta de Cajas
 * (o Recibo Provisional: comparten la forma del sub-objeto). Para COMBINADO usa
 * el método con mayor monto; si no se puede determinar, devuelve "99".
 */
function formaPagoSatDeNotaVenta(notaVenta) {
  const nv = notaVenta || {};
  const forma = String(nv.formaPago || '').trim().toUpperCase();
  if (CAJA_A_SAT_FORMA_PAGO[forma]) return CAJA_A_SAT_FORMA_PAGO[forma];
  if (forma === 'COMBINADO' && nv.combinado) {
    const c = nv.combinado;
    const porCodigo = [
      ['01', (Number(c.efectivo) || 0) + (Number(c.efectivoDolares) || 0)],
      ['04', Number(c.credito) || 0],
      ['28', Number(c.debito) || 0],
      ['02', Number(c.cheque) || 0],
      ['03', Number(c.transferencia) || 0],
    ].sort((a, b) => b[1] - a[1]);
    return porCodigo[0][1] > 0 ? porCodigo[0][0] : '99';
  }
  return '99';
}

module.exports = { CAJA_A_SAT_FORMA_PAGO, formaPagoSatDeNotaVenta };
