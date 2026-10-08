// src/pages/clientes/components/ModalRazonesSocialesCliente.jsx
//
// Historial de razones sociales (nombres) con las que se ha facturado a este cliente.
// Se llena solo al generar facturas con un nombre distinto al fiscal; aquí se pueden
// ver, editar, eliminar o agregar. Se abre desde "Editar Cliente" → ⚙ Configuración.
import { useEffect, useState } from "react";
import {
  getCustomerRazonesSociales,
  updateCustomerRazonesSociales,
} from "../../../api/customers";

const fmtFecha = (f) => (f ? new Date(f).toLocaleDateString("es-MX") : "—");

export default function ModalRazonesSocialesCliente({ clienteId, clienteNombre = "", onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const { data } = await getCustomerRazonesSociales(clienteId);
        if (!cancelado) setRows(Array.isArray(data?.data) ? data.data : []);
      } catch (err) {
        if (!cancelado) setMsg("❌ " + (err?.response?.data?.error || err.message));
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [clienteId]);

  const setNombre = (i, nombre) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, nombre } : r)));
  const quitar = (i) => setRows((prev) => prev.filter((_, idx) => idx !== i));
  const agregar = () => setRows((prev) => [...prev, { nombre: "", veces: 0, ultimaVez: null }]);

  const guardar = async () => {
    setSaving(true);
    setMsg("");
    try {
      const { data } = await updateCustomerRazonesSociales(clienteId, rows);
      setRows(Array.isArray(data?.data) ? data.data : rows);
      setMsg("✅ Razones sociales guardadas.");
    } catch (err) {
      setMsg("❌ " + (err?.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="modal-dialog modal-lg modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              Razones sociales{clienteNombre ? ` — ${clienteNombre}` : ""}
            </h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body">
            <p className="text-muted small">
              Nombres con los que se ha facturado a este cliente. Se guardan solos al generar una
              factura con un nombre distinto al fiscal, y aparecen como opción en Nueva Factura.
            </p>

            {loading ? (
              <div className="text-muted">Cargando…</div>
            ) : (
              <table className="table table-sm table-bordered align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Nombre / razón social</th>
                    <th style={{ width: 80 }} className="text-center">Veces</th>
                    <th style={{ width: 110 }} className="text-center">Última vez</th>
                    <th style={{ width: 80 }} className="text-center">Eliminar</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-muted text-center">Sin razones sociales guardadas.</td>
                    </tr>
                  )}
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td>
                        <input
                          className="form-control form-control-sm"
                          value={r.nombre}
                          onChange={(e) => setNombre(i, e.target.value)}
                        />
                      </td>
                      <td className="text-center">{r.veces || 0}</td>
                      <td className="text-center">{fmtFecha(r.ultimaVez)}</td>
                      <td className="text-center">
                        <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => quitar(i)}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={agregar} disabled={loading}>
              + Agregar
            </button>
            {msg && <div className="mt-2 small">{msg}</div>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
              Cerrar
            </button>
            <button type="button" className="btn btn-primary" disabled={loading || saving} onClick={guardar}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
