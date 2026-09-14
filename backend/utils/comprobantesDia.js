const Vehiculo = require('../models/Vehiculo');
const ValeSalida = require('../models/ValeSalida');
const FacturaCfdi = require('../models/FacturaCfdi');
const { limitesDiaLocal } = require('./totalIngresosDia');

const POPULATE_CLIENTE = 'nombre apellidoPaterno apellidoMaterno tipoCliente empresa gobierno';

const FOLIO_POR_TIPO = {
  NOTA_VENTA: (p) => p.notaVenta?.numero ?? null,
  REMISION: (p) => p.remision?.numero ?? null,
  RECIBO_PROVISIONAL: (p) => p.reciboProvisional?.numero ?? null,
  // SIN_COMPROBANTE ("Liquidar") no genera folio propio.
  SIN_COMPROBANTE: () => null,
};

const LABEL_POR_TIPO = {
  NOTA_VENTA: 'Nota de Venta',
  REMISION: 'Remisión',
  RECIBO_PROVISIONAL: 'Recibo Provisional',
  SIN_COMPROBANTE: 'Sin comprobante',
};

function nombreCliente(cliente) {
  if (!cliente) return '';
  if (cliente.tipoCliente === 'Particular') {
    return [cliente.nombre, cliente.apellidoPaterno, cliente.apellidoMaterno].filter(Boolean).join(' ');
  }
  return cliente.empresa?.razonSocial || cliente.gobierno?.nombreGobierno || cliente.nombre || '';
}

// Lista (no solo suma) de Notas de Venta, Remisiones, Recibos Provisionales y
// pagos "Liquidar" (SIN_COMPROBANTE) generados en el día — para el resumen de
// Gestión de Caja / Cierre de Caja. Mismo filtro $elemMatch + refiltro en JS
// que utils/totalIngresosDia.js.
function listarComprobantesDia(fecha) {
  const { desde, hasta } = limitesDiaLocal(fecha);
  return listarComprobantesRango(desde, hasta);
}

async function listarComprobantesRango(desdeRaw, hastaRaw) {
  const desde = new Date(desdeRaw);
  const hasta = new Date(hastaRaw);
  const tipos = Object.keys(FOLIO_POR_TIPO);

  const ordenes = await Vehiculo.find({
    pagos: { $elemMatch: { comprobante: { $in: tipos }, fecha: { $gte: desde, $lte: hasta } } },
  })
    .select('ordenServicio cliente pagos')
    .populate('cliente', POPULATE_CLIENTE)
    .lean();

  const pagosDelRango = [];
  for (const orden of ordenes) {
    for (const pago of orden.pagos || []) {
      if (pago.cancelado) continue;
      if (!tipos.includes(pago.comprobante)) continue;
      const f = new Date(pago.fecha);
      if (f < desde || f > hasta) continue;
      pagosDelRango.push({ orden, pago });
    }
  }

  // "Sin comprobante" (Liquidar) creado automáticamente desde el menú Factura
  // (una orden sin anticipo/remisión vigente que se facturó directo — ver
  // crearPagosSinComprobante en generar_xml.js) queda ligado a esa factura en
  // pago.facturaId. Ahí se muestra como "Factura" + su folio, no "Sin
  // comprobante", para saber de dónde salió el cobro.
  const facturaIds = [
    ...new Set(
      pagosDelRango
        .filter(({ pago }) => pago.comprobante === 'SIN_COMPROBANTE' && pago.facturaId)
        .map(({ pago }) => String(pago.facturaId))
    ),
  ];
  const folioPorFacturaId = new Map();
  if (facturaIds.length) {
    const facturas = await FacturaCfdi.find({ _id: { $in: facturaIds } }).select('serie folio').lean();
    for (const f of facturas) folioPorFacturaId.set(String(f._id), `${f.serie || ''}${f.folio || ''}`);
  }

  const filas = pagosDelRango.map(({ orden, pago }) => {
    const folioFactura =
      pago.comprobante === 'SIN_COMPROBANTE' && pago.facturaId
        ? folioPorFacturaId.get(String(pago.facturaId))
        : null;
    return {
      tipo: folioFactura ? 'FACTURA' : pago.comprobante,
      tipoLabel: folioFactura ? 'Factura' : LABEL_POR_TIPO[pago.comprobante],
      folio: folioFactura || FOLIO_POR_TIPO[pago.comprobante](pago),
      fecha: pago.fecha,
      ordenServicio: orden.ordenServicio,
      vehiculoId: orden._id,
      pagoId: pago._id,
      cliente: nombreCliente(orden.cliente),
      monto: pago.monto || 0,
      registradoPor: pago.registradoPor || '',
    };
  });
  filas.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  return filas;
}

// Vales de salida emitidos el día — mismo campo/patrón de filtro que
// GET /api/vales (backend/routes/vales.js).
function listarValesSalidaDia(fecha) {
  const { desde, hasta } = limitesDiaLocal(fecha);
  return listarValesSalidaRango(desde, hasta);
}

async function listarValesSalidaRango(desdeRaw, hastaRaw) {
  return ValeSalida.find({ fecha: { $gte: new Date(desdeRaw), $lte: new Date(hastaRaw) } })
    .select('noVale noOrden nombreCliente estatus cajero asesor fecha')
    .sort({ fecha: 1 })
    .lean();
}

module.exports = {
  listarComprobantesDia,
  listarValesSalidaDia,
  listarComprobantesRango,
  listarValesSalidaRango,
};
