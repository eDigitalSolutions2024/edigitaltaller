import { useEffect, useState } from "react";
import { getUnidadesMedida } from "../../../api/configuracion";

const API = process.env.REACT_APP_API_URL || "http://localhost:4000/api";

export default function ModalSeleccionarCodigo({ onSelect, onClose, prefill = {}, modoEntrada = false }) {
  const [codigos, setCodigos]   = useState([]);
  const [stockMap, setStockMap] = useState({});
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [proveedores, setProveedores] = useState([]);
  const [unidades, setUnidades]       = useState([]);
  const [vista, setVista]       = useState("buscar");

  const [codigoManual, setCodigoManual]             = useState("");
  const [mostrarFormGuardar, setMostrarFormGuardar] = useState(false);
  const [guardando, setGuardando]                   = useState(false);
  const [formNuevo, setFormNuevo] = useState({
    descripcion: "",
    proveedor: prefill.proveedor || "",
    marca: prefill.marca || "",
    unidad: prefill.unidad || "",
    precioUnitario: prefill.precioUnitario || "",
  });

  useEffect(() => {
    fetch(`${API}/entradas/migrate-codigos-proveedor`, { method: "POST", credentials: "include" })
      .catch(() => {})
      .finally(() => {
        Promise.all([
          fetch(`${API}/codigos`, { credentials: "include" }).then((r) => r.json()).catch(() => []),
          fetch(`${API}/inventario`, { credentials: "include" }).then((r) => r.json()).catch(() => []),
          fetch(`${API}/proveedores?limit=200&soloActivos=true`, { credentials: "include" }).then((r) => r.json()).catch(() => ({})),
          getUnidadesMedida().catch(() => []),
        ]).then(([jCod, jInv, jProv, uArr]) => {
          setCodigos(jCod?.data || jCod || []);
          const inv = jInv?.data || jInv || [];
          const map = {};
          inv.forEach((x) => { if (x._id) map[String(x._id)] = Number(x.cantidad ?? 0); });
          setStockMap(map);
          setProveedores(jProv?.data || []);
          setUnidades((Array.isArray(uArr) ? uArr : []).filter((u) => u.activo !== false));
        }).finally(() => setCargando(false));
      });
  }, []);

  const filtrados = codigos.filter((c) => {
    const q = busqueda.toLowerCase();
    return (
      (c.numeroParte || c.codigo || "").toLowerCase().includes(q) ||
      (c.descripcion || "").toLowerCase().includes(q) ||
      (c.proveedor    || "").toLowerCase().includes(q)
    );
  });

  const codigoExistente = codigoManual.trim()
    ? codigos.find(
        (c) => (c.numeroParte || c.codigo || "").toLowerCase() === codigoManual.trim().toLowerCase()
      )
    : null;

  const handleContinuarSinGuardar = () => {
    const np = codigoManual.trim();
    if (!np) return;
    onSelect({ numeroParte: np, codigo: np, descripcion: "", proveedor: "" });
  };

  const handleGuardarEnBD = async () => {
    const np = codigoManual.trim();
    if (!np) { alert("El código no puede estar vacío."); return; }
    if (!formNuevo.descripcion.trim()) { alert("La descripción es obligatoria."); return; }
    try {
      setGuardando(true);
      const payload = {
        tipo: "refaccion",
        codigo: np,
        numeroParte: np,
        descripcion: formNuevo.descripcion.trim(),
        proveedor:   formNuevo.proveedor.trim(),
        marca:       formNuevo.marca.trim(),
        unidad:      formNuevo.unidad.trim(),
        precioUnitario: formNuevo.precioUnitario !== "" ? Number(formNuevo.precioUnitario) : undefined,
      };
      const r = await fetch(`${API}/codigos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.message || "No se pudo guardar el código.");
      onSelect(j.data || { ...payload, _id: j._id || j.id });
    } catch (e) {
      alert(e.message || "Error al guardar.");
    } finally {
      setGuardando(false);
    }
  };

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
          zIndex: 1050, width: "90%", maxWidth: 720, maxHeight: "85vh",
          background: "white", borderRadius: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        <div className="d-flex justify-content-between align-items-center p-3 border-bottom">
          <div className="d-flex gap-2">
            <button
              className={`btn btn-sm ${vista === "buscar" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => { setVista("buscar"); setMostrarFormGuardar(false); }}
            >
              Buscar en BD Códigos
            </button>
            <button
              className={`btn btn-sm ${vista === "manual" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setVista("manual")}
            >
              {modoEntrada ? "Nuevo código" : "Código manual"}
            </button>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", lineHeight: 1 }}
          >×</button>
        </div>

        {vista === "buscar" && (
          <>
            <div className="p-3 border-bottom">
              <input
                autoFocus
                className="form-control"
                placeholder="Buscar por número de parte, descripción o proveedor..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {cargando ? (
                <div className="text-center py-4 text-muted">Cargando códigos...</div>
              ) : filtrados.length === 0 ? (
                <div className="text-center py-4 text-muted">Sin resultados</div>
              ) : (
                <table className="table table-hover table-sm mb-0">
                  <thead className="table-light" style={{ position: "sticky", top: 0 }}>
                    <tr>
                      <th>Número de Parte</th>
                      <th>Descripción</th>
                      <th>Proveedor</th>
                      <th style={{ width: 110 }}>Inventario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((c) => {
                      const stock = stockMap[String(c._id)];
                      const tieneStock = stock !== undefined && stock > 0;
                      return (
                        <tr key={c._id} style={{ cursor: "pointer" }} onClick={() => onSelect(c)}>
                          <td>{c.numeroParte || c.codigo || "—"}</td>
                          <td>{c.descripcion || "—"}</td>
                          <td>{c.proveedor   || "—"}</td>
                          <td className="text-center">
                            {stock === undefined ? (
                              <span className="badge bg-light text-muted border">Sin registro</span>
                            ) : tieneStock ? (
                              <span className="badge bg-success">{stock} en stock</span>
                            ) : (
                              <span className="badge bg-danger">Sin stock</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div className="p-3 border-top d-flex justify-content-end">
              <button className="btn btn-outline-secondary" onClick={onClose}>Cancelar</button>
            </div>
          </>
        )}

        {vista === "manual" && (
          <div className="p-4 d-flex flex-column gap-3" style={{ overflowY: "auto" }}>
            <div>
              <label className="form-label fw-semibold">Código a ingresar</label>
              <input
                autoFocus
                className="form-control"
                placeholder="Ej. AZ-BJ-2345"
                value={codigoManual}
                onChange={(e) => {
                  setCodigoManual(e.target.value);
                  if (!modoEntrada) setMostrarFormGuardar(false);
                }}
              />
            </div>

            {codigoExistente && (
              <div className="alert alert-warning py-2 mb-0">
                <strong>Este código ya existe en BD Códigos:</strong>{" "}
                {codigoExistente.descripcion || "sin descripción"}
                {codigoExistente.proveedor ? ` — ${codigoExistente.proveedor}` : ""}
                <div className="mt-2">
                  <button className="btn btn-sm btn-warning" onClick={() => onSelect(codigoExistente)}>
                    Usar este código
                  </button>
                </div>
              </div>
            )}

            {!codigoExistente && (modoEntrada || codigoManual.trim() || mostrarFormGuardar) && (
              modoEntrada ? (
                /* ── Modo Entrada Inventario: formulario directo, sin opciones ── */
                <div className="border rounded p-3">
                  <div className="row g-2">
                    <div className="col-md-4">
                      <label className="form-label form-label-sm mb-1">Código <span className="text-danger">*</span></label>
                      <input className="form-control form-control-sm" value={codigoManual} readOnly placeholder="Ej. AZ-BJ-2345" />
                    </div>
                    <div className="col-md-8">
                      <label className="form-label form-label-sm mb-1">Descripción <span className="text-danger">*</span></label>
                      <input
                        className="form-control form-control-sm"
                        placeholder="Nombre o descripción de la refacción..."
                        value={formNuevo.descripcion}
                        onChange={(e) => setFormNuevo((f) => ({ ...f, descripcion: e.target.value }))}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label form-label-sm mb-1">Proveedor</label>
                      <select
                        className="form-select form-select-sm"
                        value={formNuevo.proveedor}
                        disabled
                      >
                        <option value="">— Seleccionar —</option>
                        {proveedores.map((p) => (
                          <option key={p._id} value={p.nombreProveedor || p.aliasProveedor || p._id}>
                            {p.nombreProveedor || p.aliasProveedor}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label form-label-sm mb-1">Marca <span className="text-muted small">(opcional)</span></label>
                      <input
                        className="form-control form-control-sm"
                        placeholder="Ej. Bosch, Gates..."
                        value={formNuevo.marca}
                        onChange={(e) => setFormNuevo((f) => ({ ...f, marca: e.target.value }))}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label form-label-sm mb-1">Unidad <span className="text-muted small">(opcional)</span></label>
                      <select
                        className="form-select form-select-sm"
                        value={formNuevo.unidad}
                        onChange={(e) => setFormNuevo((f) => ({ ...f, unidad: e.target.value }))}
                      >
                        <option value="">— Seleccionar —</option>
                        {unidades.map((u) => (
                          <option key={u._id} value={u.nombre || u.clave}>{u.nombre || u.clave}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label form-label-sm mb-1">Precio unitario <span className="text-muted small">(opcional)</span></label>
                      <input
                        type="number" step="0.01"
                        className="form-control form-control-sm"
                        placeholder="$0.00"
                        value={formNuevo.precioUnitario}
                        onChange={(e) => setFormNuevo((f) => ({ ...f, precioUnitario: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="d-flex justify-content-end mt-3">
                    <button
                      className="btn btn-primary btn-sm px-4"
                      onClick={handleGuardarEnBD}
                      disabled={guardando}
                    >
                      {guardando ? "Guardando..." : "Guardar y usar código"}
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Modo estándar: Opción 1 + Opción 2 ── */
                <div className="d-flex flex-column gap-2">
                  <p className="text-muted small mb-1">
                    Este código no está en BD Códigos. Elige cómo continuar:
                  </p>

                  <div className="border rounded p-3">
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <strong>Opción 1:</strong> Guardar en BD Códigos
                        <p className="text-muted small mb-0">Queda registrado para futuras cotizaciones.</p>
                      </div>
                      <button
                        className="btn btn-outline-primary btn-sm"
                        onClick={() => setMostrarFormGuardar((v) => !v)}
                      >
                        {mostrarFormGuardar ? "Ocultar" : "Llenar datos"}
                      </button>
                    </div>

                    {mostrarFormGuardar && (
                      <div className="mt-3 border-top pt-3">
                        <div className="row g-2">
                          <div className="col-md-4">
                            <label className="form-label form-label-sm mb-1">Código <span className="text-danger">*</span></label>
                            <input
                              className="form-control form-control-sm"
                              value={codigoManual}
                              onChange={(e) => setCodigoManual(e.target.value)}
                            />
                          </div>
                          <div className="col-md-8">
                            <label className="form-label form-label-sm mb-1">Descripción <span className="text-danger">*</span></label>
                            <input
                              className="form-control form-control-sm"
                              placeholder="Nombre o descripción de la refacción..."
                              value={formNuevo.descripcion}
                              onChange={(e) => setFormNuevo((f) => ({ ...f, descripcion: e.target.value }))}
                            />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label form-label-sm mb-1">Proveedor</label>
                            <select
                              className="form-select form-select-sm"
                              value={formNuevo.proveedor}
                              onChange={(e) => setFormNuevo((f) => ({ ...f, proveedor: e.target.value }))}
                            >
                              <option value="">— Seleccionar —</option>
                              {proveedores.map((p) => (
                                <option key={p._id} value={p.nombreProveedor || p.aliasProveedor || p._id}>
                                  {p.nombreProveedor || p.aliasProveedor}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="col-md-6">
                            <label className="form-label form-label-sm mb-1">Marca <span className="text-muted small">(opcional)</span></label>
                            <input
                              className="form-control form-control-sm"
                              placeholder="Ej. Bosch, Gates..."
                              value={formNuevo.marca}
                              onChange={(e) => setFormNuevo((f) => ({ ...f, marca: e.target.value }))}
                            />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label form-label-sm mb-1">Unidad <span className="text-muted small">(opcional)</span></label>
                            <select
                              className="form-select form-select-sm"
                              value={formNuevo.unidad}
                              onChange={(e) => setFormNuevo((f) => ({ ...f, unidad: e.target.value }))}
                            >
                              <option value="">— Seleccionar —</option>
                              {unidades.map((u) => (
                                <option key={u._id} value={u.nombre || u.clave}>{u.nombre || u.clave}</option>
                              ))}
                            </select>
                          </div>
                          <div className="col-md-6">
                            <label className="form-label form-label-sm mb-1">Precio unitario <span className="text-muted small">(opcional)</span></label>
                            <input
                              type="number" step="0.01"
                              className="form-control form-control-sm"
                              placeholder="$0.00"
                              value={formNuevo.precioUnitario}
                              onChange={(e) => setFormNuevo((f) => ({ ...f, precioUnitario: e.target.value }))}
                            />
                          </div>
                        </div>
                        <div className="d-flex justify-content-end mt-3">
                          <button
                            className="btn btn-primary btn-sm px-4"
                            onClick={handleGuardarEnBD}
                            disabled={guardando}
                          >
                            {guardando ? "Guardando..." : "Guardar y usar código"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border rounded p-3 d-flex justify-content-between align-items-center">
                    <div>
                      <strong>Opción 2:</strong> Solo para esta ocasión
                      <p className="text-muted small mb-0">No se descuenta del inventario. Se surte manualmente.</p>
                    </div>
                    <button className="btn btn-outline-secondary btn-sm" onClick={handleContinuarSinGuardar}>
                      Continuar sin guardar
                    </button>
                  </div>
                </div>
              )
            )}

            <div className="d-flex justify-content-start mt-1">
              <button className="btn btn-outline-secondary btn-sm" onClick={onClose}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
