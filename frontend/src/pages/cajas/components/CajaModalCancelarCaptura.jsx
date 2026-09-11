import React, { useEffect, useState } from "react";

function formatMoney(n) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);
}

function fechaHora(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sumConteo(list) {
  return (list || []).reduce((s, x) => s + Number(x.denominacion || 0) * (Number(x.cantidad) || 0), 0);
}

// Mismo criterio que calcularTotalCaptura (GestionCaja) y CajaHistorialCapturas:
// efectivo + cheques + transferencias + dólares. No incluye vales.
function totalCaptura(c) {
  if (!c) return 0;
  const dolares = (Number(c.dolares?.cantidad) || 0) * (Number(c.dolares?.tipoCambio) || 0);
  return (
    sumConteo(c.billetes) +
    sumConteo(c.monedas) +
    (Number(c.cheques) || 0) +
    (Number(c.transferencias) || 0) +
    dolares
  );
}

// Solo admin (ver CajaHistorialCapturas): cancela una ronda de "Guardar" del
// formulario de Captura de la sesión con monto equivocado. Queda tachada en el
// historial como bitácora y su importe se resta del total de la caja; el
// backend recompone el corte a partir de las capturas no canceladas.
// Sustituye al window.prompt() que se usaba antes en GestionCaja.jsx.
export default function CajaModalCancelarCaptura({ show, captura, onClose, onConfirm }) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (show) {
      setMotivo("");
      setError("");
    }
  }, [show, captura?._id]);

  if (!show || !captura) return null;

  const handleConfirmar = async () => {
    try {
      setGuardando(true);
      setError("");
      await onConfirm(motivo.trim());
    } catch (err) {
      setError(err.response?.data?.msg || "Error al cancelar la captura.");
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
            <h5 className="modal-title fw-bold">Cancelar captura</h5>
            <button type="button" className="btn-close" onClick={onClose} disabled={guardando} />
          </div>

          <div className="modal-body">
            <div className="alert alert-warning py-2 mb-3">
              Vas a cancelar la captura de <strong>{fechaHora(captura.fecha)}</strong>
              {captura.capturadoPor ? <> por <strong>{captura.capturadoPor}</strong></> : null}, por{" "}
              <strong>{formatMoney(totalCaptura(captura))}</strong>. Se restará del total de la caja y
              quedará tachada en el historial. Esta acción no se puede deshacer.
            </div>

            <label className="form-label mb-0 fw-semibold">
              Motivo de la cancelación <span className="text-muted fw-normal">(opcional)</span>
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
              Cerrar
            </button>
            <button type="button" className="btn btn-danger fw-semibold" onClick={handleConfirmar} disabled={guardando}>
              {guardando ? "Cancelando…" : "Cancelar captura"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
