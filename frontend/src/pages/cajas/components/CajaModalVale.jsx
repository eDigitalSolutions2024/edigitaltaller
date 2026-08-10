import React, { useEffect, useState } from "react";
import { getValeCajaSiguienteFolio } from "../../../api/reportes";

const FORM_VACIO = { motivo: "", monto: "" };

// Deja pasar solo dígitos y un único punto decimal — a diferencia de
// <input type="number">, así ni letras ni signos (+, -, e) llegan al valor.
function sanitizeMonto(value) {
  let v = value.replace(/[^0-9.]/g, "");
  const primerPunto = v.indexOf(".");
  if (primerPunto !== -1) {
    v = v.slice(0, primerPunto + 1) + v.slice(primerPunto + 1).replace(/\./g, "");
  }
  return v;
}

// Modal para capturar un vale de la Caja del día (sustituye a los inputs en
// línea que había antes en la tabla de Vales, ver GestionCaja.jsx). El folio
// es automático: se genera del contador 'valeCaja' (ver Configuración) al
// abrir el modal, no se captura a mano.
export default function CajaModalVale({ show, onClose, onAdd }) {
  const [folio, setFolio] = useState(null);
  const [cargandoFolio, setCargandoFolio] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!show) return;
    setForm(FORM_VACIO);
    setError("");
    setFolio(null);
    setCargandoFolio(true);
    getValeCajaSiguienteFolio()
      .then((res) => setFolio(res.data.folio))
      .catch(() => setError("No se pudo generar el folio del vale."))
      .finally(() => setCargandoFolio(false));
  }, [show]);

  if (!show) return null;

  const handleGuardar = () => {
    if (!folio) {
      setError("Espera a que se genere el folio del vale.");
      return;
    }
    if (!Number(form.monto) || Number(form.monto) <= 0) {
      setError("Captura un monto mayor a 0.");
      return;
    }
    onAdd({ folio: String(folio), motivo: form.motivo.trim(), monto: Number(form.monto) });
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
            <h5 className="modal-title fw-bold">Generar Vale</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body">
            <div className="mb-2">
              <label className="form-label mb-0">Folio</label>
              <input
                type="text"
                disabled
                className="form-control"
                value={cargandoFolio ? "Generando…" : folio ?? ""}
              />
            </div>

            <div className="mb-2">
              <label className="form-label mb-0">Motivo</label>
              <input
                type="text"
                className="form-control"
                autoFocus
                value={form.motivo}
                onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))}
              />
            </div>

            <div className="mb-2">
              <label className="form-label mb-0">Monto</label>
              <input
                type="text"
                inputMode="decimal"
                className="form-control"
                value={form.monto}
                onChange={(e) => setForm((f) => ({ ...f, monto: sanitizeMonto(e.target.value) }))}
              />
            </div>

            {error && <p className="text-danger mt-2 mb-0">{error}</p>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
              Cerrar
            </button>
            <button
              type="button"
              className="btn btn-danger fw-semibold"
              onClick={handleGuardar}
              disabled={cargandoFolio}
            >
              Agregar Vale
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
