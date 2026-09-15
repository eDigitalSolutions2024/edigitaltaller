'use strict';

// Validación compartida del desglose "más de una tarjeta" de un pago de Cajas
// (backend/routes/cajas.js) o de una orden sin comprobante facturada desde el
// menú Factura (backend/routes/generar_xml.js): mismo catálogo de terminales
// que TERMINALES_TARJETA en ambos archivos.
const TERMINALES_TARJETA = ['BANREGIO', 'AMERICAN EXPRESS', 'BANAMEX', 'BANORTE', 'BBVA BANCOMER'];

// Limpia y valida un desglose [{ monto, terminal }] capturado en el
// formulario: cada entrada necesita monto > 0 y una terminal válida, y la
// suma debe cuadrar (±1 centavo) con el total que se cobró con tarjeta
// (montoPesos del pago simple, o combinado.credito/combinado.debito).
// Devuelve { tarjetas, error }: `tarjetas` ya limpio (montos redondeados) si
// no hubo error; `error` es un mensaje listo para responder 400.
function limpiarYValidarTarjetas(tarjetas, totalEsperado, etiqueta = 'tarjeta') {
  const lista = Array.isArray(tarjetas) ? tarjetas : [];
  const limpias = [];
  let suma = 0;
  for (const t of lista) {
    const monto = Math.round((Number(t?.monto) || 0) * 100) / 100;
    const terminal = t?.terminal || '';
    if (monto <= 0 || !TERMINALES_TARJETA.includes(terminal)) {
      return { tarjetas: null, error: `Captura el monto y la terminal de cada ${etiqueta}.` };
    }
    limpias.push({ monto, terminal });
    suma += monto;
  }
  if (!limpias.length) {
    return { tarjetas: null, error: `Captura al menos una ${etiqueta} con monto y terminal.` };
  }
  const esperado = Math.round((Number(totalEsperado) || 0) * 100) / 100;
  if (Math.abs(suma - esperado) > 0.01) {
    return {
      tarjetas: null,
      error: `La suma de las ${etiqueta}s (${suma.toFixed(2)}) no coincide con el monto a cobrar con tarjeta (${esperado.toFixed(2)}).`,
    };
  }
  return { tarjetas: limpias, error: null };
}

module.exports = { TERMINALES_TARJETA, limpiarYValidarTarjetas };
