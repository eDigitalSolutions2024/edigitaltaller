// src/pages/garantias/ModalCancelarGarantia.jsx
import React, { useEffect, useState } from "react";
import Dropdown from "../../components/Dropdown";
import { getAsesores } from "../../api/users";

// Modal que se muestra al presionar "Cancelar" sobre una solicitud de
// garantía marcada como "No aplica": confirma la orden que se va a cancelar
// y pide elegir el asesor que aparecerá en la nueva orden de reemplazo.
export default function ModalCancelarGarantia({ solicitud, guardando, onClose, onConfirm }) {
  const [asesores, setAsesores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [seleccionado, setSeleccionado] = useState("");
  const [nuevaOrdenServicio, setNuevaOrdenServicio] = useState("");

  useEffect(() => {
    if (!solicitud) return;
    setSeleccionado("");
    setNuevaOrdenServicio("");
    getAsesores()
      .then((data) => setAsesores(Array.isArray(data) ? data : []))
      .catch(() => setAsesores([]))
      .finally(() => setCargando(false));
  }, [solicitud]);

  if (!solicitud) return null;

  const g = solicitud.garantia || {};

  const handleConfirmar = () => {
    if (!seleccionado || guardando) return;
    const asesor = asesores.find((a) => a._id === seleccionado);
    onConfirm(asesor, nuevaOrdenServicio.trim());
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
            <h5 className="modal-title fw-bold">Cancelar orden</h5>
            <button type="button" className="btn-close" onClick={onClose} disabled={guardando} />
          </div>

          <div className="modal-body">
            <div className="alert alert-danger py-2">
              Se cancelará la orden <strong>{solicitud.ordenServicio}</strong>
              {g.ordenAnteriorFolio ? ` (garantía sobre ${g.ordenAnteriorFolio})` : ""}.
              Esta acción no se puede deshacer.
            </div>
            {g.motivo && (
              <p className="small mb-3">
                <strong>Motivo "No aplica":</strong> {g.motivo}
              </p>
            )}

            <label className="form-label fw-semibold">
              Asesor que aparecerá en la nueva orden
            </label>
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

            <label className="form-label fw-semibold mt-3">
              Número de la nueva orden de servicio (opcional)
            </label>
            <input
              type="text"
              className="form-control"
              placeholder="Ej. OS-045"
              value={nuevaOrdenServicio}
              onChange={(e) => setNuevaOrdenServicio(e.target.value)}
              disabled={guardando}
            />
            <small className="text-muted d-block mt-1">
              Al confirmar se cancelará la orden y podrás continuar con una
              nueva orden prellenada con los mismos datos del cliente, el
              vehículo, las fallas reportadas y la inspección física
              (accesorios, daños e indicadores del tablero), sin los
              servicios ni las refacciones solicitadas. Si capturas aquí el
              número de orden, aparecerá listo en esa pantalla (puedes
              cambiarlo antes de guardar).
            </small>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={guardando}>
              Cerrar
            </button>
            <button
              type="button"
              className="btn btn-danger fw-semibold"
              onClick={handleConfirmar}
              disabled={!seleccionado || guardando}
            >
              {guardando ? "Cancelando..." : "Cancelar orden y continuar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
