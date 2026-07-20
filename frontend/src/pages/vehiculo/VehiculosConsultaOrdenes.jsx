import React, { useEffect, useState } from "react";
import { listOrdenesServicio } from "../../api/vehiculos";
import { getMisGrupos } from "../../api/grupos";
import { useNavigate } from "react-router-dom";
import { getUser } from "../../auth";
import { formatFecha } from "../../utils/fechas";


const TABS = [
  { key: "PENDIENTE_CAPTURA",              label: "PENDIENTE CAPTURA" },
  { key: "PENDIENTE_REFACCIONARIA",        label: "PENDIENTE REFACCIONARIA" },
  { key: "PENDIENTE_AUTORIZACION_CLIENTE", label: "PENDIENTE AUTORIZACION CLIENTE" },
  { key: "PENDIENTE_SURTIR",              label: "PENDIENTE SURTIR" },
  { key: "REPARACION_EN_CURSO",           label: "REPARACIÓN EN CURSO" },
  { key: "PENDIENTE_CIERRE",              label: "PENDIENTE DE CIERRE" },
];

const ESTADO_LABELS = {
  PENDIENTE_CAPTURA:              "Pendiente Captura",
  PENDIENTE_REFACCIONARIA:        "Pendiente Refaccionaria",
  PENDIENTE_AUTORIZACION_CLIENTE: "Pendiente Autorización Cliente",
  PENDIENTE_SURTIR:               "Pendiente Surtir",
  PENDIENTE_CIERRE:               "Pendiente de Cierre",
  REPARACION_EN_CURSO:            "Reparación en Curso",
  CALIDAD:                        "Calidad",
  PENDIENTE_CERRAR:               "Pendiente Cerrar",
  CERRADA:                        "Cerrada",
  CANCELADA:                      "Cancelada",
};

const TAB_MAP = {
  PENDIENTE_CAPTURA:              "datos",
  PENDIENTE_REFACCIONARIA:        "req",
  PENDIENTE_AUTORIZACION_CLIENTE: "req",
  PENDIENTE_SURTIR:               "presupuesto",
  REPARACION_EN_CURSO:            "reparacion",
  PENDIENTE_CIERRE:               "general",
  CALIDAD:                        "general",
  PENDIENTE_CERRAR:               "general",
  CERRADA:                        "general",
  CANCELADA:                      "general",
};

