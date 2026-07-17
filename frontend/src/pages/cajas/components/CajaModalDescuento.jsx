import React, { useState } from "react";

function formatMoney(n) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}

const FORM_VACIO = { tipo: "MONTO", valor: "", motivo: "", lineaId: "" };

export default function CajaModalDescuento({ show, descuentos = [], ventaRows = [], onClose, onAdd, onUpdate, onDelete }) {
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  if (!show) return null;

  // Solo las líneas ya guardadas (con _id) pueden recibir un descuento propio.
  const lineasDisponibles = ventaRows.filter((r) => r._id);

  const nombreLinea = (lineaId) => {
    if (!lineaId) return "Toda la orden";
    const linea = ventaRows.find((r) => String(r._id) === String(lineaId));
    return linea ? linea.concepto : "Toda la orden";
  };

  const handleEditar = (d) => {
    setEditandoId(d._id);
    setForm({ tipo: d.tipo, valor: d.valor, motivo: d.motivo || "", lineaId: d.lineaId ? String(d.lineaId) : "" });
    setError("");
  };

  const handleCancelarEdicion = () => {
    setEditandoId(null);
    setForm(FORM_VACIO);
    setError("");
  };

  const handleToggleActivo = async (d) => {
    try {
      await onUpdate(d._id, { activo: !d.activo });
    } catch (err) {
      console.error(err);
      setError("Error al actualizar el descuento.");
    }
  };

  const handleEliminar = async (d) => {
    if (!window.confirm("¿Eliminar este descuento?")) return;
    try {
      await onDelete(d._id);
      if (editandoId === d._id) handleCancelarEdicion();
    } catch (err) {
      console.error(err);
      setError("Error al eliminar el descuento.");
    }
  };

  const handleGuardar = async () => {
    if (!Number(form.valor) || Number(form.valor) <= 0) {
      setError("Captura un valor de descuento mayor a 0.");
      return;
    }
    try {
      setGuardando(true);
      setError("");
      const payload = {
        tipo: form.tipo,
        valor: Number(form.valor),
        motivo: form.motivo,
        lineaId: form.lineaId || null,
      };
      if (editandoId) {
        await onUpdate(editandoId, payload);
      } else {
        await onAdd(payload);
      }
      handleCancelarEdicion();
    } catch (err) {
      console.error(err);
      setError("Error al guardar el descuento.");
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
      <div className="modal-dialog modal-lg modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title fw-bold">Descuentos</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body">
            <h6 className="fw-semibold mb-2">Descuentos Activos</h6>
            <div className="table-responsive mb-3">
              <table className="table table-sm table-bordered align-middle">
                <thead className="table-light text-center">
                  <tr>
                    <th>Aplica a</th>
                    <th>Tipo</th>
                    <th>Valor</th>
                    <th>Motivo</th>
                    <th>Activo</th>
                    <th style={{ width: 140 }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {descuentos.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center text-muted">
                        No hay descuentos registrados.
                      </td>
                    </tr>
                  )}
                  {descuentos.map((d) => (
                    <tr key={d._id} className={d.activo === false ? "text-muted" : ""}>
                      <td>{nombreLinea(d.lineaId)}</td>
                      <td className="text-center">{d.tipo === "PORCENTAJE" ? "Porcentaje" : "Monto"}</td>
                      <td className="text-end">
                        {d.tipo === "PORCENTAJE" ? `${d.valor}%` : formatMoney(d.valor)}
                      </td>
                      <td>{d.motivo}</td>
                      <td className="text-center">
                        <input
                          type="checkbox"
                          checked={d.activo !== false}
                          onChange={() => handleToggleActivo(d)}
                        />
                      </td>
                      <td className="text-center">
                        <div className="d-flex gap-1 justify-content-center">
                          <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => handleEditar(d)}>
                            Editar
                          </button>
                          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => handleEliminar(d)}>
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h6 className="fw-semibold mb-2">{editandoId ? "Editar Descuento" : "Agregar Descuento"}</h6>

            <div className="mb-2">
              <label className="form-label mb-0 fw-semibold">Aplica a</label>
              <select
                className="form-select"
                value={form.lineaId}
                onChange={(e) => setForm((f) => ({ ...f, lineaId: e.target.value }))}
              >
                <option value="">Toda la orden</option>
                {lineasDisponibles.map((r) => (
                  <option key={r._id} value={r._id}>{r.concepto}</option>
                ))}
              </select>
            </div>

            <div className="mb-2">
              <label className="form-label mb-0 fw-semibold">Tipo de Descuento</label>
              <select
                className="form-select"
                value={form.tipo}
                onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}
              >
                <option value="MONTO">Monto fijo ($)</option>
                <option value="PORCENTAJE">Porcentaje (%)</option>
              </select>
            </div>

            <div className="mb-2">
              <label className="form-label mb-0">Valor</label>
              <input
                type="number"
                step="0.01"
                className="form-control"
                value={form.valor}
                onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
              />
            </div>

            <div className="mb-2">
              <label className="form-label mb-0">Motivo</label>
              <textarea
                className="form-control"
                rows={2}
                value={form.motivo}
                onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))}
              />
            </div>

            {error && <p className="text-danger mt-2 mb-0">{error}</p>}
          </div>

          <div className="modal-footer">
            {editandoId && (
              <button type="button" className="btn btn-secondary" onClick={handleCancelarEdicion}>
                Cancelar Edición
              </button>
            )}
            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
              Cerrar
            </button>
            <button type="button" className="btn btn-warning fw-semibold" onClick={handleGuardar} disabled={guardando}>
              {guardando ? "Guardando..." : editandoId ? "Actualizar Descuento" : "Agregar Descuento"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
