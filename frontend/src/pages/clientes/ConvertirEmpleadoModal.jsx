import React, { useEffect, useState } from "react";
import { listarEmpleados } from "../../api/empleados";
import { convertirClienteAEmpleado } from "../../api/customers";

function nombreCliente(c) {
  if (!c) return "";
  if (c.tipoCliente === "Empresa Gobierno") return c.gobierno?.nombreGobierno || c.nombre || "";
  if (c.tipoCliente === "Empresa Privada" || c.tipoCliente === "Empresa Arrendadora") {
    return c.empresa?.razonSocial || c.nombre || "";
  }
  return [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(" ");
}

// Consulta de Clientes → "Convertir a Empleado": migración manual para un
// cliente marcado "Empleado" (esEmpleado) que se dio de alta a mano antes de
// que existiera el botón "Empleados" de Nueva Orden de Servicio. Liga el
// cliente a un registro real de Empleado (existente o nuevo) sin tocar las
// órdenes que ya tiene abiertas; a partir de ahí deja de listarse en
// Clientes (ver Cliente.empleadoRef).
export default function ConvertirEmpleadoModal({ show, cliente, onClose, onConverted }) {
  const [empleados, setEmpleados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [guardandoId, setGuardandoId] = useState(null);

  useEffect(() => {
    if (!show) return;
    setSearch("");
    setError("");
    setNombreNuevo(nombreCliente(cliente));
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, cliente]);

  async function cargar() {
    try {
      setLoading(true);
      setError("");
      const data = await listarEmpleados({ activo: true });
      setEmpleados(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error cargando empleados:", err);
      setError("No se pudieron cargar los empleados.");
    } finally {
      setLoading(false);
    }
  }

  async function vincular(payload, idBoton) {
    try {
      setGuardandoId(idBoton);
      setError("");
      const res = await convertirClienteAEmpleado(cliente._id, payload);
      onConverted(res.data?.data);
    } catch (err) {
      console.error("Error convirtiendo cliente a empleado:", err);
      setError(err?.response?.data?.error || "No se pudo convertir el cliente.");
    } finally {
      setGuardandoId(null);
    }
  }

  const filtrados = empleados.filter((e) => {
    const term = search.toLowerCase().trim();
    if (!term) return true;
    return (e.nombre || "").toLowerCase().includes(term);
  });

  if (!show) return null;

  return (
    <div
      className="modal d-block"
      tabIndex="-1"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-dialog modal-lg modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title fw-bold">Convertir a Empleado</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body">
            <p className="text-muted">
              Liga <strong>{nombreCliente(cliente)}</strong> a un empleado del taller. Sus
              órdenes ya abiertas se conservan; el cliente dejará de aparecer en Clientes.
            </p>

            {error && <p className="text-danger">{error}</p>}

            <div className="mb-3">
              <label className="form-label fw-semibold">Vincular a un empleado existente</label>
              <input
                type="text"
                className="form-control mb-2"
                placeholder="Buscar empleado..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              {loading && <p className="text-muted">Cargando empleados...</p>}

              {!loading && filtrados.length > 0 && (
                <ul className="list-group" style={{ maxHeight: "220px", overflowY: "auto" }}>
                  {filtrados.map((e) => (
                    <li
                      key={e._id}
                      className="list-group-item d-flex justify-content-between align-items-center"
                    >
                      {e.nombre}
                      <button
                        type="button"
                        className="btn btn-success btn-sm"
                        disabled={guardandoId === e._id}
                        onClick={() => vincular({ empleadoId: e._id }, e._id)}
                      >
                        {guardandoId === e._id ? "Vinculando..." : "Vincular"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {!loading && filtrados.length === 0 && (
                <p className="text-muted mb-0">No hay empleados activos con ese nombre.</p>
              )}
            </div>

            <hr />

            <div>
              <label className="form-label fw-semibold">O crear un empleado nuevo</label>
              <div className="d-flex gap-2">
                <input
                  type="text"
                  className="form-control"
                  value={nombreNuevo}
                  onChange={(e) => setNombreNuevo(e.target.value)}
                  placeholder="Nombre del empleado"
                />
                <button
                  type="button"
                  className="btn btn-primary text-nowrap"
                  disabled={!nombreNuevo.trim() || guardandoId === "nuevo"}
                  onClick={() => vincular({ nombreEmpleado: nombreNuevo.trim() }, "nuevo")}
                >
                  {guardandoId === "nuevo" ? "Creando..." : "Crear y vincular"}
                </button>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
