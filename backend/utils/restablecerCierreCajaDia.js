const CierreCaja = require('../models/CierreCaja');

// Reabre un día ya cerrado: vuelve a ABIERTA (editable desde Gestión de Caja
// otra vez) conservando todo lo ya capturado (billetes, monedas, vales,
// terminales, etc.) — solo cambia el estado. La usan tanto el botón directo
// de admin (POST /reportes/cierre-caja/restablecer) como la aprobación de un
// ticket RESTABLECER_CAJA (PUT /tickets/:id/resolver-restablecer-caja).
async function restablecerCierreCajaDia(fecha, usuario) {
  const cierre = await CierreCaja.findOne({ fecha });
  if (!cierre) {
    const err = new Error('No hay un cierre de caja guardado para esta fecha.');
    err.status = 404;
    throw err;
  }
  if (cierre.estado !== 'CERRADA') {
    const err = new Error('La caja de este día no está cerrada.');
    err.status = 400;
    throw err;
  }

  cierre.estado = 'ABIERTA';
  cierre.restablecidoEn = new Date();
  cierre.restablecidoPor = usuario || '';
  await cierre.save();

  return cierre;
}

module.exports = { restablecerCierreCajaDia };
