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

const FORMA_PAGO_LABELS = {
  EFECTIVO: "Efectivo",
  CREDITO: "Tarjeta de Crédito",
  DEBITO: "Tarjeta de Débito",
  CHEQUE: "Cheque",
  TRANSFERENCIA: "Transferencia",
  COMBINADO: "Combinado",
};

const MOTIVO_CANCELACION_LABELS = {
  ERROR: "Corrección de captura (error)",
  PASA_A_FACTURA: "Pasó a factura",
};

// El sub-objeto con la forma de pago depende del comprobante; una Remisión no
// captura forma de pago (se concilia aparte).
function formaPagoInfo(p) {
  if (p.comprobante === "NOTA_VENTA") return p.notaVenta;
  if (p.comprobante === "RECIBO_PROVISIONAL") return p.reciboProvisional;
  if (p.comprobante === "SIN_COMPROBANTE") return p.liquidacion;
  return null;
}

function Dato({ label, children }) {
  return (
    <div className="col-6 col-md-4">
      <div className="text-muted">{label}</div>
      <div className="fw-semibold">{children ?? "-"}</div>
    </div>
  );
}

// Detalle de solo lectura de un pago (Abono / Anticipo / Liquida / Liquidar)
// del Historial de Pagos de Cajas: la forma en que entró el dinero, el saldo a
// favor aplicado (si lo hubo) y, si se canceló o se le corrigió la fecha, esa
// bitácora — información que la tabla del historial no alcanza a mostrar.
export default function CajaModalDetallePago({ show, pago, onClose }) {
  if (!show || !pago) return null;
  const p = pago;
  const fp = formaPagoInfo(p);
  const combinado = fp?.formaPago === "COMBINADO" ? fp.combinado : null;

  return (
    <div className="modal d-block" tabIndex="-1" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="modal-dialog modal-dialog-centered modal-lg">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title fw-bold">
              {tipoPagoLabel(p)} · {comprobanteLabel(p)}
            </h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body">
            {p.cancelado && (
              <div className="alert alert-danger py-2">
                <strong>Cancelado</strong>
                {p.motivoCancelacionTipo && ` · ${MOTIVO_CANCELACION_LABELS[p.motivoCancelacionTipo] || p.motivoCancelacionTipo}`}
                {p.canceladoPor && ` · por ${p.canceladoPor}`}
                {p.canceladoEn && ` · ${formatFecha(p.canceladoEn)}`}
                {p.motivoCancelacion && <div className="mt-1">Motivo: {p.motivoCancelacion}</div>}
              </div>
            )}

            <div className="row g-2 mb-3 small">
              <Dato label="Fecha">{formatFecha(p.fecha)}</Dato>
              <Dato label="Registrado por">{p.registradoPor}</Dato>
              <Dato label="Monto Pesos">{formatMoney(p.montoPesos)}</Dato>
              <Dato label="Monto Dólares">{p.montoDolares ? formatMoney(p.montoDolares) : "-"}</Dato>
              <Dato label="Tipo de Cambio">{p.tipoCambio || "-"}</Dato>
              <Dato label="Monto Total (MN)">{formatMoney(p.monto)}</Dato>
              {p.tipoPago === "ANTICIPO" && (
                <Dato label="Aplica al reporte de">
                  {p.anticipoDestino === "NOTA_VENTA" ? "Facturas" : p.anticipoDestino === "REMISION" ? "Remisiones" : "-"}
                </Dato>
              )}
              {p.aSaldoAFavor && (
                <Dato label="Saldo a favor">
                  Sí — este dinero se guardó como saldo a favor del cliente, no bajó el saldo de la orden.
                </Dato>
              )}
            </div>

            {fp ? (
              <div className="mb-3">
                <h6 className="fw-semibold">Forma de pago</h6>
                <div className="row g-2 small">
                  <Dato label="Método">{FORMA_PAGO_LABELS[fp.formaPago] || fp.formaPago}</Dato>
                  {["CREDITO", "DEBITO"].includes(fp.formaPago) && <Dato label="Terminal">{fp.banco || "-"}</Dato>}
                  {fp.formaPago === "CHEQUE" && <Dato label="N° de Cheque">{fp.chequeNumero || "-"}</Dato>}
                  {p.comprobante === "RECIBO_PROVISIONAL" && (
                    <>
                      <Dato label="Concepto">{p.reciboProvisional?.concepto}</Dato>
                      <Dato label="Recibió">{p.reciboProvisional?.recibio}</Dato>
                    </>
                  )}
                </div>

                {combinado && (
                  <div className="table-responsive mt-2">
                    <table className="table table-sm table-bordered mb-0">
                      <thead className="table-light text-center">
                        <tr>
                          <th>Efectivo</th>
                          <th>Efectivo USD</th>
                          <th>T. Crédito</th>
                          <th>T. Débito</th>
                          <th>Cheque</th>
                          <th>Transferencia</th>
                          <th>Terminal</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="text-center">
                          <td>{formatMoney(combinado.efectivo)}</td>
                          <td>{combinado.efectivoDolares ? `$${combinado.efectivoDolares} USD` : "-"}</td>
                          <td>{formatMoney(combinado.credito)}</td>
                          <td>{formatMoney(combinado.debito)}</td>
                          <td>{formatMoney(combinado.cheque)}</td>
                          <td>{formatMoney(combinado.transferencia)}</td>
                          <td>{combinado.banco || "-"}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              p.comprobante === "REMISION" && (
                <p className="text-muted small">Una Remisión no captura forma de pago; se concilia aparte.</p>
              )
            )}

            {p.saldoAplicado?.monto > 0 && (
              <div className="mb-3">
                <h6 className="fw-semibold">Saldo a favor aplicado</h6>
                <p className="small mb-1">
                  Se usaron <strong>{formatMoney(p.saldoAplicado.monto)}</strong> del saldo a favor del cliente
                  (ya incluidos en el Monto Total).
                </p>
                {(p.saldoAplicado.origenes || []).length > 0 && (
                  <div className="table-responsive">
                    <table className="table table-sm table-bordered mb-0">
                      <thead className="table-light text-center">
                        <tr>
                          <th>Con qué se depositó originalmente</th>
                          <th>Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.saldoAplicado.origenes.map((o, i) => (
                          <tr key={i} className="text-center">
                            <td>{FORMA_PAGO_LABELS[o.formaPago] || o.formaPago || "Reembolso previo"}</td>
                            <td>{formatMoney(o.monto)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {(p.referencia || p.observaciones || p.notas) && (
              <div className="row g-2 small">
                {p.referencia && <Dato label="Referencia">{p.referencia}</Dato>}
                {p.observaciones && <Dato label="Observaciones">{p.observaciones}</Dato>}
                {p.notas && <Dato label="Notas">{p.notas}</Dato>}
              </div>
            )}

            {p.motivoCambioFecha && (
              <div className="alert alert-warning py-2 mt-3 mb-0 small">
                <strong>Fecha corregida</strong>
                {p.fechaOriginal && ` · fecha original: ${formatFecha(p.fechaOriginal)}`}
                {p.fechaEditadaPor && ` · por ${p.fechaEditadaPor}`}
                {p.fechaEditadaEn && ` · ${formatFecha(p.fechaEditadaEn)}`}
                <div className="mt-1">Motivo: {p.motivoCambioFecha}</div>
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
