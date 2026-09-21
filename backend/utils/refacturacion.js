const mongoose = require('mongoose');
const FacturaCfdi = require('../models/FacturaCfdi');
const Vehiculo = require('../models/Vehiculo');

// Refacturación (SAT): una orden puede tener más de una factura de ingreso si la
// anterior se sustituye (TipoRelacion 04) o se cancela. El sistema NO timbra ni
// cancela ante el SAT (eso se hace fuera, en el PAC/portal del SAT): aquí solo se
// REGISTRA la cancelación para que deje de contar en reportes y en los guards.

const MOTIVOS_CANCELACION = ['01', '02', '03', '04'];

const folioDe = (f) => `${f?.serie || ''}${f?.folio || ''}`;

// Ids (string) de las órdenes que cubre una factura (principal + lista).
function vehiculoIdsDeFactura(f) {
  const ids = new Set();
  if (f?.orden?.vehiculoId) ids.add(String(f.orden.vehiculoId));
  for (const o of f?.ordenes || []) if (o?.vehiculoId) ids.add(String(o.vehiculoId));
  return ids;
}

// Facturas de ingreso previas de un conjunto de órdenes, separadas por estatus.
// `vigentes` = las que hay que sustituir para volver a facturar; `canceladas` =
// las ya canceladas, cuyo cobro registrado en Cajas hereda la factura nueva.
async function facturasPreviasDeOrdenes(vehiculoIds) {
  if (!Array.isArray(vehiculoIds) || !vehiculoIds.length) return { vigentes: [], canceladas: [] };
  const docs = await FacturaCfdi.find({
    tipoFactura: 'factura',
    $or: [{ 'orden.vehiculoId': { $in: vehiculoIds } }, { 'ordenes.vehiculoId': { $in: vehiculoIds } }],
  })
    .select('serie folio fecha estatus orden ordenes totales cancelacion')
    .sort({ fecha: 1 })
    .lean();
  return {
    vigentes: docs.filter((d) => d.estatus === 'generada'),
    canceladas: docs.filter((d) => d.estatus === 'cancelada'),
  };
}

// Ids (string) de, entre estas órdenes, las que tienen pagos de Cajas ligados
// (pago.facturaId) a alguna de esas facturas: solo ahí hay un cobro que heredar; una
// orden cuya factura anterior no traía pagos ligados sí necesita capturar el cobro.
async function vehiculoIdsConCobroHeredable(vehiculoIds, facturaIds) {
  if (!vehiculoIds?.length || !facturaIds?.length) return new Set();
  const oid = (v) => new mongoose.Types.ObjectId(String(v));
  const docs = await Vehiculo.find({
    _id: { $in: vehiculoIds.map(oid) },
    'pagos.facturaId': { $in: facturaIds.map(oid) },
  })
    .select('_id')
    .lean();
  return new Set(docs.map((d) => String(d._id)));
}

// Marca una factura como cancelada (solo si sigue 'generada': atómico, así dos
// peticiones a la vez no la cancelan dos veces). `sustituta` = la factura nueva
// (motivo 01). Devuelve el documento actualizado o null si ya estaba cancelada.
async function registrarCancelacionFactura(facturaId, { motivo, sustituta = null, nota = '', user = null } = {}) {
  return FacturaCfdi.findOneAndUpdate(
    { _id: facturaId, estatus: 'generada' },
    {
      $set: {
        estatus: 'cancelada',
        cancelacion: {
          motivo,
          fecha: new Date(),
          canceladoPor: user?.name || user?.username || '',
          canceladoPorId: user?._id || null,
          sustituidaPorId: sustituta?._id || null,
          sustituidaPorFolio: sustituta ? folioDe(sustituta) : '',
          nota: String(nota || '').trim(),
        },
      },
    },
    { new: true }
  );
}

// Los pagos de Cajas ligados a las facturas anteriores (anticipos/remisiones
// cancelados al facturar, Liquidar) pasan a apuntar a la factura nueva: el
// dinero ya se cobró, la refactura solo lo hereda (no se vuelve a capturar).
async function reasignarPagosDeFacturas(vehiculoIds, facturaIdsAnteriores, nuevaFacturaId) {
  if (!vehiculoIds?.length || !facturaIdsAnteriores?.length) return;
  const oid = (v) => new mongoose.Types.ObjectId(String(v));
  await Vehiculo.updateMany(
    { _id: { $in: vehiculoIds.map(oid) } },
    { $set: { 'pagos.$[p].facturaId': oid(nuevaFacturaId) } },
    { arrayFilters: [{ 'p.facturaId': { $in: facturaIdsAnteriores.map(oid) } }] }
  );
}

module.exports = {
  MOTIVOS_CANCELACION,
  folioDe,
  vehiculoIdsDeFactura,
  facturasPreviasDeOrdenes,
  vehiculoIdsConCobroHeredable,
  registrarCancelacionFactura,
  reasignarPagosDeFacturas,
};
