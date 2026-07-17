import React from "react";

function formatMoney(n) {
  if (n === "" || n === null || n === undefined) return "-";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}

// Suma, en dinero, los descuentos activos que aplican a una línea específica
// (o a toda la orden, cuando lineaId es null) — siempre se muestra como monto,
// aunque el descuento se haya capturado como porcentaje.
function descuentoLinea(row, descuentos) {
  const subtotalLinea = Number(row.cant || 0) * Number(row.precioVenta || 0);
  return descuentos
    .filter((d) => d.activo !== false && row._id && String(d.lineaId) === String(row._id))
    .reduce((s, d) => s + (d.tipo === "PORCENTAJE" ? subtotalLinea * (Number(d.valor || 0) / 100) : Number(d.valor || 0)), 0);
}

export default function CajaCostoVentaTable({ rows, descuentos = [], totales }) {
  return (
    <div className="table-responsive mb-3">
      <table className="table table-bordered table-sm align-middle">
        <thead className="table-light text-center">
          <tr>
            <th style={{ width: 70 }}>Cantidad</th>
            <th>Concepto, Servicio y/o Reparación</th>
            <th style={{ width: 150 }}>Precio Venta (Sin IVA)</th>
            <th style={{ width: 120 }}>Descuento</th>
            <th>Observaciones</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="text-center text-muted">
                No hay partidas de costo/venta registradas.
              </td>
            </tr>
          )}

          {rows.map((r, idx) => {
            const desc = descuentoLinea(r, descuentos);
            return (
              <tr key={idx}>
                <td className="text-center">{r.cant}</td>
                <td>{r.concepto}</td>
                <td className="text-end">{formatMoney(r.precioVenta)}</td>
                <td className="text-end">{desc > 0 ? formatMoney(desc) : "-"}</td>
                <td>{r.observaciones}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} className="text-end fw-bold">Sub Total:</td>
            <td className="text-end fw-bold">{formatMoney(totales.subtotal)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr>
            <td colSpan={2} className="text-end fw-bold">IVA {totales.ivaPct}%:</td>
            <td className="text-end fw-bold">{formatMoney(totales.ivaMonto)}</td>
            <td colSpan={2}></td>
          </tr>
          {totales.descuentoMonto > 0 && (
            <tr>
              <td colSpan={2} className="text-end fw-bold">Descuentos:</td>
              <td className="text-end fw-bold text-danger">-{formatMoney(totales.descuentoMonto)}</td>
              <td colSpan={2}></td>
            </tr>
          )}
          <tr>
            <td colSpan={2} className="text-end fw-bold">Total:</td>
            <td className="text-end fw-bold text-white bg-primary">{formatMoney(totales.totalOrden)}</td>
            <td colSpan={2}></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
