// src/pages/vehiculo/VehiculosConsultaGarantias.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listGarantias } from "../../api/garantias";
import { formatFecha } from "../../utils/fechas";

const PAGE_SIZE = 10;

const ESTADO_BADGE = {
  PENDIENTE: "bg-warning text-dark",
  APROBADA: "bg-success",
  NEGADA: "bg-danger",
};

// En pantalla la garantía se maneja como Pendiente / Autorizada / Negada
// (en la base de datos se conserva APROBADA).
const ESTADO_LABEL = {
  PENDIENTE: "PENDIENTE",
  APROBADA: "AUTORIZADA",
  NEGADA: "NEGADA",
};

export default function VehiculosConsultaGarantias() {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);

  const [page, setPage] = useState(1);
  const [searchOs, setSearchOs] = useState("");
  const [estado, setEstado] = useState("");
  const [loading, setLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await listGarantias({
        estado,
        searchOs: searchOs.trim(),
        page,
        limit: PAGE_SIZE,
      });

      const { data, total: t } = res.data;
      setRows(data || []);
      setTotal(t || 0);
    } catch (err) {
      console.error(err);
      alert("Error al cargar las órdenes de garantía");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, estado]);

  const handleBuscar = (e) => {
    e.preventDefault();
    setPage(1);
    loadData();
  };

  // Abre el menú de Solicitudes de Garantía enfocado en esta orden
  const handleRowClick = (orden) => {
    if (!orden?.ordenServicio) return;
    navigate(`/garantias?os=${encodeURIComponent(orden.ordenServicio)}`);
  };

  return (
    <div className="card card-body">
      <h4 className="mb-3">ÓRDENES DE GARANTÍA</h4>

      {/* Filtros */}
      <form className="row g-2 align-items-end mb-3" onSubmit={handleBuscar}>
        <div className="col-md-3">
          <label className="form-label">Buscar por Orden de Servicio:</label>
          <input
            type="text"
            className="form-control form-control-sm"
            value={searchOs}
            onChange={(e) => setSearchOs(e.target.value)}
            placeholder="Orden nueva o anterior. Ej. OS-023"
          />
        </div>

        <div className="col-md-3">
          <label className="form-label">Estatus de la garantía:</label>
          <select
            className="form-select form-select-sm"
            value={estado}
            onChange={(e) => {
              setEstado(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            <option value="PENDIENTE">Pendientes</option>
            <option value="APROBADA">Autorizadas</option>
            <option value="NEGADA">Negadas</option>
          </select>
        </div>

        <div className="col-md-2">
          <button
            type="submit"
            className="btn btn-primary btn-sm w-100"
            disabled={loading}
          >
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </div>

        <div className="col-md-4 text-end">
          <small className="text-muted">
            Clic en una fila para abrir la solicitud de garantía.
          </small>
        </div>
      </form>

      {/* Tabla */}
      <div className="table-responsive">
        <table className="table table-sm table-bordered align-middle">
          <thead className="table-light">
            <tr>
              <th style={{ width: 90 }}>Orden de Servicio</th>
              <th>Cliente</th>
              <th style={{ width: 100 }}>Orden Anterior</th>
              <th>Marca / Modelo</th>
              <th style={{ width: 70 }}>Año</th>
              <th style={{ width: 110 }}>Placas</th>
              <th style={{ width: 120 }}>Fecha Recepción</th>
              <th style={{ width: 120 }}>Fecha Solicitud</th>
              <th style={{ width: 130 }}>Teléfono</th>
              <th style={{ width: 140 }}>Asesor</th>
              <th style={{ width: 110 }}>Estatus Garantía</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={11} className="text-center">
                  No hay órdenes de garantía que coincidan con la búsqueda.
                </td>
              </tr>
            )}

            {rows.map((o) => {
              const c = o.cliente || {};
              const g = o.garantia || {};
              const clienteNombre =
                c.gobierno?.nombreGobierno ||
                c.empresa?.razonSocial ||
                [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(" ") ||
                "";

              const tel = (c.telefonos || [])[0] || {};
              const cel = (c.celulares || [])[0] || {};
              const telefono =
                [tel.lada, tel.numero].filter(Boolean).join(" ") ||
                cel.numero ||
                "";

              return (
                <tr
                  key={o._id}
                  onClick={() => handleRowClick(o)}
                  style={{ cursor: "pointer" }}
                  title="Abrir en Solicitudes de Garantía"
                >
                  <td>{o.ordenServicio || o._id}</td>
                  <td>{clienteNombre}</td>
                  <td className="fw-semibold">{g.ordenAnteriorFolio || "—"}</td>
                  <td>
                    {(o.marca || "") + (o.modelo ? ` / ${o.modelo}` : "")}
                  </td>
                  <td>{o.anio}</td>
                  <td>{o.placas}</td>
                  <td>{formatFecha(o.fechaRecepcion)}</td>
                  <td>{formatFecha(g.fechaSolicitud)}</td>
                  <td>{telefono}</td>
                  <td>{o.asesorServicio || o.creadoPor}</td>
                  <td>
                    <span className={`badge ${ESTADO_BADGE[g.estado] || "bg-secondary"}`}>
                      {ESTADO_LABEL[g.estado] || g.estado || "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      <div className="d-flex justify-content-between align-items-center mt-2">
        <div>
          <small>
            Mostrando página {page} de {totalPages} ({total} órdenes)
          </small>
        </div>
        <div className="btn-group btn-group-sm">
          <button
            type="button"
            className="btn btn-outline-secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => (p < totalPages ? p + 1 : p))}
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}
