import React, { useState } from "react";
import { FaPrint } from "react-icons/fa";
import { formatFecha } from "../../../utils/fechas";

function formatMoney(n) {
  if (n === "" || n === null || n === undefined) return "-";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}

const TIPO_PAGO_LABELS = { COMPLETO: "Pago Completo", ABONO: "Abono", ANTICIPO: "Anticipo" };

function comprobanteLabel(p) {
  if (p.comprobante === "NOTA_VENTA") return `Nota Venta N°${p.notaVenta?.numero ?? "-"}`;
  if (p.comprobante === "REMISION") return `Remisión N°${p.remision?.numero ?? "-"}`;
  return "-";
}

export default function CajaHistorialPagos({ pagos = [], onImprimir }) {
  const [filtro, setFiltro] = useState("TODOS");

  const ordenados = [...pagos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const visibles = filtro === "TODOS" ? ordenados : ordenados.filter((p) => p.comprobante === filtro);

  return (
    <div>
      <div className="d-flex justify-content-end mb-2">
        <select
          className="form-select form-select-sm"
          style={{ width: "auto" }}
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        >
          <option value="TODOS">Todos los comprobantes</option>
          <option value="NOTA_VENTA">Nota de Venta</option>
          <option value="REMISION">Remisión</option>
        </select>
      </div>

      <div className="table-responsive mb-3">
        <table className="table table-sm table-bordered align-middle">
          <thead className="table-light text-center">
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Comprobante</th>
              <th>Monto Pesos</th>
              <th>Monto Dólares</th>
              <th>T.C.</th>
              <th>Monto Total (MN)</th>
              <th>Referencia</th>
              <th>Observaciones</th>
              <th>Registrado por</th>
              <th>Imprimir</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={11} className="text-center text-muted">
                  No hay pagos registrados.
                </td>
              </tr>
            )}
            {visibles.map((p, idx) => (
              <tr key={p._id || idx}>
                <td className="text-center">{formatFecha(p.fecha)}</td>
                <td className="text-center">{TIPO_PAGO_LABELS[p.tipoPago] || p.tipoPago}</td>
                <td className="text-center">{comprobanteLabel(p)}</td>
                <td className="text-end">{formatMoney(p.montoPesos)}</td>
                <td className="text-end">{p.montoDolares ? formatMoney(p.montoDolares) : "-"}</td>
                <td className="text-end">{p.tipoCambio || "-"}</td>
                <td className="text-end fw-bold">{formatMoney(p.monto)}</td>
                <td>{p.referencia}</td>
                <td>{p.observaciones}</td>
                <td>{p.registradoPor}</td>
                <td className="text-center">
                  <button
                    className="btn btn-outline-danger btn-sm"
                    title={`Imprimir ${comprobanteLabel(p)}`}
                    onClick={() => onImprimir?.(p)}
                  >
                    <FaPrint />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
