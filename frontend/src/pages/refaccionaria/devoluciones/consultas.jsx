import { useEffect, useMemo, useState } from "react";
import http from "../../../api/http";

const fmx = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export default function ConsultaDevoluciones() {
  const [loading, setLoading]   = useState(false);
  const [rows, setRows]         = useState([]);
  const [page, setPage]         = useState(1);
  const [limit, setLimit]       = useState(10);
  const [totalPages, setTP]     = useState(1);
  const [totalDocs, setTD]      = useState(0);

  // Filtros
  const [f, setF] = useState({
    tipo: "",            // DINERO | PIEZA | VALE | ""
    factura: "",
    proveedor: "",
    q: "",
    desde: "",
    hasta: ""
  });

  const onF = (e) => setF(s => ({ ...s, [e.target.name]: e.target.value }));

  const fetchData = async (_page = page, _limit = limit) => {
    setLoading(true);
    try {
      const { data } = await http.get("/devoluciones", {
        params: { ...f, page: _page, limit: _limit }
      });
      if (data?.ok) {
        setRows(data.docs || []);
        setPage(data.page);
        setLimit(data.limit);
        setTP(data.totalPages);
        setTD(data.totalDocs);
      } else {
        setRows([]); setTP(1); setTD(0);
      }
    } catch (e) {
      console.error(e);
      setRows([]); setTP(1); setTD(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(1, limit); /* carga inicial */ }, []); // eslint-disable-line

  const reset = () => {
    setF({ tipo:"", factura:"", proveedor:"", q:"", desde:"", hasta:"" });
    setPage(1);
    fetchData(1, limit);
  };

  const montoCell = (r) => {
    if (r.tipo === "PIEZA") {
      // diferencia (positivo cobra, negativo abona)
      if (typeof r.diferencia === "number") return fmx.format(r.diferencia);
      // fallback: mostrar salida - entrada si existiera
      const a = r.totalSalida ?? 0, b = r.totalEntrada ?? 0;
      return fmx.format((a||0)-(b||0));
    }
    return fmx.format(r.total ?? 0);
  };

  const badge = (t) => {
    const cls = t === "DINERO" ? "bg-success"
              : t === "VALE"   ? "bg-info"
              : "bg-warning";
    return <span className={`badge ${cls}`}>{t}</span>;
  };

  return (
    <div className="container-fluid py-3">
      <h1 className="h4 mb-3">Consulta de Devoluciones</h1>

      {/* Filtros */}
      <div className="card shadow-sm mb-3">
        <div className="card-body">
          <div className="row g-3">
            <div className="col-sm-3">
              <label className="form-label">Tipo</label>
              <select className="form-select" name="tipo" value={f.tipo} onChange={onF}>
                <option value="">Todos</option>
                <option value="DINERO">Dinero</option>
                <option value="PIEZA">Pieza x Pieza</option>
                <option value="VALE">Vale (en especie)</option>
              </select>
            </div>

            <div className="col-sm-3">
              <label className="form-label">N° Factura</label>
              <input className="form-control" name="factura" value={f.factura} onChange={onF} />
            </div>

            <div className="col-sm-3">
              <label className="form-label">Proveedor</label>
              <input className="form-control" name="proveedor" value={f.proveedor} onChange={onF} />
            </div>

            <div className="col-sm-3">
              <label className="form-label">Buscar</label>
              <input className="form-control" name="q" placeholder="folio, motivo..." value={f.q} onChange={onF} />
            </div>

            <div className="col-sm-3">
              <label className="form-label">Desde</label>
              <input type="date" className="form-control" name="desde" value={f.desde} onChange={onF} />
            </div>

            <div className="col-sm-3">
              <label className="form-label">Hasta</label>
              <input type="date" className="form-control" name="hasta" value={f.hasta} onChange={onF} />
            </div>

            <div className="col-sm-6 d-flex align-items-end gap-2">
              <button className="btn btn-primary" onClick={() => fetchData(1, limit)}>
                {loading ? "Buscando..." : "Buscar"}
              </button>
              <button className="btn btn-outline-secondary" onClick={reset}>Limpiar</button>

              <div className="ms-auto d-flex align-items-center gap-2">
                <label className="form-label m-0">Mostrar</label>
                <select
                  className="form-select"
                  style={{ width: 90 }}
                  value={limit}
                  onChange={(e) => { const l = parseInt(e.target.value)||10; setLimit(l); fetchData(1,l); }}
                >
                  <option>10</option><option>25</option><option>50</option><option>100</option>
                </select>
                <span className="text-muted small">de {totalDocs}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="card shadow-sm">
        <div className="table-responsive">
          <table className="table table-bordered table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>Fecha</th>
                <th>Folio</th>
                <th>Tipo</th>
                <th>N° Factura</th>
                <th>Proveedor</th>
                <th className="text-end">Monto</th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr><td colSpan={6} className="text-center py-4 text-muted">Sin resultados</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.fecha}</td>
                  <td>{r.folio || <span className="text-muted">—</span>}</td>
                  <td>{badge(r.tipo)}</td>
                  <td>{r.factura || <span className="text-muted">—</span>}</td>
                  <td className="text-truncate" style={{maxWidth: 280}}>{r.proveedor}</td>
                  <td className="text-end">{montoCell(r)}</td>
                </tr>
              ))}
              {loading && (
                <tr><td colSpan={6} className="py-4 text-center">Cargando…</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <div className="d-flex justify-content-between align-items-center p-2">
          <small className="text-muted">Página {page} de {totalPages}</small>
          <div className="btn-group">
            <button className="btn btn-outline-secondary" disabled={page<=1 || loading} onClick={()=>fetchData(page-1, limit)}>«</button>
            <button className="btn btn-outline-secondary" disabled={page>=totalPages || loading} onClick={()=>fetchData(page+1, limit)}>»</button>
          </div>
        </div>
      </div>
    </div>
  );
}
