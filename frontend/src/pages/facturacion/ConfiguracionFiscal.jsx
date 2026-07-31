import React, { useEffect, useState } from "react";
import api from "../../api/http";
import { REGIMEN_FISCAL_OPTIONS } from "../../utils/regimenFiscal";
import {
  listConceptosPreset,
  createConceptoPreset,
  updateConceptoPreset,
  deleteConceptoPreset,
} from "../../api/conceptosPreset";

export default function ConfiguracionFiscal() {
  const [form, setForm] = useState({
    rfc: "",
    nombre: "",
    regimenFiscal: "",
    lugarExpedicion: "",
    serie: "",
    folioInterno: "",
  });

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const [certStatus, setCertStatus] = useState({
    cargado: false,
    noCertificado: "",
    nombreArchivo: "",
  });

  const [keyStatus, setKeyStatus] = useState({
    cargado: false,
    nombreArchivo: "",
  });

  // 👇 para mostrar el nombre aunque se limpie el input
  const [cerSelectedName, setCerSelectedName] = useState("");
  const [keySelectedName, setKeySelectedName] = useState("");

  const [keyPass, setKeyPass] = useState("");
  const [showPass, setShowPass] = useState(false);

  /* ==========
     CATÁLOGO DE CONCEPTOS
  ========== */
  const PRESET_VACIO = {
    cProdServ: "",
    cProdServDescripcion: "",
    cUnidad: "",
    unidad: "",
    descripcion: "",
    valorUnitario: "",
  };

  const [presets, setPresets] = useState([]);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [mostrarAltaPreset, setMostrarAltaPreset] = useState(false);
  const [nuevoPreset, setNuevoPreset] = useState(PRESET_VACIO);
  const [editPresetId, setEditPresetId] = useState(null);
  const [editPresetDraft, setEditPresetDraft] = useState(null);

  async function loadPresets() {
    setPresetsLoading(true);
    try {
      const res = await listConceptosPreset();
      setPresets(res.data?.data || []);
    } catch (e) {
      setMsg(e?.response?.data?.error || e.message);
    } finally {
      setPresetsLoading(false);
    }
  }

  useEffect(() => {
    loadPresets();
  }, []);

  const presetPayloadValido = (p) =>
    String(p.cProdServ || "").trim() &&
    String(p.cUnidad || "").trim() &&
    String(p.unidad || "").trim() &&
    String(p.descripcion || "").trim();

  async function agregarPreset() {
    if (!presetPayloadValido(nuevoPreset)) {
      return setMsg("❌ Clave SAT, clave unidad, unidad y descripción son obligatorios.");
    }
    setPresetsLoading(true);
    try {
      await createConceptoPreset({
        ...nuevoPreset,
        valorUnitario: Number(nuevoPreset.valorUnitario || 0),
      });
      setNuevoPreset(PRESET_VACIO);
      setMostrarAltaPreset(false);
      await loadPresets();
    } catch (e) {
      setMsg(e?.response?.data?.error || e.message);
    } finally {
      setPresetsLoading(false);
    }
  }

  const startEditPreset = (p) => {
    setEditPresetId(p._id);
    setEditPresetDraft({ ...p });
  };

  const cancelEditPreset = () => {
    setEditPresetId(null);
    setEditPresetDraft(null);
  };

  async function guardarEditPreset() {
    if (!presetPayloadValido(editPresetDraft)) {
      return setMsg("❌ Clave SAT, clave unidad, unidad y descripción son obligatorios.");
    }
    setPresetsLoading(true);
    try {
      await updateConceptoPreset(editPresetId, {
        ...editPresetDraft,
        valorUnitario: Number(editPresetDraft.valorUnitario || 0),
      });
      cancelEditPreset();
      await loadPresets();
    } catch (e) {
      setMsg(e?.response?.data?.error || e.message);
    } finally {
      setPresetsLoading(false);
    }
  }

  async function eliminarPreset(id) {
    if (!window.confirm("¿Eliminar este concepto del catálogo?")) return;
    setPresetsLoading(true);
    try {
      await deleteConceptoPreset(id);
      await loadPresets();
    } catch (e) {
      setMsg(e?.response?.data?.error || e.message);
    } finally {
      setPresetsLoading(false);
    }
  }

  async function load() {
    setLoading(true);
    setMsg("");
    try {
      const res = await api.get("/fiscal-config");
      if (res.data?.ok && res.data.data) {
        const d = res.data.data;

        setForm({
          rfc: d.rfc || "",
          nombre: d.nombre || "",
          regimenFiscal: d.regimenFiscal || "",
          lugarExpedicion: d.lugarExpedicion || "",
          serie: d.serie || "",
          folioInterno: d.folioInterno || "",
        });

        setCertStatus({
          cargado: !!d.certificadoBase64,
          noCertificado: d.noCertificado || "",
          nombreArchivo: d.certificadoNombreArchivo || "",
        });

        setKeyStatus({
          cargado: !!d.keyPemCargado,
          nombreArchivo: d.keyNombreArchivo || "",
        });
      }
    } catch (e) {
      setMsg(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const onChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  async function guardar() {
    setLoading(true);
    setMsg("");
    try {
      const payload = {
        ...form,
        rfc: (form.rfc || "").trim().toUpperCase(),
        nombre: (form.nombre || "").trim().toUpperCase(),
      };

      const res = await api.post("/fiscal-config", payload);
      if (res.data?.ok) {
        setMsg("✅ Configuración fiscal guardada");
        await load();
      } else {
        setMsg(res.data?.error || "Error");
      }
    } catch (e) {
      setMsg(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  async function subirCer(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setCerSelectedName(file.name);

    setLoading(true);
    setMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await api.post("/fiscal-config/cert", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.data?.ok) {
        setMsg("✅ Certificado cargado");
        await load();
      } else {
        setMsg(res.data?.error || "Error subiendo certificado");
      }
    } catch (e2) {
      setMsg(e2?.response?.data?.error || e2.message);
    } finally {
      setLoading(false);
      e.target.value = ""; // limpiamos input (normal)
    }
  }

  async function subirKey(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setKeySelectedName(file.name);

    if (!keyPass || keyPass.trim().length === 0) {
      setMsg("❌ Captura la contraseña del .key antes de subirlo");
      e.target.value = "";
      return;
    }

    setLoading(true);
    setMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("password", keyPass);

      const res = await api.post("/fiscal-config/key", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.data?.ok) {
        setMsg("✅ Llave (.key) cargada y convertida a PEM");
        setKeyPass("");
        await load();
      } else {
        setMsg(res.data?.error || "Error subiendo llave");
      }
    } catch (e2) {
      setMsg(e2?.response?.data?.error || e2.message);
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="container" style={{ maxWidth: 900 }}>
      <h2 className="mb-1">Configuración fiscal</h2>
      <p className="text-muted mb-4">Emisor, series/folios y certificados SAT</p>

      {msg ? <div className="alert alert-info py-2">{msg}</div> : null}

      {/* Datos del emisor */}
      <div className="card mb-4">
        <div className="card-header fw-bold">Datos del emisor</div>
        <div className="card-body row g-3">
          <div className="col-md-6">
            <label className="form-label">RFC</label>
            <input name="rfc" className="form-control" value={form.rfc} onChange={onChange} />
          </div>

          <div className="col-md-6">
            <label className="form-label">Nombre / Razón social</label>
            <input name="nombre" className="form-control" value={form.nombre} onChange={onChange} />
          </div>

          <div className="col-md-6">
            <label className="form-label">Régimen fiscal</label>
            <select name="regimenFiscal" className="form-select" value={form.regimenFiscal} onChange={onChange}>
              <option value="">-- Seleccionar --</option>
              {REGIMEN_FISCAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="col-md-6">
            <label className="form-label">Lugar de expedición (CP)</label>
            <input name="lugarExpedicion" className="form-control" value={form.lugarExpedicion} onChange={onChange} />
          </div>

          <div className="col-md-3">
            <label className="form-label">Serie</label>
            <input name="serie" className="form-control" value={form.serie} onChange={onChange} />
          </div>

          <div className="col-md-3">
            <label className="form-label">Folio interno</label>
            <input name="folioInterno" className="form-control" value={form.folioInterno} onChange={onChange} />
          </div>
        </div>
      </div>

      {/* Certificados */}
      <div className="card mb-4">
        <div className="card-header fw-bold">Certificados SAT</div>
        <div className="card-body row g-4">
          {/* CER */}
          <div className="col-md-6">
            <label className="form-label fw-semibold">Certificado (.cer)</label>
            <input type="file" accept=".cer" onChange={subirCer} className="form-control" disabled={loading} />

            <small className="text-muted d-block mt-1">
              {cerSelectedName ? `Seleccionado: ${cerSelectedName}` : "Aún no seleccionado"}
            </small>

            <small className="text-muted d-block mt-1">
              {certStatus.cargado
                ? `✔ Cargado: ${certStatus.nombreArchivo} (NoCert: ${certStatus.noCertificado || "—"})`
                : "Aún no cargado"}
            </small>
          </div>

          {/* KEY */}
          <div className="col-md-6">
            <label className="form-label fw-semibold">Llave privada (.key)</label>

            <div className="input-group mb-2">
              <input
                type={showPass ? "text" : "password"}
                className="form-control"
                placeholder="Contraseña del .key"
                value={keyPass}
                onChange={(e) => setKeyPass(e.target.value)}
                disabled={loading}
              />
              <button
                className="btn btn-outline-secondary"
                type="button"
                onClick={() => setShowPass((s) => !s)}
                disabled={loading}
              >
                {showPass ? "Ocultar" : "Ver"}
              </button>
            </div>

            <input type="file" accept=".key" onChange={subirKey} className="form-control" disabled={loading} />

            <small className="text-muted d-block mt-1">
              {keySelectedName ? `Seleccionado: ${keySelectedName}` : "Aún no seleccionado"}
            </small>

            <small className="text-muted d-block mt-1">
              {keyStatus.cargado ? `✔ Cargada: ${keyStatus.nombreArchivo}` : "Aún no cargada"}
            </small>
          </div>
        </div>
      </div>

      {/* Catálogo de conceptos */}
      <div className="card mb-4">
        <div className="card-header d-flex justify-content-between align-items-center">
          <span className="fw-bold">Catálogo de conceptos</span>
          <button
            className="btn btn-sm btn-outline-danger"
            onClick={() => setMostrarAltaPreset((s) => !s)}
          >
            {mostrarAltaPreset ? "Cancelar" : "Agregar concepto"}
          </button>
        </div>
        <div className="card-body">
          <p className="text-muted small mb-3">
            Números de servicio con conceptos ya armados (clave SAT + descripción) para
            seleccionarlos rápido al capturar una factura.
          </p>

          {mostrarAltaPreset && (
            <div className="row g-2 align-items-end mb-3 p-2 border rounded">
              <div className="col-6 col-md-2">
                <label className="form-label small mb-1">Clave SAT</label>
                <input
                  className="form-control form-control-sm"
                  value={nuevoPreset.cProdServ}
                  onChange={(e) => setNuevoPreset((p) => ({ ...p, cProdServ: e.target.value }))}
                />
              </div>
              <div className="col-6 col-md-3">
                <label className="form-label small mb-1">Descripción SAT</label>
                <input
                  className="form-control form-control-sm"
                  value={nuevoPreset.cProdServDescripcion}
                  onChange={(e) =>
                    setNuevoPreset((p) => ({ ...p, cProdServDescripcion: e.target.value }))
                  }
                />
              </div>
              <div className="col-6 col-md-1">
                <label className="form-label small mb-1">Clave unidad</label>
                <input
                  className="form-control form-control-sm"
                  value={nuevoPreset.cUnidad}
                  onChange={(e) => setNuevoPreset((p) => ({ ...p, cUnidad: e.target.value }))}
                />
              </div>
              <div className="col-6 col-md-1">
                <label className="form-label small mb-1">Unidad</label>
                <input
                  className="form-control form-control-sm"
                  value={nuevoPreset.unidad}
                  onChange={(e) => setNuevoPreset((p) => ({ ...p, unidad: e.target.value }))}
                />
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label small mb-1">Descripción del concepto</label>
                <input
                  className="form-control form-control-sm"
                  value={nuevoPreset.descripcion}
                  onChange={(e) => setNuevoPreset((p) => ({ ...p, descripcion: e.target.value }))}
                />
              </div>
              <div className="col-6 col-md-1">
                <label className="form-label small mb-1">V. Unit</label>
                <input
                  type="number"
                  className="form-control form-control-sm"
                  value={nuevoPreset.valorUnitario}
                  onChange={(e) =>
                    setNuevoPreset((p) => ({ ...p, valorUnitario: e.target.value }))
                  }
                />
              </div>
              <div className="col-6 col-md-1 d-grid">
                <button
                  className="btn btn-sm btn-danger"
                  onClick={agregarPreset}
                  disabled={presetsLoading}
                >
                  Guardar
                </button>
              </div>
            </div>
          )}

          <div className="table-responsive">
            <table className="table table-sm table-bordered align-middle">
              <thead>
                <tr>
                  <th>Clave SAT</th>
                  <th>Descripción SAT</th>
                  <th>Clave unidad</th>
                  <th>Unidad</th>
                  <th>Descripción</th>
                  <th>V. Unit</th>
                  <th style={{ width: 160 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {presets.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center text-muted">
                      Aún no hay conceptos guardados. Agrega el primero.
                    </td>
                  </tr>
                ) : (
                  presets.map((p) => {
                    const editing = editPresetId === p._id;
                    const row = editing ? editPresetDraft : p;
                    return (
                      <tr key={p._id}>
                        <td>
                          {editing ? (
                            <input
                              className="form-control form-control-sm"
                              value={row.cProdServ}
                              onChange={(e) =>
                                setEditPresetDraft((d) => ({ ...d, cProdServ: e.target.value }))
                              }
                            />
                          ) : (
                            p.cProdServ
                          )}
                        </td>
                        <td>
                          {editing ? (
                            <input
                              className="form-control form-control-sm"
                              value={row.cProdServDescripcion}
                              onChange={(e) =>
                                setEditPresetDraft((d) => ({
                                  ...d,
                                  cProdServDescripcion: e.target.value,
                                }))
                              }
                            />
                          ) : (
                            p.cProdServDescripcion || "—"
                          )}
                        </td>
                        <td>
                          {editing ? (
                            <input
                              className="form-control form-control-sm"
                              value={row.cUnidad}
                              onChange={(e) =>
                                setEditPresetDraft((d) => ({ ...d, cUnidad: e.target.value }))
                              }
                            />
                          ) : (
                            p.cUnidad
                          )}
                        </td>
                        <td>
                          {editing ? (
                            <input
                              className="form-control form-control-sm"
                              value={row.unidad}
                              onChange={(e) =>
                                setEditPresetDraft((d) => ({ ...d, unidad: e.target.value }))
                              }
                            />
                          ) : (
                            p.unidad
                          )}
                        </td>
                        <td>
                          {editing ? (
                            <input
                              className="form-control form-control-sm"
                              value={row.descripcion}
                              onChange={(e) =>
                                setEditPresetDraft((d) => ({ ...d, descripcion: e.target.value }))
                              }
                            />
                          ) : (
                            p.descripcion
                          )}
                        </td>
                        <td>
                          {editing ? (
                            <input
                              type="number"
                              className="form-control form-control-sm"
                              value={row.valorUnitario}
                              onChange={(e) =>
                                setEditPresetDraft((d) => ({
                                  ...d,
                                  valorUnitario: e.target.value,
                                }))
                              }
                            />
                          ) : (
                            Number(p.valorUnitario || 0).toLocaleString("es-MX", {
                              style: "currency",
                              currency: "MXN",
                            })
                          )}
                        </td>
                        <td>
                          {editing ? (
                            <div className="d-flex gap-1">
                              <button
                                className="btn btn-sm btn-success"
                                onClick={guardarEditPreset}
                                disabled={presetsLoading}
                              >
                                Guardar
                              </button>
                              <button className="btn btn-sm btn-secondary" onClick={cancelEditPreset}>
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <div className="d-flex gap-1">
                              <button
                                className="btn btn-sm btn-outline-primary"
                                onClick={() => startEditPreset(p)}
                              >
                                Editar
                              </button>
                              <button
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => eliminarPreset(p._id)}
                              >
                                Eliminar
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <button className="btn btn-danger" onClick={guardar} disabled={loading}>
        {loading ? "Guardando..." : "Guardar configuración"}
      </button>

      <p className="text-muted mt-3 small">
        El sistema valida automáticamente que el <b>.cer</b> y el <b>.key</b> correspondan.
      </p>

      <p className="text-muted small">
        Nota: el sistema genera automáticamente <code>backend/keys/emisor.key.pem</code>.
      </p>
    </div>
  );
}
