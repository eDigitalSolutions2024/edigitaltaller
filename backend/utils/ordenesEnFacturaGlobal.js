const Vehiculo = require('../models/Vehiculo');
const FacturaCfdi = require('../models/FacturaCfdi');

// Órdenes cuya Nota de Venta vigente ya se agrupó en una Factura Global vigente
// (pago.facturaGlobalId -> FacturaCfdi tipoFactura 'facturaGlobal', estatus
// 'generada'): esa venta ya quedó facturada al público en general, así que la
// orden no debe poder facturarse otra vez a su cliente. Una Factura Global
// cancelada (estatus distinto de 'generada') ya no cuenta, aunque las notas
// sigan marcadas con su id.
//
// Devuelve Map<vehiculoId (string), folio de la Factura Global ("SERIE" + "FOLIO")>.
// `vehiculoIds` (opcional) limita la consulta a esas órdenes; sin él revisa todas.
async function ordenesEnFacturaGlobal(vehiculoIds = null) {
  const resultado = new Map();

  const globales = await FacturaCfdi.find({ tipoFactura: 'facturaGlobal', estatus: 'generada' })
    .select('serie folio')
    .lean();
  if (!globales.length) return resultado;

  const folioPorId = new Map(globales.map((f) => [String(f._id), `${f.serie || ''}${f.folio || ''}`]));

  const filtro = {
    pagos: {
      $elemMatch: {
        comprobante: 'NOTA_VENTA',
        cancelado: { $ne: true },
        facturaGlobalId: { $in: globales.map((f) => f._id) },
      },
    },
  };
  if (vehiculoIds) filtro._id = { $in: vehiculoIds };

  const vehiculos = await Vehiculo.find(filtro).select('pagos').lean();
  for (const v of vehiculos) {
    const pago = (v.pagos || []).find(
      (p) =>
        p.comprobante === 'NOTA_VENTA' &&
        !p.cancelado &&
        p.facturaGlobalId &&
        folioPorId.has(String(p.facturaGlobalId))
    );
    if (pago) resultado.set(String(v._id), folioPorId.get(String(pago.facturaGlobalId)));
  }
  return resultado;
}

module.exports = { ordenesEnFacturaGlobal };
