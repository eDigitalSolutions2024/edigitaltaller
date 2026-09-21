const Contador = require('../models/Contador');

// Ajuste global de Configuración: ¿el sistema exige el UUID (folio fiscal) real al relacionar
// facturas (nota de crédito, complemento de pago, "facturas relacionadas" de una factura)?
//
// El sistema NO timbra: el UUID se captura a mano. Mientras las facturas no se timbren, un
// administrador puede desactivar la exigencia (solo para pruebas, antes de subir a producción):
// el XML se genera igual y, donde falte el UUID, lleva uno en ceros. Se guarda como un Contador
// (mismo patrón que el fondo de caja): valor 1 = se exige (default), 0 = no se exige.
const EXIGIR_UUID_CONTADOR = 'exigirUuidFacturas';

async function exigirUuidActivo() {
  const c = await Contador.findOne({ nombre: EXIGIR_UUID_CONTADOR }).select('valor').lean();
  return c ? Number(c.valor) !== 0 : true;
}

module.exports = { EXIGIR_UUID_CONTADOR, exigirUuidActivo };
