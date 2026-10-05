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
  // Un pago cancelado (anticipo/remisión) deja de contar como abonado — SALVO
  // cuando se canceló porque "pasó a factura" (motivoCancelacionTipo
  // 'PASA_A_FACTURA', ver cancelarAnticiposYRemisionesPorFactura en
  // backend/utils/anticiposAlFacturar.js, compartida por Factura directa y
  // Factura Global): ese dinero SÍ pagó la orden, solo que ahora queda
  // documentado en la factura en vez de en el comprobante de Cajas — sin esta
  // excepción la orden se queda con un saldo pendiente fantasma por ese
  // monto, aunque ya esté completamente facturada y cobrada (bug real,
  // confirmado contra la BD de producción). Un anticipo con `aSaldoAFavor`
  // nunca cuenta aquí: su dinero se guardó como saldo a favor del cliente
  // (Cliente.saldoAFavor), no se abonó a la orden; se cobra después vía "Usar
  // saldo a favor", y ese pago posterior sí cuenta.
  const totalAbonado = (orden.pagos || [])
    .filter((p) => (!p.cancelado || p.motivoCancelacionTipo === "PASA_A_FACTURA") && !p.aSaldoAFavor)
    .reduce((s, p) => s + Number(p.monto || 0), 0);
  const saldoPendiente = totalOrden - totalAbonado;

  return { subtotal, ivaPct, ivaMonto, totalBruto, descuentoMonto, totalOrden, totalAbonado, saldoPendiente };
}
