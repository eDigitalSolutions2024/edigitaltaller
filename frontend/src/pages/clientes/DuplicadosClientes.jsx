import { useCallback, useEffect, useState } from "react";
import {
  getClientesDuplicados, fusionarClientes, vistaPreviaFusion,
  getFusionesClientes, deshacerFusionClientes,
} from "../../api/customers";
import "../../styles/clientes.css";

// Campos que se pueden resolver a mano al fusionar (mismos paths que CAMPOS_FUSION
// en backend/routes/clientes.js).
const CAMPOS = [
  ["tipoCliente", "Tipo de cliente"],
  ["nombre", "Nombre"],
  ["apellidoPaterno", "Apellido paterno"],
  ["apellidoMaterno", "Apellido materno"],
  ["empresa.razonSocial", "Razón social"],
  ["gobierno.nombreGobierno", "Nombre de gobierno"],
  ["rfc", "RFC"],
  ["regimenFiscal", "Régimen fiscal"],
  ["codigoPostalFiscal", "C.P. fiscal"],
  ["facturacion.usoCFDI", "Uso CFDI"],
  ["direccion.calle", "Calle"],
  ["direccion.numeroExterior", "N° exterior"],
  ["direccion.numeroInterior", "N° interior"],
  ["direccion.colonia", "Colonia"],
  ["direccion.codigoPostal", "C.P."],
  ["direccion.ciudad", "Ciudad"],
  ["direccion.estado", "Estado"],
  ["asesorResponsable", "Asesor responsable"],
  ["condicionesPago", "Condiciones de pago"],
  ["observaciones", "Observaciones"],
];

const leer = (obj, path) =>
  String(path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj) ?? "").trim();

const telTexto = (t) => (t?.lada ? `(${t.lada}) ${t.numero}` : t?.numero || "");

function listaUnida(clientes) {
  const uniq = (arr) => [...new Set(arr.filter(Boolean))];
  return {
    Correos: uniq(clientes.flatMap((c) => c.emails || [])),
    Teléfonos: uniq(clientes.flatMap((c) => [...(c.telefonos || []), ...(c.celulares || [])].map(telTexto))),
    "Códigos de servicio": uniq(clientes.flatMap((c) => (c.codigosServicio || []).map((x) => x.codigoCliente))),
    "Cuentas bancarias": uniq(clientes.flatMap((c) => (c.cuentasBancarias || []).map((x) => `${x.banco} ${x.numeroCuenta}`))),
  };
}

