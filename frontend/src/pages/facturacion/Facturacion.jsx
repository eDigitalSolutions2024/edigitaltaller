import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";


export default function Facturacion() {
  const [res, setRes] = useState(null);

  const testPreview = async () => {
    const { data } = await axios.post("/facturacion/preview", {
      ivaRate: 0.16,
      retencionIvaRate: 0,
      aplicarRetencionIsr: true,
      items: [{ descripcion: "Servicio", cantidad: 1, valorUnitario: 1000 }],
    });
    setRes(data);
  };

  return (
    <div style={{ padding: 24 }}>
      <h2>Facturación</h2>

      <button className="btn btn-primary" onClick={testPreview}>
        Probar Preview
      </button>

      <pre style={{ marginTop: 16 }}>
        {res ? JSON.stringify(res, null, 2) : "Sin respuesta aún"}
      </pre>
    </div>
  );
}
