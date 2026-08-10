const TERMINALES_KEYS = [
  'bancomer',
  'banregio',
  'banamex',
  'americanExpress',
  'banorte',
  'cheques',
  'transferencias',
];

// Únicas terminales sin fuente automática (ningún pago las alimenta): las
// demás se suman solas desde registrarMovimientoTerminal y no deben aceptar
// sobreescritura por el formulario de captura (ver POST / en cierreCaja.js).
const TERMINALES_MANUALES = ['cheques', 'transferencias'];

// Espejo de cajaTotales.js: los totales del cierre nunca se persisten, siempre
// se recalculan a partir de los conteos/capturas guardadas.
function calcularTotalesCierre(cierre) {
  const totalBilletes = (cierre.billetes || []).reduce(
    (s, b) => s + Number(b.denominacion || 0) * Number(b.cantidad || 0),
    0
  );
  const totalMonedas = (cierre.monedas || []).reduce(
    (s, m) => s + Number(m.denominacion || 0) * Number(m.cantidad || 0),
    0
  );

  const terminales = cierre.terminales || {};
  const totalTerminales = TERMINALES_KEYS.reduce((s, k) => s + Number(terminales[k] || 0), 0);

  const totalDolares = Number(cierre.dolares?.cantidad || 0) * Number(cierre.dolares?.tipoCambio || 0);

  const totalVales = (cierre.vales || []).reduce((s, v) => s + Number(v.monto || 0), 0);

  // Total Cobrado = todo lo contado físicamente. Los vales quedan fuera de esta
  // suma y de la diferencia: su efecto en el corte es una regla de negocio que
  // todavía no se define (ver conversación de origen de esta función).
  const totalCobrado = totalBilletes + totalMonedas + totalTerminales + totalDolares;

  const totalReportes = Number(cierre.totalReportes || 0);
  const fondoCaja = Number(cierre.fondoCaja || 0);
  const diferencia = totalCobrado - totalReportes - fondoCaja;

  return {
    totalBilletes,
    totalMonedas,
    totalTerminales,
    totalDolares,
    totalVales,
    totalCobrado,
    diferencia,
  };
}

module.exports = { calcularTotalesCierre, TERMINALES_KEYS, TERMINALES_MANUALES };
