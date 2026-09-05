// src/pages/vehiculo/ModalCambiarCliente.jsx
import React, { useEffect, useMemo, useState } from "react";
import { getClientes } from "../../api/customers";

// apellidoPaterno/apellidoMaterno son exclusivos de "Particular"; en
// empresa/gobierno pueden traer datos viejos huérfanos, por eso no se usan
// de respaldo ahí (mismo criterio que VehiculosEntrada / VehiculoOrdenGeneral).
function nombreCliente(c) {
  if (!c) return "Sin nombre";
  if (c.tipoCliente === "Empresa Gobierno") {
    return c.gobierno?.nombreGobierno || c.nombre || "Sin nombre";
  }
  if (c.tipoCliente === "Empresa Privada" || c.tipoCliente === "Empresa Arrendadora") {
    return c.empresa?.razonSocial || c.nombre || "Sin nombre";
  }
  return (
    [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(" ") ||
    "Sin nombre"
  );
}

export default function ModalCambiarCliente({ clienteActual, guardando, onClose, onConfirm }) {
  const [clientes, setClientes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState("");
  const [seleccionado, setSeleccionado] = useState(null);
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    getClientes({ limit: 9999 })
      .then((res) => {
        const data = Array.isArray(res.data?.data) ? res.data.data : [];
        setClientes(data);
      })
      .catch(() => setClientes([]))
      .finally(() => setCargando(false));
  }, []);

  const clienteActualId = clienteActual?._id ? String(clienteActual._id) : "";

  const filtrados = useMemo(() => {
    const term = q.toLowerCase().trim();
    const base = clientes.filter((c) => String(c._id) !== clienteActualId);
    if (!term) return base.slice(0, 50);
    return base
      .filter((c) => {
        const candidatos = [
          c.nombre,
          c.apellidoPaterno,
          c.apellidoMaterno,
          c.empresa?.razonSocial,
          c.gobierno?.nombreGobierno,
          c.rfc,
        ].filter(Boolean);
        return candidatos.some((v) => v.toLowerCase().includes(term));
      })
      .slice(0, 50);
  }, [q, clientes, clienteActualId]);

  const handleConfirmar = () => {
    if (!seleccionado || guardando) return;
    onConfirm(seleccionado._id, motivo.trim());
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
          maxWidth: 520,
          background: "white",
          borderRadius: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div className="d-flex justify-content-between align-items-center p-3 border-bottom">
          <span className="fw-bold">Cambiar cliente de la orden</span>
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
            <label className="form-label fw-semibold">Cliente actual</label>
            <div className="form-control-plaintext border rounded px-2 py-1 bg-light">
              {clienteActual ? nombreCliente(clienteActual) : "—"}
            </div>
          </div>

          <div className="mb-2">
            <label className="form-label fw-semibold">Nuevo cliente</label>
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Buscar por nombre, razón social o RFC..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              disabled={guardando}
              autoFocus
            />
          </div>

          <div
            className="border rounded"
            style={{ maxHeight: 220, overflowY: "auto" }}
          >
            {cargando ? (
              <div className="text-muted small p-2">Cargando clientes...</div>
            ) : filtrados.length === 0 ? (
              <div className="text-muted small p-2">Sin resultados.</div>
            ) : (
              filtrados.map((c) => {
                const activo = seleccionado?._id === c._id;
                return (
                  <button
                    type="button"
                    key={c._id}
                    onClick={() => setSeleccionado(c)}
                    disabled={guardando}
                    className={
                      "d-block w-100 text-start border-0 px-2 py-1 " +
                      (activo ? "bg-primary text-white" : "bg-white")
                    }
                    style={{ cursor: "pointer" }}
                  >
                    <div className="fw-semibold">{nombreCliente(c)}</div>
                    <div className={"small " + (activo ? "text-white-50" : "text-muted")}>
                      {[c.tipoCliente, c.rfc].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="mt-3">
            <label className="form-label fw-semibold">Motivo (opcional)</label>
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Ej.: se abrió con el cliente equivocado"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              disabled={guardando}
            />
          </div>

          <p className="text-muted small mt-3 mb-0">
            Solo se puede cambiar el cliente si la orden no tiene pagos en Cajas,
            factura ni anticipo aplicado.
          </p>
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
