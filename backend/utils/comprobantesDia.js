const Vehiculo = require('../models/Vehiculo');
const ValeSalida = require('../models/ValeSalida');
const { limitesDiaLocal } = require('./totalIngresosDia');

const POPULATE_CLIENTE = 'nombre apellidoPaterno apellidoMaterno tipoCliente empresa gobierno';

const FOLIO_POR_TIPO = {
  NOTA_VENTA: (p) => p.notaVenta?.numero ?? null,
  REMISION: (p) => p.remision?.numero ?? null,
  RECIBO_PROVISIONAL: (p) => p.reciboProvisional?.numero ?? null,
};

const LABEL_POR_TIPO = {
  NOTA_VENTA: 'Nota de Venta',
  REMISION: 'Remisión',
  RECIBO_PROVISIONAL: 'Recibo Provisional',
};

function nombreCliente(cliente) {
  if (!cliente) return '';
  if (cliente.tipoCliente === 'Particular') {
    return [cliente.nombre, cliente.apellidoPaterno, cliente.apellidoMaterno].filter(Boolean).join(' ');
  }
  return cliente.empresa?.razonSocial || cliente.gobierno?.nombreGobierno || cliente.nombre || '';
}

// Lista (no solo suma) de Notas de Venta, Remisiones y Recibos Provisionales
// generados en el día — para el resumen de Gestión de Caja / Cierre de Caja.
// Mismo filtro $elemMatch + refiltro en JS que utils/totalIngresosDia.js.
async function listarComprobantesDia(fecha) {
  const { desde, hasta } = limitesDiaLocal(fecha);
  const tipos = Object.keys(FOLIO_POR_TIPO);

  const ordenes = await Vehiculo.find({
    pagos: { $elemMatch: { comprobante: { $in: tipos }, fecha: { $gte: desde, $lte: hasta } } },
  })
    .select('ordenServicio cliente pagos')
    .populate('cliente', POPULATE_CLIENTE)
    .lean();

  const filas = [];
  for (const orden of ordenes) {
    for (const pago of orden.pagos || []) {
      if (pago.cancelado) continue;
      if (!tipos.includes(pago.comprobante)) continue;
      const f = new Date(pago.fecha);
      if (f < desde || f > hasta) continue;
      filas.push({
        tipo: pago.comprobante,
        tipoLabel: LABEL_POR_TIPO[pago.comprobante],
        folio: FOLIO_POR_TIPO[pago.comprobante](pago),
        fecha: pago.fecha,
        ordenServicio: orden.ordenServicio,
        vehiculoId: orden._id,
        pagoId: pago._id,
        cliente: nombreCliente(orden.cliente),
        monto: pago.monto || 0,
        registradoPor: pago.registradoPor || '',
      });
    }
  }
  filas.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  return filas;
}

// Vales de salida emitidos el día — mismo campo/patrón de filtro que
// GET /api/vales (backend/routes/vales.js).
async function listarValesSalidaDia(fecha) {
  const { desde, hasta } = limitesDiaLocal(fecha);
  return ValeSalida.find({ fecha: { $gte: desde, $lte: hasta } })
    .select('noVale noOrden nombreCliente estatus cajero asesor fecha')
    .sort({ fecha: 1 })
    .lean();
}

module.exports = { listarComprobantesDia, listarValesSalidaDia };
