import React, { useEffect, useState } from "react";

// Solo admin (ver ReporteCajasIngresos): regenera el Reporte Diario de
// Ingresos de UN día ya terminado. Ese día se congela la primera vez que se
// abre (para que lo que pase después no lo reescriba), así que algo que llegó
// tarde — p. ej. una Factura Global timbrada días después — no aparece hasta
// regenerarlo. El motivo es obligatorio y queda en el reporte y en el Registro
// de Actividad.
export default function ModalRegenerarReporte({ show, tituloDia, tipoLabel, onClose, onConfirm }) {
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
    if (!motivo.trim()) {
      setError("Captura el motivo para regenerar el reporte.");
      return;
    }
    try {
      setGuardando(true);
      setError("");
      await onConfirm(motivo.trim());
    } catch (err) {
      setError(
        err.response?.data?.msg ||
          err.response?.data?.message ||
          "Error al regenerar el reporte."
      );
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
            <h5 className="modal-title fw-bold">Regenerar reporte del día</h5>
            <button type="button" className="btn-close" onClick={onClose} disabled={guardando} />
          </div>

          <div className="modal-body">
            <div className="alert alert-warning py-2 mb-3">
              Vas a regenerar el reporte de <strong>{tipoLabel}</strong> de{" "}
              <strong>{tituloDia}</strong>. Se recalcula el día <strong>completo</strong> con los
              datos de hoy, no solo lo que faltaba: cualquier otro cambio posterior que afecte a
              ese día también entrará, y sus totales pueden cambiar. Queda registrado quién lo hizo
              y por qué.
            </div>

            <label className="form-label mb-0 fw-semibold">
              Motivo <span className="text-danger">*</span>
            </label>
            <textarea
              className="form-control"
              rows={3}
              maxLength={300}
              autoFocus
              placeholder="Ej. Factura Global A-60615 timbrada el 21/09 con notas del día 19"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />

            {error && <p className="text-danger mt-2 mb-0">{error}</p>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={guardando}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-warning fw-semibold"
              onClick={handleConfirmar}
              disabled={guardando || !motivo.trim()}
            >
              {guardando ? "Regenerando…" : "Regenerar reporte"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
