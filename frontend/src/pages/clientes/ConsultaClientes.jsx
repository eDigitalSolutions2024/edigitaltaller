import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";          // 👈 NUEVO
import { listCustomers } from "../../api/customers";
import "../../styles/clientes.css";

export default function ConsultaClientes() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState("");
  const limit = 10;

  const navigate = useNavigate();                        // 👈 NUEVO

  const fetchData = useCallback(
    async (p = 1) => {
      try {
        setErr("");
        const res = await listCustomers({ q, page: p, limit });
        setRows(res.data.data || []);
        setTotal(res.data.total || 0);
        setPage(res.data.page || 1);
      } catch (e) {
        console.error(e);
        setErr(
          e?.response?.data?.error ||
            e.message ||
            "Error al consultar clientes"
        );
        setRows([]);
        setTotal(0);
        setPage(1);
      }
    },
    [q]
  ); // dependemos de q para que el botón “Buscar” use el último valor

  useEffect(() => {
    fetchData(1);
  }, [fetchData]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handleEdit = (id) => {
    // Reutilizamos AltaCliente para editar
    navigate(`/clientes/alta/${id}`);
  };

  return (
    <div className="consulta-card">
      <div className="consulta-toolbar">
        <input
          className="dash-search"
          placeholder="Buscar por nombre, correo o RFC..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn btn-light" onClick={() => fetchData(1)}>
          Buscar
        </button>
      </div>

      {err && (
        <div
          style={{
            color: "#b91c1c",
            fontWeight: 700,
            marginBottom: 10,
          }}
        >
          ERROR: {err}
        </div>
      )}

      <div className="tabla">
        <div className="thead">
          <div>Nombre</div>
          <div>Correo</div>
          <div>RFC</div>
          <div>Teléfono</div>
          <div>Ciudad</div>
          <div>Acciones</div> {/* 👈 NUEVO */}
        </div>

        {rows.map((c) => (
          <div className="trow" key={c._id}>
            <div>
              {[c.nombre, c.apellidoPaterno, c.apellidoMaterno]
                .filter(Boolean)
                .join(" ")}
            </div>
            <div>{c.email || "—"}</div>
            <div>{c.rfc || "—"}</div>
            <div>
              {c.celular?.lada
                ? `(${c.celular.lada}) ${c.celular.numero}`
                : c.telefono?.numero || "—"}
            </div>
            <div>{c.direccion?.ciudad || "—"}</div>
            <div>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => handleEdit(c._id)}
              >
                Editar
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="paginacion">
        <button
          className="btn btn-light"
          disabled={page <= 1}
          onClick={() => fetchData(page - 1)}
        >
          «
        </button>
        <span>
          Página {page} de {totalPages}
        </span>
        <button
          className="btn btn-light"
          disabled={page >= totalPages}
          onClick={() => fetchData(page + 1)}
        >
          »
        </button>
      </div>
    </div>
  );
}
