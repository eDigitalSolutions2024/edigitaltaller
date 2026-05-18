import React from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/facturacion.css";

export default function FacturacionPanel() {
  const navigate = useNavigate();

  return (
    <div className="fact-panel">
      <div className="fact-header">
        <div>
          <h2 className="fact-title">Facturación</h2>
          <p className="fact-subtitle">Gestiona CFDI, vistas previas y emisión de facturas.</p>
        </div>

        <div className="fact-actions">
          <button className="btn btn-danger" onClick={() => navigate("/facturacion/nueva")}>
            ➕ Nueva factura
          </button>
          <button className="btn btn-outline-secondary" onClick={() => navigate("/facturacion/consultar")}>
            🔎 Consultar
          </button>
        </div>
      </div>

      <div className="fact-cards">
        <div className="fact-card fact-card--gradient" onClick={() => navigate("/facturacion/nueva")}>
          <div className="fact-card-icon">🧾</div>
          <div className="fact-card-body">
            <div className="fact-card-title">Nueva factura</div>
            <div className="fact-card-desc">Crea una factura nueva y revisa totales con vista previa.</div>
            <div className="fact-card-link">Abrir →</div>
          </div>
        </div>

        <div className="fact-card" onClick={() => navigate("/facturacion/consultar")}>
          <div className="fact-card-icon">📁</div>
          <div className="fact-card-body">
            <div className="fact-card-title">Consultar facturas</div>
            <div className="fact-card-desc">Busca por cliente, folio, fechas, estatus (timbrada/cancelada).</div>
            <div className="fact-card-link">Abrir →</div>
          </div>
        </div>

            <div
            className="fact-card"
            onClick={() => navigate("/facturacion/configuracion-fiscal")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                navigate("/facturacion/configuracion-fiscal");
                }
            }}
            >
            <div className="fact-card-icon">⚙️</div>
            <div className="fact-card-body">
                <div className="fact-card-title">Configuración fiscal</div>
                <div className="fact-card-desc">Emisor, series/folios, certificados, PAC.</div>
                <div className="fact-card-link">Abrir →</div>
            </div>
            </div>

      </div>
    </div>
  );
}
