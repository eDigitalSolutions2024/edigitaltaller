// src/pages/vehiculo/VehiculoConsultaCerradas.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listOrdenesServicio } from "../../api/vehiculos";

const PAGE_SIZE = 10;

export default function VehiculoConsultaCerradas() {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);

  const [page, setPage] = useState(1);
  const [searchOs, setSearchOs] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await listOrdenesServicio({
        estado: "CERRADA",
        searchOs: searchOs.trim(),
        search: search.trim(),
        page,
        limit: PAGE_SIZE,
      });

      const { data, total: t } = res.data;
      setRows(data || []);
      setTotal(t || 0);
    } catch (err) {
      console.error(err);
      alert("Error al cargar órdenes cerradas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleBuscar = (e) => {
    e.preventDefault();
    setPage(1);
    loadData();
  };

  const handleRowDblClick = (ordenId) => {
  if (!ordenId) return;
  navigate(`/vehiculo/orden/${ordenId}`);  // 👈 igualito que en la otra tabla
};


  return (
    <div className="card card-body">
      <h4 className="mb-3">ÓRDENES CERRADAS</h4>

      {/* Filtros */}
      <form className="row g-2 align-items-end mb-3" onSubmit={handleBuscar}>
        <div className="col-md-3">
          <label className="form-label">Buscar por Orden de Servicio:</label>
          <input
            type="text"
            className="form-control form-control-sm"
            value={searchOs}
            onChange={(e) => setSearchOs(e.target.value)}
            placeholder="Ej. 12, L6..."
          />
        </div>

        <div className="col-md-3">
          <label className="form-label">Búsqueda general:</label>
          <input
            type="text"
            className="form-control form-control-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cliente, placas, marca, modelo..."
          />
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
            Doble clic en una fila para abrir la orden.
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
              <th>Marca / Modelo</th>
              <th style={{ width: 70 }}>Año</th>
              <th style={{ width: 120 }}>Placas</th>
              <th style={{ width: 130 }}>Fecha Recepción</th>
              <th style={{ width: 140 }}>Teléfono</th>
              <th style={{ width: 150 }}>Asesor</th>
              <th style={{ width: 130 }}>Fecha Cierre</th>
              {/* 👇 nueva columna */}
              <th style={{ width: 110 }}>Estatus</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={10} className="text-center">
                  No hay órdenes cerradas que coincidan con la búsqueda.
                </td>
              </tr>
            )}

            {rows.map((o) => {
              const clienteNombre =
                o.nombreGobierno ||
                o.cliente?.nombre ||
                o.clienteNombre ||
                "";

              const telefono =
                (o.telefonoFijoLada
                  ? o.telefonoFijoLada + " " + (o.telefonoFijo || "")
                  : o.telefonoFijo) ||
                o.celular ||
                "";

              return (
                <tr
                  key={o._id}
                  onDoubleClick={() => handleRowDblClick(o._id)}
                  style={{ cursor: "pointer" }}
                >
                  <td>{o.ordenServicio || o._id}</td>
                  <td>{clienteNombre}</td>
                  <td>
                    {(o.marca || "") + (o.modelo ? ` / ${o.modelo}` : "")}
                  </td>
                  <td>{o.anio}</td>
                  <td>{o.placas}</td>
                  <td>
                    {o.fechaRecepcion
                      ? new Date(o.fechaRecepcion).toLocaleDateString("es-MX")
                      : ""}
                  </td>
                  <td>{telefono}</td>
                  <td>{o.asesorServicio || ""}</td>
                  <td>
                    {o.fechaCierre
                      ? new Date(o.fechaCierre).toLocaleDateString("es-MX")
                      : ""}
                  </td>
                  {/* 👇 muestra estadoOrden (debería salir CERRADA) */}
                  <td>{o.estadoOrden || ""}</td>
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
            onClick={() =>
              setPage((p) => (p < totalPages ? p + 1 : p))
            }
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}
