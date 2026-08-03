// Espejo de backend/utils/cajaTotales.js: los totales de Cajas nunca se
// persisten, siempre se recalculan a partir de ventaCliente/ivaVenta/descuento/pagos.
export function calcularTotalesOrden(orden) {
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
      s + (d.tipo === "PORCENTAJE" ? totalBruto * (Number(d.valor || 0) / 100) : Number(d.valor || 0)),
    0
  );

  const totalOrden = Math.max(0, totalBruto - descuentoMonto);
  // Un pago cancelado (anticipo/remisión que se cancela para poder facturar la
  // orden) conserva su folio en el historial pero ya no cuenta como abonado.
  const totalAbonado = (orden.pagos || [])
    .filter((p) => !p.cancelado)
    .reduce((s, p) => s + Number(p.monto || 0), 0);
  const saldoPendiente = totalOrden - totalAbonado;

  return { subtotal, ivaPct, ivaMonto, totalBruto, descuentoMonto, totalOrden, totalAbonado, saldoPendiente };
}
