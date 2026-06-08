import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import http from "../../api/http";

const API    = process.env.REACT_APP_API_URL || "http://localhost:4000/api";
const SERVER = API.replace(/\/api$/, "");
const fmt    = new Intl.DateTimeFormat("es-MX");

// ─── Modal para subir foto a una entrada sin fotografía ───────────────────────
function ModalSubirFoto({ entrada, onClose, onFotoGuardada }) {
  const [archivo, setArchivo]   = useState(null);
  const [preview, setPreview]   = useState(null);
  const [tipo, setTipo]         = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [zoomAbierto, setZoomAbierto] = useState(false);

  const onFile = (e) => {
    const f = e.target.files[0] || null;
    setArchivo(f);
    setZoomAbierto(false);
    if (f) {
      setTipo(f.type);
      setPreview(URL.createObjectURL(f));
    } else {
      setPreview(null);
      setTipo(null);
    }
  };

  const guardar = async () => {
    if (!archivo) return alert("Selecciona un archivo primero.");
    const formData = new FormData();
    formData.append("fotoFactura", archivo);

    try {
      setGuardando(true);
      const r = await fetch(`${API}/entradas/${entrada._id}/foto`, {
        method: "PATCH",
        credentials: "include",
        body: formData,
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json?.message || "Error al guardar la foto");
      onFotoGuardada(entrada._id);
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      {/* Backdrop del modal */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          backgroundColor: "rgba(0,0,0,0.5)",
          zIndex: 1040,
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed", top: "50%", left: "50%",
          transform: "translate(-50%,-50%)",
          zIndex: 1050, width: "100%", maxWidth: 500,
          background: "white", borderRadius: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          padding: 24,
        }}
      >
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h5 className="mb-0">📎 Subir fotografía de factura</h5>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", lineHeight: 1 }}
          >×</button>
        </div>

        {/* Info de la entrada */}
        <div className="alert alert-warning py-2 mb-3 small">
          <strong>Factura:</strong> {entrada.factura} &nbsp;·&nbsp;
          <strong>Proveedor:</strong> {entrada.proveedor || "—"} &nbsp;·&nbsp;
          <strong>Fecha:</strong> {entrada.fecha ? fmt.format(new Date(entrada.fecha)) : "—"}
        </div>

        <div className="mb-3">
          <label className="form-label">Selecciona imagen o PDF</label>
          <input
            type="file"
            className="form-control"
            accept="image/*,application/pdf"
            onChange={onFile}
          />
          <div className="form-text">Acepta imagen o PDF (≤ 5MB).</div>
        </div>

        {/* Vista previa */}
        {preview && (
          <div className="border rounded p-2 mb-3">
            {tipo === "application/pdf" ? (
              <iframe
                src={preview}
                title="Vista previa"
                width="100%"
                height="220px"
                style={{ border: "none" }}
              />
            ) : (
              <>
                <img
                  src={preview}
                  alt="Vista previa"
                  onClick={() => setZoomAbierto(true)}
                  style={{
                    width: "100%",
                    maxHeight: 220,
                    objectFit: "contain",
                    cursor: "zoom-in",
                    borderRadius: 4,
                  }}
                />
                <div className="text-center mt-1">
                  <small className="text-muted">🔍 Clic para ampliar</small>
                </div>
              </>
            )}
          </div>
        )}

        <div className="d-flex justify-content-end gap-2">
          <button className="btn btn-outline-secondary" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={guardar} disabled={guardando || !archivo}>
            {guardando ? "Guardando..." : "Guardar foto"}
          </button>
        </div>
      </div>

      {/* Zoom — encima de todo, z-index mayor que el modal */}
      {zoomAbierto && (
        <div
          onClick={() => setZoomAbierto(false)}
          style={{
            position: "fixed", inset: 0,
            backgroundColor: "rgba(0,0,0,0.88)",
            zIndex: 2000,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "zoom-out",
          }}
        >
          <img
            src={preview}
            alt="Zoom"
            style={{
              maxWidth: "90vw",
              maxHeight: "90vh",
              objectFit: "contain",
              borderRadius: 8,
              boxShadow: "0 0 40px rgba(0,0,0,0.6)",
            }}
          />
          <button
            onClick={() => setZoomAbierto(false)}
            style={{
              position: "absolute", top: 16, right: 16,
              background: "white", border: "none",
              borderRadius: "50%", width: 36, height: 36,
              fontSize: 18, cursor: "pointer", lineHeight: 1,
            }}
          >×</button>
        </div>
      )}
    </>
  );
}

function formatCurrency(n) {
  try { return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" }); }
  catch { return `$${(n || 0).toFixed(2)}`; }
}

// ─── Modal ver detalle (solo lectura) ────────────────────────────────────────
function ModalVerDetalle({ entrada, onClose }) {
  const proveedor =
    entrada.proveedorId?.nombreProveedor ||
    entrada.proveedorId?.nombre ||
    entrada.proveedorId?.aliasProveedor ||
    "—";

  function calcTotal(r) {
    const base = (r.cantidad || 0) * (r.costoUnitario || 0);
    const conDesc = base * (1 - (r.descuentoPct || 0) / 100);
    return conDesc * (1 + (r.ivaPct || 0) / 100);
  }

  const totalGeneral = (entrada.captura || []).reduce((sum, r) => sum + calcTotal(r), 0);

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1040 }}
      />
      <div
        style={{
          position: "fixed", top: "50%", left: "50%",
          transform: "translate(-50%,-50%)",
          zIndex: 1050, width: "95%", maxWidth: 1050, maxHeight: "90vh",
          background: "white", borderRadius: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        {/* Encabezado del modal */}
        <div className="d-flex justify-content-between align-items-center p-3 border-bottom">
          <h5 className="mb-0">Detalle de Factura</h5>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", lineHeight: 1 }}
          >×</button>
        </div>

        <div style={{ overflowY: "auto", padding: 24 }}>
          {/* Datos generales */}
          <div className="row g-3 mb-4">
            <div className="col-6 col-md-4">
              <small className="text-muted d-block">Tipo de Comprobante</small>
              <strong>{entrada.tipoComprobante || "—"}</strong>
            </div>
            <div className="col-6 col-md-4">
              <small className="text-muted d-block">Número de Factura</small>
              <strong>{entrada.numero || "—"}</strong>
            </div>
            <div className="col-6 col-md-4">
              <small className="text-muted d-block">Fecha</small>
              <strong>{entrada.fechaFactura ? fmt.format(new Date(entrada.fechaFactura)) : "—"}</strong>
            </div>
            <div className="col-6 col-md-4">
              <small className="text-muted d-block">Proveedor</small>
              <strong>{proveedor}</strong>
            </div>
            <div className="col-6 col-md-4">
              <small className="text-muted d-block">Moneda</small>
              <strong>{entrada.moneda || "—"}</strong>
            </div>
            <div className="col-6 col-md-4">
              <small className="text-muted d-block">Forma de Pago</small>
              <strong>{entrada.formaPago || "—"}</strong>
            </div>
            <div className="col-6 col-md-4">
              <small className="text-muted d-block">Estado</small>
              <strong>{entrada.estado === "finalizada" ? "🟢 Finalizada" : "🟡 Borrador"}</strong>
            </div>
          </div>

          {/* Fotografía de la factura */}
          {entrada.fotoFactura?.url && (
            <div className="mb-4">
              <h6 className="text-uppercase text-muted mb-2">Fotografía de Factura</h6>
              {entrada.fotoFactura.mimetype === "application/pdf" ? (
                <iframe
                  src={`${SERVER}${entrada.fotoFactura.url}`}
                  title="Factura PDF"
                  width="100%"
                  height="400px"
                  style={{ border: "1px solid #dee2e6", borderRadius: 4 }}
                />
              ) : (
                <img
                  src={`${SERVER}${entrada.fotoFactura.url}`}
                  alt="Fotografía de factura"
                  style={{
                    maxWidth: "100%",
                    maxHeight: 400,
                    objectFit: "contain",
                    border: "1px solid #dee2e6",
                    borderRadius: 4,
                    display: "block",
                  }}
                />
              )}
            </div>
          )}

          {/* Tabla de captura */}
          <h6 className="text-uppercase text-muted mb-2">Detalle de Captura</h6>
          {(!entrada.captura || entrada.captura.length === 0) ? (
            <p className="text-muted">Sin renglones de captura registrados.</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-bordered table-sm align-middle">
                <thead className="table-light">
                  <tr>
                    <th>#</th>
                    <th>Descripción</th>
                    <th>Tipo</th>
                    <th>Unidad</th>
                    <th>Cantidad</th>
                    <th>Costo Unitario</th>
                    <th>IVA</th>
                    <th>Descuento ($)</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {entrada.captura.map((c, i) => (
                    <tr key={c._id || i}>
                      <td>{i + 1}</td>
                      <td>{c.descripcion || "—"}</td>
                      <td>{c.tipo || "—"}</td>
                      <td>{c.unidad || "—"}</td>
                      <td>{c.cantidad}</td>
                      <td>{formatCurrency(c.costoUnitario || 0)}</td>
                      <td>{c.ivaPct || 0}%</td>
                      <td>{formatCurrency((c.cantidad || 0) * (c.costoUnitario || 0) * ((c.descuentoPct || 0) / 100))}</td>
                      <td>{formatCurrency(calcTotal(c))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={8} className="text-end fw-semibold">Total General:</td>
                    <td className="fw-bold">{formatCurrency(totalGeneral)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <div className="p-3 border-top d-flex justify-content-end">
          <button className="btn btn-outline-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ConsultarFacturaProveedor() {
  const navigate = useNavigate();

  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [page, setPage]             = useState(1);
  const [limit, setLimit]           = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalDocs, setTotalDocs]   = useState(0);
  const [entradaFoto, setEntradaFoto]       = useState(null);
  const [entradaDetalle, setEntradaDetalle] = useState(null);

  const [f, setF] = useState({
    numero: "", q: "", proveedor: "", estado: "todos", desde: "", hasta: "",
  });
  const onF = (e) => setF((s) => ({ ...s, [e.target.name]: e.target.value }));

  const fetchData = async (_page = page, _limit = limit) => {
    setLoading(true);
    try {
      const { data } = await http.get("/facturas-proveedor", {
        params: { ...f, page: _page, limit: _limit },
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

  useEffect(() => { fetchData(1, limit); }, []); // eslint-disable-line

  useEffect(() => {
    const timer = setTimeout(() => { fetchData(1, limit); }, 400);
    return () => clearTimeout(timer);
  }, [f.numero, f.proveedor, f.q, f.estado, f.desde, f.hasta]); // eslint-disable-line

  const reset = () => {
    setF({ numero: "", q: "", proveedor: "", estado: "todos", desde: "", hasta: "" });
    fetchData(1, limit);
  };

  const continuar = (row) => navigate(`/refaccionaria/entrada?id=${row._id}`);

  const verDetalle = async (row) => {
    try {
      const r = await fetch(`${API}/entradas/${row._id}`, { credentials: "include" });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.success) throw new Error(json?.message || "Error al cargar detalle");
      setEntradaDetalle(json.data);
    } catch (err) {
      alert(err.message);
    }
  };

  const eliminarBorrador = async (row) => {
    if (!window.confirm(`¿Eliminar el borrador de factura "${row.factura}"?\nEsta acción no se puede deshacer.`)) return;
    try {
      const r = await fetch(`${API}/entradas/${row._id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json?.message || "Error al eliminar");
      setRows((prev) => prev.filter((x) => x._id !== row._id));
      setTotalDocs((prev) => prev - 1);
    } catch (err) {
      alert(err.message);
    }
  };

  const onFotoGuardada = (id) => {
    setRows((prev) =>
      prev.map((r) =>
        r._id === id ? { ...r, fotoFactura: { url: "actualizada" } } : r
      )
    );
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
              <input className="form-control" name="numero" value={f.numero} onChange={onF} />
            </div>
            <div className="col-md-3">
              <label className="form-label">Proveedor</label>
              <input className="form-control" name="proveedor" value={f.proveedor} onChange={onF} />
            </div>
            <div className="col-md-3">
              <label className="form-label">Estado</label>,
              <select className="form-select" name="estado" value={f.estado} onChange={onF}>
                <option value="todos">Todos</option>
                <option value="borrador">Borradores</option>
                <option value="finalizada">Finalizadas</option>
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Search</label>
              <input className="form-control" name="q" value={f.q} onChange={onF}
                placeholder="texto libre (folio, motivo, etc.)" />
            </div>
            <div className="col-md-1">
              <label className="form-label">Mostrar</label>
              <select className="form-select" value={limit}
                onChange={(e) => { const l = parseInt(e.target.value) || 10; setLimit(l); fetchData(1, l); }}>
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
                <th style={{ minWidth: 180 }}>Número de Factura</th>
                <th>Proveedor</th>
                <th style={{ minWidth: 140 }}>Fecha</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr><td colSpan={5} className="text-center py-4 text-muted">No hay resultados</td></tr>
              )}

              {rows.map((r) => {
                const sinFoto = !r.fotoFactura;
                return (
                  <tr key={r._id} style={sinFoto ? { backgroundColor: "#fff3e0" } : {}}>
                    <td>
                      {sinFoto ? (
                        <span
                          title="Pendiente de fotografía"
                          onClick={() => setEntradaFoto(r)}
                          style={{
                            cursor: "pointer",
                            color: "#e65100",
                            fontWeight: 600,
                            borderBottom: "2px dashed #e65100",
                          }}
                        >
                          {r.factura} 
                        </span>
                      ) : (
                        <span>{r.factura}</span>
                      )}
                    </td>
                    <td className="text-truncate" style={{ maxWidth: 380 }}>
                      {r.proveedor || "—"}
                    </td>
                    <td>{r.fecha ? fmt.format(new Date(r.fecha)) : "—"}</td>
                    <td>
                      {r.estado === "finalizada" ? "🟢 Finalizada" : "🟡 Borrador"}
                    </td>
                    <td>
                      <div className="d-flex flex-wrap gap-1">
                        {r.estado === "borrador" && (
                          <button className="btn btn-warning btn-sm" onClick={() => continuar(r)}>
                            Continuar
                          </button>
                        )}
                        <button className="btn btn-outline-info btn-sm" onClick={() => verDetalle(r)}>
                          Ver info
                        </button>
                        {r.estado === "borrador" && (
                          <button className="btn btn-outline-danger btn-sm" onClick={() => eliminarBorrador(r)}>
                            Eliminar
                          </button>
                        )}
                        {r.estado === "finalizada" && (
                          <span className="text-success fw-semibold align-self-center small">Completada</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {loading && (
                <tr><td colSpan={5} className="text-center py-4">Cargando…</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <div className="d-flex justify-content-between align-items-center p-2">
          <small className="text-muted">Showing {rows?.length || 0} of {totalDocs} entries</small>
          <div className="btn-group">
            <button className="btn btn-outline-secondary" disabled={page <= 1 || loading}
              onClick={() => fetchData(page - 1, limit)}>Previous</button>
            <span className="btn btn-outline-secondary disabled">{page}</span>
            <button className="btn btn-outline-secondary" disabled={page >= totalPages || loading}
              onClick={() => fetchData(page + 1, limit)}>Next</button>
          </div>
        </div>
      </div>

      {/* Modal subir foto */}
      {entradaFoto && (
        <ModalSubirFoto
          entrada={entradaFoto}
          onClose={() => setEntradaFoto(null)}
          onFotoGuardada={onFotoGuardada}
        />
      )}

      {/* Modal ver detalle */}
      {entradaDetalle && (
        <ModalVerDetalle
          entrada={entradaDetalle}
          onClose={() => setEntradaDetalle(null)}
        />
      )}
    </div>
  );
}