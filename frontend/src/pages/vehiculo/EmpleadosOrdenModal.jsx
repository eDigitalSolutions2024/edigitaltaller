import React, { useState, useEffect } from "react";
import { listarPersonal } from "../../api/empleados";
import { crearClienteDesdePersonal } from "../../api/customers";

const puestoLabels = {
  asesor: "Asesor",
  mecanico: "Mecánico",
  ayudante: "Ayudante",
  carrocero: "Carrocero",
  recepcion: "Recepción",
  contabilidad: "Contabilidad",
  jefe_taller: "Jefe de taller",
  jefe: "Jefe",
  otro: "Otro",
};

const roleLabels = {
  admin: "Admin",
  recepcion: "Recepción",
  cajas: "Cajas",
  captura: "Captura",
  refaccionario: "Refaccionario",
  asesor_servicio: "Asesor de servicio",
  cuentas_por_pagar: "Cuentas por pagar",
  auditoria: "Auditoría",
  cuentas_por_cobrar: "Cuentas por cobrar",
  recursos_humanos: "Recursos Humanos",
  coordinador: "Coordinador",
  finanzas: "Finanzas",
};

function etiquetaPuesto(p) {
  if (p.puesto) return puestoLabels[p.puesto] || p.puesto;
  if (p.role) return roleLabels[p.role] || p.role;
  return "—";
}

// Botón "Empleados" de Nueva Orden de Servicio: permite arrancar una orden
// directo para alguien del personal del taller (su propio vehículo), sin
// tener que darlo de alta a mano en Clientes y marcar la casilla "Empleado".
// Muestra el mismo roster que Administración → Personal (Empleados y
// usuarios sin ficha de Empleado — ver GET /empleados/personal). Al elegir
// uno, el backend busca o crea la ficha de Cliente ligada a él (ver
// POST /clientes/desde-personal) y de ahí en adelante sigue el mismo flujo
// de siempre (Nuevo Carro / Sin Vehículo / Garaje).
export default function EmpleadosOrdenModal({ show, onSelect, onClose }) {
  const [personal, setPersonal] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [seleccionandoKey, setSeleccionandoKey] = useState(null);

  useEffect(() => {
    if (!show) return;
    setSearch("");
    setError("");
    cargarPersonal();
  }, [show]);

  const cargarPersonal = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await listarPersonal();
      setPersonal(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error cargando personal:", err);
      setError("No se pudo cargar el personal.");
    } finally {
      setLoading(false);
    }
  };

  const handleSeleccionar = async (persona) => {
    const key = persona.empleadoId || persona.userId;
    try {
      setSeleccionandoKey(key);
      setError("");
      const res = await crearClienteDesdePersonal({
        empleadoId: persona.empleadoId,
        userId: persona.userId,
      });
      onSelect(res.data?.data);
    } catch (err) {
      console.error("Error preparando orden de personal:", err);
      setError(
        err?.response?.data?.error || "No se pudo iniciar la orden para esta persona."
      );
    } finally {
      setSeleccionandoKey(null);
    }
  };

  const filtrados = personal.filter((p) => {
    const term = search.toLowerCase().trim();
    if (!term) return true;
    return (
      (p.nombre || "").toLowerCase().includes(term) ||
      etiquetaPuesto(p).toLowerCase().includes(term)
    );
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
            <h5 className="modal-title fw-bold">Personal del taller</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body">
            <div className="mb-3">
              <input
                type="text"
                className="form-control"
                placeholder="Buscar por nombre o puesto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>

            {loading && <p className="text-muted">Cargando personal...</p>}
            {error && <p className="text-danger">{error}</p>}

            {!loading && !error && filtrados.length === 0 && (
              <div className="text-center py-5 text-muted">
                <p className="fs-5">No hay personal activo registrado.</p>
                <small>Se da de alta desde Administración → Personal.</small>
              </div>
            )}

            {!loading && filtrados.length > 0 && (
              <ul className="list-group">
                {filtrados.map((p) => {
                  const key = p.empleadoId || p.userId;
                  return (
                    <li
                      key={key}
                      className="list-group-item d-flex justify-content-between align-items-center"
                      style={{ cursor: "pointer" }}
                      onClick={() => handleSeleccionar(p)}
                    >
                      <div>
                        <div className="fw-semibold">{p.nombre}</div>
                        <small className="text-muted">{etiquetaPuesto(p)}</small>
                      </div>
                      <button
                        type="button"
                        className="btn btn-success btn-sm"
                        disabled={seleccionandoKey === key}
                        onClick={(ev) => { ev.stopPropagation(); handleSeleccionar(p); }}
                      >
                        {seleccionandoKey === key ? "Cargando..." : "Seleccionar"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
