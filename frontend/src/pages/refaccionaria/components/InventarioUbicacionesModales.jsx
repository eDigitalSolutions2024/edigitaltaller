import { useEffect, useMemo, useState } from "react";

/* Contenedor modal genérico (mismo estilo que los demás modales de Consultar Inventario) */
function Modal({ title, subtitle, onClose, size = "", children, footer, busy }) {
  return (
    <>
      <div className="modal-backdrop fade show" style={{ zIndex: 1050 }} onClick={() => !busy && onClose()} />
      <div
        className="modal fade show d-block"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        style={{ zIndex: 1055 }}
        onKeyDown={(e) => e.key === "Escape" && !busy && onClose()}
      >
        <div className={`modal-dialog modal-dialog-centered modal-dialog-scrollable ${size}`}>
          <div className="modal-content">
            <div className="modal-header">
              <div>
                <h5 className="modal-title mb-0">{title}</h5>
                {subtitle && <div className="small text-muted">{subtitle}</div>}
              </div>
              <button type="button" className="btn-close" onClick={onClose} disabled={busy} />
            </div>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-footer">{footer}</div>}
          </div>
        </div>
      </div>
    </>
  );
}

/* ===== Crear / renombrar ubicación ===== */
export function ModalUbicacionForm({ ubic, onClose, onSave }) {
  const [nombre, setNombre] = useState(ubic?.nombre || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function guardar() {
    if (!nombre.trim()) return setErr("Escribe un nombre.");
    setSaving(true);
    setErr("");
    try {
      await onSave({ nombre: nombre.trim() });
    } catch (e) {
      setErr(e.response?.data?.message || e.message || "No se pudo guardar.");
      setSaving(false);
    }
  }

  return (
    <Modal
      title={ubic ? "Editar ubicación" : "Nueva ubicación"}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={guardar} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      <div className="mb-2">
        <label className="form-label fw-semibold">Nombre</label>
        <input
          className="form-control"
          autoFocus
          placeholder="Ej: Repisa 1"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && guardar()}
        />
      </div>
      {err && <div className="alert alert-danger py-2 small mt-3 mb-0">{err}</div>}
    </Modal>
  );
}

