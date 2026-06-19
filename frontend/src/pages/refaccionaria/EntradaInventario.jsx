// frontend/src/pages/refaccionaria/EntradaInventario.jsx
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import TablaCapturaEntrada from "./components/TablaCapturaEntrada";
import ModalAltaProveedor from "./components/ModalAltaProveedor";
import ModalAltaCodigo from "./components/ModalAltaCodigo";

const API = process.env.REACT_APP_API_URL || "http://localhost:4000/api";

const fmtFecha = (iso) => {
  if (!iso) return "—";
  try { return new Intl.DateTimeFormat("es-MX").format(new Date(iso)); }
  catch { return iso; }
};

// ─── Modal buscar orden de servicio ──────────────────────────────────────────
function ModalBuscarOrden({ onSelect, onClose }) {
  const [busqueda, setBusqueda] = useState("");
  const [ordenes,  setOrdenes]  = useState([]);
  const [loading,  setLoading]  = useState(false);

  const buscar = async (q = busqueda) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: 20 });
      if (q.trim()) params.set("searchOs", q.trim());
      const r = await fetch(`${API}/vehiculos/ordenes?${params}`, { credentials: "include" });
      const json = await r.json().catch(() => ({}));
      setOrdenes(json?.data || []);
    } catch {
      setOrdenes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { buscar(""); }, []); // eslint-disable-line

  useEffect(() => {
    const t = setTimeout(() => buscar(busqueda), 350);
    return () => clearTimeout(t);
  }, [busqueda]); // eslint-disable-line

  const seleccionar = (orden) => {
    const cliente = [
      orden.cliente?.nombre,
      orden.cliente?.apellidoPaterno,
      orden.cliente?.apellidoMaterno,
    ].filter(Boolean).join(" ");

    onSelect({
      ordenId:       orden._id,
      numeroOrden:   orden.ordenServicio || "",
      clienteOrden:  cliente || orden.cliente?.empresa || "—",
      vehiculoOrden: orden.marca || "",
      modeloOrden:   [orden.modelo, orden.anio].filter(Boolean).join(" "),
      refaccionarioOrden: orden.devueltoPor || "",
      fechaOrden:    orden.fechaRecepcion || null,
    });
    onClose();
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1040 }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        zIndex: 1050, width: "96%", maxWidth: 780, maxHeight: "85vh",
        background: "white", borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div className="d-flex justify-content-between align-items-center p-3 border-bottom">
          <h5 className="mb-0">Buscar Orden de Servicio</h5>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        <div className="p-3 border-bottom">
          <input
            className="form-control"
            placeholder="Buscar por número de orden (OS-...)..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            autoFocus
          />
        </div>

        <div style={{ overflowY: "auto", padding: 16, minHeight: 120 }}>
          {!loading && ordenes.length === 0 && (
            <p className="text-center text-muted py-3">No se encontraron órdenes.</p>
          )}
          <div className="row g-3" style={{ opacity: loading ? 0.5 : 1, transition: "opacity 0.15s" }}>
            {ordenes.map((o) => {
              const cliente = [o.cliente?.nombre, o.cliente?.apellidoPaterno, o.cliente?.apellidoMaterno]
                .filter(Boolean).join(" ") || o.cliente?.empresa || "—";
              return (
                <div key={o._id} className="col-12 col-md-6">
                  <div
                    className="card h-100 border"
                    onClick={() => seleccionar(o)}
                    style={{ cursor: "pointer", transition: "box-shadow 0.15s" }}
                    onMouseEnter={(e) => e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.15)"}
                    onMouseLeave={(e) => e.currentTarget.style.boxShadow = ""}
                  >
                    <div className="card-body p-3">
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <span className="fw-bold text-primary font-monospace">{o.ordenServicio || "—"}</span>
                        <span className="badge bg-secondary small">{o.estadoOrden?.replace(/_/g, " ") || ""}</span>
                      </div>
                      <div className="small">
                        <div><span className="text-muted">Cliente:</span> <strong>{cliente}</strong></div>
                        <div><span className="text-muted">Vehículo:</span> <strong>{[o.marca, o.modelo, o.anio].filter(Boolean).join(" ") || "—"}</strong></div>
                        <div><span className="text-muted">Fecha:</span> <strong>{fmtFecha(o.fechaRecepcion)}</strong></div>
                        {o.devueltoPor && (
                          <div><span className="text-muted">Refaccionario:</span> <strong>{o.devueltoPor}</strong></div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-3 border-top d-flex justify-content-end">
          <button className="btn btn-outline-secondary" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </>
  );
}

export default function EntradaInventario() {
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(false);
  const [proveedores, setProveedores] = useState([]);
  const [codigos, setCodigos] = useState([]);
  const [showModalCodigo, setShowModalCodigo] = useState(false);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [fotoTipo, setFotoTipo] = useState(null);
  const [zoomAbierto, setZoomAbierto] = useState(false);
  const [entradaId, setEntradaId] = useState(null);
  const [entradaInfo, setEntradaInfo] = useState(null);
  const tablaRef = useRef(null);
  const [showModalProveedor, setShowModalProveedor] = useState(false);

  const [showModalOrden, setShowModalOrden] = useState(false);

  const [form, setForm] = useState({
    comprobante: "Factura",
    numero: "",
    moneda: "MXN",
    formaPago: "Crédito",
    proveedorId: "",
    fecha: new Date().toISOString().split("T")[0],
    foto: null,
    usadaEnOrden: false,
    sucursal: "",
    ordenId: "",
    numeroOrden: "",
    clienteOrden: "",
    vehiculoOrden: "",
    modeloOrden: "",
    refaccionarioOrden: "",
    fechaOrden: "",
  });

  // ─── Carga proveedores y códigos ───────────────────────────────────────────
  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        const r = await fetch(`${API}/proveedores?limit=200&soloActivos=true`, {
          credentials: "include",
        });
        const json = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(json?.message || "Error al listar proveedores");
        if (!abort) setProveedores(json?.data || []);
      } catch (err) {
        console.error(err);
        if (!abort) setProveedores([]);
      }
    })();

    fetch(`${API}/codigos`, { credentials: "include" })
      .then((r) => r.json())
      .then((j) => setCodigos(j?.data || j || []))
      .catch(() => setCodigos([]));

    return () => { abort = true; };
  }, []);

  // ─── Si viene ?id= en la URL, carga la entrada borrador directamente ───────
  useEffect(() => {
    const idParam = searchParams.get("id");
    if (!idParam) return;

    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`${API}/entradas/${idParam}`, {
          credentials: "include",
        });
        const json = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(json?.message || "No se pudo cargar la entrada");

        const entrada = json?.data || json;

        setEntradaId(entrada._id);
        setEntradaInfo({
          id: entrada._id,
          proveedorNombre:
            entrada.proveedorId?.nombreProveedor ||
            entrada.proveedorId?.nombre ||
            "",
          numero: entrada.numero,
          fecha: entrada.fechaFactura?.split("T")[0] || "",
          moneda: entrada.moneda,
          comprobante: entrada.tipoComprobante,
        });

        setTimeout(
          () => tablaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
          100
        );
      } catch (err) {
        console.error(err);
        alert("No se pudo cargar la entrada: " + err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [searchParams]); // eslint-disable-line

  // ─── Handlers del formulario ───────────────────────────────────────────────
  const onChange = (e) => {
    const { name, value, files, type, checked } = e.target;

    if (name === "proveedorId" && value === "__nuevo__") {
      setShowModalProveedor(true);
      return;
    }

    if (type === "checkbox") {
      setForm((f) => ({
        ...f,
        [name]: checked,
        // limpiar campos de orden si se desmarca
        ...(name === "usadaEnOrden" && !checked ? {
          sucursal: "", ordenId: "", numeroOrden: "",
          clienteOrden: "", vehiculoOrden: "", modeloOrden: "",
          refaccionarioOrden: "", fechaOrden: "",
        } : {}),
      }));
      return;
    }

    if (files) {
      const archivo = files[0] || null;
      setForm((f) => ({ ...f, [name]: archivo }));
      if (archivo) {
        setFotoTipo(archivo.type);
        setFotoPreview(URL.createObjectURL(archivo));
      } else {
        setFotoPreview(null);
        setFotoTipo(null);
      }
    } else {
      setForm((f) => ({ ...f, [name]: value }));
    }
  };

  const handleOrdenSeleccionada = (datos) => {
    setForm((f) => ({ ...f, ...datos }));
  };

  const handleProveedorCreado = (nuevoProveedor) => {
    setProveedores((prev) => [...prev, nuevoProveedor]);
    setForm((f) => ({ ...f, proveedorId: nuevoProveedor._id }));
    setShowModalProveedor(false);
  };

  const handleCodigoCreado = (nuevoCodigo) => {
    setCodigos((prev) => [...prev, nuevoCodigo]);
    setForm((f) => ({ ...f, codigoId: nuevoCodigo._id, codigoLabel: nuevoCodigo.numeroParte }));
    setShowModalCodigo(false);
  };

  const onSubmit = async (e) => {
    e.preventDefault();

    if (!form.proveedorId) return alert("Selecciona un proveedor.");
    if (!form.fecha) return alert("Selecciona la fecha de la factura.");
    if (!form.numero.trim()) return alert("Ingresa el número de factura o remisión.");

    const formData = new FormData();
    formData.append("tipoComprobante", form.comprobante);
    formData.append("numero", form.numero.trim());
    formData.append("moneda", form.moneda);
    formData.append("formaPago", form.formaPago);
    formData.append("proveedorId", form.proveedorId);
    formData.append("fechaFactura", form.fecha + "T12:00:00.000Z");
    if (form.foto) formData.append("fotoFactura", form.foto);

    if (form.usadaEnOrden) {
      formData.append("usadaEnOrden", "true");
      formData.append("sucursal",           form.sucursal || "");
      formData.append("ordenId",            form.ordenId  || "");
      formData.append("numeroOrden",        form.numeroOrden || "");
      formData.append("clienteOrden",       form.clienteOrden || "");
      formData.append("vehiculoOrden",      form.vehiculoOrden || "");
      formData.append("modeloOrden",        form.modeloOrden || "");
      formData.append("refaccionarioOrden", form.refaccionarioOrden || "");
      if (form.fechaOrden) formData.append("fechaOrden", form.fechaOrden);
    } else {
      formData.append("usadaEnOrden", "false");
    }

    try {
      setLoading(true);
      const r = await fetch(`${API}/entradas`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json?.message || "Error al crear la entrada");

      const id = json?.entradaId || json?._id || json?.data?._id;
      if (!id) throw new Error("No se recibió folio/ID de la entrada.");

      setEntradaId(id);
      const prov = proveedores.find((p) => p._id === form.proveedorId);
      setEntradaInfo({
        id,
        proveedorNombre: prov?.nombreProveedor || prov?.nombre || "",
        numero: form.numero,
        fecha: form.fecha,
        moneda: form.moneda,
        comprobante: form.comprobante,
      });

      setTimeout(
        () => tablaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        50
      );
    } catch (err) {
      console.error(err);
      alert(err.message || "Error al guardar la entrada.");
    } finally {
      setLoading(false);
    }
  };

  // Si viene de "Continuar captura", ocultamos el formulario de nueva entrada
  const modoConsulta = !!searchParams.get("id");

  return (
    <div className="container-fluid py-3">
      <div className="row justify-content-center">
        <div className="col-12 col-xxl-10">

          {/* ── Formulario nueva entrada: se oculta si venimos de "Continuar" ── */}
          {!modoConsulta && (
            <div className="card shadow-sm border-0">
              <div className="card-header bg-white border-0">
                <h2 className="h4 text-center mb-0">ALTA DE MATERIAL EN INVENTARIO VARIABLE</h2>
              </div>

              <div className="card-body">
                <form onSubmit={onSubmit} encType="multipart/form-data">
                  {/* Fila 1 */}
                  <div className="row g-3 align-items-end">
                    <div className="col-12 col-md-6">
                      <label className="form-label">Tipo de Comprobante</label>
                      <select className="form-select" name="comprobante" value={form.comprobante} onChange={onChange}>
                        <option>Factura</option>
                        <option>Remisión</option>
                        <option>Nota</option>
                        <option>Ticket</option>
                      </select>
                    </div>
                    <div className="col-12 col-md-6">
                      <label className="form-label">Número de Factura y/o Remisión</label>
                      <input
                        type="text" className="form-control" name="numero"
                        value={form.numero} onChange={onChange} placeholder="Folio del documento"
                      />
                    </div>
                  </div>

                  {/* Fila 2 */}
                  <div className="row g-3 align-items-end mt-1">
                    <div className="col-12 col-md-6">
                      <label className="form-label">Moneda</label>
                      <select className="form-select" name="moneda" value={form.moneda} onChange={onChange}>
                        <option value="MXN">MXN - Peso mexicano</option>
                        <option value="USD">USD - Dólar estadounidense</option>
                      </select>
                    </div>
                    <div className="col-12 col-md-6">
                      <label className="form-label">Forma de Pago</label>
                      <select className="form-select" name="formaPago" value={form.formaPago} onChange={onChange}>
                        <option>Crédito</option>
                        <option>Contado</option>
                        <option>Transferencia</option>
                        <option>Efectivo</option>
                        <option>Tarjeta</option>
                      </select>
                    </div>
                  </div>

                  {/* Fila 3 */}
                  <div className="row g-3 align-items-end mt-1">
                    <div className="col-12 col-md-6">
                      <label className="form-label">Proveedor</label>
                      <select className="form-select" name="proveedorId" value={form.proveedorId} onChange={onChange}>
                        <option value="">— Selecciona —</option>
                        {proveedores.map((p) => (
                          <option key={p._id} value={p._id}>
                            {p.nombreProveedor || p.nombre || p.aliasProveedor || p.rfc}
                          </option>
                        ))}
                        <option value="__nuevo__">➕ Dar de alta nuevo proveedor...</option>
                      </select>
                    </div>
                    <div className="col-12 col-md-6">
                      <label className="form-label">Fecha Factura</label>
                      <input type="date" className="form-control" name="fecha" value={form.fecha} onChange={onChange} />
                    </div>
                  </div>

                  {/* Fila 4 */}
                  <div className="row g-3 align-items-end mt-1">
                    <div className="col-12 col-md-6">
                      <label className="form-label">Foto Factura</label>
                      <input
                        type="file" className="form-control" name="foto"
                        accept="image/*,application/pdf" onChange={onChange}
                      />
                      <div className="form-text">Acepta imagen o PDF (≤ 5MB).</div>
                    </div>

                    {/* Checkbox orden de servicio */}
                    <div className="col-12 col-md-6 d-flex align-items-center" style={{ paddingTop: 28 }}>
                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id="usadaEnOrden"
                          name="usadaEnOrden"
                          checked={form.usadaEnOrden}
                          onChange={onChange}
                        />
                        <label className="form-check-label fw-semibold" htmlFor="usadaEnOrden">
                          ¿Esta factura fue usada en alguna orden de servicio?
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Sección orden vinculada */}
                  {form.usadaEnOrden && (
                    <div className="border rounded p-3 mt-3" style={{ background: "#f8f9fa" }}>
                      <h6 className="text-uppercase text-muted mb-3" style={{ fontSize: "0.78rem", letterSpacing: 1 }}>
                        Datos de la Orden de Servicio Vinculada
                      </h6>

                      {/* Sucursal + Número de Orden */}
                      <div className="row g-3 mb-3">
                        <div className="col-12 col-md-4">
                          <label className="form-label">Sucursal</label>
                          <input
                            className="form-control"
                            name="sucursal"
                            value={form.sucursal}
                            onChange={onChange}
                            placeholder="Nombre de la sucursal"
                          />
                        </div>
                        <div className="col-12 col-md-4">
                          <label className="form-label">Número de Orden</label>
                          <div className="input-group">
                            <input
                              className="form-control"
                              name="numeroOrden"
                              value={form.numeroOrden || ""}
                              onChange={onChange}
                              placeholder="OS-00001 o captura manual"
                            />
                            <button
                              type="button"
                              className="btn btn-outline-primary"
                              onClick={() => setShowModalOrden(true)}
                            >
                              Buscar
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Campos auto-rellenados o captura manual */}
                      <div className="row g-3">
                        <div className="col-12 col-md-4">
                          <label className="form-label text-muted small">Cliente</label>
                          <input className="form-control form-control-sm" name="clienteOrden" value={form.clienteOrden || ""} onChange={onChange} placeholder="Nombre del cliente" />
                        </div>
                        <div className="col-12 col-md-4">
                          <label className="form-label text-muted small">Vehículo</label>
                          <input className="form-control form-control-sm" name="vehiculoOrden" value={form.vehiculoOrden || ""} onChange={onChange} placeholder="Marca del vehículo" />
                        </div>
                        <div className="col-12 col-md-4">
                          <label className="form-label text-muted small">Modelo</label>
                          <input className="form-control form-control-sm" name="modeloOrden" value={form.modeloOrden || ""} onChange={onChange} placeholder="Modelo y año" />
                        </div>
                        <div className="col-12 col-md-4">
                          <label className="form-label text-muted small">Refaccionario</label>
                          <input className="form-control form-control-sm" name="refaccionarioOrden" value={form.refaccionarioOrden || ""} onChange={onChange} placeholder="Nombre del refaccionario" />
                        </div>
                        <div className="col-12 col-md-4">
                          <label className="form-label text-muted small">Fecha Orden</label>
                          <input type="date" className="form-control form-control-sm" name="fechaOrden" value={form.fechaOrden ? String(form.fechaOrden).split("T")[0] : ""} onChange={onChange} />
                        </div>
                      </div>

                      {!form.numeroOrden && (
                        <p className="text-muted small mt-2 mb-0">
                          Usa "Buscar" para auto-rellenar desde el sistema, o captura los datos manualmente si la orden no está en el sistema.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Vista previa foto */}
                  {fotoPreview && (
                    <div className="mt-2 border rounded p-2" style={{ maxWidth: 400 }}>
                      {fotoTipo === "application/pdf" ? (
                        <iframe src={fotoPreview} title="Vista previa PDF" width="100%" height="300px" style={{ border: "none" }} />
                      ) : (
                        <>
                          <img
                            src={fotoPreview} alt="Vista previa"
                            onClick={() => setZoomAbierto(true)}
                            style={{ width: "100%", maxHeight: 300, objectFit: "contain", cursor: "zoom-in" }}
                          />
                          <div className="text-center">
                            <small className="text-muted">🔍 Clic para ampliar</small>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Modal zoom */}
                  {zoomAbierto && (
                    <div
                      onClick={() => setZoomAbierto(false)}
                      style={{
                        position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.85)",
                        zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out",
                      }}
                    >
                      <img src={fotoPreview} alt="Zoom"
                        style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 8, boxShadow: "0 0 40px rgba(0,0,0,0.6)" }}
                      />
                      <button
                        onClick={() => setZoomAbierto(false)}
                        style={{ position: "absolute", top: 16, right: 16, background: "white", border: "none", borderRadius: "50%", width: 36, height: 36, fontSize: 18, cursor: "pointer", lineHeight: 1 }}
                      >×</button>
                    </div>
                  )}

                  <div className="d-flex justify-content-center mt-4">
                    <button type="submit" className="btn btn-primary px-4" disabled={loading}>
                      {loading ? "Guardando..." : "Comenzar Captura"}
                    </button>
                  </div>
                </form>
              </div>

              <div className="card-footer bg-white border-0 text-center small text-muted">
                Completa los datos del documento de compra para iniciar la captura de partidas.
              </div>
            </div>
          )}

          {/* ── Spinner mientras carga la entrada borrador ── */}
          {modoConsulta && loading && (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status" />
              <p className="mt-2 text-muted">Cargando entrada...</p>
            </div>
          )}

          {/* ── Tabla de captura ── */}
          {entradaId && (
            <div ref={tablaRef} className="card shadow-sm border-0 mt-3">
              <div className="card-header bg-white border-0">
                <h3 className="h5 mb-0">
                  {modoConsulta ? "Continuar captura — Entrada " : "Captura de partidas — Entrada "}
                  <span className="font-monospace">#{entradaId}</span>
                </h3>
                {entradaInfo?.proveedorNombre && (
                  <div className="small text-muted">
                    Proveedor: <strong>{entradaInfo.proveedorNombre}</strong> · Doc:{" "}
                    <strong>{entradaInfo.numero}</strong> · Fecha:{" "}
                    <strong>{entradaInfo.fecha}</strong> · Moneda:{" "}
                    <strong>{entradaInfo.moneda}</strong>
                  </div>
                )}
              </div>
              <div className="card-body">
                <TablaCapturaEntrada entradaId={entradaId} info={entradaInfo} modoConsulta={modoConsulta} />
              </div>
            </div>
          )}

        </div>
      </div>

      {showModalProveedor && (
        <ModalAltaProveedor
          onProveedorCreado={handleProveedorCreado}
          onClose={() => setShowModalProveedor(false)}
        />
      )}

      {showModalOrden && (
        <ModalBuscarOrden
          onSelect={handleOrdenSeleccionada}
          onClose={() => setShowModalOrden(false)}
        />
      )}
    </div>
  );
}