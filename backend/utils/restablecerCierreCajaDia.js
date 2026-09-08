const CierreCaja = require('../models/CierreCaja');

// Reabre una SESIÓN de caja ya cerrada: vuelve a ABIERTA (editable desde
// Gestión de Caja) conservando todo lo capturado (billetes, monedas, vales,
// terminales, etc.) — solo cambia el estado. Solo puede haber UNA sesión
// abierta a la vez: si ya hay otra abierta, se rechaza.
async function restablecerSesionCaja(cierreId, usuario) {
  const cierre = await CierreCaja.findById(cierreId);
  if (!cierre) {
    const err = new Error('No se encontró esa sesión de caja.');
    err.status = 404;
    throw err;
  }
  if (cierre.estado !== 'CERRADA') {
    const err = new Error('Esa sesión de caja no está cerrada.');
    err.status = 400;
    throw err;
  }

  const yaAbierta = await CierreCaja.findOne({ estado: 'ABIERTA' }).select('_id');
  if (yaAbierta) {
    const err = new Error('Ya hay una caja abierta. Ciérrala antes de restablecer una sesión anterior.');
    err.status = 409;
    throw err;
  }

  cierre.estado = 'ABIERTA';
  cierre.cerradoEn = null;
  cierre.restablecidoEn = new Date();
  cierre.restablecidoPor = usuario || '';
  await cierre.save();

  return cierre;
}

// Compat: el ticket RESTABLECER_CAJA viejo guarda un día (fechaCierreCaja). Se
// resuelve a la sesión CERRADA que abrió o cerró ese día calendario.
async function restablecerCierreCajaDia(fecha, usuario) {
  const d = new Date(fecha);
  const finDia = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, -1);
  const iniDia = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

  const cierre = await CierreCaja.findOne({
    estado: 'CERRADA',
    $or: [
      { fecha: d },
      { abiertaEn: { $gte: iniDia, $lte: finDia } },
      { cerradoEn: { $gte: iniDia, $lte: finDia } },
    ],
  }).sort({ cerradoEn: -1 });

  if (!cierre) {
    const err = new Error('No hay una sesión de caja cerrada para esa fecha.');
    err.status = 404;
    throw err;
  }
  return restablecerSesionCaja(cierre._id, usuario);
}

module.exports = { restablecerSesionCaja, restablecerCierreCajaDia };
