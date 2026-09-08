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

// Instante -> medianoche UTC de su día calendario LOCAL (convención de
// CierreCaja.fecha / normalizarFecha). El servidor corre en la zona horaria
// del taller, así que los getters locales ya dan el día correcto.
function fechaSoloDia(fecha) {
  const d = new Date(fecha);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

// Inicio de la sesión de caja actual: el `cerradoEn` de la última sesión
// CERRADA. Si nunca se ha cerrado una, la medianoche local de hoy.
async function inicioSesionActual() {
  const ultima = await CierreCaja.findOne({ estado: 'CERRADA' })
    .sort({ cerradoEn: -1 })
    .select('cerradoEn')
    .lean();
  if (ultima?.cerradoEn) return new Date(ultima.cerradoEn);
  const ahora = new Date();
  return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0, 0, 0);
}

// La sesión de caja ABIERTA (una a la vez). Si no hay ninguna y `crear` es
// true, la crea arrancando en el fin de la sesión anterior (así la sesión
// cubre TODO lo cobrado desde el último cierre, aunque cruce la medianoche).
async function sesionCajaAbierta({ crear = false } = {}) {
  let sesion = await CierreCaja.findOne({ estado: 'ABIERTA' }).sort({ abiertaEn: -1 });
  if (sesion || !crear) return sesion;

  const abiertaEn = await inicioSesionActual();
  try {
    sesion = await CierreCaja.create({
      fecha: fechaSoloDia(new Date()),
      abiertaEn,
      estado: 'ABIERTA',
    });
  } catch (err) {
    // Carrera: otro request creó la sesión primero. Se relee.
    sesion = await CierreCaja.findOne({ estado: 'ABIERTA' }).sort({ abiertaEn: -1 });
    if (!sesion) throw err;
  }
  return sesion;
}

// Suma (o resta, si monto es negativo) el importe de un pago con terminal a la
// SESIÓN de caja abierta (no a un día concreto: la caja acumula todo hasta que
// se cierra a mano). `fecha` ya no enruta nada, se conserva por firma.
// Nunca debe tumbar el flujo de pagos: quien la llama la envuelve en try/catch.
async function registrarMovimientoTerminal(banco, monto, fecha) {
  const key = BANCO_A_TERMINAL[banco];
  if (!key || !monto) return;

  // Solo un cobro real (monto > 0) abre una sesión de caja. Una reversa
  // (monto < 0, cancelación) cuando no hay caja abierta no debe crear una.
  const sesion = await sesionCajaAbierta({ crear: monto > 0 });
  if (!sesion || sesion.estado === 'CERRADA') return;

  await CierreCaja.updateOne(
    { _id: sesion._id, estado: 'ABIERTA' },
    { $inc: { [`terminales.${key}`]: monto } }
  );
}

module.exports = {
  registrarMovimientoTerminal,
  BANCO_A_TERMINAL,
  sesionCajaAbierta,
  inicioSesionActual,
  fechaSoloDia,
};
