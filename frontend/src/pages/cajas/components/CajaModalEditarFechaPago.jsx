import React, { useEffect, useState } from "react";
import { formatFecha } from "../../../utils/fechas";

// Hoy y una fecha cualquiera en 'YYYY-MM-DD' (hora local) para <input type="date">.
function hoyISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function fechaAInputDate(valor) {
  const d = valor ? new Date(valor) : new Date();
  if (isNaN(d.getTime())) return hoyISO();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function comprobanteLabel(p) {
  if (!p) return "";
  if (p.comprobante === "NOTA_VENTA") return `Nota de Venta N°${p.notaVenta?.numero ?? "-"}`;
  if (p.comprobante === "REMISION") return `Remisión N°${p.remision?.numero ?? "-"}`;
  if (p.comprobante === "RECIBO_PROVISIONAL") return `Recibo Provisional N°${p.reciboProvisional?.numero ?? "-"}`;
  if (p.comprobante === "SIN_COMPROBANTE") return "Sin comprobante";
  return "";
}

// Modal para corregir la fecha de un pago ya registrado. Exige un motivo; el
// backend lo guarda en el pago (motivoCambioFecha) para dejar rastro.
export default function CajaModalEditarFechaPago({ show, pago, onClose, onGuardar }) {
  const [fecha, setFecha] = useState(hoyISO());
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!show) return;
    setFecha(fechaAInputDate(pago?.fecha));
    setMotivo("");
    setError("");
    setGuardando(false);
  }, [show, pago]);

  if (!show || !pago) return null;

  const guardar = async () => {
    if (!fecha) {
      setError("Elige la nueva fecha.");
      return;
    }
    if (!motivo.trim()) {
      setError("Captura el motivo del cambio de fecha.");
      return;
    }
    setGuardando(true);
    setError("");
    try {
      await onGuardar(pago, fecha, motivo.trim());
      onClose();
    } catch (err) {
      setError(err?.response?.data?.msg || "No se pudo cambiar la fecha del pago.");
      setGuardando(false);
    }
  };

  return (
    <div className="modal d-block" tabIndex="-1" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title fw-bold">Corregir fecha del pago</h5>
            <button type="button" className="btn-close" onClick={onClose} disabled={guardando} />
          </div>

          <div className="modal-body">
            <p className="mb-2 small text-muted">
              {comprobanteLabel(pago)} · fecha actual: <strong>{formatFecha(pago.fecha)}</strong>
            </p>

            <div className="mb-3">
              <label className="form-label mb-0">Nueva fecha</label>
              <input
                type="date"
                className="form-control"
                value={fecha}
                max={hoyISO()}
                onChange={(e) => setFecha(e.target.value)}
                data-no-uppercase
              />
              <small className="text-muted">No se permiten fechas futuras.</small>
            </div>

            <div className="mb-2">
              <label className="form-label mb-0">Motivo del cambio</label>
              <textarea
                className="form-control"
                rows={2}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. El pago se capturó con la fecha equivocada"
              />
            </div>

            {error && <p className="text-danger mb-0">{error}</p>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={guardando}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary fw-semibold" onClick={guardar} disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar fecha"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
