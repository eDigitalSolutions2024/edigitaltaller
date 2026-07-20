import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listOrdenesEnCurso } from "../../api/cajas";
import { formatFecha } from "../../utils/fechas";

const PAGE_SIZE = 10;
const DEBOUNCE_MS = 600;

const ESTADO_LABELS = {
  PENDIENTE_CAPTURA: "Pendiente Captura",
  PENDIENTE_REFACCIONARIA: "Pendiente Refaccionaria",
  PENDIENTE_AUTORIZACION_CLIENTE: "Pendiente Autorización Cliente",
  PENDIENTE_SURTIR: "Pendiente Surtir",
  PENDIENTE_CIERRE: "Pendiente de Cierre",
  REPARACION_EN_CURSO: "Reparación en Curso",
  CALIDAD: "Calidad",
  PENDIENTE_CERRAR: "Pendiente Cerrar",
  CERRADA: "Cerrada",
  CANCELADA: "Cancelada",
};

export default function CajasBuscarOrden() {
  const navigate = useNavigate();

  const [busqueda, setBusqueda] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Cualquier cambio en los filtros regresa a la página 1 (sin debounce: es
  // solo un reset de estado, la consulta real se dispara en el efecto de abajo).
  useEffect(() => {
    setPage(1);
  }, [busqueda, fechaDesde, fechaHasta]);

  // Búsqueda reactiva: cada cambio espera un momento antes de disparar la
  // consulta, para no pegarle al servidor en cada tecla.
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        setError("");
        const res = await listOrdenesEnCurso({
          search: busqueda,
          fechaDesde,
          fechaHasta,
          page,
          limit: PAGE_SIZE,
        });
        setRows(res.data.data || []);
        setTotal(res.data.total || 0);
      } catch (err) {
        console.error("Error cargando órdenes en curso:", err);
        setError("No se pudieron cargar las órdenes.");
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, fechaDesde, fechaHasta, page]);

  const irAOrden = (r) => navigate(`/cajas/orden/${r._id}`);

  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  return (
    <div>
      <h4 className="text-center fw-bold mb-4">Buscar Orden de Servicio</h4>

      <div className="row g-2 align-items-end mb-3">
        <div className="col-md-6">
          <label className="form-label mb-0">Orden de Servicio, Cliente o Número de Serie</label>
          <input
            type="text"
            className="form-control"
            placeholder="Escribe para buscar..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <div className="col-md-3">
          <label className="form-label mb-0">Fecha Desde</label>
          <input
            type="date"
            className="form-control"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
          />
        </div>
        <div className="col-md-3">
          <label className="form-label mb-0">Fecha Hasta</label>
          <input
            type="date"
            className="form-control"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
          />
        </div>
      </div>

      {loading && <p className="text-muted">Buscando...</p>}
      {error && <p className="text-danger">{error}</p>}

      {!loading && !error && (
        <div className="table-responsive">
          <table className="table table-striped table-bordered table-sm">
            <thead className="table-light">
              <tr className="text-center">
                <th>Orden de Servicio</th>
                <th>Cliente</th>
                <th>Marca / Modelo</th>
                <th>Serie</th>
                <th>Placas</th>
                <th>Fecha Recepción</th>
                <th>Asesor</th>
                <th>Estatus</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-muted">
                    No hay órdenes que coincidan con la búsqueda.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r._id} style={{ cursor: "pointer" }} onClick={() => irAOrden(r)}>
                  <td className="text-center">{r.ordenServicio || "-"}</td>
                  <td>
                    {r.cliente?.gobierno?.nombreGobierno ||
                      r.cliente?.empresa?.razonSocial ||
                      [r.cliente?.nombre, r.cliente?.apellidoPaterno, r.cliente?.apellidoMaterno]
                        .filter(Boolean)
                        .join(" ") ||
                      "-"}
                  </td>
                  <td>{(r.marca || "") + (r.modelo ? " / " + r.modelo : "") || "-"}</td>
                  <td className="text-center">{r.serie || "-"}</td>
                  <td className="text-center">{r.placas || "-"}</td>
                  <td className="text-center">{formatFecha(r.fechaRecepcion) || "-"}</td>
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
                  <td className="text-center">
                    {r.garantia && (
                      <span className="badge bg-info text-dark me-1">Garantía</span>
                    )}
                    {ESTADO_LABELS[r.estadoOrden] || r.estadoOrden || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
              onClick={() => setPage((p) => (p < totalPages ? p + 1 : p))}
            >
              Next »
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
