import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getVehiculoById,
  saveRequisicionDiagnostico,
} from "../../api/vehiculos";
import { getUnidadesMedida } from "../../api/configuracion";

const API = process.env.REACT_APP_API_URL || "http://localhost:4000/api";

// ─── Modal selección de código ────────────────────────────────────────────────
function ModalSeleccionarCodigo({ onSelect, onClose }) {
  const [codigos, setCodigos]   = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    // Migración silenciosa: rellena proveedores de códigos usando historial de entradas
    fetch(`${API}/entradas/migrate-codigos-proveedor`, { method: "POST", credentials: "include" })
      .catch(() => {})
      .finally(() => {
        fetch(`${API}/codigos`, { credentials: "include" })
          .then((r) => r.json())
          .then((j) => setCodigos(j?.data || j || []))
          .catch(() => setCodigos([]))
          .finally(() => setCargando(false));
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
          zIndex: 1050, width: "90%", maxWidth: 720, maxHeight: "80vh",
          background: "white", borderRadius: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        <div className="d-flex justify-content-between align-items-center p-3 border-bottom">
          <h5 className="mb-0">Seleccionar Código</h5>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", lineHeight: 1 }}
          >×</button>
        </div>

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
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => (
                  <tr key={c._id} style={{ cursor: "pointer" }} onClick={() => onSelect(c)}>
                    <td>{c.numeroParte || c.codigo || "—"}</td>
                    <td>{c.descripcion || "—"}</td>
                    <td>{c.proveedor   || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="p-3 border-top d-flex justify-content-end">
          <button className="btn btn-outline-secondary" onClick={onClose}>Cancelar</button>
        </div>
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
    setRefacciones((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        return {
          ...item,
          nuevaOpcion: {
            ...item.nuevaOpcion,
            codigo:         codigo.numeroParte || codigo.codigo || "",
            proveedor:      codigo.proveedor   || item.nuevaOpcion?.proveedor || "",
            marca:          codigo.marca        || item.nuevaOpcion?.marca     || "",
            unidad:         codigo.unidad       || item.nuevaOpcion?.unidad    || "",
            precioUnitario: codigo.precioUnitario != null && codigo.precioUnitario !== ""
                              ? String(codigo.precioUnitario)
                              : item.nuevaOpcion?.precioUnitario || "",
          },
        };
      })
    );
    setModalCodigoIndex(null);
  };

  const cambiarNuevaOpcion = (index, field, value) => {
    setRefacciones((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;

        const nuevaOpcion = {
          ...item.nuevaOpcion,
          [field]: value,
        };

        if (field === "core" && value !== "SI") {
          nuevaOpcion.precioCore = "";
        }

        if (field === "moneda" && value !== "USD") {
          nuevaOpcion.tipoCambio = "";
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

        if (!op.marca?.trim() || !op.proveedor?.trim() || precio <= 0) {
          alert("Captura al menos marca, proveedor y precio.");
          return item;
        }

        if (op.moneda === "USD" && tipoCambio <= 0) {
          alert("Captura el tipo de cambio para opciones en USD.");
          return item;
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

  return (
    <div className="container-fluid py-3">
      <div className="card">
        <div className="card-header fw-bold text-center">
          ATENDER SOLICITUD DE REFACCIONES
        </div>

        <div className="card-body">
          <div className="row g-2 mb-3">
            <div className="col-md-3">
              <label className="form-label fw-semibold">Orden</label>
              <input
                className="form-control form-control-sm"
                value={orden.ordenServicio || ""}
                disabled
              />
            </div>

            <div className="col-md-3">
              <label className="form-label fw-semibold">Cliente</label>
              <input
                className="form-control form-control-sm"
                value={nombreCliente()}
                disabled
              />
            </div>

            <div className="col-md-3">
              <label className="form-label fw-semibold">Vehículo</label>
              <input
                className="form-control form-control-sm"
                value={descripcionVehiculo()}
                disabled
              />
            </div>

            <div className="col-md-3">
              <label className="form-label fw-semibold">Placas</label>
              <input
                className="form-control form-control-sm"
                value={orden.placas || ""}
                disabled
              />
            </div>
          </div>

          <div className="table-responsive">
            <table className="table table-sm table-bordered align-middle">
              <thead className="table-light">
                <tr>
                    <th style={{ width: "70px" }}>Cant</th>
                    <th style={{ width: "90px" }}>Unidad</th>
                    <th>Refacción</th>
                    <th style={{ width: "120px" }}>Tipo</th>
                    <th>Marca</th>
                    <th>Proveedor</th>
                    <th>Código</th>
                    <th style={{ width: "130px" }}>Precio Unitario</th>
                    <th style={{ width: "120px" }}>Importe</th>
                    <th style={{ width: "90px" }}>Moneda</th>
                    <th style={{ width: "120px" }}>Tipo Cambio</th>
                    <th style={{ width: "130px" }}>Tiempo Entrega</th>
                    <th style={{ width: "100px" }}>Core</th>
                    <th style={{ width: "120px" }}>Precio Core</th>
                    <th>Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {refacciones.length === 0 && (
                  <tr>
                    <td colSpan={15} className="text-center text-muted">
                      No hay refacciones solicitadas.
                    </td>
                  </tr>
                )}

                {refacciones.map((item, index) => (
                  <React.Fragment key={item._id || index}>
                    <tr className="table-secondary">
                      <td colSpan={15}>
                        <strong>Solicitud:</strong> {item.refaccion} |
                        <strong className="ms-2">Cantidad:</strong> {item.cant}
                      </td>
                    </tr>

                    {(item.opciones || []).map((op, opIndex) => (
                      <tr key={opIndex}>
                        <td>{item.cant}</td>
                        <td>{op.unidad}</td>
                        <td>{item.refaccion}</td>
                        <td>{op.tipo}</td>
                        <td>{op.marca}</td>
                        <td>{op.proveedor}</td>
                        <td>{op.codigo}</td>
                        <td>${Number(op.precioUnitario || 0).toFixed(2)}</td>
                        <td>${Number(op.importeTotal || 0).toFixed(2)}</td>
                        <td>{op.moneda}</td>
                        <td>
                          {op.moneda === "USD" ? Number(op.tipoCambio || 0).toFixed(2) : "-"}
                        </td>
                        <td>{op.tiempoEntrega}</td>
                        <td>{op.core}</td>
                        <td>
                          {op.core === "SI" ? `$${Number(op.precioCore || 0).toFixed(2)}` : "-"}
                        </td>

                        <td>
                          <div className="d-flex gap-2">
                            <span>{op.observaciones}</span>
                            <button
                              type="button"
                              className="btn btn-outline-danger btn-sm ms-auto"
                              onClick={() => eliminarOpcion(index, opIndex)}
                            >
                              Borrar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    <tr className="table-info">
                      <td>{item.cant}</td>
                      <td>
                        <select
                          className="form-select form-select-sm"
                          value={item.nuevaOpcion?.unidad || ""}
                          onChange={(e) => cambiarNuevaOpcion(index, "unidad", e.target.value)}
                          disabled={unidades.length === 0}
                        >
                          {unidades.length === 0
                            ? <option value="">Sin unidades</option>
                            : <>
                                <option value="">-</option>
                                {unidades.map(u => (
                                  <option key={u._id} value={u.nombre}>{u.nombre}</option>
                                ))}
                              </>
                          }
                        </select>
                      </td>
                      <td>{item.refaccion}</td>
                      <td>
                        <select
                          className="form-select form-select-sm"
                          value={item.nuevaOpcion?.tipo || ""}
                          onChange={(e) => cambiarNuevaOpcion(index, "tipo", e.target.value)}
                        >
                          <option value="">Selec.</option>
                          <option value="Original">Original</option>
                          <option value="Usado">Usado</option>
                          <option value="Generico">Genérico</option>
                          <option value="Alterna">Alterna</option>
                        </select>
                      </td>
                      <td>
                        <input
                          className="form-control form-control-sm"
                          value={item.nuevaOpcion?.marca || ""}
                          onChange={(e) => cambiarNuevaOpcion(index, "marca", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="form-control form-control-sm"
                          value={item.nuevaOpcion?.proveedor || ""}
                          onChange={(e) => cambiarNuevaOpcion(index, "proveedor", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="form-control form-control-sm"
                          value={item.nuevaOpcion?.codigo || ""}
                          readOnly
                          placeholder="Clic para seleccionar..."
                          style={{ cursor: "pointer", backgroundColor: "#fff" }}
                          onClick={() => setModalCodigoIndex(index)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="form-control form-control-sm"
                          value={item.nuevaOpcion?.precioUnitario || ""}
                          onChange={(e) =>
                            cambiarNuevaOpcion(index, "precioUnitario", e.target.value)
                          }
                        />
                      </td>
                      <td></td>
                      <td>
                        <select
                          className="form-select form-select-sm"
                          value={item.nuevaOpcion?.moneda || "MN"}
                          onChange={(e) => cambiarNuevaOpcion(index, "moneda", e.target.value)}
                        >
                          <option value="MN">MN</option>
                          <option value="USD">USD</option>
                        </select>
                      </td>
                      
                      <td>
                        {item.nuevaOpcion?.moneda === "USD" ? (
                          <input
                            type="number"
                            min="0"
                            step="0.0001"
                            className="form-control form-control-sm"
                            value={item.nuevaOpcion?.tipoCambio || ""}
                            onChange={(e) =>
                              cambiarNuevaOpcion(index, "tipoCambio", e.target.value)
                            }
                            placeholder="Ej. 17.25"
                          />
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>


                      <td>
                        <input
                          className="form-control form-control-sm"
                          value={item.nuevaOpcion?.tiempoEntrega || ""}
                          onChange={(e) =>
                            cambiarNuevaOpcion(index, "tiempoEntrega", e.target.value)
                          }
                        />
                      </td>
                      <td>
                        <select
                          className="form-select form-select-sm"
                          value={item.nuevaOpcion?.core || ""}
                          onChange={(e) => cambiarNuevaOpcion(index, "core", e.target.value)}
                        >
                          <option value="">Sel.</option>
                          <option value="SI">SI</option>
                          <option value="NO">NO</option>
                          <option value="N/A">N/A</option>
                        </select>
                      </td>
                      <td>
                        {item.nuevaOpcion?.core === "SI" ? (
                          <input
                            type="number"
                            className="form-control form-control-sm"
                            value={item.nuevaOpcion?.precioCore || ""}
                            onChange={(e) =>
                              cambiarNuevaOpcion(index, "precioCore", e.target.value)
                            }
                          />
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      <td>
                        <div className="d-flex gap-2">
                          <input
                            className="form-control form-control-sm"
                            value={item.nuevaOpcion?.observaciones || ""}
                            onChange={(e) =>
                              cambiarNuevaOpcion(index, "observaciones", e.target.value)
                            }
                          />
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => agregarOpcion(index)}
                          >
                            +
                          </button>
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                ))}

              </tbody>

              <tfoot>
                <tr>
                  <td colSpan={8} className="text-end fw-bold">
                    Total
                  </td>
                  <td className="text-end fw-bold">
                    ${total.toFixed(2)}
                  </td>
                  <td colSpan={6}></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="d-flex justify-content-end gap-2 mt-3">
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
        </div>
      </div>
      {modalCodigoIndex !== null && (
        <ModalSeleccionarCodigo
          onSelect={seleccionarCodigo}
          onClose={() => setModalCodigoIndex(null)}
        />
      )}
    </div>
  );
}
