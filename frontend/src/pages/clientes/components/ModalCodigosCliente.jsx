// src/pages/clientes/components/ModalCodigosCliente.jsx
//
// Catálogo de códigos de servicio propios del cliente. Se abre desde
// "Editar Cliente" → ⚙ Configuración. Cada fila asocia una descripción de
// servicio al código que usa el cliente (codigoCliente); ese código se envía
// como NoIdentificacion en el CFDI 4.0 al generar la factura, en cada concepto
// cuya descripción coincida (ver frontend/src/pages/facturacion/NuevaFactura.jsx
// y backend/routes/generar_xml.js).
import { useEffect, useState } from "react";
import { getCustomerCodigos, updateCustomerCodigos } from "../../../api/customers";

const filaVacia = () => ({ codigoCliente: "", descripcion: "" });

export default function ModalCodigosCliente({ clienteId, clienteNombre = "", onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        setLoading(true);
        const { data } = await getCustomerCodigos(clienteId);
        if (cancelado) return;
        const lista = Array.isArray(data?.data) ? data.data : [];
        setRows(lista.length ? lista.map((r) => ({ ...filaVacia(), ...r })) : [filaVacia()]);
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
    // El backend descarta filas sin codigoCliente; aquí se limpian para no
    // guardar renglones a medio llenar.
    const limpias = rows
      .map((r) => ({
        codigoCliente: String(r.codigoCliente || "").trim(),
        descripcion: String(r.descripcion || "").trim(),
      }))
      .filter((r) => r.codigoCliente);

    setSaving(true);
    setMsg("");
    try {
      const { data } = await updateCustomerCodigos(clienteId, limpias);
      const lista = Array.isArray(data?.data) ? data.data : limpias;
      setRows(lista.length ? lista.map((r) => ({ ...filaVacia(), ...r })) : [filaVacia()]);
      setMsg("✅ Códigos guardados.");
    } catch (err) {
      setMsg("❌ " + (err?.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal fade show d-block"
      tabIndex="-1"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog modal-lg modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              Códigos de servicio del cliente
              {clienteNombre ? ` — ${clienteNombre}` : ""}
            </h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body">
            <p className="text-muted small">
              <b>Código del cliente</b>: el que usa el cliente para este servicio; al
              generar la factura se envía como <code>NoIdentificacion</code> en cada
              concepto cuya <b>descripción</b> coincida. La clave del SAT y la descripción
              del concepto no cambian.
            </p>

            {loading ? (
              <div className="text-muted">Cargando…</div>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm table-bordered align-middle">
                  <thead className="table-light">
                    <tr>
                      <th style={{ width: 200 }}>Código del cliente *</th>
                      <th>Descripción</th>
                      <th style={{ width: 70 }} className="text-center">
                        Quitar
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td>
                          <input
                            className="form-control form-control-sm"
                            value={r.codigoCliente}
                            onChange={(e) => setField(i, "codigoCliente", e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            className="form-control form-control-sm"
                            value={r.descripcion}
                            onChange={(e) => setField(i, "descripcion", e.target.value)}
                          />
                        </td>
                        <td className="text-center">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => removeRow(i)}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              onClick={addRow}
              disabled={loading}
            >
              + Agregar fila
            </button>

            {msg && <div className="mt-2">{msg}</div>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-light" onClick={onClose} disabled={saving}>
              Cerrar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={guardar}
              disabled={saving || loading}
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
