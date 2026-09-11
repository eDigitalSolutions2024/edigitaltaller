import React from "react";
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

function tipoPagoLabel(p) {
  if (p.comprobante === "REMISION" && p.remision?.tipo === "Credito") return "Crédito";
  return TIPO_PAGO_LABELS[p.tipoPago] || p.tipoPago;
}

function comprobanteLabel(p) {
  if (p.comprobante === "NOTA_VENTA") return `Nota Venta N°${p.notaVenta?.numero ?? "-"}`;
  if (p.comprobante === "REMISION") return `Remisión N°${p.remision?.numero ?? "-"}`;
  if (p.comprobante === "RECIBO_PROVISIONAL") return `Recibo Provisional N°${p.reciboProvisional?.numero ?? "-"}`;
  if (p.comprobante === "SIN_COMPROBANTE") return "Sin comprobante";
  return "-";
}

const TIPO_FACTURA_LABEL = {
  factura: "Factura",
  notaCredito: "Nota de Crédito",
  complementoPago: "Complemento de Pago",
  facturaGlobal: "Factura Global",
};

function facturaFolioLabel(f) {
  return [f.serie, f.folio].filter(Boolean).join("-") || "-";
}

// Detalle de solo lectura de una factura del historial de Cajas: muestra los
// datos propios del CFDI y, sobre todo, los pagos de Cajas que quedaron
// ligados a ella (los que se cancelaron y "pasaron a factura", o -en factura
// global- las Notas de Venta que se marcaron como ya facturadas), con la
// misma información que el Historial de Pagos / Abonos.
export default function CajaModalDetalleFactura({ show, factura, pagos = [], vehiculoId, onClose }) {
  if (!show || !factura) return null;

  const pagosLigados = pagos.filter(
    (p) =>
      (factura._id && String(p.facturaId || "") === String(factura._id)) ||
      (factura._id && String(p.facturaGlobalId || "") === String(factura._id))
  );

  const notasVentaDeEstaOrden = (factura.notasVenta || []).filter(
    (n) => !vehiculoId || String(n.vehiculoId || "") === String(vehiculoId)
  );

  return (
    <div className="modal d-block" tabIndex="-1" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="modal-dialog modal-dialog-centered modal-lg">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title fw-bold">
              {TIPO_FACTURA_LABEL[factura.tipoFactura] || "Factura"} · {facturaFolioLabel(factura)}
            </h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body">
            <div className="row g-2 mb-3 small">
              <div className="col-6 col-md-3">
                <div className="text-muted">Fecha</div>
                <div className="fw-semibold">{formatFecha(factura.fecha)}</div>
              </div>
              <div className="col-6 col-md-3">
                <div className="text-muted">Cliente</div>
                <div className="fw-semibold">{factura.cliente?.nombre || "-"}</div>
              </div>
              <div className="col-6 col-md-3">
                <div className="text-muted">Forma / Método de pago</div>
                <div className="fw-semibold">
                  {[factura.cfdi?.formaPago, factura.cfdi?.metodoPago].filter(Boolean).join(" · ") || "-"}
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="text-muted">Total</div>
                <div className="fw-semibold">{formatMoney(factura.totales?.total)}</div>
              </div>
              <div className="col-6 col-md-3">
                <div className="text-muted">Generado por</div>
                <div className="fw-semibold">{factura.generadoPor || "-"}</div>
              </div>
              <div className="col-6 col-md-3">
                <div className="text-muted">Estatus</div>
                <div className="fw-semibold">{factura.estatus === "cancelada" ? "Cancelada" : "Generada"}</div>
              </div>
              {factura.notaFacturacion && (
                <div className="col-12">
                  <div className="text-muted">Observaciones</div>
                  <div className="fw-semibold">{factura.notaFacturacion}</div>
                </div>
              )}
            </div>

            {/* Solo Complemento de Pago: el pago aplicado y la factura que salda */}
            {factura.tipoFactura === "complementoPago" && (
              <div className="mb-3">
                <h6 className="fw-semibold">Pago aplicado</h6>
                <table className="table table-sm table-bordered mb-2">
                  <tbody>
                    <tr>
                      <th className="ps-2" style={{ width: "30%" }}>
                        Fecha de pago
                      </th>
                      <td>{factura.pago?.fechaPago ? formatFecha(factura.pago.fechaPago) : "-"}</td>
                    </tr>
                    <tr>
                      <th className="ps-2">Forma de pago</th>
                      <td>{factura.pago?.formaPago || "-"}</td>
                    </tr>
                    <tr>
                      <th className="ps-2">Monto</th>
                      <td>{formatMoney(factura.pago?.monto)}</td>
                    </tr>
                  </tbody>
                </table>
                {(factura.relacionadas || []).length > 0 && (
                  <div className="table-responsive">
                    <table className="table table-sm table-bordered align-middle">
                      <thead className="table-light text-center">
                        <tr>
                          <th>Factura saldada</th>
                          <th>Saldo Anterior</th>
                          <th>Importe Pagado</th>
                          <th>Saldo Insoluto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {factura.relacionadas.map((r, i) => (
                          <tr key={i} className="text-center">
                            <td>{[r.serie, r.folio].filter(Boolean).join("-") || "-"}</td>
                            <td className="text-end">{formatMoney(r.saldoAnterior)}</td>
                            <td className="text-end">{formatMoney(r.importePagado)}</td>
                            <td className="text-end">{formatMoney(r.saldoInsoluto)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Solo Factura Global: las Notas de Venta de esta orden agrupadas en el CFDI */}
            {factura.tipoFactura === "facturaGlobal" && notasVentaDeEstaOrden.length > 0 && (
              <div className="mb-3">
                <h6 className="fw-semibold">Notas de Venta de esta orden incluidas</h6>
                <div className="table-responsive">
                  <table className="table table-sm table-bordered align-middle">
                    <thead className="table-light text-center">
                      <tr>
                        <th>N° Nota de Venta</th>
                        <th>Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notasVentaDeEstaOrden.map((n, i) => (
                        <tr key={i} className="text-center">
                          <td>{n.numero ?? "-"}</td>
                          <td className="text-end">{formatMoney(n.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <h6 className="fw-semibold">Cómo se registró el pago en Cajas</h6>
            {pagosLigados.length === 0 ? (
              <p className="text-muted small mb-0">
                No hay ningún pago de Cajas ligado directamente a esta factura.
              </p>
            ) : (
              <div className="table-responsive">
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
                      <th>Observaciones</th>
                      <th>Registrado por</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagosLigados.map((p, idx) => (
                      <tr key={p._id || idx}>
                        <td className="text-center text-nowrap">{formatFecha(p.fecha)}</td>
                        <td className="text-center">{tipoPagoLabel(p)}</td>
                        <td className="text-center">{comprobanteLabel(p)}</td>
                        <td className="text-end">{formatMoney(p.montoPesos)}</td>
                        <td className="text-end">{p.montoDolares ? formatMoney(p.montoDolares) : "-"}</td>
                        <td className="text-end">{p.tipoCambio || "-"}</td>
                        <td className="text-end fw-bold">{formatMoney(p.monto)}</td>
                        <td>{p.notasAntesCancelar || p.observaciones}</td>
                        <td>{p.registradoPor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
