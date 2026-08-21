// src/pages/vehiculo/ModalAnticipoHoras.jsx
import React, { useState } from "react";
import Dropdown from "../../components/Dropdown";
import { TARIFA_HORA } from "../../utils/manoObra";
import { formatFecha } from "../../utils/fechas";

function formatMoney(n) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}

export default function ModalAnticipoHoras({ show, mecanicos = [], moRows = [], anticipos = [], guardando = false, onClose, onAdd, onRemove }) {
  const [seleccionado, setSeleccionado] = useState("");
  const [horasAbonar, setHorasAbonar] = useState("");
  const [error, setError] = useState("");

  if (!show) return null;

  const nombreMecanico = (id) => mecanicos.find((m) => String(m._id) === String(id))?.nombre || id || "—";

  // Solo mecánicos con mano de obra asignada en esta orden (la carrocería no
  // entra al Reporte de Horas Trabajadas por Técnico, así que no se anticipa).
  const idsAsignados = [
    ...new Set(
      moRows.filter((m) => !m.esCarroceria && m.mecanico).map((m) => String(m.mecanico))
    ),
  ];

  const horasTotalesDe = (id) =>
    moRows
      .filter((m) => !m.esCarroceria && String(m.mecanico) === String(id))
      .reduce((s, m) => s + (Number(m.horas) || 0), 0);

  const horasAnticipadasDe = (id) =>
    anticipos
      .filter((a) => String(a.mecanico) === String(id))
      .reduce((s, a) => s + (Number(a.horas) || 0), 0);

  const horasTotales = seleccionado ? horasTotalesDe(seleccionado) : 0;
  const horasYaAnticipadas = seleccionado ? horasAnticipadasDe(seleccionado) : 0;
  const horasDisponibles = Math.max(0, horasTotales - horasYaAnticipadas);
  const montoAbonar = (Number(horasAbonar) || 0) * TARIFA_HORA;

  const handleSeleccionar = (id) => {
    setSeleccionado(id);
    setHorasAbonar("");
    setError("");
  };

  const handleConfirmar = async () => {
    const horas = Number(horasAbonar);
    if (!seleccionado) {
      setError("Selecciona un mecánico.");
      return;
    }
    if (!horas || horas <= 0) {
      setError("Captura horas mayores a 0.");
      return;
    }
    if (horas > horasDisponibles) {
      setError(`Solo quedan ${horasDisponibles} horas disponibles para anticipar a este mecánico.`);
      return;
    }
    setError("");
    const ok = await onAdd({
      mecanico: seleccionado,
      horas,
      monto: horas * TARIFA_HORA,
      fecha: new Date().toISOString(),
    });
    if (ok) setHorasAbonar("");
  };

  return (
    <div
      className="modal d-block"
      tabIndex="-1"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-dialog modal-lg modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title fw-bold">Anticipar Horas a Mano de Obra</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body">
            <h6 className="fw-semibold mb-2">Anticipos Registrados en esta Orden</h6>
            <div className="table-responsive mb-3">
              <table className="table table-sm table-bordered align-middle">
                <thead className="table-light text-center">
                  <tr>
                    <th>Mecánico</th>
                    <th>Horas</th>
                    <th>Monto</th>
                    <th>Fecha</th>
                    <th style={{ width: 90 }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {anticipos.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center text-muted">
                        No hay horas anticipadas registradas.
                      </td>
                    </tr>
                  )}
                  {anticipos.map((a, idx) => (
                    <tr key={idx}>
                      <td>{nombreMecanico(a.mecanico)}</td>
                      <td className="text-center">{a.horas}</td>
                      <td className="text-end">{formatMoney(a.monto)}</td>
                      <td>{formatFecha(a.fecha) || "—"}</td>
                      <td className="text-center">
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() => onRemove(idx)}
                          disabled={guardando}
                        >
                          Quitar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h6 className="fw-semibold mb-2">Anticipar Horas</h6>

            {idsAsignados.length === 0 ? (
              <p className="text-muted mb-0">
                No hay mecánicos asignados a mano de obra en esta orden todavía.
              </p>
            ) : (
              <>
                <div className="mb-2">
                  <label className="form-label mb-0 fw-semibold">Mecánico</label>
                  <Dropdown
                    className="form-select"
                    value={seleccionado}
                    onChange={(e) => handleSeleccionar(e.target.value)}
                    disabled={guardando}
                  >
                    <Dropdown.Option value="">-- Seleccionar --</Dropdown.Option>
                    {idsAsignados.map((id) => (
                      <Dropdown.Option key={id} value={id}>{nombreMecanico(id)}</Dropdown.Option>
                    ))}
                  </Dropdown>
                </div>

                {seleccionado && (
                  <div className="row g-2 mb-2 text-center">
                    <div className="col-6">
                      <div className="border rounded p-2 h-100">
                        <div className="text-muted small">Horas Totales (esta orden)</div>
                        <div className="fw-bold fs-5">{horasTotales}</div>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="border rounded p-2 h-100">
                        <div className="text-muted small">Horas Disponibles para Anticipar</div>
                        <div className="fw-bold fs-5">{horasDisponibles}</div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mb-2">
                  <label className="form-label mb-0">Horas a Abonar</label>
                  <input
                    type="number"
                    step="0.1"
                    className="form-control"
                    value={horasAbonar}
                    disabled={!seleccionado || guardando}
                    onChange={(e) => setHorasAbonar(e.target.value)}
                  />
                </div>

                <div className="alert alert-info py-2 mb-0">
                  Equivale a <strong>{formatMoney(montoAbonar)}</strong> ({formatMoney(TARIFA_HORA)} / hora)
                </div>
              </>
            )}

            {error && <p className="text-danger mt-2 mb-0">{error}</p>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={guardando}>
              Cerrar
            </button>
            <button
              type="button"
              className="btn btn-warning fw-semibold"
              onClick={handleConfirmar}
              disabled={idsAsignados.length === 0 || guardando}
            >
              {guardando ? "Guardando..." : "Confirmar Anticipo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
