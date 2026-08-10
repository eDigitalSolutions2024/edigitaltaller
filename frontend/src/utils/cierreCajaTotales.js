// Espejo de backend/utils/cierreCajaTotales.js — se usa tanto en la captura
// (Gestión de Caja, para mostrar totales en vivo mientras se escribe) como en
// la vista de solo lectura (Reportes > Cierre de Caja).
export const TERMINALES = [
  { key: 'bancomer', label: 'Terminal Bancomer' },
  { key: 'banregio', label: 'Terminal Banregio' },
  { key: 'banamex', label: 'Terminal Banamex' },
  { key: 'americanExpress', label: 'Terminal A. Express' },
  { key: 'banorte', label: 'Terminal Banorte' },
  { key: 'cheques', label: 'Cheques' },
  { key: 'transferencias', label: 'Transferencias' },
];

// Bancos con fuente automática (se suman solos al registrar un pago con Nota
// de Venta); el resto (cheques, transferencias) se sigue capturando a mano
// porque no hay ningún pago del que derivarlos.
export const TERMINALES_AUTOMATICAS = ['bancomer', 'banregio', 'banamex', 'americanExpress', 'banorte'];

export function calcularTotalesCierre(cierre) {
  const totalBilletes = (cierre.billetes || []).reduce(
    (s, b) => s + Number(b.denominacion || 0) * (Number(b.cantidad) || 0),
    0
  );
  const totalMonedas = (cierre.monedas || []).reduce(
    (s, m) => s + Number(m.denominacion || 0) * (Number(m.cantidad) || 0),
    0
  );
  const terminales = cierre.terminales || {};
  const totalTerminales = TERMINALES.reduce((s, t) => s + (Number(terminales[t.key]) || 0), 0);
  const totalDolares = (Number(cierre.dolares?.cantidad) || 0) * (Number(cierre.dolares?.tipoCambio) || 0);
  const totalVales = (cierre.vales || []).reduce((s, v) => s + (Number(v.monto) || 0), 0);
  const totalCobrado = totalBilletes + totalMonedas + totalTerminales + totalDolares;
  const totalReportes = Number(cierre.totalReportes) || 0;
  const fondoCaja = Number(cierre.fondoCaja) || 0;
  const diferencia = totalCobrado - totalReportes - fondoCaja;
  return { totalBilletes, totalMonedas, totalTerminales, totalDolares, totalVales, totalCobrado, diferencia };
}