function ModalFusion({ grupo, onClose, onHecho }) {
  const { clientes } = grupo;
  const [principalId, setPrincipalId] = useState(clientes[0]._id);
  const [campos, setCampos] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  // Vista previa: órdenes de los duplicados con casilla para elegir cuáles se mueven.
  const [preview, setPreview] = useState([]);
  const [ordenesSel, setOrdenesSel] = useState(new Set());

  useEffect(() => {
    let vivo = true;
    vistaPreviaFusion({
      principalId,
      duplicadoIds: clientes.filter((c) => c._id !== principalId).map((c) => c._id),
    })
      .then((r) => {
        if (!vivo) return;
        const data = r.data.data || [];
        setPreview(data);
        setOrdenesSel(new Set(data.flatMap((d) => d.ordenes.map((o) => o._id))));
      })
      .catch((e) => vivo && setError(e?.response?.data?.error || e.message));
    return () => { vivo = false; };
  }, [principalId, clientes]);

  const totalOrdenes = preview.reduce((n, d) => n + d.ordenes.length, 0);
  const todasSel = ordenesSel.size === totalOrdenes;
  const toggleOrden = (id) =>
    setOrdenesSel((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  // Al cambiar de principal se propone su valor y, si está vacío, el primero no vacío de los demás.
  useEffect(() => {
    const principal = clientes.find((c) => c._id === principalId);
    const otros = clientes.filter((c) => c._id !== principalId);
    const inicial = {};
    for (const [path] of CAMPOS) {
      inicial[path] = leer(principal, path) || otros.map((o) => leer(o, path)).find(Boolean) || "";
    }
    setCampos(inicial);
  }, [principalId, clientes]);

  const filas = CAMPOS.map(([path, etiqueta]) => {
    const valores = clientes.map((c) => leer(c, path));
    const distintos = [...new Set(valores.filter(Boolean))];
    return { path, etiqueta, valores, distintos, conflicto: distintos.length > 1 };
  }).filter((f) => f.distintos.length > 0);

  const confirmar = async () => {
    setGuardando(true);
    setError("");
    try {
      await fusionarClientes({
        principalId,
        duplicadoIds: clientes.filter((c) => c._id !== principalId).map((c) => c._id),
        campos,
        ordenIds: [...ordenesSel],
      });
      onHecho();
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
      setGuardando(false);
    }
  };

  const unidas = listaUnida(clientes);

  return (
    <div className="modal fade show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="modal-dialog modal-xl modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Fusionar clientes duplicados</h5>
            <button className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body">
            <p className="mb-1 fw-bold">1. Elige el cliente que se conserva</p>
            {clientes.map((c) => (
              <div className="form-check" key={c._id}>
                <input
                  className="form-check-input"
                  type="radio"
                  id={`p-${c._id}`}
                  checked={principalId === c._id}
                  onChange={() => setPrincipalId(c._id)}
                />
                <label className="form-check-label" htmlFor={`p-${c._id}`}>
                  {c.nombreMostrar} {c.rfc ? `· ${c.rfc}` : ""}
                  {c.saldoAFavor > 0 ? ` · saldo $${c.saldoAFavor}` : ""}
                </label>
              </div>
            ))}

            <p className="mt-3 mb-1 fw-bold">2. Revisa los datos finales</p>
            <small className="text-muted d-block mb-2">
              Los campos en amarillo tienen valores distintos: haz clic en uno de ellos o escribe el valor correcto.
            </small>
            {filas.map((f) => (
              <div key={f.path} className={`row g-2 align-items-center mb-1 p-1 rounded ${f.conflicto ? "bg-warning-subtle" : ""}`}>
                <div className="col-md-2 small fw-semibold">{f.etiqueta}</div>
                <div className="col-md-4">
                  <input
                    className="form-control form-control-sm"
                    value={campos[f.path] ?? ""}
                    onChange={(e) => setCampos((p) => ({ ...p, [f.path]: e.target.value }))}
                  />
                </div>
                <div className="col-md-6">
                  {f.conflicto &&
                    f.distintos.map((v) => (
                      <button
                        key={v}
                        type="button"
                        className="btn btn-sm btn-outline-secondary me-1 mb-1"
                        onClick={() => setCampos((p) => ({ ...p, [f.path]: v }))}
                      >
                        {v}
                      </button>
                    ))}
                </div>
              </div>
            ))}

            <p className="mt-3 mb-1 fw-bold">3. Órdenes que se pasan al cliente que se conserva</p>
            {preview.map((d) => {
              const c = clientes.find((x) => x._id === d.clienteId);
              return (
                <div key={d.clienteId} className="border rounded p-2 mb-2">
                  <div className="small fw-semibold">
                    {c?.nombreMostrar} — {d.ordenes.length} orden(es), {d.anticipos} anticipo(s), {d.facturas} factura(s)
                    {d.saldoAFavor > 0 ? `, saldo $${d.saldoAFavor}` : ""}
                  </div>
                  {d.ordenes.map((o) => (
                    <div className="form-check small" key={o._id}>
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id={`o-${o._id}`}
                        checked={ordenesSel.has(o._id)}
                        onChange={() => toggleOrden(o._id)}
                      />
                      <label className="form-check-label" htmlFor={`o-${o._id}`}>
                        {o.ordenServicio || "(sin folio)"} · {[o.marca, o.modelo, o.anio].filter(Boolean).join(" ")} {o.placas ? `· ${o.placas}` : ""}
                      </label>
                    </div>
                  ))}
                </div>
              );
            })}
            {!todasSel && (
              <div className="alert alert-warning py-1 small">
                No están todas las órdenes seleccionadas: solo se moverán las marcadas y los clientes con órdenes
                pendientes seguirán activos (sin fusionar sus datos, anticipos, facturas ni saldo).
              </div>
            )}

            <p className="mt-3 mb-1 fw-bold">Se unirán automáticamente</p>
            <ul className="small mb-1">
              {Object.entries(unidas).map(([k, v]) => (
                <li key={k}>
                  <strong>{k}:</strong> {v.length ? v.join(", ") : "—"}
                </li>
              ))}
              <li>
                <strong>Órdenes, anticipos, facturas y saldo a favor</strong> de los duplicados pasan al cliente que se conserva.
              </li>
            </ul>
            <small className="text-muted">Los duplicados quedan inactivos (no se borran).</small>
            {error && <div className="text-danger fw-bold mt-2">{error}</div>}
          </div>
          <div className="modal-footer">
            <button className="btn btn-light" onClick={onClose} disabled={guardando}>Cancelar</button>
            <button className="btn btn-primary" onClick={confirmar} disabled={guardando || (totalOrdenes > 0 && ordenesSel.size === 0)}>
              {guardando ? "Fusionando..." : "Fusionar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DuplicadosClientes() {
  const [grupos, setGrupos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [fusion, setFusion] = useState(null);
  const [fusiones, setFusiones] = useState([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErr("");
    try {
      const res = await getClientesDuplicados();
      setGrupos(res.data.data || []);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  const cargarFusiones = useCallback(async () => {
    try {
      const r = await getFusionesClientes();
      setFusiones(r.data.data || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => { cargar(); cargarFusiones(); }, [cargar, cargarFusiones]);

  // Fusión que se está por deshacer (abre el modal de confirmación).
  const [aDeshacer, setADeshacer] = useState(null);
  const [deshaciendo, setDeshaciendo] = useState(false);
  const [errDeshacer, setErrDeshacer] = useState("");

  const confirmarDeshacer = async () => {
    setDeshaciendo(true);
    setErrDeshacer("");
    try {
      await deshacerFusionClientes(aDeshacer._id);
      setADeshacer(null);
      setErr("");
      setMsg("Fusión deshecha.");
      cargar();
      cargarFusiones();
    } catch (e) {
      setErrDeshacer(e?.response?.data?.error || e.message);
    } finally {
      setDeshaciendo(false);
    }
  };

  return (
    <div className="consulta-card">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <div>
          <h5 className="mb-0">Clientes duplicados</h5>
          <small className="text-muted">Clientes activos con el mismo nombre o el mismo RFC.</small>
        </div>
        <button className="btn btn-light" onClick={cargar}>Actualizar</button>
      </div>
      {msg && <div className="text-success fw-bold mb-2">{msg}</div>}
      {err && <div className="text-danger fw-bold mb-2">ERROR: {err}</div>}
      {cargando ? (
        <p>Buscando duplicados...</p>
      ) : grupos.length === 0 ? (
        <p>No se encontraron clientes duplicados.</p>
      ) : (
        grupos.map((g, i) => (
          <div key={i} className="border rounded p-2 mb-2">
            <div className="d-flex justify-content-between align-items-center">
              <span className="badge bg-warning text-dark">{g.motivos.join(" + ")}</span>
              <button className="btn btn-sm btn-primary" onClick={() => setFusion(g)}>Fusionar</button>
            </div>
            {g.clientes.map((c) => (
              <div key={c._id} className="small mt-1">
                <strong>{c.nombreMostrar}</strong>
                <span className="text-muted">
                  {" "}· {c.tipoCliente}
                  {c.rfc ? ` · ${c.rfc}` : ""}
                  {c.emails?.[0] ? ` · ${c.emails[0]}` : ""}
                </span>
              </div>
            ))}
          </div>
        ))
      )}
      {fusion && (
        <ModalFusion
          grupo={fusion}
          onClose={() => setFusion(null)}
          onHecho={() => {
            setFusion(null);
            setMsg("Clientes fusionados correctamente.");
            cargar();
            cargarFusiones();
          }}
        />
      )}

      {fusiones.length > 0 && (
        <>
          <h6 className="mt-4">Fusiones recientes</h6>
          <small className="text-muted d-block mb-1">Se pueden deshacer durante 7 días.</small>
          {fusiones.map((f) => (
            <div key={f._id} className="d-flex justify-content-between align-items-center border rounded p-2 mb-1 small">
              <span>
                <strong>{f.principalNombre}</strong> ← {f.duplicados.map((d) => d.nombre).join(", ") || "órdenes sueltas"}
                {" "}· {f.ordenes.length} orden(es), {f.anticipos.length} anticipo(s), {f.facturas.length} factura(s)
                <span className="text-muted"> · {new Date(f.createdAt).toLocaleString("es-MX")}</span>
              </span>
              {f.deshechaEn ? (
                <span className="badge bg-secondary">Deshecha</span>
              ) : (
                <button className="btn btn-sm btn-outline-danger" onClick={() => { setErrDeshacer(""); setADeshacer(f); }}>Deshacer</button>
              )}
            </div>
          ))}
        </>
      )}

      {aDeshacer && (
        <div
          className="modal d-block"
          tabIndex="-1"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={(e) => { if (e.target === e.currentTarget && !deshaciendo) setADeshacer(null); }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title fw-bold">Deshacer fusión</h5>
                <button type="button" className="btn-close" onClick={() => setADeshacer(null)} disabled={deshaciendo} />
              </div>
              <div className="modal-body">
                <div className="alert alert-warning py-2 mb-3">
                  Vas a deshacer la fusión en <strong>{aDeshacer.principalNombre}</strong>:
                  <ul className="mb-0 mt-1">
                    <li>{aDeshacer.ordenes.length} orden(es), {aDeshacer.anticipos.length} anticipo(s) y {aDeshacer.facturas.length} factura(s) regresan a su cliente original.</li>
                    <li>Los clientes duplicados se reactivan{aDeshacer.saldoSumado > 0 ? ` y se resta el saldo a favor sumado ($${aDeshacer.saldoSumado})` : ""}.</li>
                    <li>Los datos del cliente conservado vuelven a como estaban antes de fusionar.</li>
                  </ul>
                </div>
                {errDeshacer && <p className="text-danger mb-0">{errDeshacer}</p>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline-secondary" onClick={() => setADeshacer(null)} disabled={deshaciendo}>
                  Cancelar
                </button>
                <button type="button" className="btn btn-danger fw-semibold" onClick={confirmarDeshacer} disabled={deshaciendo}>
                  {deshaciendo ? "Deshaciendo…" : "Deshacer fusión"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
