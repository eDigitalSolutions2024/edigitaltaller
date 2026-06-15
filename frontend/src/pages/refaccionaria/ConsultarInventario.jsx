import { useEffect, useMemo, useState } from "react";
import { getUser } from "../../auth";
import http from "../../api/http";

const API = process.env.REACT_APP_API_URL || "http://localhost:4000/api";
const PAGE_SIZES = [10, 25, 50, 100];

export default function ConsultarInventario() {
  const isAdmin = getUser()?.role === "admin";

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: "codigo", dir: "asc" });

  // Modal historial
  const [showHist, setShowHist] = useState(false);
  const [histTab, setHistTab] = useState("compras"); // "compras" | "usos"
  const [histItem, setHistItem] = useState(null);
  const [comprasLoading, setComprasLoading] = useState(false);
  const [comprasRows, setComprasRows] = useState([]);
  const [usosLoading, setUsosLoading] = useState(false);
  const [usosRows, setUsosRows] = useState([]);

  // Modal ajuste (solo admin)
  const [showAjuste, setShowAjuste] = useState(false);
  const [ajusteItem, setAjusteItem] = useState(null);
  const [ajusteCantidad, setAjusteCantidad] = useState("");
  const [ajusteMotivo, setAjusteMotivo] = useState("");
  const [ajusteSaving, setAjusteSaving] = useState(false);

  const cargar = async () => {
    let abort = false;
    try {
      setLoading(true);
      const r = await fetch(`${API}/inventario`, { credentials: "include" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.message || "No se pudo cargar inventario");
      const data = (j?.data || j || []).map((x) => ({
        _id: x._id || x.id,
        codigo: x.codigo || x.codigoInterno || x.sku || x.clave || "",
        descripcion: x.descripcion || x.nombre || "",
        unidad: x.unidad || "",
        cantidad: Number(x.cantidad ?? x.existencia ?? x.stock ?? 0),
      }));
      if (!abort) setItems(data);
    } catch (e) {
      console.error(e);
      if (!abort) setItems([]);
    } finally {
      if (!abort) setLoading(false);
    }
    return () => { abort = true; };
  };

  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function abrirHistorial(item) {
    setHistItem(item);
    setHistTab("compras");
    setComprasRows([]);
    setUsosRows([]);
    setShowHist(true);
    cargarCompras(item._id);
    cargarUsos(item._id);
  }

  async function cargarCompras(id) {
    setComprasLoading(true);
    try {
      const r = await fetch(`${API}/inventario/${id}/historial`, { credentials: "include" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.message || "Error");
      const rows = (j?.data || []).map((h, idx) => ({
        id: h._id || idx,
        fecha: fmtDate(h.fechaFactura || h.fecha),
        proveedor: h.proveedorNombre || h.proveedor || "",
        doc: `${h.tipoComprobante || ""} ${h.numero || ""}`.trim(),
        cantidad: Number(h.cantidad || 0),
        costoUnitario: Number(h.costoUnitario || 0),
        ivaPct: Number(h.ivaPct ?? 0),
        total: Number(h.total ?? (Number(h.cantidad || 0) * Number(h.costoUnitario || 0))),
      }));
      setComprasRows(rows);
    } catch (e) {
      console.error(e);
    } finally {
      setComprasLoading(false);
    }
  }

  async function cargarUsos(id) {
    setUsosLoading(true);
    try {
      const r = await fetch(`${API}/inventario/${id}/historial-usos`, { credentials: "include" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.message || "Error");
      setUsosRows(j?.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setUsosLoading(false);
    }
  }

  function abrirAjuste(item) {
    setAjusteItem(item);
    setAjusteCantidad("");
    setAjusteMotivo("");
    setShowAjuste(true);
  }

  async function handleGuardarAjuste() {
    const qty = Number(ajusteCantidad);
    if (!qty || qty === 0) {
      alert("La cantidad no puede ser 0.");
      return;
    }
    setAjusteSaving(true);
    try {
      await http.post("/inventario/ajuste", {
        codigoInterno: ajusteItem._id,
        descripcion:   ajusteItem.descripcion,
        unidad:        ajusteItem.unidad,
        cantidad:      qty,
        motivo:        ajusteMotivo,
      });
      setShowAjuste(false);
      await cargar();
    } catch (e) {
      alert(e.response?.data?.message || e.message || "Error al guardar ajuste.");
    } finally {
      setAjusteSaving(false);
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
                    <th
                      role="button"
                      onClick={() => changeSort("cantidad")}
                      className="text-center"
                      style={{ width: 100 }}
                    >
                      Cantidad {chevron(sort, "cantidad")}
                    </th>
                    <th className="text-center" style={{ width: 110 }}>
                      Disponibilidad
                    </th>
                    <th role="button" onClick={() => changeSort("codigo")}>
                      Codigo {chevron(sort, "codigo")}
                    </th>
                    <th style={{ width: 90 }}>Unidad</th>
                    <th className="text-center" style={{ width: 140 }}>Historial</th>
                    {isAdmin && (
                      <th className="text-center" style={{ width: 100 }}>Ajustar</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={isAdmin ? 6 : 5} className="text-center py-4">Cargando…</td></tr>
                  ) : pageData.length === 0 ? (
                    <tr><td colSpan={isAdmin ? 6 : 5} className="text-center py-4">Sin resultados</td></tr>
                  ) : (
                    pageData.map((it) => (
                      <tr key={it._id}>
                        <td className="text-center fw-semibold">{it.cantidad}</td>
                        <td className="text-center">
                          <BadgeDisponibilidad cantidad={it.cantidad} />
                        </td>
                        <td>
                          <div className="fw-semibold">{it.codigo || "—"}</div>
                          <div className="small text-muted">{it.descripcion || " "}</div>
                        </td>
                        <td className="text-center small">{it.unidad || "—"}</td>
                        <td className="text-center">
                          <button
                            type="button"
                            className="btn btn-link p-0 small"
                            onClick={() => abrirHistorial(it)}
                          >
                            Ver historial
                          </button>
                        </td>
                        {isAdmin && (
                          <td className="text-center">
                            <button
                              type="button"
                              className="btn btn-outline-primary btn-sm"
                              onClick={() => abrirAjuste(it)}
                            >
                              Ajustar
                            </button>
                          </td>
                        )}
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

          {/* ===== Modal Historial (2 pestañas) ===== */}
          {showHist && (
            <>
              <div
                className="modal-backdrop fade show"
                style={{ zIndex: 1050 }}
                onClick={() => setShowHist(false)}
              />
              <div
                className="modal fade show d-block"
                role="dialog"
                aria-modal="true"
                tabIndex={-1}
                style={{ zIndex: 1055 }}
                onKeyDown={(e) => e.key === "Escape" && setShowHist(false)}
              >
                <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
                  <div className="modal-content">
                    <div className="modal-header pb-0 border-0">
                      <div>
                        <h5 className="modal-title mb-1">
                          {histItem?.codigo}
                        </h5>
                        <div className="small text-muted">{histItem?.descripcion}</div>
                      </div>
                      <button type="button" className="btn-close" onClick={() => setShowHist(false)} />
                    </div>

                    {/* Pestañas */}
                    <div className="modal-body pt-2">
                      <ul className="nav nav-tabs mb-3">
                        <li className="nav-item">
                          <button
                            className={`nav-link ${histTab === "compras" ? "active" : ""}`}
                            onClick={() => setHistTab("compras")}
                          >
                            Historial de compra
                          </button>
                        </li>
                        <li className="nav-item">
                          <button
                            className={`nav-link ${histTab === "usos" ? "active" : ""}`}
                            onClick={() => setHistTab("usos")}
                          >
                            Usos y ajustes
                          </button>
                        </li>
                      </ul>

                      {/* Tab: Compras */}
                      {histTab === "compras" && (
                        comprasLoading ? (
                          <div className="text-center py-4">Cargando…</div>
                        ) : comprasRows.length === 0 ? (
                          <div className="text-center py-4 text-muted">Sin registros de compra</div>
                        ) : (
                          <div className="table-responsive">
                            <table className="table table-sm table-striped align-middle">
                              <thead>
                                <tr>
                                  <th style={{ whiteSpace: "nowrap" }}>Fecha</th>
                                  <th>Proveedor</th>
                                  <th>Documento</th>
                                  <th className="text-end">Cantidad</th>
                                  <th className="text-end">Costo Unit.</th>
                                  <th className="text-end">IVA</th>
                                  <th className="text-end">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {comprasRows.map((r) => (
                                  <tr key={r.id}>
                                    <td style={{ whiteSpace: "nowrap" }}>{r.fecha}</td>
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
                        )
                      )}

                      {/* Tab: Usos y ajustes */}
                      {histTab === "usos" && (
                        usosLoading ? (
                          <div className="text-center py-4">Cargando…</div>
                        ) : usosRows.length === 0 ? (
                          <div className="text-center py-4 text-muted">Sin registros de uso</div>
                        ) : (
                          <div className="table-responsive">
                            <table className="table table-sm table-striped align-middle">
                              <thead>
                                <tr>
                                  <th style={{ whiteSpace: "nowrap" }}>Fecha</th>
                                  <th>Tipo</th>
                                  <th className="text-end">Cantidad</th>
                                  <th>Referencia / Motivo</th>
                                  <th>Usuario</th>
                                </tr>
                              </thead>
                              <tbody>
                                {usosRows.map((r, i) => (
                                  <tr key={i}>
                                    <td style={{ whiteSpace: "nowrap" }}>{fmtDate(r.fecha)}</td>
                                    <td><BadgeTipoUso tipo={r.tipo} /></td>
                                    <td className={`text-end fw-semibold ${r.cantidad < 0 ? "text-danger" : "text-success"}`}>
                                      {r.cantidad > 0 ? `+${r.cantidad}` : r.cantidad}
                                    </td>
                                    <td>{r.referencia || "—"}</td>
                                    <td className="small text-muted">{r.usuario || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )
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

          {/* ===== Modal Ajuste Manual (admin) ===== */}
          {showAjuste && isAdmin && (
            <>
              <div
                className="modal-backdrop fade show"
                style={{ zIndex: 1050 }}
                onClick={() => !ajusteSaving && setShowAjuste(false)}
              />
              <div
                className="modal fade show d-block"
                role="dialog"
                aria-modal="true"
                tabIndex={-1}
                style={{ zIndex: 1055 }}
                onKeyDown={(e) => e.key === "Escape" && !ajusteSaving && setShowAjuste(false)}
              >
                <div className="modal-dialog modal-dialog-centered">
                  <div className="modal-content">
                    <div className="modal-header">
                      <h5 className="modal-title">
                        Ajuste manual — {ajusteItem?.codigo}
                        <div className="small text-muted">{ajusteItem?.descripcion}</div>
                      </h5>
                      <button
                        type="button"
                        className="btn-close"
                        onClick={() => setShowAjuste(false)}
                        disabled={ajusteSaving}
                      />
                    </div>
                    <div className="modal-body">
                      <p className="text-muted small mb-3">
                        Existencia actual: <strong>{ajusteItem?.cantidad}</strong>{" "}
                        {ajusteItem?.unidad || ""}
                      </p>

                      <div className="mb-3">
                        <label className="form-label fw-semibold">
                          Cantidad a agregar / quitar
                        </label>
                        <input
                          type="number"
                          className="form-control"
                          placeholder="Ej: 5 para agregar, -3 para quitar"
                          value={ajusteCantidad}
                          onChange={(e) => setAjusteCantidad(e.target.value)}
                          disabled={ajusteSaving}
                        />
                        <div className="form-text">
                          Ingresa un número positivo para agregar o negativo para quitar.
                        </div>
                      </div>

                      <div className="mb-2">
                        <label className="form-label fw-semibold">Motivo (opcional)</label>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Ej: corrección de conteo, merma, etc."
                          value={ajusteMotivo}
                          onChange={(e) => setAjusteMotivo(e.target.value)}
                          disabled={ajusteSaving}
                        />
                      </div>

                      {ajusteCantidad !== "" && Number(ajusteCantidad) !== 0 && (
                        <div className={`alert ${Number(ajusteCantidad) > 0 ? "alert-success" : "alert-warning"} py-2 small`}>
                          Nueva existencia estimada:{" "}
                          <strong>{ajusteItem.cantidad + Number(ajusteCantidad)}</strong>
                        </div>
                      )}
                    </div>
                    <div className="modal-footer">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setShowAjuste(false)}
                        disabled={ajusteSaving}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleGuardarAjuste}
                        disabled={ajusteSaving || !ajusteCantidad || Number(ajusteCantidad) === 0}
                      >
                        {ajusteSaving ? "Guardando…" : "Guardar ajuste"}
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

/* ===== Sub-componentes badge ===== */
function BadgeTipoUso({ tipo }) {
  if (tipo === "SALIDA")
    return <span className="badge bg-danger">Uso en OS</span>;
  if (tipo === "AJUSTE_ENTRADA")
    return <span className="badge bg-success">Ajuste +</span>;
  if (tipo === "AJUSTE_SALIDA")
    return <span className="badge bg-warning text-dark">Ajuste −</span>;
  return <span className="badge bg-secondary">{tipo}</span>;
}

function BadgeDisponibilidad({ cantidad }) {
  if (cantidad > 5)
    return <span className="badge bg-success">Disponible</span>;
  if (cantidad > 0)
    return <span className="badge bg-warning text-dark">Stock bajo</span>;
  return <span className="badge bg-danger">Sin stock</span>;
}

/* ===== Helpers ===== */
function chevron(sort, key) {
  if (sort.key !== key) return <span className="text-muted">▲▼</span>;
  return sort.dir === "asc" ? <span>▲</span> : <span>▼</span>;
}
function fmtMXN(n) {
  try {
    return Number(n || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  } catch {
    return `$${(n || 0).toFixed(2)}`;
  }
}
function fmtDate(d) {
  try {
    const dd = new Date(d);
    if (Number.isNaN(dd.getTime())) return String(d || "");
    return dd.toISOString().slice(0, 10);
  } catch {
    return String(d || "");
  }
}
