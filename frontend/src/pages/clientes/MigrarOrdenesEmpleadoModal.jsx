import React, { useEffect, useState } from "react";
import { listarPersonal } from "../../api/empleados";
import { migrarOrdenesAEmpleado } from "../../api/customers";

// Editar Cliente → al marcar "¿Es empleado?": se elige a qué persona de
// Administración → Personal pasan TODAS las órdenes de este cliente (ver
// POST /clientes/:id/migrar-ordenes-a-empleado). Tras confirmar, el cliente
// queda inactivo; sus órdenes ya viven bajo la ficha del empleado.
export default function MigrarOrdenesEmpleadoModal({ show, cliente, clienteNombre, onClose, onMigrado }) {
  const [personal, setPersonal] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [elegido, setElegido] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!show) return;
    setSearch("");
    setError("");
    setElegido(null);
    (async () => {
      try {
        setLoading(true);
        const data = await listarPersonal();
        setPersonal(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Error cargando personal:", err);
        setError("No se pudo cargar el personal.");
      } finally {
        setLoading(false);
      }
    })();
  }, [show]);

  const confirmar = async () => {
    try {
      setGuardando(true);
      setError("");
      const res = await migrarOrdenesAEmpleado(cliente._id, {
        empleadoId: elegido.empleadoId,
        userId: elegido.userId,
      });
      onMigrado(res.data?.data, elegido);
    } catch (err) {
      console.error("Error migrando órdenes:", err);
      setError(err?.response?.data?.error || "No se pudieron pasar las órdenes al empleado.");
    } finally {
      setGuardando(false);
    }
  };

  const filtrados = personal.filter((p) => {
    const term = search.toLowerCase().trim();
    return !term || (p.nombre || "").toLowerCase().includes(term);
  });

  if (!show) return null;

  return (
    <div
      className="modal d-block"
      tabIndex="-1"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget && !guardando) onClose(); }}
    >
      <div className="modal-dialog modal-lg modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title fw-bold">Pasar órdenes a un empleado</h5>
            <button type="button" className="btn-close" onClick={onClose} disabled={guardando} />
          </div>

          <div className="modal-body">
            {!elegido ? (
              <>
                <p className="text-muted">
                  Elige al empleado que será el dueño de <strong>todas las órdenes</strong> de{" "}
                  <strong>{clienteNombre}</strong>.
                </p>
                <input
                  type="text"
                  className="form-control mb-3"
                  placeholder="Buscar por nombre..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
                {loading && <p className="text-muted">Cargando personal...</p>}
                {error && <p className="text-danger">{error}</p>}
                {!loading && !error && filtrados.length === 0 && (
                  <p className="text-muted">No hay personal con ese nombre.</p>
                )}
                {!loading && filtrados.length > 0 && (
                  <ul className="list-group">
                    {filtrados.map((p) => (
                      <li
                        key={p.empleadoId || p.userId}
                        className="list-group-item d-flex justify-content-between align-items-center"
                      >
                        <div className="fw-semibold">{p.nombre}</div>
                        <button type="button" className="btn btn-success btn-sm" onClick={() => setElegido(p)}>
                          Seleccionar
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <>
                <div className="alert alert-warning">
                  Todas las órdenes de <strong>{clienteNombre}</strong> pasarán a{" "}
                  <strong>{elegido.nombre}</strong> y el cliente quedará <strong>inactivo</strong>{" "}
                  (ya no aparecerá en búsquedas ni podrá abrir órdenes nuevas). Un administrador
                  puede reactivarlo después, pero las órdenes no regresan solas.
                </div>
                {error && <p className="text-danger">{error}</p>}
              </>
            )}
          </div>

          <div className="modal-footer">
            {elegido && (
              <button type="button" className="btn btn-outline-secondary" onClick={() => setElegido(null)} disabled={guardando}>
                Elegir otro
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={guardando}>
              Cancelar
            </button>
            {elegido && (
              <button type="button" className="btn btn-danger" onClick={confirmar} disabled={guardando}>
                {guardando ? "Pasando órdenes..." : "Pasar órdenes y desactivar cliente"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
