import React, { useEffect, useMemo, useState } from "react";
import { listProveedores } from "../../api/providers";
import { useNavigate } from "react-router-dom";

const LIMIT_DEFAULT = 10;

const fmtTelFijo = (row) => {
  const lada = (row.telefonoLada || "").toString().trim();
  const fijo = (row.telefonoFijo || "").toString().trim();
  return [lada, fijo].filter(Boolean).join(" ");
};

const getCelular = (row) =>
  row.celular ||
  row.telefonoCelular ||
  row.cel ||
  row.cel1 ||
  row.telefonoMovil ||
  "";

export default function ConsultaProveedores() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(LIMIT_DEFAULT);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  const handleEdit = (id) => {
    // reutilizamos AltaProveedor para editar
    navigate(`/proveedores/alta/${id}`);
  };

  const debouncedQ = useMemo(() => q.trim(), [q]);

  useEffect(() => {
    const id = setTimeout(() => setPage(1), 300);
    return () => clearTimeout(id);
  }, [debouncedQ]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError("");
        const { data } = await listProveedores({
          q: debouncedQ,
          page,
          limit,
          soloActivos: true,
        });
        if (!data?.success) throw new Error(data?.message || "Error al listar");
        setRows(data.data || []);
        setTotal(Number(data.total || 0));
      } catch (err) {
        const msg =
          err.response?.data?.message ||
          err.message ||
          "Error al listar proveedores.";
        setError(msg);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [debouncedQ, page, limit]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);

  return (
    <div className="container-fluid">
      <h2 className="text-center fw-bold my-3" style={{ letterSpacing: "2px" }}>
        CONSULTAR PROVEEDORES
      </h2>

      <div className="card shadow-sm">
        <div className="card-body">
          {error && <div className="alert alert-danger py-2">{error}</div>}

          {/* 🔍 Filtros */}
          <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
            <div>
              <label className="me-2">Mostrar:</label>
              <select
                className="form-select d-inline-block"
                style={{ width: 90 }}
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value) || LIMIT_DEFAULT);
                  setPage(1);
                }}
              >
                {[10, 20, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <div className="ms-auto">
              <label className="me-2">Search:</label>
              <input
                className="form-control d-inline-block"
                style={{ width: 260 }}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nombre, correo, RFC, ciudad..."
              />
            </div>
          </div>

          <div className="table-responsive">
            <table className="table table-striped align-middle">
              <thead className="table-light">
                <tr>
                  <th style={{ minWidth: 280 }}>Nombre Proveedor</th>
                  <th style={{ minWidth: 260 }}>Correo Electrónico</th>
                  <th style={{ minWidth: 150 }}>Teléfono</th>
                  <th style={{ minWidth: 150 }}>Celular</th>
                  <th style={{ minWidth: 160 }}>RFC</th>
                  <th style={{ minWidth: 120 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-4">
                      Cargando...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-4">
                      Sin resultados
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const telFijo = fmtTelFijo(r) || "—";
                    const cel = getCelular(r) || "—";
                    return (
                      <tr key={r._id}>
                        <td className="fw-semibold text-wrap">
                          {r.nombreProveedor || "—"}
                        </td>
                        <td className="text-wrap">
                          {r.correo ? (
                            <a href={`mailto:${r.correo}`}>{r.correo}</a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="font-monospace">{telFijo}</td>
                        <td className="font-monospace">{cel}</td>
                        <td className="font-monospace">{r.rfc || "—"}</td>
                        <td>
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => handleEdit(r._id)}
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="d-flex justify-content-between align-items-center">
            <small className="text-muted">
              Mostrando {from}–{to} de {total}
            </small>
            <div className="btn-group">
              <button
                className="btn btn-outline-secondary"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
              >
                « Prev
              </button>
              <span className="btn btn-outline-secondary disabled">
                Página {page} de {totalPages}
              </span>
              <button
                className="btn btn-outline-secondary"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
              >
                Next »
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
