import React, { useEffect, useState } from "react";

function formatMoney(n) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}

const TIPO_PAGO_LABELS = { COMPLETO: "Pago Completo", ABONO: "Abono", ANTICIPO: "Anticipo" };

// Una remisión a crédito se registra como Pago Completo, pero no entró dinero
// (mismo criterio que CajaHistorialPagos).
function tipoPagoLabel(p) {
  if (!p) return "";
  if (p.comprobante === "REMISION" && p.remision?.tipo === "Credito") return "Crédito";
  return TIPO_PAGO_LABELS[p.tipoPago] || p.tipoPago;
}

function comprobanteLabel(p) {
  if (!p) return "";
  if (p.comprobante === "NOTA_VENTA") return `Nota Venta N°${p.notaVenta?.numero ?? "-"}`;
  if (p.comprobante === "REMISION") return `Remisión N°${p.remision?.numero ?? "-"}`;
  if (p.comprobante === "RECIBO_PROVISIONAL") return `Recibo Provisional N°${p.reciboProvisional?.numero ?? "-"}`;
  return "-";
}

// Solo admin (ver CajaOrdenDetalle): cancela/restablece un abono, anticipo,
// remisión o nota de venta ya registrado. El folio se conserva; el pago solo
// queda marcado como cancelado (badge en el historial + marca de agua "CANCELADO"
// en su PDF).
export default function CajaModalCancelarPago({ show, pago, onClose, onConfirm }) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (show) {
      setMotivo("");
      setError("");
    }
  }, [show, pago?._id]);

  if (!show || !pago) return null;

  const handleConfirmar = async () => {
    if (!motivo.trim()) {
      setError("Captura el motivo de la cancelación.");
      return;
    }
    try {
      setGuardando(true);
      setError("");
      await onConfirm(motivo.trim());
    } catch (err) {
      setError(err.response?.data?.msg || "Error al cancelar el pago.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      className="modal d-block"
      tabIndex="-1"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title fw-bold">Cancelar / Restablecer Pago</h5>
            <button type="button" className="btn-close" onClick={onClose} disabled={guardando} />
          </div>

          <div className="modal-body">
            <div className="alert alert-warning py-2">
              Vas a cancelar <strong>{comprobanteLabel(pago)}</strong> ({tipoPagoLabel(pago)}) por{" "}
              <strong>{formatMoney(pago.monto)}</strong>. El folio se conserva, pero el pago quedará marcado
              como cancelado y dejará de contar como abonado.
            </div>

            <label className="form-label mb-0 fw-semibold">Motivo de la cancelación</label>
            <textarea
              className="form-control"
              rows={3}
              autoFocus
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />

            {error && <p className="text-danger mt-2 mb-0">{error}</p>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={guardando}>
              Cerrar
            </button>
            <button type="button" className="btn btn-danger fw-semibold" onClick={handleConfirmar} disabled={guardando}>
              {guardando ? "Cancelando..." : "Cancelar Pago"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
