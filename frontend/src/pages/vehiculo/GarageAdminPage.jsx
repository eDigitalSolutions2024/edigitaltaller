import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getGarageVehiculosDetalle, importarVehiculosCerrados } from "../../api/garage";
import { getUser } from "../../auth";

function getNombreCliente(c) {
  if (!c) return "Sin nombre";
  if (c.gobierno?.nombreGobierno) return c.gobierno.nombreGobierno;
  if (c.empresa?.razonSocial) return c.empresa.razonSocial;
  return [c.nombre, c.apellidoPaterno].filter(Boolean).join(" ") || "Sin nombre";
}

function formatFecha(valor) {
  if (!valor) return "—";
  const d = new Date(valor);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function GarageAdminPage() {
  const navigate = useNavigate();
  const user = getUser();

  const [vehiculos, setVehiculos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [expandido, setExpandido] = useState(null);
  const [importando, setImportando] = useState(false);

  // Solo admin puede acceder
  useEffect(() => {
    if (user?.role !== "admin") {
      navigate("/vehiculo/entrada", { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    cargar();
  }, []);

  const cargar = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await getGarageVehiculosDetalle();
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

  const toggleExpandido = (id) =>
    setExpandido((prev) => (prev === id ? null : id));

  const handleImportar = async () => {
    if (!window.confirm("¿Importar todos los vehículos de órdenes cerradas al garaje? Se agregarán los que falten y se actualizarán los existentes.")) return;
    try {
      setImportando(true);
      const res = await importarVehiculosCerrados();
      const { creados, actualizados, omitidos, total, totalSeries } = res.data;
      alert(`Importación completada:\n• ${total} órdenes cerradas procesadas (${totalSeries} series únicas)\n• ${creados} vehículos nuevos en el garaje\n• ${actualizados} vehículos actualizados\n• ${omitidos} sin número de serie (omitidos)`);
      cargar();
    } catch (err) {
      console.error("Error en importación:", err);
      alert("Error al importar. Revisa la consola.");
    } finally {
      setImportando(false);
    }
  };

  return (
    <div className="container-fluid py-3">
      <h2 className="fw-bold mb-1">Garaje de Vehículos</h2>
      <p className="text-muted mb-3">
        Catálogo de vehículos registrados por número de serie. Vista exclusiva de administrador.
      </p>

      <div className="row mb-3 align-items-center g-2">
        <div className="col-12 col-md-6">
          <input
            type="text"
            className="form-control"
            placeholder="Buscar por serie, marca, modelo o placas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="col-auto">
          <button className="btn btn-outline-secondary btn-sm" onClick={cargar}>
            Actualizar
          </button>
        </div>
        <div className="col-auto">
          <button
            className="btn btn-info text-dark btn-sm"
            onClick={handleImportar}
            disabled={importando}
            title="Registra en el garaje todos los vehículos de órdenes ya cerradas que tengan número de serie"
          >
            {importando ? "Importando..." : "Importar órdenes cerradas"}
          </button>
        </div>
        <div className="col-auto ms-auto">
          <span className="badge bg-secondary fs-6">
            {filtrados.length} vehículo{filtrados.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {loading && <p className="text-muted">Cargando...</p>}
      {error && <p className="text-danger">{error}</p>}

      {!loading && !error && filtrados.length === 0 && (
        <div className="text-center py-5 text-muted">
          <p className="fs-5">No hay vehículos en el garaje.</p>
        </div>
      )}

      <div className="d-flex flex-column gap-3">
        {filtrados.map((v) => {
          const clientes = Array.isArray(v.clientes) ? v.clientes : [];
          const ordenes = Array.isArray(v.ordenesCerradas) ? v.ordenesCerradas : [];
          const abierto = expandido === v._id;

          return (
            <div key={v._id} className="card border shadow-sm">
              {/* Cabecera clickeable */}
              <div
                className="card-header d-flex justify-content-between align-items-center"
                style={{ cursor: "pointer", userSelect: "none" }}
                onClick={() => toggleExpandido(v._id)}
              >
                <div className="d-flex align-items-center gap-3 flex-wrap">
                  <strong className="fs-6">
                    {[v.marca, v.modelo].filter(Boolean).join(" ") || "Vehículo sin nombre"}
                  </strong>
                  {v.anio && (
                    <span className="text-muted" style={{ fontSize: "0.9rem" }}>
                      {v.anio}{v.color ? ` · ${v.color}` : ""}
                    </span>
                  )}
                  <span className="badge bg-light text-dark border" style={{ fontSize: "0.8rem" }}>
                    Serie: {v.serie}
                  </span>
                  {v.placas && (
                    <span className="badge bg-light text-dark border" style={{ fontSize: "0.8rem" }}>
                      Placas: {v.placas}
                    </span>
                  )}
                </div>
                <div className="d-flex align-items-center gap-2">
                  <span className="badge bg-primary">
                    {ordenes.length} orden{ordenes.length !== 1 ? "es" : ""} cerrada{ordenes.length !== 1 ? "s" : ""}
                  </span>
                  <span className="text-muted" style={{ fontSize: "1.1rem" }}>
                    {abierto ? "▲" : "▼"}
                  </span>
                </div>
              </div>

              {/* Detalle expandible */}
              {abierto && (
                <div className="card-body">
                  <div className="row g-4">
                    {/* Datos del vehículo */}
                    <div className="col-12 col-md-4">
                      <h6 className="fw-semibold border-bottom pb-1 mb-2">Datos del Vehículo</h6>
                      <table className="table table-sm table-borderless mb-0" style={{ fontSize: "0.88rem" }}>
                        <tbody>
                          {v.marca      && <tr><td className="text-muted">Marca</td><td>{v.marca}</td></tr>}
                          {v.modelo     && <tr><td className="text-muted">Modelo</td><td>{v.modelo}</td></tr>}
                          {v.anio       && <tr><td className="text-muted">Año</td><td>{v.anio}</td></tr>}
                          {v.color      && <tr><td className="text-muted">Color</td><td>{v.color}</td></tr>}
                          {v.placas     && <tr><td className="text-muted">Placas</td><td>{v.placas}</td></tr>}
                          {v.serie      && <tr><td className="text-muted">Serie/VIN</td><td className="fw-semibold">{v.serie}</td></tr>}
                          {v.motor      && <tr><td className="text-muted">Motor</td><td>{v.motor}</td></tr>}
                          {v.nacionalidad && <tr><td className="text-muted">Nacionalidad</td><td>{v.nacionalidad}</td></tr>}
                          {v.traccion   && <tr><td className="text-muted">Tracción</td><td>{v.traccion}</td></tr>}
                          {v.numeroEconomico && <tr><td className="text-muted">No. Económico</td><td>{v.numeroEconomico}</td></tr>}
                        </tbody>
                      </table>
                    </div>

                    {/* Clientes */}
                    <div className="col-12 col-md-4">
                      <h6 className="fw-semibold border-bottom pb-1 mb-2">
                        Clientes ({clientes.length})
                      </h6>
                      {clientes.length === 0 ? (
                        <p className="text-muted" style={{ fontSize: "0.88rem" }}>Sin clientes registrados</p>
                      ) : (
                        <ul className="list-group list-group-flush">
                          {clientes.map((c) => (
                            <li
                              key={c._id}
                              className="list-group-item px-0 py-1"
                              style={{ fontSize: "0.88rem" }}
                            >
                              {getNombreCliente(c)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Órdenes cerradas */}
                    <div className="col-12 col-md-4">
                      <h6 className="fw-semibold border-bottom pb-1 mb-2">
                        Órdenes Cerradas ({ordenes.length})
                      </h6>
                      {ordenes.length === 0 ? (
                        <p className="text-muted" style={{ fontSize: "0.88rem" }}>Sin órdenes cerradas</p>
                      ) : (
                        <ul className="list-group list-group-flush">
                          {ordenes.map((o) => (
                            <li
                              key={o._id}
                              className="list-group-item px-0 py-1 d-flex justify-content-between align-items-center"
                              style={{ fontSize: "0.85rem" }}
                            >
                              <div>
                                <span className="fw-semibold">{o.ordenServicio || "Sin folio"}</span>
                                {o.cliente && (
                                  <span className="text-muted ms-2">
                                    — {getNombreCliente(o.cliente)}
                                  </span>
                                )}
                                <div className="text-muted" style={{ fontSize: "0.78rem" }}>
                                  Recepción: {formatFecha(o.fechaRecepcion)}
                                  {o.fechaCierre && ` · Cierre: ${formatFecha(o.fechaCierre)}`}
                                </div>
                              </div>
                              <button
                                type="button"
                                className="btn btn-outline-primary btn-sm ms-2"
                                onClick={() => navigate(`/vehiculo/orden/${o._id}`)}
                              >
                                Ver
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
