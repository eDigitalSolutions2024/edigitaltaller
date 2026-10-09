// src/pages/clientes/components/ModalFormatoFacturaCliente.jsx
//
// Formato del PDF de las facturas de este cliente. Se abre desde "Editar Cliente" →
// ⚙ Configuración (ver backend/service/facturaFormatoInegi.js).
import { useEffect, useState } from "react";
import {
  getCustomerFormatoFactura,
  updateCustomerFormatoFactura,
} from "../../../api/customers";

export default function ModalFormatoFacturaCliente({ clienteId, clienteNombre = "", onClose }) {
  const [formato, setFormato] = useState("NORMAL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const { data } = await getCustomerFormatoFactura(clienteId);
        if (!cancelado) setFormato(data?.data?.formatoFactura === "INEGI" ? "INEGI" : "NORMAL");
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

  const guardar = async () => {
    setSaving(true);
    setMsg("");
    try {
      await updateCustomerFormatoFactura(clienteId, formato);
      setMsg("✅ Formato guardado.");
    } catch (err) {
      setMsg("❌ " + (err?.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="modal-dialog">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              Formato de factura{clienteNombre ? ` — ${clienteNombre}` : ""}
            </h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body">
            <p className="text-muted small">
              Es el formato del PDF al facturar a este cliente (vista previa y factura generada).
            </p>
            <select
              className="form-select"
              value={formato}
              disabled={loading || saving}
              onChange={(e) => setFormato(e.target.value)}
            >
              <option value="NORMAL">Normal (Servicompactos)</option>
              <option value="INEGI">INEGI</option>
            </select>
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
