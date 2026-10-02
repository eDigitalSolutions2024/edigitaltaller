// src/pages/clientes/components/ModalCuentasBancariasCliente.jsx
//
// Cuentas bancarias del cliente (una por banco). Se abre desde "Editar Cliente" →
// ⚙ Configuración. Se usan como Banco/Cuenta ORDENANTE al generar un Complemento de
// pago por transferencia (ver NuevaFactura.jsx y backend/routes/generar_xml.js).
import { useEffect, useState } from "react";
import {
  getCustomerCuentasBancarias,
  updateCustomerCuentasBancarias,
} from "../../../api/customers";
import { REGLAS_ORDENANTE } from "../../../utils/cuentaOrdenante";
import useBancos, { TERMINALES_CATALOGO } from "../../../hooks/useBancos";

const filaVacia = () => ({ banco: "", formaPago: "03", numeroCuenta: "" });

export default function ModalCuentasBancariasCliente({ clienteId, clienteNombre = "", onClose }) {
  useBancos();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        setLoading(true);
        const { data } = await getCustomerCuentasBancarias(clienteId);
        if (cancelado) return;
        const lista = Array.isArray(data?.data) ? data.data : [];
        setRows(lista.length ? lista.map((r) => ({ ...filaVacia(), formaPago: "", ...r })) : [filaVacia()]);
      } catch (err) {
        if (!cancelado) {
          setMsg("❌ " + (err?.response?.data?.error || err.message));
          setRows([filaVacia()]);
        }
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [clienteId]);

  const setField = (i, campo, valor) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [campo]: valor } : r)));
  const addRow = () => setRows((prev) => [...prev, filaVacia()]);
  const removeRow = (i) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const guardar = async () => {
    const limpias = rows
      .map((r) => ({
        banco: String(r.banco || "").trim(),
        formaPago: String(r.formaPago || "").trim(),
        numeroCuenta: String(r.numeroCuenta || "").trim(),
      }))
      .filter((r) => r.banco || r.numeroCuenta);

    setSaving(true);
    setMsg("");
    try {
      const { data } = await updateCustomerCuentasBancarias(clienteId, limpias);
      const lista = Array.isArray(data?.data) ? data.data : limpias;
      setRows(lista.length ? lista.map((r) => ({ ...filaVacia(), formaPago: "", ...r })) : [filaVacia()]);
      setMsg("✅ Cuentas guardadas.");
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
              Cuentas bancarias del cliente{clienteNombre ? ` — ${clienteNombre}` : ""}
            </h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body">
            <p className="text-muted small">
              Una cuenta por banco y tipo de pago. Se ofrecen como <b>banco ordenante</b> al
              generar un Complemento de pago. Longitudes del SAT: transferencia 10, 16 o 18
              dígitos; cheque 11 o 18; tarjeta de crédito/débito 16. El RFC del banco sale del
              catálogo (Configuración).
            </p>

            {loading ? (
              <div className="text-muted">Cargando…</div>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm table-bordered align-middle">
                  <thead className="table-light">
                    <tr>
                      <th style={{ width: 240 }}>Banco *</th>
                      <th style={{ width: 210 }}>Tipo *</th>
                      <th>Número de cuenta / tarjeta *</th>
                      <th style={{ width: 70 }} className="text-center">Quitar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td>
                          <select
                            className="form-select form-select-sm"
                            value={r.banco}
                            onChange={(e) => setField(i, "banco", e.target.value)}
                          >
                            <option value="">— Selecciona —</option>
                            {TERMINALES_CATALOGO.map((b) => (
                              <option key={b} value={b}>{b}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            className="form-select form-select-sm"
                            value={r.formaPago}
                            onChange={(e) => setField(i, "formaPago", e.target.value)}
                          >
                            {!r.formaPago && <option value="">(Sin tipo)</option>}
                            {Object.entries(REGLAS_ORDENANTE).map(([k, v]) => (
                              <option key={k} value={k}>{k} - {v.nombre}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            className="form-control form-control-sm"
                            value={r.numeroCuenta}
                            onChange={(e) => setField(i, "numeroCuenta", e.target.value)}
                          />
                        </td>
                        <td className="text-center">
                          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removeRow(i)}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <button type="button" className="btn btn-sm btn-outline-primary" onClick={addRow} disabled={loading}>
              + Agregar cuenta
            </button>

            {msg && <div className="mt-2">{msg}</div>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-light" onClick={onClose} disabled={saving}>
              Cerrar
            </button>
            <button type="button" className="btn btn-primary" onClick={guardar} disabled={saving || loading}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