export default function VehiculosConsultaOrdenes() {
  const usuario = getUser();
  const miNombre = usuario?.name || usuario?.username || "";
  const [misGrupoIds, setMisGrupoIds] = useState([]);

  useEffect(() => {
    if (usuario?.role === "admin") return;
    getMisGrupos()
      .then(setMisGrupoIds)
      .catch((err) => console.error("Error cargando mis-grupos:", err));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const esMiOrden = (r) => {
    if (r.creadoPor === miNombre) return true;
    const gid = r.grupoId?._id || r.grupoId;
    return !!gid && misGrupoIds.includes(String(gid));
  };

  const [tab, setTab] = useState("PENDIENTE_CAPTURA");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [searchOs, setSearchOs] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);

  // Búsqueda general por orden de servicio (sin importar el estado/tab)
  const [globalOs, setGlobalOs] = useState("");
  const [globalResults, setGlobalResults] = useState([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [globalSearched, setGlobalSearched] = useState(false);

  const navigate = useNavigate();

  const fetchData = async () => {
    try {
      setLoading(true);
      setError("");

      const params =
        tab === "PENDIENTE_CIERRE"
          ? { pendienteCierre: true, searchOs, search, page, limit }
          : { estado: tab, searchOs, search, page, limit };

      const res = await listOrdenesServicio(params);

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

  const handleGlobalSearch = async (e) => {
    e.preventDefault();
    if (!globalOs.trim()) {
      setGlobalResults([]);
      setGlobalSearched(false);
      setGlobalError("");
      return;
    }
    try {
      setGlobalLoading(true);
      setGlobalError("");
      setGlobalSearched(true);
      const res = await listOrdenesServicio({
        searchOs: globalOs.trim(),
        page: 1,
        limit: 50,
      });
      setGlobalResults(res.data.data || []);
    } catch (err) {
      console.error("Error en búsqueda general de órdenes:", err);
      setGlobalError("No se pudo realizar la búsqueda.");
    } finally {
      setGlobalLoading(false);
    }
  };

  const irAOrden = (r) => {
    const targetTab = TAB_MAP[r.estadoOrden] || "datos";
    navigate(`/vehiculo/orden/${r._id}?tab=${targetTab}`);
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="container-fluid">
      <h2 className="text-center fw-bold my-3" style={{ letterSpacing: "2px" }}>
        CONSULTA GENERAL ÓRDENES DE SERVICIO
      </h2>

      {/* BÚSQUEDA GENERAL POR ORDEN DE SERVICIO */}
      <div className="card shadow-sm mb-3">
        <div className="card-body">
          <form className="row g-2 align-items-end" onSubmit={handleGlobalSearch}>
            <div className="col-md-6">
              <label className="form-label mb-0 fw-bold">
                Búsqueda General por Orden de Servicio
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="Ej. OS001"
                value={globalOs}
                onChange={(e) => setGlobalOs(e.target.value)}
              />
            </div>
            <div className="col-md-2">
              <button type="submit" className="btn btn-primary w-100">
                Buscar
              </button>
            </div>
          </form>

          {globalLoading && <p className="text-muted mt-2 mb-0">Buscando...</p>}
          {globalError && <p className="text-danger mt-2 mb-0">{globalError}</p>}

          {!globalLoading && !globalError && globalSearched && (
            <div className="table-responsive mt-3">
              <table className="table table-striped table-bordered table-sm">
                <thead className="table-light">
                  <tr className="text-center">
                    <th>Orden de Servicio</th>
                    <th>Cliente</th>
                    <th>Marca / Modelo</th>
                    <th>Placas</th>
                    <th>Estatus Actual</th>
                  </tr>
                </thead>
                <tbody>
                  {globalResults.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center text-muted">
                        No se encontraron órdenes.
                      </td>
                    </tr>
                  )}
                  {globalResults.map((r) => (
                    <tr
                      key={r._id}
                      style={{ cursor: "pointer" }}
                      onClick={() => irAOrden(r)}
                    >
                      <td className="text-center">{r.ordenServicio || "-"}</td>
                      <td>
                        {r.cliente?.gobierno?.nombreGobierno ||
                          [
                            r.cliente?.nombre,
                            r.cliente?.apellidoPaterno,
                            r.cliente?.apellidoMaterno,
                          ]
                            .filter(Boolean)
                            .join(" ") ||
                          "-"}
                      </td>
                      <td>
                        {(r.marca || "") + (r.modelo ? " / " + r.modelo : "") ||
                          "-"}
                      </td>
                      <td className="text-center">{r.placas || "-"}</td>
                      <td className="text-center">
                        {ESTADO_LABELS[r.estadoOrden] || r.estadoOrden || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

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

          {/* Leyenda de colores */}
          <div className="d-flex justify-content-end mb-2">
            <div className="d-flex align-items-center gap-3 small text-muted">
              <span className="d-flex align-items-center gap-1">
                <span
                  style={{
                    width: 14,
                    height: 14,
                    display: "inline-block",
                    backgroundColor: "#9df3aba9",
                    border: "1px solid #ced4da",
                    borderRadius: 2,
                  }}
                />
                Tus órdenes
              </span>
              <span className="d-flex align-items-center gap-1">
                <span
                  style={{
                    width: 14,
                    height: 14,
                    display: "inline-block",
                    backgroundColor: "#f1f3f5",
                    border: "1px solid #ced4da",
                    borderRadius: 2,
                  }}
                />
                Órdenes de otros asesores
              </span>
            </div>
          </div>

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
      className={esMiOrden(r) ? "fila-propia" : ""}
      style={{ cursor: "pointer" }}
      onClick={() => irAOrden(r)}
    >
      <td className="text-center">{r.ordenServicio || "-"}</td>
      <td>
        {r.cliente?.gobierno?.nombreGobierno ||
          [r.cliente?.nombre, r.cliente?.apellidoPaterno, r.cliente?.apellidoMaterno]
            .filter(Boolean)
            .join(" ") ||
          "-"}
      </td>
      <td>
        {(r.marca || "") + (r.modelo ? " / " + r.modelo : "") || "-"}
      </td>
      <td className="text-center">{r.anio || "-"}</td>
      <td className="text-center">{r.placas || "-"}</td>
      <td className="text-center">
        {formatFecha(r.fechaRecepcion) || "-"}
      </td>
      <td className="text-center">{(r.cliente?.telefonos?.[0]?.numero) || "-"}</td>
      <td className="text-center">
        {r.creadoPor || "-"}
        {r.grupoId?.nombre && (
          <div className="small text-muted">
            Grupo: {r.grupoId.nombre}
            {Array.isArray(r.grupoId.miembros) && r.grupoId.miembros.length > 0 && (
              <> ({r.grupoId.miembros.map((m) => m.name).join(", ")})</>
            )}
          </div>
        )}
      </td>
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
