const mongoose = require('mongoose');
const FacturaCfdi = require('../models/FacturaCfdi');
const Vehiculo = require('../models/Vehiculo');

// Nota de crédito (CFDI de Egreso, relación 01) contra una Factura Global: es la vía del SAT
// (Opción A) para SACAR de la Global una nota de venta cuando el cliente pide su factura
// nominativa. La NC acredita el monto de esas notas y las "libera": la nota conserva su
// `facturaGlobalId` (si se limpiara, reaparecería en /notas-venta-pendientes y entraría en
// otra Global), pero queda marcada en `pago.facturaGlobalLiberada` y su orden ya se puede
// facturar a su cliente (ver ordenesEnFacturaGlobal).

const TOLERANCIA = 0.05; // la NC parte del subtotal con IVA redondeado a centavos
const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const folioDe = (f) => `${f?.serie || ''}${f?.folio || ''}`;

// Valida la NC contra la Factura Global y resuelve, DESDE LA BD (no de lo que manda la
// pantalla), las notas que libera: { global, notas: [{ vehiculoId, pagoId, ordenServicio,
// numero, monto }] } o { error }.
async function resolverNotasLiberadas({ relacionadas, notasLiberadas, totalNc }) {
  if (!Array.isArray(relacionadas) || relacionadas.length !== 1) {
    return { error: 'Una nota de crédito que libera notas de venta debe relacionar solo la Factura Global.' };
  }
  const globalId = relacionadas[0]?.facturaId;
  if (!mongoose.isValidObjectId(globalId)) return { error: 'Factura Global inválida.' };

  const global = await FacturaCfdi.findById(globalId).select('tipoFactura estatus serie folio notasVenta').lean();
  if (!global || global.tipoFactura !== 'facturaGlobal') {
    return { error: 'La factura relacionada no es una Factura Global.' };
  }
  if (global.estatus !== 'generada') return { error: 'La Factura Global relacionada está cancelada.' };

  const notas = [];
  const vistos = new Set();
  for (const pedida of notasLiberadas) {
    const numero = Number(pedida?.numero);
    const clave = `${pedida?.vehiculoId}_${numero}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);

    const enGlobal = (global.notasVenta || []).find(
      (n) => n.numero === numero && String(n.vehiculoId) === String(pedida?.vehiculoId)
    );
    if (!enGlobal) {
      return { error: `La nota de venta P${numero} no pertenece a la Factura Global ${folioDe(global)}.` };
    }

    const v = await Vehiculo.findById(enGlobal.vehiculoId).select('ordenServicio pagos').lean();
    const pago = (v?.pagos || []).find(
      (p) =>
        p.comprobante === 'NOTA_VENTA' &&
        !p.cancelado &&
        p.notaVenta?.numero === numero &&
        String(p.facturaGlobalId || '') === String(global._id)
    );
    if (!pago) return { error: `No se encontró la nota de venta P${numero} de esa Factura Global.` };
    if (pago.facturaGlobalLiberada?.notaCreditoId) {
      return { error: `La nota de venta P${numero} ya fue acreditada con otra nota de crédito.` };
    }

    notas.push({
      vehiculoId: enGlobal.vehiculoId,
      pagoId: pago._id,
      ordenServicio: enGlobal.ordenServicio || v?.ordenServicio || '',
      numero,
      monto: r2(enGlobal.monto),
    });
  }
  if (!notas.length) return { error: 'Elige al menos una nota de venta de la Factura Global.' };

  const suma = r2(notas.reduce((s, n) => s + n.monto, 0));
  if (Math.abs(suma - r2(totalNc)) > TOLERANCIA) {
    return {
      error: `El total de la nota de crédito ($${r2(totalNc).toFixed(2)}) debe ser igual a la suma de las notas de venta elegidas ($${suma.toFixed(2)}).`,
    };
  }
  return { global, notas };
}

// Marca cada nota como liberada de la Global por esta nota de crédito.
async function liberarNotasDeGlobal(notas, notaCreditoId, user = null) {
  for (const n of notas) {
    await Vehiculo.updateOne(
      { _id: n.vehiculoId },
      {
        $set: {
          'pagos.$[p].facturaGlobalLiberada': {
            notaCreditoId,
            en: new Date(),
            por: user?.name || user?.username || '',
          },
        },
      },
      { arrayFilters: [{ 'p._id': n.pagoId }] }
    );
  }
}

// Números de nota de venta de una Factura Global que ya se acreditaron con una NC.
async function numerosLiberadosDeGlobal(globalId) {
  const ncs = await FacturaCfdi.find({ tipoFactura: 'notaCredito', 'relacionadas.facturaId': globalId })
    .select('notasLiberadas.numero')
    .lean();
  return [...new Set(ncs.flatMap((nc) => (nc.notasLiberadas || []).map((n) => n.numero)))];
}

module.exports = { resolverNotasLiberadas, liberarNotasDeGlobal, numerosLiberadosDeGlobal };
