import { useEffect, useMemo, useState } from "react";

const API = process.env.REACT_APP_API_URL || "http://localhost:4000/api";
const PAGE_SIZES = [10, 25, 50, 100];

export default function ConsultarInventario() {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: "codigo", dir: "asc" }); // or cantidad

  // Modal historial
  const [showHist, setShowHist] = useState(false);
  const [histLoading, setHistLoading] = useState(false);
  const [histItem, setHistItem] = useState(null);
  const [histRows, setHistRows] = useState([]);

  // ===== Cargar inventario =====
  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        setLoading(true);
        const r = await fetch(`${API}/inventario`, { credentials: "include" });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.message || "No se pudo cargar inventario");

        // Normaliza campos comunes
        const data = (j?.data || j || []).map((x) => ({
          _id: x._id || x.id,
          codigo: x.codigo || x.codigoInterno || x.sku || x.clave || "",
          descripcion: x.descripcion || x.nombre || "",
          cantidad: Number(x.cantidad ?? x.existencia ?? x.stock ?? 0),
        }));
        if (!abort) setItems(data);
      } catch (e) {
        console.error(e);
        if (!abort) setItems([]);
      } finally {
        if (!abort) setLoading(false);
      }
    })();
    return () => { abort = true; };
  }, []);

  // ===== Filtro + orden =====
  const filtered = useMemo(() => {
    const q = (query || "").toLowerCase().trim();
    let arr = !q
      ? items
      : items.filter(
          (x) =>
            x.codigo.toLowerCase().includes(q) ||
            (x.descripcion || "").toLowerCase().includes(q)
        );

    arr.sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      if (sort.key === "cantidad") return (a.cantidad - b.cantidad) * dir;
      const av = String(a[sort.key] || "").toLowerCase();
      const bv = String(b[sort.key] || "").toLowerCase();
      return av.localeCompare(bv) * dir;
    });
    return arr;
  }, [items, query, sort]);

  // ===== Paginación =====
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageData = useMemo(() => {
    const start = (pageSafe - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageSafe, pageSize]);

  function changeSort(key) {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  }

  // ===== Historial =====
  async function abrirHistorial(item) {
    setHistItem(item);
    setShowHist(true);
    setHistRows([]);
    setHistLoading(true);
    try {
      const r = await fetch(`${API}/inventario/${item._id}/historial`, {
        credentials: "include",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.message || "No se pudo cargar historial");
      const rows = (j?.data || j || []).map((h, idx) => ({
        id: h._id || idx,
        fechaFactura: fmtDate(h.fechaFactura || h.fecha),
        proveedor: h.proveedorNombre || h.proveedor || "",
        doc: `${h.tipoComprobante || ""} ${h.numero || ""}`.trim(),
        cantidad: Number(h.cantidad || h.qty || 0),
        costoUnitario: Number(h.costoUnitario || h.precio || 0),
        ivaPct: Number(h.ivaPct ?? 0),
        total: Number(h.total ?? (Number(h.cantidad || 0) * Number(h.costoUnitario || 0))),
      }));
      setHistRows(rows);
    } catch (e) {
      console.error(e);
      setHistRows([]);
    } finally {
      setHistLoading(false);
    }
  }

  return (
    <div className="container-fluid py-3">
      <div className="row justify-content-center">
        <div className="col-12 col-xxl-10">
          <div className="card shadow-sm border-0">
            <div className="card-header bg-white border-0 d-flex flex-wrap align-items-center justify-content-between">
              <h2 className="h4 mb-2 mb-md-0">CONSULTAR INVENTARIO</h2>

              <div className="d-flex align-items-center gap-3">
                <div className="d-flex align-items-center gap-2">
                  <span className="text-muted small">Show</span>
                  <select
                    value={pageSize}
                    className="form-select form-select-sm"
                    onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  >
                    {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <span className="text-muted small">entries</span>
                </div>

                <div className="d-flex align-items-center gap-2">
                  <span className="text-muted small">Search:</span>
                  <input
                    className="form-control form-control-sm"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                  />
                </div>
              </div>
            </div>

            <div className="table-responsive">
              <table className="table table-striped table-bordered align-middle mb-0">
                <thead>
                  <tr>
                    <th role="button" onClick={() => changeSort("cantidad")} className="text-center" style={{width:120}}>
                      Cantidad {chevron(sort, "cantidad")}
                    </th>
                    <th role="button" onClick={() => changeSort("codigo")}>
                      Codigo {chevron(sort, "codigo")}
                    </th>
                    <th className="text-center" style={{width:160}}>Historial de Compra</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={3} className="text-center py-4">Cargando…</td></tr>
                  ) : pageData.length === 0 ? (
                    <tr><td colSpan={3} className="text-center py-4">Sin resultados</td></tr>
                  ) : (
                    pageData.map((it) => (
                      <tr key={it._id}>
                        <td className="text-center">{it.cantidad}</td>
                        <td>
                          <div className="fw-semibold">{it.codigo || "—"}</div>
                          <div className="small text-muted">{it.descripcion || " "}</div>
                        </td>
                        <td className="text-center">
                          <button
                            type="button"
                            className="btn btn-link p-0"
                            onClick={() => abrirHistorial(it)}
                          >
                            Revisar
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="card-footer bg-white d-flex flex-wrap align-items-center justify-content-between">
              <div className="small text-muted">
                Showing {Math.min((pageSafe - 1) * pageSize + 1, filtered.length)} to{" "}
                {Math.min(pageSafe * pageSize, filtered.length)} of {filtered.length} entries
              </div>

              <nav>
                <ul className="pagination pagination-sm mb-0">
                  <li className={`page-item ${pageSafe === 1 ? "disabled" : ""}`}>
                    <button className="page-link" onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
                  </li>
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <li key={i} className={`page-item ${pageSafe === i + 1 ? "active" : ""}`}>
                      <button className="page-link" onClick={() => setPage(i + 1)}>{i + 1}</button>
                    </li>
                  ))}
                  <li className={`page-item ${pageSafe === totalPages ? "disabled" : ""}`}>
                    <button className="page-link" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
                  </li>
                </ul>
              </nav>
            </div>
          </div>

          

          {/* Modal Historial */}
{showHist && (
  <>
    {/* Backdrop debajo del modal */}
    <div
      className="modal-backdrop fade show"
      style={{ zIndex: 1050 }}
      onClick={() => setShowHist(false)}
    />

    {/* Modal encima del backdrop */}
    <div
      className="modal fade show d-block"
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      style={{ zIndex: 1055 }}
      onKeyDown={(e) => e.key === 'Escape' && setShowHist(false)}
    >
      <div className="modal-dialog modal-lg modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              Historial de compra — {histItem?.codigo}
              <div className="small text-muted">{histItem?.descripcion}</div>
            </h5>
            <button type="button" className="btn-close" onClick={() => setShowHist(false)} />
          </div>

          <div className="modal-body">
                    {histLoading ? (
                      <div className="text-center py-4">Cargando…</div>
                    ) : histRows.length === 0 ? (
                      <div className="text-center py-4">Sin registros</div>
                    ) : (
                      <div className="table-responsive">
                        <table className="table table-sm table-striped align-middle">
                          <thead>
                            <tr>
                              <th style={{whiteSpace:'nowrap'}}>Fecha</th>
                              <th>Proveedor</th>
                              <th>Documento</th>
                              <th className="text-end">Cantidad</th>
                              <th className="text-end">Costo Unit.</th>
                              <th className="text-end">IVA</th>
                              <th className="text-end">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {histRows.map((r) => (
                              <tr key={r.id}>
                                <td style={{whiteSpace:'nowrap'}}>{r.fechaFactura}</td>
                                <td>{r.proveedor}</td>
                                <td>{r.doc}</td>
                                <td className="text-end">{r.cantidad}</td>
                                <td className="text-end">{fmtMXN(r.costoUnitario)}</td>
                                <td className="text-end">{r.ivaPct}%</td>
                                <td className="text-end">{fmtMXN(r.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => setShowHist(false)}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  </>
)}

        </div>
      </div>
    </div>
  );
}

/* ===== Helpers ===== */
function chevron(sort, key) {
  if (sort.key !== key) return <span className="text-muted">▲▼</span>;
  return sort.dir === "asc" ? <span>▲</span> : <span>▼</span>;
}
function fmtMXN(n) {
  try { return Number(n || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" }); }
  catch { return `$${(n || 0).toFixed(2)}`; }
}
function fmtDate(d) {
  try {
    const dd = new Date(d);
    if (Number.isNaN(dd.getTime())) return String(d || "");
    return dd.toISOString().slice(0,10);
  } catch { return String(d || ""); }
}
