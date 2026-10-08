import { useEffect, useMemo, useState } from "react";
import Dropdown from "../../components/Dropdown";
import { getUser } from "../../auth";
import http from "../../api/http";
import useLineaNegocio, { paramsLinea } from "../../hooks/useLineaNegocio";
import {
  ModalUbicacionForm, ModalAsignar, ModalUbicacionDetalle,
} from "./components/InventarioUbicacionesModales";
import "../../styles/inventarioUbicaciones.css";

import { isAdminLike } from "../../utils/roles";
const API = process.env.REACT_APP_API_URL || "http://localhost:4000/api";
const PAGE_SIZES = [10, 25, 50, 100];

export default function ConsultarInventario() {
  // Cada línea de negocio tiene su propio almacén: en /chirey se ve solo el de Chirey.
  const linea = useLineaNegocio();
  const qs = linea ? `?lineaNegocio=${linea}` : "";
  const role = getUser()?.role;
  const isAdmin = isAdminLike(role);
  const canEditUbic = isAdmin || role === "refaccionario";

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [queryGeneral, setQueryGeneral] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [verSinStock, setVerSinStock] = useState(false); // pestaña "Sin stock" del panel inferior
  const [sort, setSort] = useState({ key: "codigo", dir: "asc" });

  // Modales de ubicaciones
  const [ubicAbiertaId, setUbicAbiertaId] = useState(null);
  const [formUbic, setFormUbic] = useState(null);        // null | { ubic?: {...} }
  const [asignarItem, setAsignarItem] = useState(null);

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
      const [r, ru] = await Promise.all([
        fetch(`${API}/inventario${qs}`, { credentials: "include" }),
        http.get("/inventario/ubicaciones", { params: paramsLinea(linea) }).catch(() => null),
      ]);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.message || "No se pudo cargar inventario");
      const data = (j?.data || j || []).map((x) => ({
        _id: x._id || x.id,
        codigo: x.codigo || x.codigoInterno || x.sku || x.clave || "",
        descripcion: x.descripcion || x.nombre || "",
        unidad: x.unidad || "",
        cantidad: Number(x.cantidad ?? x.existencia ?? x.stock ?? 0),
      }));
      if (!abort) {
        setItems(data);
        setUbicaciones(ru?.data?.data || []);
      }
    } catch (e) {
      console.error(e);
      if (!abort) setItems([]);
    } finally {
      if (!abort) setLoading(false);
    }
    return () => { abort = true; };
  };

  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- Cruce inventario × ubicaciones ---- */
  const enriched = useMemo(() => {
    const porCodigo = {};
    ubicaciones.forEach((u) =>
      (u.items || []).forEach((i) => {
        (porCodigo[i.codigoInterno] ||= []).push({ ubicId: u._id, nombre: u.nombre, cantidad: i.cantidad });
      })
    );
    return items.map((it) => {
      const locs = porCodigo[it._id] || [];
      const asignado = locs.reduce((s, l) => s + l.cantidad, 0);
      return { ...it, locs, asignado, sinAsignar: Math.max(0, it.cantidad - asignado) };
    });
  }, [items, ubicaciones]);

  const itemsPorId = useMemo(() => Object.fromEntries(enriched.map((x) => [x._id, x])), [enriched]);
  const ubicAbierta = ubicaciones.find((u) => u._id === ubicAbiertaId) || null;

  /* ---- Búsqueda general: filtra ubicaciones y sin asignar ---- */
  const qGen = queryGeneral.toLowerCase().trim();
  const coincide = (x) =>
    x.codigo.toLowerCase().includes(qGen) || (x.descripcion || "").toLowerCase().includes(qGen);

  /* ---- Refacciones sin asignar (tabla paginada) ---- */
  const filtered = useMemo(() => {
    // "Con stock": hay piezas por colocar. "Sin stock": existencia ≤ 0 (apartado aparte).
    let arr = enriched.filter((x) => (verSinStock ? x.cantidad <= 0 : x.cantidad > 0 && x.sinAsignar > 0));
    if (qGen) arr = arr.filter(coincide);
    return [...arr].sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      if (sort.key === "cantidad") return (verSinStock ? a.cantidad - b.cantidad : a.sinAsignar - b.sinAsignar) * dir;
      const av = String(a[sort.key] || "").toLowerCase();
      const bv = String(b[sort.key] || "").toLowerCase();
      return av.localeCompare(bv) * dir;
    });
  }, [enriched, qGen, sort, verSinStock]); // eslint-disable-line react-hooks/exhaustive-deps

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

  /* ---- Acciones de ubicaciones ---- */
  const reemplazarUbic = (doc) =>
    setUbicaciones((list) => {
      const i = list.findIndex((u) => u._id === doc._id);
      if (i < 0) return [...list, doc];
      const c = [...list]; c[i] = doc; return c;
    });

  async function guardarUbicacion(datos) {
    if (formUbic?.ubic) {
      const r = await http.put(`/inventario/ubicaciones/${formUbic.ubic._id}`, datos);
      reemplazarUbic(r.data.data);
    } else {
      const r = await http.post("/inventario/ubicaciones", { ...datos, ...paramsLinea(linea) });
      reemplazarUbic(r.data.data);
    }
    setFormUbic(null);
  }

  async function eliminarUbicacion(u) {
    const n = (u.items || []).length;
    const msg = n
      ? `¿Eliminar "${u.nombre}"? Sus ${n} refacción(es) volverán a "sin asignar".`
      : `¿Eliminar "${u.nombre}"?`;
    if (!window.confirm(msg)) return;
    try {
      await http.delete(`/inventario/ubicaciones/${u._id}`);
      setUbicaciones((l) => l.filter((x) => x._id !== u._id));
      setUbicAbiertaId(null);
    } catch (e) {
      alert(e.response?.data?.message || e.message || "No se pudo eliminar.");
    }
  }

  async function setCantidadEnUbic(ubicId, codigo, cantidad) {
    const r = await http.put(`/inventario/ubicaciones/${ubicId}/items`, { codigoInterno: codigo, cantidad });
    reemplazarUbic(r.data.data);
  }

  async function asignarAUbic(ubicId, codigo, cantidad) {
    const r = await http.put(`/inventario/ubicaciones/${ubicId}/items`, { codigoInterno: codigo, sumar: cantidad });
    reemplazarUbic(r.data.data);
    setAsignarItem(null);
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
      const r = await fetch(`${API}/inventario/${id}/historial${qs}`, { credentials: "include" });
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
      const r = await fetch(`${API}/inventario/${id}/historial-usos${qs}`, { credentials: "include" });
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
        ...paramsLinea(linea),
      });
      setShowAjuste(false);
      await cargar();
    } catch (e) {
      alert(e.response?.data?.message || e.message || "Error al guardar ajuste.");
    } finally {
      setAjusteSaving(false);
    }
  }

  const totalPorAsignar = enriched.filter((x) => x.cantidad > 0 && x.sinAsignar > 0).length;
  const totalSinStock = enriched.filter((x) => x.cantidad <= 0).length;

  // Con búsqueda activa solo se muestran las ubicaciones que tienen la refacción
  const ubicVisibles = ubicaciones
    .map((u) => ({
      u,
      coinc: qGen
        ? (u.items || []).map((i) => ({ it: itemsPorId[i.codigoInterno], cantidad: i.cantidad })).filter((m) => m.it && coincide(m.it))
        : [],
    }))
    .filter((x) => !qGen || x.coinc.length > 0);

  const tarjeta = ({ u, coinc }) => {
    const piezas = (u.items || []).reduce((s, i) => s + i.cantidad, 0);
    return (
      <button key={u._id} type="button" className="inv-ubic" onClick={() => setUbicAbiertaId(u._id)}>
        <span className="inv-ubic__nombre">{u.nombre}</span>
        {qGen ? (
          coinc.slice(0, 4).map((m) => (
            <span key={m.it._id} className="inv-ubic__hit">{m.it.codigo}: <b>{m.cantidad}</b></span>
          ))
        ) : (
          <span className="inv-ubic__meta">{(u.items || []).length} ref. · {piezas} pzas</span>
        )}
      </button>
    );
  };

  return (
    <div className="container-fluid py-3 inv">
      <div className="row justify-content-center">
        <div className="col-12 col-xxl-10">
          <div className="d-flex flex-wrap align-items-center justify-content-between mb-3 gap-2">
            <h2 className="h4 mb-0">INVENTARIO</h2>
            <div className="small text-muted">
              {enriched.length} refacciones · {ubicaciones.length} ubicaciones
            </div>
          </div>

          {/* ===== Búsqueda general ===== */}
          <div className="card shadow-sm border-0 mb-3">
            <div className="card-body">
              <input
                className="form-control form-control-lg"
                placeholder="🔍  Búsqueda general: código o descripción de la refacción…"
                value={queryGeneral}
                onChange={(e) => { setQueryGeneral(e.target.value); setPage(1); }}
              />
            </div>
          </div>

          {/* ===== Ubicaciones ===== */}
          <div className="card shadow-sm border-0 mb-3">
            <div className="card-header bg-white border-0 d-flex align-items-center justify-content-between">
              <h3 className="h6 mb-0">Ubicaciones</h3>
              {canEditUbic && (
                <button className="btn btn-primary btn-sm" onClick={() => setFormUbic({})}>
                  + Nueva ubicación
                </button>
              )}
            </div>
            <div className="card-body pt-0">
              {ubicVisibles.length === 0 && ubicaciones.length > 0 ? (
                <div className="text-muted text-center py-4">Ninguna ubicación tiene esa refacción.</div>
              ) : ubicaciones.length === 0 ? (
                <div className="text-muted text-center py-4">
                  Aún no hay ubicaciones.{canEditUbic ? " Crea la primera con “Nueva ubicación” (ej. Repisa 1)." : ""}
                </div>
              ) : (
                <div className="inv-ubic-grid">{ubicVisibles.map(tarjeta)}</div>
              )}
            </div>
          </div>

          {/* ===== Refacciones sin asignar ===== */}
          <div className="card shadow-sm border-0 inv-lista">
            <div className="inv-tabs">
              <button
                type="button"
                className={`inv-tab ${!verSinStock ? "is-active" : ""}`}
                onClick={() => { setVerSinStock(false); setPage(1); }}
              >
                Por asignar <span className="inv-tab__n">{totalPorAsignar}</span>
              </button>
              <button
                type="button"
                className={`inv-tab inv-tab--danger ${verSinStock ? "is-active" : ""}`}
                onClick={() => { setVerSinStock(true); setPage(1); }}
              >
                Sin stock <span className="inv-tab__n">{totalSinStock}</span>
              </button>

              <div className="inv-tabs__right">
                <span className="text-muted small">Mostrar</span>
                <Dropdown
                  value={pageSize}
                  className="form-select-sm"
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                >
                  {PAGE_SIZES.map((n) => <Dropdown.Option key={n} value={n}>{n}</Dropdown.Option>)}
                </Dropdown>
              </div>
            </div>

            <div className="table-responsive">
              <table className="table inv-table align-middle mb-0">
                <thead>
                  <tr>
                    <th role="button" onClick={() => changeSort("codigo")}>
                      Refacción {chevron(sort, "codigo")}
                    </th>
                    <th style={{ width: 90 }}>Unidad</th>
                    <th role="button" onClick={() => changeSort("cantidad")} className="text-center" style={{ width: 150 }}>
                      {verSinStock ? "Existencia" : "Por asignar"} {chevron(sort, "cantidad")}
                    </th>
                    <th className="text-end" style={{ width: 280 }} />
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={4} className="text-center py-4">Cargando…</td></tr>
                  ) : pageData.length === 0 ? (
                    <tr><td colSpan={4} className="text-center text-muted py-5">
                      {verSinStock
                        ? (qGen ? "Ninguna refacción sin stock coincide." : "No hay refacciones sin stock")
                        : (qGen ? "No hay piezas sin asignar de esa refacción." : "Todas las refacciones están asignadas")}
                    </td></tr>
                  ) : (
                    pageData.map((it) => (
                      <tr key={it._id}>
                        <td>
                          <div className="fw-semibold">{it.codigo || "—"}</div>
                          <div className="small text-muted">{it.descripcion || " "}</div>
                        </td>
                        <td className="small text-muted">{it.unidad || "—"}</td>
                        <td className="text-center">
                          <span className={`inv-stock ${it.cantidad <= 0 ? "inv-stock--cero" : it.cantidad <= 5 ? "inv-stock--bajo" : "inv-stock--ok"}`}>
                            {verSinStock ? it.cantidad : it.sinAsignar}
                          </span>
                          {!verSinStock && it.asignado > 0 && <div className="small text-muted mt-1">de {it.cantidad}</div>}
                        </td>
                        <td className="text-end text-nowrap">
                          {canEditUbic && !verSinStock && (
                            <button
                              type="button"
                              className="btn btn-success btn-sm me-1"
                              disabled={it.sinAsignar <= 0}
                              onClick={() => setAsignarItem(it)}
                            >
                              Asignar
                            </button>
                          )}
                          <button type="button" className="btn btn-outline-secondary btn-sm me-1" onClick={() => abrirHistorial(it)}>
                            Historial
                          </button>
                          {isAdmin && (
                            <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => abrirAjuste(it)}>
                              Ajustar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="card-footer bg-white d-flex flex-wrap align-items-center justify-content-between">
              <div className="small text-muted">
                Mostrando {filtered.length ? (pageSafe - 1) * pageSize + 1 : 0} a{" "}
                {Math.min(pageSafe * pageSize, filtered.length)} de {filtered.length}
              </div>

              <nav>
                <ul className="pagination pagination-sm mb-0">
                  <li className={`page-item ${pageSafe === 1 ? "disabled" : ""}`}>
                    <button className="page-link" onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</button>
                  </li>
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <li key={i} className={`page-item ${pageSafe === i + 1 ? "active" : ""}`}>
                      <button className="page-link" onClick={() => setPage(i + 1)}>{i + 1}</button>
                    </li>
                  ))}
                  <li className={`page-item ${pageSafe === totalPages ? "disabled" : ""}`}>
                    <button className="page-link" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Siguiente</button>
                  </li>
                </ul>
              </nav>
            </div>
          </div>

          {/* ===== Modales de ubicaciones ===== */}
          {ubicAbierta && (
            <ModalUbicacionDetalle
              ubic={ubicAbierta}
              itemsPorId={itemsPorId}
              sinAsignarList={enriched}
              canEdit={canEditUbic}
              onClose={() => setUbicAbiertaId(null)}
              onEditar={() => setFormUbic({ ubic: ubicAbierta })}
              onEliminar={() => eliminarUbicacion(ubicAbierta)}
              onSetCantidad={setCantidadEnUbic}
              onAsignar={asignarAUbic}
            />
          )}
          {formUbic && (
            <ModalUbicacionForm ubic={formUbic.ubic} onClose={() => setFormUbic(null)} onSave={guardarUbicacion} />
          )}
          {asignarItem && (
            <ModalAsignar
              item={itemsPorId[asignarItem._id] || asignarItem}
              ubicaciones={ubicaciones}
              onClose={() => setAsignarItem(null)}
              onAsignar={asignarAUbic}
            />
          )}

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