/* ===== Asignar una refacción (parte de su existencia) a una ubicación ===== */
export function ModalAsignar({ item, ubicaciones, ubicInicial, onClose, onAsignar }) {
  const [ubicId, setUbicId] = useState(ubicInicial || ubicaciones[0]?._id || "");
  const [cantidad, setCantidad] = useState(String(item.sinAsignar || ""));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const qty = Number(cantidad);
  const invalida = !ubicId || !qty || qty <= 0 || qty > item.sinAsignar;

  async function guardar() {
    setSaving(true);
    setErr("");
    try {
      await onAsignar(ubicId, item._id, qty);
    } catch (e) {
      setErr(e.response?.data?.message || e.message || "No se pudo asignar.");
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Asignar — ${item.codigo}`}
      subtitle={item.descripcion}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={guardar} disabled={saving || invalida}>
            {saving ? "Guardando…" : "Asignar"}
          </button>
        </>
      }
    >
      {ubicaciones.length === 0 ? (
        <div className="alert alert-info mb-0">
          Aún no hay ubicaciones. Crea una con el botón “Nueva ubicación”.
        </div>
      ) : (
        <>
          <p className="small text-muted mb-3">
            Existencia: <strong>{item.cantidad}</strong> {item.unidad} · Sin asignar:{" "}
            <strong>{item.sinAsignar}</strong>
          </p>
          <div className="mb-3">
            <label className="form-label fw-semibold">Ubicación</label>
            <select className="form-select" value={ubicId} onChange={(e) => setUbicId(e.target.value)}>
              {ubicaciones.map((u) => (
                <option key={u._id} value={u._id}>{u.nombre}</option>
              ))}
            </select>
          </div>
          <div className="mb-2">
            <label className="form-label fw-semibold">Cantidad a colocar ahí</label>
            <input
              type="number"
              min="1"
              max={item.sinAsignar}
              className="form-control"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !invalida && guardar()}
            />
            <div className="form-text">Máximo {item.sinAsignar}. El resto puedes repartirlo en otra ubicación.</div>
          </div>
        </>
      )}
      {err && <div className="alert alert-danger py-2 small mt-3 mb-0">{err}</div>}
    </Modal>
  );
}

/* ===== Detalle de una ubicación ===== */
export function ModalUbicacionDetalle({
  ubic, itemsPorId, sinAsignarList, canEdit, onClose, onEditar, onEliminar, onSetCantidad, onAsignar,
}) {
  const [q, setQ] = useState("");
  const [edits, setEdits] = useState({});       // codigo -> string en edición
  const [busyCode, setBusyCode] = useState("");
  const [err, setErr] = useState("");

  // Agregar refacción
  const [addQ, setAddQ] = useState("");
  const [addId, setAddId] = useState("");
  const [addQty, setAddQty] = useState("");

  useEffect(() => { setEdits({}); }, [ubic]);

  const filas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (ubic.items || [])
      .map((i) => ({ ...i, it: itemsPorId[i.codigoInterno] }))
      .filter((r) => !t || (r.it?.codigo || "").toLowerCase().includes(t) || (r.it?.descripcion || "").toLowerCase().includes(t))
      .sort((a, b) => String(a.it?.codigo || "").localeCompare(String(b.it?.codigo || "")));
  }, [ubic, itemsPorId, q]);

  const totalPiezas = (ubic.items || []).reduce((s, i) => s + i.cantidad, 0);

  const candidatos = useMemo(() => {
    const t = addQ.trim().toLowerCase();
    return sinAsignarList
      .filter((x) => x.sinAsignar > 0)
      .filter((x) => !t || x.codigo.toLowerCase().includes(t) || (x.descripcion || "").toLowerCase().includes(t))
      .slice(0, 50);
  }, [sinAsignarList, addQ]);
  const elegido = sinAsignarList.find((x) => x._id === addId);

  async function run(code, fn) {
    setBusyCode(code);
    setErr("");
    try { await fn(); } catch (e) { setErr(e.response?.data?.message || e.message || "No se pudo guardar."); }
    setBusyCode("");
  }

  function guardarCantidad(r) {
    const val = edits[r.codigoInterno];
    if (val === undefined) return;
    const n = Number(val);
    const max = r.it ? r.cantidad + r.it.sinAsignar : r.cantidad;
    if (!Number.isFinite(n) || n < 0) return setErr("Cantidad inválida.");
    if (n > max) return setErr(`${r.it?.codigo}: solo hay ${max} disponibles para esta ubicación.`);
    run(r.codigoInterno, async () => {
      await onSetCantidad(ubic._id, r.codigoInterno, n);
      setEdits((e) => { const c = { ...e }; delete c[r.codigoInterno]; return c; });
    });
  }

  async function agregar() {
    const n = Number(addQty);
    if (!elegido || !n || n <= 0 || n > elegido.sinAsignar) return;
    await run("__add", async () => {
      await onAsignar(ubic._id, elegido._id, n);
      setAddId(""); setAddQty(""); setAddQ("");
    });
  }

  return (
    <Modal
      size="modal-xl"
      title={ubic.nombre}
      subtitle={`${ubic.items.length} refacción(es) · ${totalPiezas} pieza(s)`}
      onClose={onClose}
      footer={
        <>
          {canEdit && (
            <div className="me-auto d-flex gap-2">
              <button className="btn btn-outline-secondary btn-sm" onClick={onEditar}>Renombrar</button>
              <button className="btn btn-outline-danger btn-sm" onClick={onEliminar}>Eliminar ubicación</button>
            </div>
          )}
          <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
        </>
      }
    >
      {err && <div className="alert alert-danger py-2 small">{err}</div>}

      {canEdit && (
        <div className="inv-agregar mb-3">
          <div className="fw-semibold small mb-2">Agregar refacción a esta ubicación</div>
          <div className="row g-2 align-items-end">
            <div className="col-md-4">
              <input
                className="form-control form-control-sm"
                placeholder="Buscar refacción sin asignar…"
                value={addQ}
                onChange={(e) => { setAddQ(e.target.value); setAddId(""); }}
              />
            </div>
            <div className="col-md-4">
              <select
                className="form-select form-select-sm"
                value={addId}
                onChange={(e) => {
                  setAddId(e.target.value);
                  const x = sinAsignarList.find((s) => s._id === e.target.value);
                  setAddQty(x ? String(x.sinAsignar) : "");
                }}
              >
                <option value="">— Elige ({candidatos.length}) —</option>
                {candidatos.map((x) => (
                  <option key={x._id} value={x._id}>{x.codigo} · {x.descripcion} (sin asignar: {x.sinAsignar})</option>
                ))}
              </select>
            </div>
            <div className="col-6 col-md-2">
              <input
                type="number"
                min="1"
                max={elegido?.sinAsignar}
                className="form-control form-control-sm"
                placeholder="Cantidad"
                value={addQty}
                onChange={(e) => setAddQty(e.target.value)}
                disabled={!elegido}
              />
            </div>
            <div className="col-6 col-md-2">
              <button
                className="btn btn-primary btn-sm w-100"
                onClick={agregar}
                disabled={!elegido || !Number(addQty) || Number(addQty) > elegido.sinAsignar || busyCode === "__add"}
              >
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        className="form-control form-control-sm mb-2"
        placeholder="Buscar en esta ubicación…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="table-responsive">
        <table className="table table-sm table-striped align-middle mb-0">
          <thead>
            <tr>
              <th>Código</th>
              <th className="text-center" style={{ width: 170 }}>Cantidad aquí</th>
              <th className="text-center" style={{ width: 140 }}>Existencia total</th>
              {canEdit && <th style={{ width: 90 }} />}
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr><td colSpan={canEdit ? 4 : 3} className="text-center text-muted py-4">Sin refacciones en esta ubicación</td></tr>
            ) : filas.map((r) => {
              const editando = edits[r.codigoInterno] !== undefined;
              const exceso = r.it && r.it.asignado > r.it.cantidad;
              return (
                <tr key={r.codigoInterno}>
                  <td>
                    <div className="fw-semibold">{r.it?.codigo || r.codigoInterno}</div>
                    <div className="small text-muted">{r.it?.descripcion || ""}</div>
                  </td>
                  <td className="text-center">
                    {canEdit ? (
                      <div className="d-flex justify-content-center gap-1">
                        <input
                          type="number"
                          min="0"
                          className="form-control form-control-sm text-center"
                          style={{ width: 80 }}
                          value={editando ? edits[r.codigoInterno] : r.cantidad}
                          onChange={(e) => setEdits((s) => ({ ...s, [r.codigoInterno]: e.target.value }))}
                          onKeyDown={(e) => e.key === "Enter" && guardarCantidad(r)}
                          disabled={busyCode === r.codigoInterno}
                        />
                        {editando && (
                          <button className="btn btn-success btn-sm" onClick={() => guardarCantidad(r)} disabled={busyCode === r.codigoInterno}>
                            ✓
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="fw-semibold">{r.cantidad}</span>
                    )}
                  </td>
                  <td className="text-center">
                    {r.it?.cantidad ?? "—"} {r.it?.unidad || ""}
                    {exceso && <div className="small text-danger">Asignado de más ({r.it.asignado})</div>}
                  </td>
                  {canEdit && (
                    <td className="text-end">
                      <button
                        className="btn btn-outline-danger btn-sm"
                        onClick={() => run(r.codigoInterno, () => onSetCantidad(ubic._id, r.codigoInterno, 0))}
                        disabled={busyCode === r.codigoInterno}
                      >
                        Quitar
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
