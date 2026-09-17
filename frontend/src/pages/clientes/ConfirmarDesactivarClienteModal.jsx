import React, { useEffect, useState } from "react";

// Confirmación antes de marcar un cliente como inactivo (ver ⚙ Configuración
// en AltaCliente.jsx) — para no perderlo de la búsqueda por un clic
// accidental. El motivo es obligatorio (a diferencia de
// CajaModalCancelarCaptura, que lo deja opcional) y queda en el Registro de
// Actividad porque viaja en el body del PATCH /clientes/:id/estado, que el
// middleware de auditoría ya registra como DESACTIVAR.
export default function ConfirmarDesactivarClienteModal({ show, clienteNombre, onClose, onConfirm }) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (show) {
      setMotivo("");
      setError("");
    }
  }, [show]);

  if (!show) return null;

  const handleConfirmar = async () => {
    const motivoLimpio = motivo.trim();
    if (!motivoLimpio) {
      setError("El motivo es obligatorio.");
      return;
    }
    try {
      setGuardando(true);
      setError("");
      await onConfirm(motivoLimpio);
    } catch (err) {
      setError(err?.response?.data?.error || "No se pudo desactivar el cliente.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      className="modal d-block"
      tabIndex="-1"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget && !guardando) onClose(); }}
    >
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title fw-bold">Desactivar cliente</h5>
            <button type="button" className="btn-close" onClick={onClose} disabled={guardando} />
          </div>

          <div className="modal-body">
            <div className="alert alert-warning py-2 mb-3">
              Vas a marcar como inactivo a <strong>{clienteNombre || "este cliente"}</strong>. Dejará
              de aparecer en las búsquedas de Clientes y no se le podrán abrir órdenes nuevas.
              Puedes reactivarlo después desde aquí mismo.
            </div>

            <label className="form-label mb-0 fw-semibold">
              Motivo <span className="text-danger">*</span>
            </label>
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
              Cancelar
            </button>
            <button type="button" className="btn btn-danger fw-semibold" onClick={handleConfirmar} disabled={guardando}>
              {guardando ? "Desactivando…" : "Desactivar cliente"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
