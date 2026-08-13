const Vehiculo = require('../models/Vehiculo');

const COMPROBANTES_INGRESO = ['NOTA_VENTA', 'REMISION', 'RECIBO_PROVISIONAL'];

// `fecha` llega como medianoche UTC que etiqueta un día calendario LOCAL
// (convención de normalizarFecha en cierreCaja.js). pago.fecha en cambio es
// un instante real, así que el rango desde/hasta debe ser la medianoche a
// medianoche LOCAL de ese día (no UTC) — si no, un pago cobrado ya entrada la
// noche local (después de las 18:00 en el huso -6) queda fuera del día que
// el cajero está viendo. El servidor corre en la zona horaria del taller, así
// que construir el Date con los componentes locales (año/mes/día) ya da el
// límite correcto.
function limitesDiaLocal(fecha) {
  const anio = fecha.getUTCFullYear();
  const mes = fecha.getUTCMonth();
  const dia = fecha.getUTCDate();
  const desde = new Date(anio, mes, dia, 0, 0, 0, 0);
  const hasta = new Date(anio, mes, dia + 1, 0, 0, 0, -1);
  return { desde, hasta };
}

// Suma lo efectivamente cobrado en un día (pagos no cancelados de los 3
// comprobantes), para comparar contra el conteo físico de Gestión de Caja.
// Mismo patrón $elemMatch + refiltro en JS que buildReporteRemisionesDiario
// (backend/routes/reportes.js), pero cruzando los 3 tipos de comprobante.
async function calcularTotalIngresosDia(fecha) {
  const { desde, hasta } = limitesDiaLocal(fecha);

  const ordenes = await Vehiculo.find({
    pagos: {
      $elemMatch: {
        comprobante: { $in: COMPROBANTES_INGRESO },
        fecha: { $gte: desde, $lte: hasta },
      },
    },
  })
    .select('pagos')
    .lean();

  let total = 0;
  for (const orden of ordenes) {
    for (const pago of orden.pagos || []) {
      if (pago.cancelado) continue;
      if (!COMPROBANTES_INGRESO.includes(pago.comprobante)) continue;
      const f = new Date(pago.fecha);
      if (f < desde || f > hasta) continue;
      total += pago.monto || 0;
    }
  }
  return total;
}

module.exports = { calcularTotalIngresosDia, limitesDiaLocal };
