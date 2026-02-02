import { useEffect, useState } from "react";
import http from "../../api/http"; // si tu archivo http está en src/api/http.js ajusta la ruta a: "../api/http" o "../../api/http"

const fmt = new Intl.DateTimeFormat("es-MX");
export default function ConsultarFacturaProveedor() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalDocs, setTotalDocs] = useState(0);

  // filtros
  const [f, setF] = useState({
    numero: "",     // N° de factura exacto o parcial
    q: "",          // búsqueda general
    proveedor: "",
    desde: "",
    hasta: "",
  });
  const onF = (e) => setF(s => ({ ...s, [e.target.name]: e.target.value }));

  const fetchData = async (_page = page, _limit = limit) => {
    setLoading(true);
    try {
      const { data } = await http.get("/facturas-proveedor", {
        params: { ...f, page: _page, limit: _limit }
      });
      if (data?.ok) {
        setRows(data.docs || []);
        setPage(data.page);
        setLimit(data.limit);
        setTotalPages(data.totalPages);
        setTotalDocs(data.totalDocs);
      } else {
        setRows([]); setPage(1); setTotalPages(1); setTotalDocs(0);
      }
    } catch (e) {
      console.error(e);
      setRows([]); setPage(1); setTotalPages(1); setTotalDocs(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(1, limit); /* carga inicial */ }, []); // eslint-disable-line

  const reset = () => {
    setF({ numero:"", q:"", proveedor:"", desde:"", hasta:"" });
    fetchData(1, limit);
  };

  return (
    <div className="container-fluid py-3">
      <h1 className="h4 text-center mb-3 text-uppercase">CONSULTA GENERAL FACTURAS PROVEEDOR</h1>

      {/* Filtros */}
      <div className="card shadow-sm mb-3">
        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-md-3">
              <label className="form-label">Buscar Número de Factura</label>
              <div className="input-group">
                <input className="form-control" name="numero" value={f.numero} onChange={onF} />
                <button className="btn btn-primary" onClick={() => fetchData(1, limit)}>
                  {loading ? "Buscando..." : "Buscar"}
                </button>
              </div>
            </div>

            <div className="col-md-3">
              <label className="form-label">Proveedor</label>
              <input className="form-control" name="proveedor" value={f.proveedor} onChange={onF} />
            </div>

            <div className="col-md-3">
              <label className="form-label">Search</label>
              <input className="form-control" name="q" value={f.q} onChange={onF}
                     placeholder="texto libre (folio, motivo, etc.)" />
            </div>

            <div className="col-md-1">
              <label className="form-label">Mostrar</label>
              <select className="form-select" value={limit}
                onChange={(e)=>{ const l = parseInt(e.target.value)||10; setLimit(l); fetchData(1,l); }}>
                <option>10</option><option>25</option><option>50</option><option>100</option>
              </select>
            </div>

            <div className="col-md-2 text-end">
              <button className="btn btn-outline-secondary" onClick={reset}>Limpiar</button>
            </div>

            <div className="col-12 col-md-3">
              <label className="form-label">Desde</label>
              <input type="date" className="form-control" name="desde" value={f.desde} onChange={onF} />
            </div>
            <div className="col-12 col-md-3">
              <label className="form-label">Hasta</label>
              <input type="date" className="form-control" name="hasta" value={f.hasta} onChange={onF} />
            </div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="card shadow-sm">
        <div className="table-responsive">
          <table className="table table-bordered align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th style={{minWidth:180}}>Número de Factura</th>
                <th>Proveedor</th>
                <th style={{minWidth:140}}>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr><td colSpan={3} className="text-center py-4 text-muted">No hay resultados</td></tr>
              )}
              {rows.map((r) => (
                <tr key={`${r.factura}|${r.proveedor}`}>
                  <td>{r.factura}</td>
                  <td className="text-truncate" style={{maxWidth: 380}}>{r.proveedor || "—"}</td>
                  <td>{r.fecha ? fmt.format(new Date(r.fecha)) : "—"}</td>
                </tr>
              ))}
              {loading && <tr><td colSpan={3} className="text-center py-4">Cargando…</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <div className="d-flex justify-content-between align-items-center p-2">
          <small className="text-muted">Showing {(rows?.length||0)} of {totalDocs} entries</small>
          <div className="btn-group">
            <button className="btn btn-outline-secondary"
                    disabled={page<=1 || loading} onClick={()=>fetchData(page-1, limit)}>
              Previous
            </button>
            <span className="btn btn-outline-secondary disabled"> {page} </span>
            <button className="btn btn-outline-secondary"
                    disabled={page>=totalPages || loading} onClick={()=>fetchData(page+1, limit)}>
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
