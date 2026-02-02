import { useEffect, useState } from "react";
import http from "../../../api/http";

const fmx = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export default function ConsultaVales() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalDocs, setTotalDocs] = useState(0);

  const [f, setF] = useState({
    q: "",            // búsqueda general: código, folio, motivo, proveedor
    codigo: "",       // código exacto del vale (opcional)
    estado: "",       // ACTIVO|CANJEADO|ANULADO|""
    proveedor: "",
    factura: "",
    desde: "",
    hasta: "",
  });
  const onF = (e) => setF(s => ({ ...s, [e.target.name]: e.target.value }));

  const fetchData = async (_page = page, _limit = limit) => {
    setLoading(true);
    try {
      const { data } = await http.get("/vales", {
        params: { ...f, page: _page, limit: _limit }
      });
      if (data?.ok) {
        setRows(data.docs || []);
        setPage(data.page);
        setLimit(data.limit);
        setTotalPages(data.totalPages);
        setTotalDocs(data.totalDocs);
      } else {
        setRows([]); setTotalPages(1); setTotalDocs(0);
      }
    } catch (e) {
      console.error(e);
      setRows([]); setTotalPages(1); setTotalDocs(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(1, limit); /* inicial */ }, []); // eslint-disable-line

  const reset = () => {
    setF({ q:"", codigo:"", estado:"", proveedor:"", factura:"", desde:"", hasta:"" });
    fetchData(1, limit);
  };

  const badgeEstado = (st) => {
    const cls = st === "ACTIVO" ? "bg-success"
              : st === "CANJEADO" ? "bg-secondary"
              : "bg-danger";
    return <span className={`badge ${cls}`}>{st}</span>;
  };

  const copy = async (txt)=>{ try{ await navigator.clipboard.writeText(txt);}catch{} };

  return (
    <div className="container-fluid py-3">
      <h1 className="h4 mb-3 text-center text-uppercase">devoluciones VALE EN ESPECIE</h1>

      {/* Filtros */}
      <div className="card shadow-sm mb-3">
        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-md-2">
              <label className="form-label">Mostrar</label>
              <select className="form-select" value={limit}
                onChange={(e)=>{ const l = parseInt(e.target.value)||10; setLimit(l); fetchData(1,l); }}>
                <option>10</option><option>25</option><option>50</option><option>100</option>
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Buscar</label>
              <input className="form-control" name="q" value={f.q} onChange={onF}
                     placeholder="código, folio, proveedor, motivo..." />
            </div>
            <div className="col-md-2">
              <label className="form-label">Código vale</label>
              <input className="form-control" name="codigo" value={f.codigo} onChange={onF} />
            </div>
            <div className="col-md-2">
              <label className="form-label">Estado</label>
              <select className="form-select" name="estado" value={f.estado} onChange={onF}>
                <option value="">Todos</option>
                <option>ACTIVO</option>
                <option>CANJEADO</option>
                <option>ANULADO</option>
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Proveedor</label>
              <input className="form-control" name="proveedor" value={f.proveedor} onChange={onF} />
            </div>

            <div className="col-md-2">
              <label className="form-label">Factura</label>
              <input className="form-control" name="factura" value={f.factura} onChange={onF} />
            </div>
            <div className="col-md-2">
              <label className="form-label">Desde</label>
              <input type="date" className="form-control" name="desde" value={f.desde} onChange={onF} />
            </div>
            <div className="col-md-2">
              <label className="form-label">Hasta</label>
              <input type="date" className="form-control" name="hasta" value={f.hasta} onChange={onF} />
            </div>

            <div className="col-md-6 d-flex gap-2 justify-content-end">
              <button className="btn btn-primary" onClick={()=>fetchData(1, limit)}>
                {loading ? "Buscando..." : "Buscar"}
              </button>
              <button className="btn btn-outline-secondary" onClick={reset}>Limpiar</button>
              <span className="align-self-center text-muted small">Total: {totalDocs}</span>
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
                <th style={{minWidth:140}}>Código Vale</th>
                <th style={{minWidth:110}}>ID Devolución</th>
                <th>Proveedor</th>
                <th style={{minWidth:130}}>Número de Factura</th>
                <th style={{minWidth:120}}>Fecha Devolución</th>
                <th style={{minWidth:120}}>Tipo Devolución</th>
                <th className="text-end" style={{minWidth:120}}>Total Abierto</th>
                <th style={{minWidth:110}}>Estatus</th>
                <th style={{minWidth:90}}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr><td colSpan={9} className="text-center py-4 text-muted">No hay datos</td></tr>
              )}
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="text-truncate" style={{maxWidth:220}}>
                    {r.codigo}
                  </td>
                  <td title={r.devolucionId}>{r.devolucionId?.slice(-8)}</td>
                  <td className="text-truncate" style={{maxWidth:280}}>{r.proveedor || "—"}</td>
                  <td>{r.factura || "—"}</td>
                  <td>{r.fecha || "—"}</td>
                  <td>{r.tipo || "VALE"}</td>
                  <td className="text-end">{fmx.format(r.saldo ?? 0)}</td>
                  <td>{badgeEstado(r.estado)}</td>
                  <td>
                    <div className="btn-group btn-group-sm">
                      <button className="btn btn-outline-secondary" title="Copiar código" onClick={()=>copy(r.codigo)}>Copiar</button>
                      {/* futuro: Detalle/Imprimir */}
                    </div>
                  </td>
                </tr>
              ))}
              {loading && <tr><td colSpan={9} className="py-4 text-center">Cargando…</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <div className="d-flex justify-content-between align-items-center p-2">
          <small className="text-muted">Página {page} de {totalPages}</small>
          <div className="btn-group">
            <button className="btn btn-outline-secondary" disabled={page<=1 || loading}
                    onClick={()=>fetchData(page-1, limit)}>Previous</button>
            <button className="btn btn-outline-secondary" disabled={page>=totalPages || loading}
                    onClick={()=>fetchData(page+1, limit)}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
