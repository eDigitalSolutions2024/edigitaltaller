// src/pages/vehiculo/ModalCambiarAsesor.jsx
import React, { useEffect, useState } from "react";
import Dropdown from "../../components/Dropdown";
import { getAsesores } from "../../api/users";

export default function ModalCambiarAsesor({ asesorActual, guardando, onClose, onConfirm }) {
  const [asesores, setAsesores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [seleccionado, setSeleccionado] = useState("");

  useEffect(() => {
    getAsesores()
      .then((data) => setAsesores(Array.isArray(data) ? data : []))
      .catch(() => setAsesores([]))
      .finally(() => setCargando(false));
  }, []);

  const handleConfirmar = () => {
    if (!seleccionado || guardando) return;
    onConfirm(seleccionado);
  };

  return (
    <>
      <div
        onClick={() => !guardando && onClose()}
        style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1040 }}
      />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          zIndex: 1050,
          width: "90%",
          maxWidth: 420,
          background: "white",
          borderRadius: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div className="d-flex justify-content-between align-items-center p-3 border-bottom">
          <span className="fw-bold">Cambiar asesor de la orden</span>
          <button
            onClick={onClose}
            disabled={guardando}
            style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer" }}
          >
            ×
          </button>
        </div>

        <div className="p-3">
          <div className="mb-3">
            <label className="form-label fw-semibold">Asesor actual</label>
            <div className="form-control-plaintext border rounded px-2 py-1 bg-light">
              {asesorActual || "—"}
            </div>
          </div>

          <div className="mb-1">
            <label className="form-label fw-semibold">Nuevo asesor</label>
            {cargando ? (
              <div className="text-muted small">Cargando asesores...</div>
            ) : (
              <Dropdown
                className="form-select"
                value={seleccionado}
                onChange={(e) => setSeleccionado(e.target.value)}
                disabled={guardando}
              >
                <Dropdown.Option value="">-- Seleccionar --</Dropdown.Option>
                {asesores.map((a) => (
                  <Dropdown.Option key={a._id} value={a._id}>
                    {a.name}
                  </Dropdown.Option>
                ))}
              </Dropdown>
            )}
          </div>
        </div>

        <div className="d-flex justify-content-end gap-2 p-3 border-top">
          <button className="btn btn-outline-secondary btn-sm" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleConfirmar}
            disabled={!seleccionado || guardando}
          >
            {guardando ? "Guardando..." : "Confirmar cambio"}
          </button>
        </div>
      </div>
    </>
  );
}
