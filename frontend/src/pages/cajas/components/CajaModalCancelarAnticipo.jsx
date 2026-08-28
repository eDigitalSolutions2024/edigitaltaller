import React, { useEffect, useState } from "react";

function formatMoney(n) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}

// Solo admin (ver CajasAnticipos): cancela un depósito de anticipo ya
// registrado (corrección de captura). Solo procede si el cliente todavía
// tiene disponible el monto completo de ese depósito — el backend lo valida
// de forma atómica (ver utils/anticiposCliente.js) y responde con un mensaje
// claro si no es posible.
export default function CajaModalCancelarAnticipo({ show, movimiento, onClose, onConfirm }) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (show) {
      setMotivo("");
      setError("");
    }
  }, [show, movimiento?._id]);

  if (!show || !movimiento) return null;

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
      setError(err.response?.data?.msg || "Error al cancelar el anticipo.");
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
            <h5 className="modal-title fw-bold">Cancelar Anticipo</h5>
            <button type="button" className="btn-close" onClick={onClose} disabled={guardando} />
          </div>

          <div className="modal-body">
            <div className="alert alert-warning py-2">
              Vas a cancelar el depósito de <strong>{formatMoney(movimiento.monto)}</strong>{" "}
              (folio {movimiento.folioRecibo}). Solo es posible si el cliente todavía tiene
              disponible ese monto en su saldo — si ya lo usó en una orden, no se puede cancelar.
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
              {guardando ? "Cancelando..." : "Cancelar Anticipo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
