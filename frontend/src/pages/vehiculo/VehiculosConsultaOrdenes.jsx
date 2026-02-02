import React, { useEffect, useState } from "react";
import { listOrdenesServicio } from "../../api/vehiculos";
import { useNavigate } from "react-router-dom";


const TABS = [
  { key: "PENDIENTE_CAPTURA", label: "PENDIENTE CAPTURA" },
  { key: "PENDIENTE_REFACCIONARIA", label: "PENDIENTE REFACCIONARIA" },
  { key: "PENDIENTE_AUTORIZACION", label: "PENDIENTE AUTORIZACION CLIENTE" },
  { key: "REPARACION_EN_CURSO", label: "REPARACIÓN EN CURSO" },
  { key: "CALIDAD", label: "CALIDAD" },
  { key: "PENDIENTE_CERRAR", label: "PENDIENTE DE CERRAR" },
];

export default function VehiculosConsultaOrdenes() {
  const [tab, setTab] = useState("PENDIENTE_CAPTURA");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [searchOs, setSearchOs] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);


  const navigate = useNavigate();

  const fetchData = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await listOrdenesServicio({
        estado: tab,
        searchOs,
        search,
        page,
        limit,
      });

      setRows(res.data.data || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error("Error cargando órdenes:", err);
      setError("No se pudieron cargar las órdenes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // cada que cambie tab o página o filtros, recarga
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page]);

  const handleBuscar = (e) => {
    e.preventDefault();
    setPage(1);
    fetchData();
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="container-fluid">
      <h2 className="text-center fw-bold my-3" style={{ letterSpacing: "2px" }}>
        CONSULTA GENERAL ÓRDENES DE SERVICIO
      </h2>

      {/* TABS */}
      <ul className="nav nav-tabs mb-3">
        {TABS.map((t) => (
          <li className="nav-item" key={t.key}>
            <button
              type="button"
              className={
                "nav-link" + (tab === t.key ? " active fw-bold" : "")
              }
              onClick={() => {
                setTab(t.key);
                setPage(1);
              }}
            >
              {t.label}
            </button>
          </li>
        ))}
      </ul>

      <div className="card shadow-sm">
        <div className="card-body">
          {/* Filtros arriba (igual que el sistema viejo) */}
          <form className="row g-2 align-items-center mb-3" onSubmit={handleBuscar}>
            <div className="col-md-4">
              <label className="form-label mb-0">
                Buscar Por Orden de Servicio:
              </label>
              <input
                type="text"
                className="form-control"
                value={searchOs}
                onChange={(e) => setSearchOs(e.target.value)}
              />
            </div>

            <div className="col-md-2 d-flex align-items-end">
              <button type="submit" className="btn btn-primary w-100">
                Buscar
              </button>
            </div>

            <div className="col-md-2">
              <label className="form-label mb-0">Mostrar</label>
              <select
                className="form-select"
                value={limit}
                disabled
              >
                <option value={10}>10 entries</option>
              </select>
            </div>

            <div className="col-md-4">
              <label className="form-label mb-0">Search:</label>
              <input
                type="text"
                className="form-control"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleBuscar(e)}
              />
            </div>
          </form>

          {loading && <p className="text-muted">Cargando órdenes...</p>}
          {error && <p className="text-danger">{error}</p>}

          {/* TABLA */}
          {!loading && !error && (
            <div className="table-responsive">
              <table className="table table-striped table-bordered table-sm">
                <thead className="table-light">
                  <tr className="text-center">
                    <th>Orden de Servicio</th>
                    <th>Cliente</th>
                    <th>Marca / Modelo</th>
                    <th>Año</th>
                    <th>Placas</th>
                    <th>Fecha Recepción</th>
                    <th>Teléfono</th>
                    <th>Asesor</th>
                  </tr>
                </thead>
                <tbody>
  {rows.length === 0 && (
    <tr>
      <td colSpan={8} className="text-center text-muted">
        No hay órdenes en este estado.
      </td>
    </tr>
  )}

  {rows.map((r) => (
    <tr
      key={r._id}
      style={{ cursor: "pointer" }}
      onClick={() => navigate(`/vehiculo/orden/${r._id}`)}  // 👈
    >
      <td className="text-center">{r.ordenServicio || "-"}</td>
      <td>{r.nombreGobierno || r.cliente?.nombre || "-"}</td>
      <td>
        {(r.marca || "") + (r.modelo ? " / " + r.modelo : "") || "-"}
      </td>
      <td className="text-center">{r.anio || "-"}</td>
      <td className="text-center">{r.placas || "-"}</td>
      <td className="text-center">
        {r.fechaRecepcion
          ? new Date(r.fechaRecepcion).toLocaleDateString()
          : "-"}
      </td>
      <td className="text-center">{r.telefonoFijo || "-"}</td>
      <td className="text-center">{r.asesor || "admin"}</td>
    </tr>
  ))}
</tbody>

              </table>
            </div>
          )}

          {/* PAGINACIÓN SIMPLE */}
          {!loading && total > 0 && (
            <div className="d-flex justify-content-between align-items-center">
              <span className="text-muted">
                Mostrando {rows.length} de {total} órdenes
              </span>
              <div className="btn-group">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  « Prev
                </button>
                <span className="btn btn-outline-secondary btn-sm disabled">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  disabled={page >= totalPages}
                  onClick={() =>
                    setPage((p) => (p < totalPages ? p + 1 : p))
                  }
                >
                  Next »
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
