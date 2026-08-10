const CierreCaja = require('../models/CierreCaja');

// Solo los bancos que corresponden a una terminal física; DOLARES y
// EFECTIVOS (también valores válidos de `banco` en Nota de Venta) no suman
// aquí: dólares y efectivo se concilian a mano en Gestión de Caja.
const BANCO_A_TERMINAL = {
  'BBVA BANCOMER': 'bancomer',
  BANREGIO: 'banregio',
  BANAMEX: 'banamex',
  'AMERICAN EXPRESS': 'americanExpress',
  BANORTE: 'banorte',
};

// pago.fecha es un instante real (new Date() al momento del cobro); hay que
// ubicarlo en su día calendario LOCAL (el del taller, no UTC) para que un
// pago cobrado ya entrada la noche siga cayendo en el cierre de "hoy" y no en
// el de mañana. El servidor corre en la zona horaria del taller (ver
// timedatectl / Intl.DateTimeFormat().resolvedOptions().timeZone), así que
// los getters locales (getFullYear/getMonth/getDate) ya dan el día correcto;
// se etiqueta como medianoche UTC para que coincida con CierreCaja.fecha
// (misma convención que normalizarFecha en cierreCaja.js).
function fechaSoloDia(fecha) {
  const d = new Date(fecha);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

// Suma (o resta, si monto es negativo) el importe de un pago con terminal al
// CierreCaja del día correspondiente. No hace nada si el banco no mapea a una
// terminal, o si ese día ya quedó CERRADA (un cierre ya congelado no se toca).
// Nunca debe tumbar el flujo de pagos: quien la llama la envuelve en try/catch.
async function registrarMovimientoTerminal(banco, monto, fecha) {
  const key = BANCO_A_TERMINAL[banco];
  if (!key || !monto) return;

  const dia = fechaSoloDia(fecha);
  const existente = await CierreCaja.findOne({ fecha: dia }).select('estado');
  if (existente?.estado === 'CERRADA') return;

  await CierreCaja.findOneAndUpdate(
    { fecha: dia },
    { $inc: { [`terminales.${key}`]: monto }, $setOnInsert: { estado: 'ABIERTA' } },
    { upsert: true }
  );
}

module.exports = { registrarMovimientoTerminal, BANCO_A_TERMINAL };
