// Espejo de frontend/src/utils/cajaTotales.js: los totales de Cajas nunca se
// persisten, siempre se recalculan a partir de ventaCliente/ivaVenta/descuento/pagos.
function calcularTotalesOrden(orden) {
  const ventaCliente = orden.ventaCliente || [];
  const subtotal = ventaCliente.reduce(
    (s, r) => s + Number(r.cant || 0) * Number(r.precioVenta || 0),
    0
  );
  const ivaPct = Number(orden.ivaVenta ?? 8) || 0;
  const ivaMonto = subtotal * (ivaPct / 100);
  const totalBruto = subtotal + ivaMonto;

  const descuentosActivos = (orden.descuentos || []).filter((d) => d.activo !== false);
  const descuentoMonto = descuentosActivos.reduce(
    (s, d) =>
      s + (d.tipo === 'PORCENTAJE' ? totalBruto * (Number(d.valor || 0) / 100) : Number(d.valor || 0)),
    0
  );

  const totalOrden = Math.max(0, totalBruto - descuentoMonto);
  // Un pago cancelado (anticipo/remisión que se cancela para poder facturar la
  // orden) conserva su folio en el historial pero ya no cuenta como abonado.
  // Un anticipo con `aSaldoAFavor` tampoco: su dinero se guardó como saldo a
  // favor del cliente (Cliente.saldoAFavor), no se abonó a la orden; se cobra
  // después vía "Usar saldo a favor", y ese pago posterior sí cuenta aquí.
  const totalAbonado = (orden.pagos || [])
    .filter((p) => !p.cancelado && !p.aSaldoAFavor)
    .reduce((s, p) => s + Number(p.monto || 0), 0);
  const saldoPendiente = totalOrden - totalAbonado;

  return { subtotal, ivaPct, ivaMonto, totalBruto, descuentoMonto, totalOrden, totalAbonado, saldoPendiente };
}

const TOLERANCIA_SALDO = 0.01;

// La Fecha de Pagada de una Remisión no se captura a mano: el sistema la marca
// en cuanto la orden se queda sin saldo pendiente, y la vuelve a limpiar si el
// saldo reaparece (p. ej. al cancelar un pago o quitar un descuento). Recibe el
// documento ya hidratado de Mongoose y solo guarda si algo cambió. Compartida
// entre cajas.js (pagos/descuentos manuales) y generar_xml.js (cancelación
// automática del anticipo/remisión al facturar).
async function sincronizarFechaPagadaRemisiones(vehiculo, fecha = new Date()) {
  const { saldoPendiente } = calcularTotalesOrden(vehiculo);
  const liquidada = saldoPendiente <= TOLERANCIA_SALDO;

  let cambio = false;
  for (const p of vehiculo.pagos || []) {
    if (p.comprobante !== 'REMISION' || p.cancelado || !p.remision) continue;
    if (liquidada && !p.remision.fechaPagada) {
      p.remision.fechaPagada = fecha;
      cambio = true;
    } else if (!liquidada && p.remision.fechaPagada) {
      p.remision.fechaPagada = null;
      cambio = true;
    }
  }

  if (cambio) await vehiculo.save();
  return vehiculo;
}

module.exports = { calcularTotalesOrden, sincronizarFechaPagadaRemisiones };
