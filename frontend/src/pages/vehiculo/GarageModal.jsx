import React, { useState, useEffect } from "react";
import { getGarageVehiculos } from "../../api/garage";

function getNombreCliente(c) {
  if (!c) return "Sin nombre";
  if (c.gobierno?.nombreGobierno) return c.gobierno.nombreGobierno;
  if (c.empresa?.razonSocial) return c.empresa.razonSocial;
  return [c.nombre, c.apellidoPaterno].filter(Boolean).join(" ") || "Sin nombre";
}

export default function GarageModal({ show, onSelect, onClose }) {
  const [vehiculos, setVehiculos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!show) return;
    setSearch("");
    cargarVehiculos();
  }, [show]);

  const cargarVehiculos = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await getGarageVehiculos();
      setVehiculos(res.data?.data || []);
    } catch (err) {
      console.error("Error cargando garaje:", err);
      setError("No se pudo cargar el garaje.");
    } finally {
      setLoading(false);
    }
  };

  const filtrados = vehiculos.filter((v) => {
    const term = search.toLowerCase().trim();
    if (!term) return true;
    return (
      (v.serie || "").toLowerCase().includes(term) ||
      (v.marca || "").toLowerCase().includes(term) ||
      (v.modelo || "").toLowerCase().includes(term) ||
      (v.placas || "").toLowerCase().includes(term)
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
      <div className="modal-dialog modal-xl modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title fw-bold">Garaje de Vehículos</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body">
            <div className="mb-3">
              <input
                type="text"
                className="form-control"
                placeholder="Buscar por serie, marca, modelo o placas..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>

            {loading && <p className="text-muted">Cargando garaje...</p>}
            {error && <p className="text-danger">{error}</p>}

            {!loading && !error && filtrados.length === 0 && (
              <div className="text-center py-5 text-muted">
                <p className="fs-5">No hay vehículos en el garaje.</p>
                <small>Al guardar una nueva orden con número de serie, se ofrecerá guardarlo aquí.</small>
              </div>
            )}

            <div className="row g-3">
              {filtrados.map((v) => {
                const clientes = Array.isArray(v.clientes) ? v.clientes : [];

                return (
                  <div key={v._id} className="col-12 col-md-6 col-lg-4">
                    <div className="card h-100 border shadow-sm">
                      <div className="card-body d-flex flex-column">
                        <div className="d-flex justify-content-between align-items-start mb-2">
                          <h6 className="card-title mb-0 fw-bold">
                            {[v.marca, v.modelo].filter(Boolean).join(" ") || "Vehículo sin nombre"}
                          </h6>
                          <span className="badge bg-primary ms-2">
                            {v.vecesUsado} uso{v.vecesUsado !== 1 ? "s" : ""}
                          </span>
                        </div>

                        {v.anio && (
                          <p className="text-muted mb-1" style={{ fontSize: "0.85rem" }}>
                            {v.anio}{v.color ? ` · ${v.color}` : ""}
                          </p>
                        )}

                        <p className="mb-1" style={{ fontSize: "0.85rem" }}>
                          <strong>Serie:</strong> {v.serie}
                        </p>

                        {v.placas && (
                          <p className="mb-1" style={{ fontSize: "0.85rem" }}>
                            <strong>Placas:</strong> {v.placas}
                          </p>
                        )}

                        <div className="mb-2" style={{ fontSize: "0.85rem" }}>
                          <strong>Cliente{clientes.length !== 1 ? "s" : ""}:</strong>{" "}
                          {clientes.length === 0
                            ? "Sin clientes registrados"
                            : clientes.map((c) => getNombreCliente(c)).join(", ")}
                        </div>

                        <div className="mt-auto">
                          <button
                            type="button"
                            className="btn btn-success btn-sm w-100"
                            onClick={() => onSelect(v)}
                          >
                            Seleccionar
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
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
