import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getVehiculoById,
  saveRequisicionDiagnostico,
} from "../../api/vehiculos";
import { getUnidadesMedida } from "../../api/configuracion";
import useTipoCambioActual from "../../hooks/useTipoCambioActual";
import ModalSeleccionarCodigo from "./components/ModalSeleccionarCodigo";
import ModalInventarioAlmacen from "./components/ModalInventarioAlmacen";

const API = process.env.REACT_APP_API_URL || "http://localhost:4000/api";

// ─── Modal selección de código ────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
function _ModalSeleccionarCodigoLegado({ onSelect, onClose }) {
  const [codigos, setCodigos]   = useState([]);
  const [stockMap, setStockMap] = useState({}); // { [_id]: cantidad }
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [proveedores, setProveedores] = useState([]);
  const [unidades, setUnidades]       = useState([]);
  const [vista, setVista]       = useState("buscar"); // "buscar" | "manual"

  // Estado para entrada manual
  const [codigoManual, setCodigoManual]             = useState("");
  const [mostrarFormGuardar, setMostrarFormGuardar] = useState(false);
  const [guardando, setGuardando]                   = useState(false);
  const [formNuevo, setFormNuevo] = useState({
    descripcion: "", proveedor: "", marca: "", unidad: "", precioUnitario: "",
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

  // Verifica si el código manual ya existe en BD
  const codigoExistente = codigoManual.trim()
    ? codigos.find(
        (c) => (c.numeroParte || c.codigo || "").toLowerCase() === codigoManual.trim().toLowerCase()
      )
    : null;

  const handleContinuarSinGuardar = () => {
    const np = codigoManual.trim();
    if (!np) return;
    // Pasa el código tal cual; sin codigo en BD → no se descuenta inventario
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
        {/* Header con tabs */}
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
              Código manual
            </button>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", lineHeight: 1 }}
          >×</button>
        </div>

        {/* ── VISTA: BUSCAR ── */}
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

        {/* ── VISTA: CÓDIGO MANUAL ── */}
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
                  setMostrarFormGuardar(false);
                }}
              />
            </div>

            {/* Aviso si ya existe */}
            {codigoExistente && (
              <div className="alert alert-warning py-2 mb-0">
                <strong>Este código ya existe en BD Códigos:</strong>{" "}
                {codigoExistente.descripcion || "sin descripción"}
                {codigoExistente.proveedor ? ` — ${codigoExistente.proveedor}` : ""}
                <div className="mt-2">
                  <button
                    className="btn btn-sm btn-warning"
                    onClick={() => onSelect(codigoExistente)}
                  >
                    Usar este código
                  </button>
                </div>
              </div>
            )}

            {/* Opciones cuando no existe */}
            {!codigoExistente && codigoManual.trim() && (
              <div className="d-flex flex-column gap-2">
                <p className="text-muted small mb-1">
                  Este código no está en BD Códigos. Elige cómo continuar:
                </p>

                {/* Opción 1: Guardar en BD */}
                <div className="border rounded p-3">
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <strong>Opción 1:</strong> Guardar en BD Códigos
                      <p className="text-muted small mb-0">
                        Queda registrado para futuras cotizaciones.
                      </p>
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
                        {/* Código (solo lectura) */}
                        <div className="col-md-4">
                          <label className="form-label form-label-sm mb-1">Código <span className="text-danger">*</span></label>
                          <input className="form-control form-control-sm" value={codigoManual} readOnly />
                        </div>
                        {/* Descripción */}
                        <div className="col-md-8">
                          <label className="form-label form-label-sm mb-1">Descripción <span className="text-danger">*</span></label>
                          <input
                            className="form-control form-control-sm"
                            placeholder="Nombre o descripción de la refacción..."
                            value={formNuevo.descripcion}
                            onChange={(e) => setFormNuevo((f) => ({ ...f, descripcion: e.target.value }))}
                          />
                        </div>
                        {/* Proveedor */}
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
                        {/* Marca */}
                        <div className="col-md-6">
                          <label className="form-label form-label-sm mb-1">Marca <span className="text-muted small">(opcional)</span></label>
                          <input
                            className="form-control form-control-sm"
                            placeholder="Ej. Bosch, Gates..."
                            value={formNuevo.marca}
                            onChange={(e) => setFormNuevo((f) => ({ ...f, marca: e.target.value }))}
                          />
                        </div>
                        {/* Unidad */}
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
                        {/* Precio unitario */}
                        <div className="col-md-6">
                          <label className="form-label form-label-sm mb-1">Precio unitario <span className="text-muted small">(opcional)</span></label>
                          <input
                            type="number"
                            step="0.01"
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

                {/* Opción 2: Solo para esta ocasión */}
                <div className="border rounded p-3 d-flex justify-content-between align-items-center">
                  <div>
                    <strong>Opción 2:</strong> Solo para esta cotización
                    <p className="text-muted small mb-0">
                      No se descuenta del inventario. Se surte manualmente.
                    </p>
                  </div>
                  <button
                    className="btn btn-outline-secondary btn-sm"
                    onClick={handleContinuarSinGuardar}
                  >
                    Continuar sin guardar
                  </button>
                </div>
              </div>
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

export default function SolicitudTallerDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [orden, setOrden] = useState(null);
  const [refacciones, setRefacciones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [unidades, setUnidades]               = useState([]);
  const [modalCodigoIndex, setModalCodigoIndex] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { tipoCambio: tipoCambioConfig, loading: cargandoTipoCambio } = useTipoCambioActual();
  const [filtroOpcion, setFiltroOpcion] = useState(null);
  const [modalInventarioOpen, setModalInventarioOpen] = useState(false);

  useEffect(() => {
    getUnidadesMedida()
      .then(data => setUnidades((data || []).filter(u => u.activo)))
      .catch(() => setUnidades([]));
  }, []);

  const cargarOrden = async () => {
    try {
      setLoading(true);
      const res = await getVehiculoById(id);
      const vehiculo = res.data?.vehiculo;

      setOrden(vehiculo || null);
      setRefacciones(
        (vehiculo?.refaccionesSolicitadas || []).map((item) => ({
          ...item,
          cant: Number(item.cant || 0),
          refaccion: item.refaccion || "",
          estatus: item.estatus || "PENDIENTE",
          opcionSeleccionada:
            item.opcionSeleccionada === undefined ? null : item.opcionSeleccionada,
          opciones: Array.isArray(item.opciones)
            ? item.opciones.map((op) => ({
                ...op,
                unidad: op.unidad || "",
                tipo: op.tipo || "",
                marca: op.marca || "",
                proveedor: op.proveedor || "",
                codigo: op.codigo || "",
                precioUnitario: Number(op.precioUnitario || 0),
                tipoCambio: Number(op.tipoCambio || 0),
                importeTotal:
                  Number(op.importeTotal || 0) ||
                  Number(item.cant || 0) *
                    Number(op.precioUnitario || 0) *
                    (op.moneda === "USD" ? Number(op.tipoCambio || 0) : 1),
                moneda: op.moneda || "MN",
                tiempoEntrega: op.tiempoEntrega || "",
                core: op.core || "",
                precioCore: Number(op.precioCore || 0),
                observaciones: op.observaciones || "",
              }))
            : [],

          nuevaOpcion: {
            unidad: "",
            tipo: "",
            marca: "",
            proveedor: "",
            codigo: "",
            precioUnitario: "",
            moneda: "MN",
            tipoCambio: "",
            tiempoEntrega: "",
            core: "",
            precioCore: "",
            observaciones: "",
          },
        }))
      );


    } catch (err) {
      console.error("Error cargando solicitud:", err);
      alert("Error al cargar la solicitud.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarOrden();
  }, [id]);

  const nombreCliente = () => {
    const c = orden?.cliente || {};
    if (c.gobierno?.nombreGobierno) return c.gobierno.nombreGobierno;
    return [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(" ") || "Sin cliente";
  };

  const descripcionVehiculo = () =>
    [orden?.marca, orden?.modelo, orden?.anio].filter(Boolean).join(" ") ||
    "Sin vehículo";

  const cambiarSolicitud = (index, field, value) => {
    setRefacciones((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    );
  };

  const seleccionarCodigo = (codigo) => {
    const idx = modalCodigoIndex;
    const tienePrecio = codigo.precioUnitario != null && codigo.precioUnitario !== "";
    const bloqueados = [
      ...(codigo.proveedor  ? ["proveedor"] : []),
      ...(codigo.marca      ? ["marca"]     : []),
      ...(codigo.unidad     ? ["unidad"]    : []),
    ];
    setRefacciones((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        return {
          ...item,
          nuevaOpcion: {
            ...item.nuevaOpcion,
            codigo:             codigo.numeroParte || codigo.codigo || "",
            proveedor:          codigo.proveedor   || item.nuevaOpcion?.proveedor || "",
            marca:              codigo.marca        || item.nuevaOpcion?.marca     || "",
            unidad:             codigo.unidad       || item.nuevaOpcion?.unidad    || "",
            precioUnitario:     tienePrecio
                                  ? String(codigo.precioUnitario)
                                  : item.nuevaOpcion?.precioUnitario || "",
            _camposBloqueados:  bloqueados,
          },
        };
      })
    );
    setModalCodigoIndex(null);
  };

  const seleccionarDeAlmacen = (item) => {
    const tienePrecio = item.precioUnitario != null && item.precioUnitario !== "";
    setRefacciones((prev) =>
      prev.map((ref, i) => {
        if (i !== selectedIndex) return ref;
        return {
          ...ref,
          nuevaOpcion: {
            ...ref.nuevaOpcion,
            codigo:         item.codigo || "",
            unidad:         item.unidad || ref.nuevaOpcion?.unidad || "",
            marca:          item.marca  || ref.nuevaOpcion?.marca  || "",
            precioUnitario: tienePrecio
                              ? String(item.precioUnitario)
                              : ref.nuevaOpcion?.precioUnitario || "",
          },
        };
      })
    );
    setModalInventarioOpen(false);
  };

  const cambiarNuevaOpcion = (index, field, value) => {
    setRefacciones((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;

        const nuevaOpcion = {
          ...item.nuevaOpcion,
          [field]: value,
        };

        if (nuevaOpcion._errores?.includes(field)) {
          nuevaOpcion._errores = nuevaOpcion._errores.filter((f) => f !== field);
        }

        if (field === "core" && value !== "SI") {
          nuevaOpcion.precioCore = "";
        }

        if (field === "moneda") {
          nuevaOpcion.tipoCambio = value === "USD" ? (tipoCambioConfig ? String(tipoCambioConfig) : "") : "";
          nuevaOpcion._errores = nuevaOpcion._errores?.filter((f) => f !== "tipoCambio");
        }

        return {
          ...item,
          nuevaOpcion,
        };
      })
    );
  };


  // Obtenemos el nombre del usuario actual para registrar quién hizo las modificaciones
  const usuarioActual = (() => {
    try {
      const raw = localStorage.getItem("user");
      return raw ? JSON.parse(raw).name : "Desconocido";
    } catch {
      return "Desconocido";
    }
  })();

  const agregarOpcion = (index) => {
    setRefacciones((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;

        const op = item.nuevaOpcion || {};
        const precio = Number(op.precioUnitario || 0);
        const cant = Number(item.cant || 0);
        const tipoCambio = op.moneda === "USD" ? Number(op.tipoCambio || 0) : 1;

        const errores = [];
        if (!op.marca?.trim()) errores.push("marca");
        if (!op.proveedor?.trim()) errores.push("proveedor");
        if (precio <= 0) errores.push("precioUnitario");
        if (op.moneda === "USD" && tipoCambio <= 0) errores.push("tipoCambio");

        if (errores.length > 0) {
          return { ...item, nuevaOpcion: { ...op, _errores: errores } };
        }


        return {
          ...item,
          opciones: [
            ...(item.opciones || []),
            {
              unidad: op.unidad || "",
              tipo: op.tipo || "",
              marca: op.marca || "",
              proveedor: op.proveedor || "",
              codigo: op.codigo || "",
              precioUnitario: precio,
              tipoCambio: op.moneda === "USD" ? tipoCambio : 0,
              importeTotal: cant * precio * tipoCambio,
              moneda: op.moneda || "MN",
              tiempoEntrega: op.tiempoEntrega || "",
              core: op.core || "",
              precioCore: op.core === "SI" ? Number(op.precioCore || 0) : 0,
              observaciones: op.observaciones || "",
            },
          ],
          nuevaOpcion: {
            unidad: "",
            tipo: "",
            marca: "",
            proveedor: "",
            codigo: "",
            precioUnitario: "",
            moneda: "MN",
            tipoCambio: "",
            tiempoEntrega: "",
            core: "",
            precioCore: "",
            observaciones: "",
          },
        };
      })
    );
  };

  const eliminarOpcion = (refIndex, opIndex) => {
    setRefacciones((prev) =>
      prev.map((item, i) => {
        if (i !== refIndex) return item;

        return {
          ...item,
          opciones: (item.opciones || []).filter((_, idx) => idx !== opIndex),
        };
      })
    );
  };



  const validarRefacciones = () => {
    const sinOpciones = refacciones.some(
      (item) =>
        !String(item.refaccion || "").trim() ||
        Number(item.cant || 0) <= 0 ||
        !Array.isArray(item.opciones) ||
        item.opciones.length === 0
    );

    if (sinOpciones) {
      alert("Cada refacción solicitada debe tener al menos una opción cotizada.");
      return false;
    }

    return true;
  };


  const guardar = async (nuevoEstadoOrden) => {
    if (!validarRefacciones()) return;

    try {
      setSaving(true);

      const payload = {
        refacciones: refacciones.map((item) => ({
          ...item,
          cant: Number(item.cant || 0),
          opciones: (item.opciones || []).map((op) => ({
            ...op,
            precioUnitario: Number(op.precioUnitario || 0),
            tipoCambio: op.moneda === "USD" ? Number(op.tipoCambio || 0) : 0,
            importeTotal:
              Number(item.cant || 0) *
              Number(op.precioUnitario || 0) *
              (op.moneda === "USD" ? Number(op.tipoCambio || 0) : 1),
            precioCore: op.core === "SI" ? Number(op.precioCore || 0) : 0,
            moneda: op.moneda || "MN",
          })),
          estatus: item.estatus || "PENDIENTE",
        })),
      };

      if (nuevoEstadoOrden) {
        payload.estadoOrden = nuevoEstadoOrden;
        payload.devueltoPor = usuarioActual;
      }

      const res = await saveRequisicionDiagnostico(id, payload);
      setOrden(res.data?.vehiculo || orden);

      alert(
        nuevoEstadoOrden
          ? "Solicitud devuelta al asesor correctamente."
          : "Solicitud guardada correctamente."
      );

      if (nuevoEstadoOrden) {
        navigate("/refaccionaria/solicitudes-taller");
      }
    } catch (err) {
      console.error("Error guardando solicitud:", err);
      alert("Error al guardar la solicitud.");
    } finally {
      setSaving(false);
    }
  };

  const total = refacciones.reduce((sum, item) => {
    const totalOpciones = (item.opciones || []).reduce(
      (acc, op) => acc + Number(op.importeTotal || 0),
      0
    );

    return sum + totalOpciones;
  }, 0);


  if (loading) {
    return (
      <div className="container-fluid py-3">
        <div className="text-muted">Cargando solicitud...</div>
      </div>
    );
  }

  if (!orden) {
    return (
      <div className="container-fluid py-3">
        <div className="alert alert-warning">No se encontró la solicitud.</div>
      </div>
    );
  }

  const itemSeleccionado = refacciones[selectedIndex] ?? null;

  const opcionesAMostrar = filtroOpcion === null
    ? refacciones.flatMap((item, ri) =>
        (item.opciones || []).map((op, oi) => ({ ...op, _ri: ri, _oi: oi, _refaccion: item.refaccion, _cant: item.cant }))
      )
    : (refacciones[filtroOpcion]?.opciones || []).map((op, oi) => ({
        ...op, _ri: filtroOpcion, _oi: oi,
        _refaccion: refacciones[filtroOpcion].refaccion,
        _cant: refacciones[filtroOpcion].cant,
      }));

  return (
    <div className="container-fluid py-3 d-flex flex-column gap-3">

      {/* ── Sección 1: Información del vehículo ─────────────────────────── */}
      <div className="card">
        <div className="card-header fw-bold text-center py-2">
          ATENDER SOLICITUD DE REFACCIONES
        </div>
        <div className="card-body py-2">
          <div className="row g-2">
            <div className="col-6 col-md-3">
              <label className="form-label form-label-sm fw-semibold mb-1">Orden</label>
              <input className="form-control form-control-sm" value={orden.ordenServicio || ""} disabled />
            </div>
            <div className="col-6 col-md-3">
              <label className="form-label form-label-sm fw-semibold mb-1">Cliente</label>
              <input className="form-control form-control-sm" value={nombreCliente()} disabled />
            </div>
            <div className="col-6 col-md-3">
              <label className="form-label form-label-sm fw-semibold mb-1">Vehículo</label>
              <input className="form-control form-control-sm" value={descripcionVehiculo()} disabled />
            </div>
            <div className="col-6 col-md-3">
              <label className="form-label form-label-sm fw-semibold mb-1">Placas</label>
              <input className="form-control form-control-sm" value={orden.placas || ""} disabled />
            </div>
          </div>
          <div className="row g-2 mt-1">
            <div className="col-6 col-md-2">
              <label className="form-label form-label-sm fw-semibold mb-1">Color</label>
              <input className="form-control form-control-sm" value={orden.color || ""} disabled />
            </div>
            <div className="col-6 col-md-2">
              <label className="form-label form-label-sm fw-semibold mb-1">Serie</label>
              <input className="form-control form-control-sm" value={orden.serie || ""} disabled />
            </div>
            <div className="col-6 col-md-2">
              <label className="form-label form-label-sm fw-semibold mb-1">KMS/Millas</label>
              <input className="form-control form-control-sm" value={orden.kmsMillas || ""} disabled />
            </div>
            <div className="col-6 col-md-2">
              <label className="form-label form-label-sm fw-semibold mb-1">Motor</label>
              <input className="form-control form-control-sm" value={orden.motor || ""} disabled />
            </div>
            <div className="col-6 col-md-2">
              <label className="form-label form-label-sm fw-semibold mb-1">No. Económico</label>
              <input className="form-control form-control-sm" value={orden.numeroEconomico || ""} disabled />
            </div>
            <div className="col-6 col-md-2">
              <label className="form-label form-label-sm fw-semibold mb-1">Tracción</label>
              <input className="form-control form-control-sm" value={orden.traccion || ""} disabled />
            </div>
          </div>
        </div>
      </div>

      {/* ── Sección 2: Lista de solicitudes + Formulario de captura ──────── */}
      <div className="card">
        <div className="card-header fw-bold py-2">Cotizar refacciones</div>
        <div className="card-body p-0">
          <div className="row g-0" style={{ minHeight: 320 }}>

            {/* Columna izquierda: lista de refacciones solicitadas */}
            <div className="col-md-4 border-end d-flex flex-column">
              <div className="px-3 py-2 fw-semibold border-bottom bg-light small text-uppercase text-muted">
                Piezas solicitadas
              </div>
              <div style={{ overflowY: "auto", maxHeight: 420 }}>
                {refacciones.length === 0 ? (
                  <p className="text-muted text-center py-4 small">Sin refacciones solicitadas.</p>
                ) : (
                  <ul className="list-group list-group-flush">
                    {refacciones.map((item, index) => {
                      const numOpciones = (item.opciones || []).length;
                      const isActive = index === selectedIndex;
                      return (
                        <li
                          key={item._id || index}
                          className="list-group-item list-group-item-action d-flex justify-content-between align-items-start py-2 px-3"
                          style={{
                            cursor: "pointer",
                            backgroundColor: isActive ? "#d34b3f" : undefined,
                            borderColor: isActive ? "#d34b3f" : undefined,
                            color: isActive ? "#fff" : undefined,
                          }}
                          onClick={() => setSelectedIndex(index)}
                        >
                          <div>
                            <div className="fw-semibold">{item.refaccion || "Sin nombre"}</div>
                            <small className={isActive ? "text-white-50" : "text-muted"}>Cant: {item.cant}</small>
                          </div>
                          <span className={`badge rounded-pill ms-2 mt-1 ${numOpciones > 0 ? "bg-success" : "bg-secondary"}`}>
                            {numOpciones}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* Columna derecha: formulario de captura */}
            <div className="col-md-8 d-flex flex-column">
              <div className="px-3 py-2 fw-semibold border-bottom bg-light small text-uppercase text-muted">
                Cotizar opción
              </div>
              <div className="p-3">
              {!itemSeleccionado ? (
                <p className="text-muted small">Selecciona una refacción de la lista.</p>
              ) : (
                <>
                  <p className="fw-semibold mb-3 border-bottom pb-2">
                    Agregar opción para: <span className="text-primary">{itemSeleccionado.refaccion}</span>
                    <span className="text-muted ms-2 small">(Cant: {itemSeleccionado.cant})</span>
                  </p>
                  <div className="row g-2">
                    <div className="col-6 col-md-4">
                      <label className="form-label form-label-sm mb-1">Unidad</label>
                      <select
                        className="form-select form-select-sm"
                        value={itemSeleccionado.nuevaOpcion?.unidad || ""}
                        onChange={(e) => cambiarNuevaOpcion(selectedIndex, "unidad", e.target.value)}
                        disabled={unidades.length === 0 || itemSeleccionado.nuevaOpcion?._camposBloqueados?.includes("unidad")}
                      >
                        <option value="">—</option>
                        {unidades.map((u) => (
                          <option key={u._id} value={u.nombre}>{u.nombre}</option>
                        ))}
                      </select>
                    </div>

                    <div className="col-6 col-md-4">
                      <label className="form-label form-label-sm mb-1">Tipo</label>
                      <select
                        className="form-select form-select-sm"
                        value={itemSeleccionado.nuevaOpcion?.tipo || ""}
                        onChange={(e) => cambiarNuevaOpcion(selectedIndex, "tipo", e.target.value)}
                      >
                        <option value="">— Selec. —</option>
                        <option value="Original">Original</option>
                        <option value="Usado">Usado</option>
                        <option value="Generico">Genérico</option>
                        <option value="Alterna">Alterna</option>
                      </select>
                    </div>

                    <div className="col-6 col-md-4">
                      <label className="form-label form-label-sm mb-1">Marca <span className="text-danger">*</span></label>
                      <input
                        className={`form-control form-control-sm ${itemSeleccionado.nuevaOpcion?._errores?.includes("marca") ? "is-invalid" : ""}`}
                        placeholder="Ej. Bosch"
                        value={itemSeleccionado.nuevaOpcion?.marca || ""}
                        onChange={(e) => cambiarNuevaOpcion(selectedIndex, "marca", e.target.value)}
                        disabled={itemSeleccionado.nuevaOpcion?._camposBloqueados?.includes("marca")}
                      />
                    </div>

                    <div className="col-6 col-md-4">
                      <label className="form-label form-label-sm mb-1">Proveedor <span className="text-danger">*</span></label>
                      {itemSeleccionado.nuevaOpcion?.proveedor === "Almacén" ? (
                        <div className="d-flex align-items-center gap-2">
                          <span className="badge bg-success">Almacén</span>
                          <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm"
                            title="Cambiar proveedor"
                            onClick={() => cambiarNuevaOpcion(selectedIndex, "proveedor", "")}
                          >✕</button>
                        </div>
                      ) : (
                        <div className="d-flex align-items-center gap-1">
                          <input
                            className={`form-control form-control-sm ${itemSeleccionado.nuevaOpcion?._errores?.includes("proveedor") ? "is-invalid" : ""}`}
                            placeholder="Ej. Distribuidora XYZ"
                            value={itemSeleccionado.nuevaOpcion?.proveedor || ""}
                            onChange={(e) => cambiarNuevaOpcion(selectedIndex, "proveedor", e.target.value)}
                            disabled={itemSeleccionado.nuevaOpcion?._camposBloqueados?.includes("proveedor")}
                          />
                          <button
                            type="button"
                            className="btn btn-outline-success text-nowrap px-3"
                            title="Usar almacén como proveedor"
                            onClick={() => cambiarNuevaOpcion(selectedIndex, "proveedor", "Almacén")}
                          >Almacén</button>
                        </div>
                      )}
                    </div>

                    <div className="col-6 col-md-4">
                      <label className="form-label form-label-sm mb-1">Código</label>
                      {itemSeleccionado.nuevaOpcion?.proveedor === "Almacén" ? (
                        <div className="d-flex gap-1">
                          <input
                            className="form-control form-control-sm"
                            value={itemSeleccionado.nuevaOpcion?.codigo || ""}
                            readOnly
                            placeholder="Seleccionar del inventario..."
                            style={{ backgroundColor: "#f8f9fa" }}
                          />
                          <button
                            type="button"
                            className="btn btn-outline-primary btn-sm text-nowrap"
                            onClick={() => setModalInventarioOpen(true)}
                          >Buscar</button>
                        </div>
                      ) : (
                        <input
                          className="form-control form-control-sm"
                          placeholder="Ej. AZ-BJ-2345"
                          value={itemSeleccionado.nuevaOpcion?.codigo || ""}
                          onChange={(e) => cambiarNuevaOpcion(selectedIndex, "codigo", e.target.value)}
                        />
                      )}
                    </div>
                    <div className="col-6 col-md-4"></div>
                    <div className="col-6 col-md-2">
                      <label className="form-label form-label-sm mb-1">Precio unit. <span className="text-danger">*</span></label>
                      <input
                        type="number"
                        className={`form-control form-control-sm ${itemSeleccionado.nuevaOpcion?._errores?.includes("precioUnitario") ? "is-invalid" : ""}`}
                        placeholder="$0.00"
                        value={itemSeleccionado.nuevaOpcion?.precioUnitario || ""}
                        onChange={(e) => cambiarNuevaOpcion(selectedIndex, "precioUnitario", e.target.value)}
                      />
                    </div>
                    <div className="col-6 col-md-2">
                      <label className="form-label form-label-sm mb-1">Moneda</label>
                      <select
                        className="form-select form-select-sm"
                        value={itemSeleccionado.nuevaOpcion?.moneda || "MN"}
                        onChange={(e) => cambiarNuevaOpcion(selectedIndex, "moneda", e.target.value)}
                      >
                        <option value="MN">MN</option>
                        <option value="USD">USD</option>
                      </select>
                    </div>


                    {itemSeleccionado.nuevaOpcion?.moneda === "USD" && (
                      <div className="col-6 col-md-2">
                        <label className="form-label form-label-sm mb-1">Tipo cambio</label>
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          className={`form-control form-control-sm ${itemSeleccionado.nuevaOpcion?._errores?.includes("tipoCambio") ? "is-invalid" : ""}`}
                          placeholder="Ej. 17.25"
                          value={itemSeleccionado.nuevaOpcion?.tipoCambio || ""}
                          disabled
                          readOnly
                          title="Se toma del tipo de cambio definido en Configuración"
                        />
                        {!cargandoTipoCambio && !tipoCambioConfig && (
                          <small className="text-danger">
                            No hay un tipo de cambio configurado.
                          </small>
                        )}
                      </div>
                    )}

                    <div className="col-6 col-md-3">
                      <label className="form-label form-label-sm mb-1">Tiempo entrega</label>
                      <input
                        className="form-control form-control-sm"
                        placeholder="Ej. 2 días"
                        value={itemSeleccionado.nuevaOpcion?.tiempoEntrega || ""}
                        onChange={(e) => cambiarNuevaOpcion(selectedIndex, "tiempoEntrega", e.target.value)}
                      />
                    </div>

                    <div className="col-4 col-md-2">
                      <label className="form-label form-label-sm mb-1">Core</label>
                      <select
                        className="form-select form-select-sm"
                        value={itemSeleccionado.nuevaOpcion?.core || ""}
                        onChange={(e) => cambiarNuevaOpcion(selectedIndex, "core", e.target.value)}
                      >
                        <option value="">—</option>
                        <option value="SI">SI</option>
                        <option value="NO">NO</option>
                        <option value="N/A">N/A</option>
                      </select>
                    </div>

                    {itemSeleccionado.nuevaOpcion?.core === "SI" && (
                      <div className="col-4 col-md-2">
                        <label className="form-label form-label-sm mb-1">Precio core</label>
                        <input
                          type="number"
                          className="form-control form-control-sm"
                          placeholder="$0.00"
                          value={itemSeleccionado.nuevaOpcion?.precioCore || ""}
                          onChange={(e) => cambiarNuevaOpcion(selectedIndex, "precioCore", e.target.value)}
                        />
                      </div>
                    )}

                    <div className="col-12 col-md-5">
                      <label className="form-label form-label-sm mb-1">Observaciones</label>
                      <input
                        className="form-control form-control-sm"
                        placeholder="Notas adicionales..."
                        value={itemSeleccionado.nuevaOpcion?.observaciones || ""}
                        onChange={(e) => cambiarNuevaOpcion(selectedIndex, "observaciones", e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="d-flex justify-content-end mt-3">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm px-4"
                      onClick={() => agregarOpcion(selectedIndex)}
                    >
                      + Agregar opción
                    </button>
                  </div>
                </>
              )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Sección 3: Opciones cotizadas ───────────────────────────────── */}
      <div className="card">
        <div className="card-header py-2 d-flex align-items-center justify-content-between flex-wrap gap-2">
          <span className="fw-bold">Opciones cotizadas</span>
          <div className="d-flex align-items-center gap-2">
            <label className="form-label form-label-sm mb-0 text-muted">Filtrar:</label>
            <select
              className="form-select form-select-sm"
              style={{ width: "auto" }}
              value={filtroOpcion === null ? "" : String(filtroOpcion)}
              onChange={(e) => setFiltroOpcion(e.target.value === "" ? null : Number(e.target.value))}
            >
              <option value="">Todas las refacciones</option>
              {refacciones.map((item, i) => (
                <option key={i} value={i}>{item.refaccion}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-sm table-bordered table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th>Refacción</th>
                  <th>Cant</th>
                  <th>Tipo</th>
                  <th>Marca</th>
                  <th>Proveedor</th>
                  <th>Código</th>
                  <th>Unidad</th>
                  <th>Precio unit.</th>
                  <th>Importe</th>
                  <th>Moneda</th>
                  <th>T. cambio</th>
                  <th>T. entrega</th>
                  <th>Core</th>
                  <th>P. core</th>
                  <th>Observaciones</th>
                  <th style={{ width: 70 }}></th>
                </tr>
              </thead>
              <tbody>
                {opcionesAMostrar.length === 0 ? (
                  <tr>
                    <td colSpan={16} className="text-center text-muted py-3">
                      No hay opciones cotizadas aún.
                    </td>
                  </tr>
                ) : (
                  opcionesAMostrar.map((op, flatIdx) => (
                    <tr key={flatIdx}>
                      <td className="fw-semibold">{op._refaccion}</td>
                      <td>{op._cant}</td>
                      <td>{op.tipo || "—"}</td>
                      <td>{op.marca || "—"}</td>
                      <td>{op.proveedor || "—"}</td>
                      <td>{op.codigo || "—"}</td>
                      <td>{op.unidad || "—"}</td>
                      <td>${Number(op.precioUnitario || 0).toFixed(2)}</td>
                      <td>${Number(op.importeTotal || 0).toFixed(2)}</td>
                      <td>{op.moneda}</td>
                      <td>{op.moneda === "USD" ? Number(op.tipoCambio || 0).toFixed(2) : "—"}</td>
                      <td>{op.tiempoEntrega || "—"}</td>
                      <td>{op.core || "—"}</td>
                      <td>{op.core === "SI" ? `$${Number(op.precioCore || 0).toFixed(2)}` : "—"}</td>
                      <td>{op.observaciones || "—"}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm w-100"
                          onClick={() => eliminarOpcion(op._ri, op._oi)}
                        >
                          Borrar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={8} className="text-end fw-bold">Total estimado</td>
                  <td className="fw-bold">${total.toFixed(2)}</td>
                  <td colSpan={7}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* ── Acciones ─────────────────────────────────────────────────────── */}
      <div className="d-flex justify-content-end gap-2">
        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={() => navigate("/refaccionaria/solicitudes-taller")}
          disabled={saving}
        >
          Regresar
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => guardar()}
          disabled={saving}
        >
          {saving ? "Guardando..." : "Guardar"}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => guardar("PENDIENTE_AUTORIZACION_CLIENTE")}
          disabled={saving || refacciones.length === 0}
        >
          Devolver a asesor
        </button>
      </div>

      {modalCodigoIndex !== null && (
        <ModalSeleccionarCodigo
          onSelect={seleccionarCodigo}
          onClose={() => setModalCodigoIndex(null)}
        />
      )}
      {modalInventarioOpen && (
        <ModalInventarioAlmacen
          onSelect={seleccionarDeAlmacen}
          onClose={() => setModalInventarioOpen(false)}
        />
      )}
    </div>
  );
}
