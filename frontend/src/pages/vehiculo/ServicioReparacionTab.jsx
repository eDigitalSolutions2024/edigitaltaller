// src/pages/vehiculo/ServicioReparacionTab.jsx
import React, { useEffect, useRef, useState } from "react";
import { updateServicioReparacion, saveRequisicionDiagnostico, omitirRefacciones } from "../../api/vehiculos";
import { fetchServiciosTaller } from "../../api/codigos";
import http from "../../api/http";

// Etiquetas legibles por grupo
const GRUPO_LABELS = {
  motor: "Mantenimiento del motor",
  lubricacion: "Lubricación",
  revision: "Revisión",
  otros: "Otros servicios",
};

const GRUPO_ORDER = ["motor", "lubricacion", "revision", "otros"];

const emptyForm = {
  serviciosSeleccionados: [],
  fallasReportadasCliente: "",
  infoLlantas: "",
  revisionFallas: "",
  fallasMotorOtros: "",
  sistemaElectricoAire: "",
  suspensionDireccionFrenos: "",
  sistemaEnfriamiento: "",
};

const PDF_SECTIONS = [
  { label: "Fallas de motor y otros",                textKey: "fallasMotorOtros" },
  { label: "Sistema eléctrico y aire acondicionado", textKey: "sistemaElectricoAire" },
  { label: "Suspensión, dirección y frenos",         textKey: "suspensionDireccionFrenos" },
  { label: "Sistema de enfriamiento",                textKey: "sistemaEnfriamiento" },
];

export default function ServicioReparacionTab({ ordenId, initialData, existingRefacciones = [], onSaved, readOnly = false, sinVehiculo = false }) {
  const [form, setForm] = useState(emptyForm);
  const [activePdf, setActivePdf] = useState({
    fallasMotorOtros: false,
    sistemaElectricoAire: false,
    suspensionDireccionFrenos: false,
    sistemaEnfriamiento: false,
  });

  // Catálogo de servicios desde BD Códigos
  const [catalogoServicios, setCatalogoServicios] = useState([]);
  const [cargandoServicios, setCargandoServicios] = useState(false);

  // Modal de solicitud de refacciones
  const [showModal, setShowModal] = useState(false);
  const [refacciones, setRefacciones] = useState([{ refaccion: "", cantidad: 1 }]);
  const [guardandoRefacciones, setGuardandoRefacciones] = useState(false);

  // Modal de omitir refacciones (continuar solo con servicios)
  const [showOmitirModal, setShowOmitirModal] = useState(false);
  const [serviciosOmitir, setServiciosOmitir] = useState([{ concepto: "", cantidad: 1 }]);
  const [guardandoOmitir, setGuardandoOmitir] = useState(false);

  // Mano de obra opcional dentro del modal de omitir
  const emptyMoLinea = {
    concepto: "",
    mecanico: "",
    horas: "",
    fechaPago: "",
    observaciones: "",
    esCarroceria: false,
    carrocero: "",
  };
  const [manoObraOmitir, setManoObraOmitir] = useState([]);
  const [mecanicos, setMecanicos] = useState([]);
  const [carroceros, setCarroceros] = useState([]);

  // Cargar datos existentes de la orden
  useEffect(() => {
    if (initialData) {
      setForm({
        serviciosSeleccionados: initialData.serviciosSeleccionados || [],
        fallasReportadasCliente: initialData.fallasReportadasCliente || "",
        infoLlantas: initialData.infoLlantas || "",
        revisionFallas: initialData.revisionFallas || "",
        fallasMotorOtros: initialData.fallasMotorOtros || "",
        sistemaElectricoAire: initialData.sistemaElectricoAire || "",
        suspensionDireccionFrenos: initialData.suspensionDireccionFrenos || "",
        sistemaEnfriamiento: initialData.sistemaEnfriamiento || "",
      });
      setActivePdf({
        fallasMotorOtros: !!initialData.fallasMotorOtros,
        sistemaElectricoAire: !!initialData.sistemaElectricoAire,
        suspensionDireccionFrenos: !!initialData.suspensionDireccionFrenos,
        sistemaEnfriamiento: !!initialData.sistemaEnfriamiento,
      });
    }
  }, [initialData]);

  // Cargar catálogo de servicios
  useEffect(() => {
    const cargar = async () => {
      try {
        setCargandoServicios(true);
        const servicios = await fetchServiciosTaller();
        setCatalogoServicios(servicios);
      } catch (err) {
        console.error("Error cargando servicios:", err);
      } finally {
        setCargandoServicios(false);
      }
    };
    cargar();
  }, []);

  // Cargar mecánicos y carroceros (para la mano de obra del modal de omitir)
  useEffect(() => {
    const cargarEmpleados = async () => {
      try {
        const [resMec, resCar] = await Promise.all([
          http.get("/empleados?puesto=mecanico&activo=true"),
          http.get("/empleados?puesto=carrocero&activo=true"),
        ]);
        setMecanicos(resMec.data || []);
        setCarroceros(resCar.data || []);
      } catch (err) {
        console.error("Error cargando empleados:", err);
      }
    };
    cargarEmpleados();
  }, []);

  // Agrupar servicios por grupoServicio
  const serviciosPorGrupo = GRUPO_ORDER.reduce((acc, grupo) => {
    const items = catalogoServicios.filter(
      (s) => (s.grupoServicio || "otros") === grupo
    );
    if (items.length > 0) acc[grupo] = items;
    return acc;
  }, {});

  const toggleServicio = (codigo) => {
    setForm((prev) => {
      const yaEsta = prev.serviciosSeleccionados.includes(codigo);
      return {
        ...prev,
        serviciosSeleccionados: yaEsta
          ? prev.serviciosSeleccionados.filter((c) => c !== codigo)
          : [...prev.serviciosSeleccionados, codigo],
      };
    });
  };

  // ===== Auto-guardado =====
  const [autoSaveStatus, setAutoSaveStatus] = useState(null); // null | 'saving' | 'saved'
  const autoSaveTimerRef = useRef(null);
  const isFirstRenderRef = useRef(true);

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    if (!ordenId || readOnly) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        setAutoSaveStatus("saving");
        await updateServicioReparacion(ordenId, form);
        setAutoSaveStatus("saved");
        setTimeout(() => setAutoSaveStatus(null), 2000);
      } catch (err) {
        console.error(err);
        setAutoSaveStatus(null);
      }
    }, 1500);

    return () => clearTimeout(autoSaveTimerRef.current);
  }, [form, ordenId, readOnly]);

  // ===== Solicitud de refacciones =====
  const agregarRefaccion = () =>
    setRefacciones((prev) => [...prev, { refaccion: "", cantidad: 1 }]);

  const eliminarRefaccion = (idx) =>
    setRefacciones((prev) => prev.filter((_, i) => i !== idx));

  const cambiarRefaccion = (idx, field, value) =>
    setRefacciones((prev) =>
      prev.map((item, i) =>
        i === idx
          ? { ...item, [field]: field === "cantidad" ? Number(value || 0) : value }
          : item
      )
    );

  const handleEnviarRefacciones = async () => {
    if (!ordenId) return;

    const validas = refacciones
      .filter((r) => r.refaccion.trim() && Number(r.cantidad) > 0)
      .map((r) => ({
        refaccion: r.refaccion.trim(),
        cant: Number(r.cantidad),
        precioUnitario: 0,
        importeTotal: 0,
        estatus: "PENDIENTE",
        requiereOC: false,
        ocGenerada: false,
        opciones: [],
        opcionSeleccionada: null,
      }));

    if (validas.length === 0) {
      alert("Agrega al menos una refacción con cantidad.");
      return;
    }

    try {
      setGuardandoRefacciones(true);

      // 1. Guardar el servicio primero
      await updateServicioReparacion(ordenId, form);

      // 2. Conservar todas las existentes y agregar las nuevas al final
      const res = await saveRequisicionDiagnostico(ordenId, {
        refacciones: [...existingRefacciones, ...validas],
        estadoOrden: "PENDIENTE_REFACCIONARIA",
      });

      alert("Refacciones enviadas a refaccionaria correctamente.");
      setShowModal(false);
      setRefacciones([{ refaccion: "", cantidad: 1 }]);

      if (onSaved && res?.data?.vehiculo) {
        onSaved(res.data.vehiculo);
      }
    } catch (err) {
      console.error(err);
      alert("Error al enviar las refacciones.");
    } finally {
      setGuardandoRefacciones(false);
    }
  };

  // ===== Omitir refacciones (continuar solo con servicios) =====
  const agregarServicioOmitir = () =>
    setServiciosOmitir((prev) => [...prev, { concepto: "", cantidad: 1 }]);

  const eliminarServicioOmitir = (idx) =>
    setServiciosOmitir((prev) => prev.filter((_, i) => i !== idx));

  const cambiarServicioOmitir = (idx, field, value) =>
    setServiciosOmitir((prev) =>
      prev.map((item, i) =>
        i === idx
          ? { ...item, [field]: field === "cantidad" ? Number(value || 0) : value }
          : item
      )
    );

  const agregarMoOmitir = () =>
    setManoObraOmitir((prev) => [...prev, { ...emptyMoLinea }]);

  const eliminarMoOmitir = (idx) =>
    setManoObraOmitir((prev) => prev.filter((_, i) => i !== idx));

  const cambiarMoOmitir = (idx, field, value) =>
    setManoObraOmitir((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const updates = { [field]: value };
        // Al cambiar el tipo (carrocería/mecánico) limpiar el selector del otro
        if (field === "esCarroceria") {
          updates.mecanico = "";
          updates.carrocero = "";
        }
        return { ...item, ...updates };
      })
    );

  const handleOmitirRefacciones = async () => {
    if (!ordenId) return;
    const validos = serviciosOmitir
      .filter((s) => s.concepto.trim() && Number(s.cantidad) > 0)
      .map((s) => ({ concepto: s.concepto.trim(), cant: Number(s.cantidad) }));

    if (validos.length === 0) {
      alert("Agrega al menos un servicio a realizar.");
      return;
    }

    // Mano de obra opcional: si una fila tiene datos, exige el concepto
    const moIncompleta = manoObraOmitir.some(
      (m) =>
        !m.concepto.trim() &&
        (m.mecanico || m.carrocero || m.horas || m.fechaPago || m.observaciones)
    );
    if (moIncompleta) {
      alert("En mano de obra captura al menos el concepto/servicio.");
      return;
    }

    const moValidas = manoObraOmitir
      .filter((m) => m.concepto.trim())
      .map((m) => ({
        concepto: m.concepto.trim(),
        mecanico: m.esCarroceria ? "" : m.mecanico,
        carrocero: m.esCarroceria ? m.carrocero : "",
        esCarroceria: !!m.esCarroceria,
        horas: Number(m.horas) || 0,
        fechaPago: m.fechaPago || "",
        observaciones: m.observaciones || "",
      }));

    try {
      setGuardandoOmitir(true);

      // 1. Guardar el servicio primero
      await updateServicioReparacion(ordenId, form);

      // 2. Registrar los servicios y avanzar la orden sin pasar por refaccionaria
      const res = await omitirRefacciones(ordenId, {
        servicios: validos,
        manoObra: moValidas,
      });

      alert(
        "Servicios registrados. La orden continúa directo a presupuesto sin pasar por refaccionaria."
      );
      setShowOmitirModal(false);
      setServiciosOmitir([{ concepto: "", cantidad: 1 }]);
      setManoObraOmitir([]);

      if (onSaved && res?.data?.vehiculo) {
        onSaved(res.data.vehiculo);
      }
    } catch (err) {
      console.error(err);
      alert("Error al omitir las refacciones.");
    } finally {
      setGuardandoOmitir(false);
    }
  };

  return (
    <>
      <div>
        <div className="card">
          <div className="card-header fw-bold text-center bg-light">
            SERVICIO O REPARACIÓN
          </div>

          <div className="card-body">

            {/* ===== SERVICIOS DESDE BD CÓDIGOS ===== */}
            {!sinVehiculo && (
            <>
            <div className="mb-4">
              <h6 className="fw-bold text-uppercase mb-3 border-bottom pb-2">
                Servicios realizados
              </h6>

              {cargandoServicios && (
                <p className="text-muted">Cargando servicios...</p>
              )}

              {!cargandoServicios && catalogoServicios.length === 0 && (
                <div className="alert alert-warning py-2">
                  No hay servicios dados de alta en BD de Códigos. Da de alta
                  servicios en el módulo <strong>Refaccionaria → BD Códigos</strong>.
                </div>
              )}

              {!cargandoServicios &&
                Object.entries(serviciosPorGrupo).map(([grupo, items]) => (
                  <div key={grupo} className="mb-3">
                    <p className="text-muted small fw-semibold text-uppercase mb-2">
                      {GRUPO_LABELS[grupo] || grupo}
                    </p>
                    <div className="d-flex flex-wrap gap-2">
                      {items.map((srv) => {
                        const activo = form.serviciosSeleccionados.includes(srv.codigo);
                        return (
                          <button
                            key={srv._id || srv.codigo}
                            type="button"
                            onClick={() => !readOnly && toggleServicio(srv.codigo)}
                            disabled={readOnly}
                            className={
                              "btn btn-sm " +
                              (activo
                                ? "btn-primary"
                                : "btn-outline-secondary")
                            }
                            title={srv.descripcion}
                          >
                            <span>{srv.descripcion || srv.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

              {/* Resumen de seleccionados */}
              {form.serviciosSeleccionados.length > 0 && (
                <div className="mt-2 p-2 bg-light rounded border">
                  <small className="text-muted fw-semibold">
                    Seleccionados:{" "}
                  </small>
                  {form.serviciosSeleccionados.map((codigo) => {
                    const srv = catalogoServicios.find((s) => s.codigo === codigo);
                    return (
                      <span key={codigo} className="badge bg-primary me-1">
                        {codigo}
                        {srv ? ` - ${srv.descripcion}` : ""}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ===== FALLAS REPORTADAS POR EL CLIENTE ===== */}
            <div className="mb-4">
              <h6 className="fw-bold text-uppercase mb-2 border-bottom pb-2">
                Fallas reportadas por el cliente
              </h6>
              <textarea
                className="form-control"
                rows={4}
                placeholder="Describe las fallas o síntomas que reportó el cliente..."
                value={form.fallasReportadasCliente}
                readOnly={readOnly}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    fallasReportadasCliente: e.target.value,
                  }))
                }
              />
            </div>

            {/* ===== INFORMACIÓN DE LLANTAS ===== */}
            <div className="mb-4">
              <h6 className="fw-bold text-uppercase mb-2 border-bottom pb-2">
                Información de llantas
              </h6>
              <textarea
                className="form-control"
                rows={2}
                placeholder="Estado de las llantas, medidas, observaciones..."
                value={form.infoLlantas}
                readOnly={readOnly}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, infoLlantas: e.target.value }))
                }
              />
            </div>
            </>
            )}

            {/* ===== OBSERVACIONES GENERALES ===== */}
            <div className="mb-4">
              <h6 className="fw-bold text-uppercase mb-2 border-bottom pb-2">
                Observaciones generales
              </h6>
              <textarea
                className="form-control"
                rows={3}
                placeholder="Observaciones adicionales sobre el servicio o reparación..."
                value={form.revisionFallas}
                readOnly={readOnly}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, revisionFallas: e.target.value }))
                }
              />
            </div>

            {/* ===== CAMPOS PARA EL PDF OPERATIVO ===== */}
            {!sinVehiculo && PDF_SECTIONS.map(({ label, textKey }) => (
              <div className="mb-3" key={textKey}>
                <div className="form-check border-bottom pb-2 mb-2">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id={`chk-${textKey}`}
                    checked={activePdf[textKey]}
                    disabled={readOnly}
                    onChange={(e) =>
                      setActivePdf((prev) => ({ ...prev, [textKey]: e.target.checked }))
                    }
                  />
                  <label
                    className="form-check-label fw-bold text-uppercase"
                    htmlFor={`chk-${textKey}`}
                  >
                    {label}
                  </label>
                </div>
                {activePdf[textKey] && (
                  <textarea
                    className="form-control"
                    rows={3}
                    value={form[textKey]}
                    readOnly={readOnly}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, [textKey]: e.target.value }))
                    }
                  />
                )}
              </div>
            ))}

            {/* ===== BOTONES ===== */}
            {!readOnly && (
              <div className="d-flex justify-content-end align-items-center gap-3">
                {autoSaveStatus === "saving" && (
                  <small className="text-muted">Guardando...</small>
                )}
                {autoSaveStatus === "saved" && (
                  <small className="text-success">Guardado</small>
                )}
                <button
                  type="button"
                  className="btn btn-outline-secondary px-4"
                  onClick={() => setShowOmitirModal(true)}
                  title="La orden no pasará por refaccionaria; captura los servicios a realizar"
                >
                  Continuar sin refacciones →
                </button>
                <button
                  type="button"
                  className="btn btn-primary px-5"
                  onClick={() => setShowModal(true)}
                >
                  Solicitar refacciones a refaccionaria →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== MODAL SOLICITUD DE REFACCIONES ===== */}
      {showModal && (
        <div
          className="modal fade show"
          style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
          tabIndex="-1"
        >
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title fw-bold">
                  Solicitar refacciones a refaccionaria
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowModal(false)}
                  disabled={guardandoRefacciones}
                />
              </div>

              <div className="modal-body">
                <p className="text-muted small mb-3">
                  Indica las refacciones que necesita el vehículo. El
                  refaccionario recibirá esta solicitud y cotizará las opciones.
                </p>

                <table className="table table-sm table-bordered align-middle">
                  <thead className="table-light">
                    <tr>
                      <th>Refacción / Descripción</th>
                      <th style={{ width: "120px" }}>Cantidad</th>
                      <th style={{ width: "50px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {refacciones.map((item, idx) => (
                      <tr key={idx}>
                        <td>
                          <input
                            className="form-control form-control-sm"
                            value={item.refaccion}
                            onChange={(e) =>
                              cambiarRefaccion(idx, "refaccion", e.target.value)
                            }
                            placeholder="Ej. Filtro de aceite, Balatas delanteras..."
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="1"
                            className="form-control form-control-sm"
                            value={item.cantidad}
                            onChange={(e) =>
                              cambiarRefaccion(idx, "cantidad", e.target.value)
                            }
                          />
                        </td>
                        <td className="text-center">
                          <button
                            type="button"
                            className="btn btn-outline-danger btn-sm"
                            onClick={() => eliminarRefaccion(idx)}
                            disabled={refacciones.length === 1}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={agregarRefaccion}
                >
                  + Agregar refacción
                </button>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                  disabled={guardandoRefacciones}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleEnviarRefacciones}
                  disabled={guardandoRefacciones}
                >
                  {guardandoRefacciones
                    ? "Enviando..."
                    : "Enviar a refaccionaria"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL OMITIR REFACCIONES ===== */}
      {showOmitirModal && (
        <div
          className="modal fade show"
          style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
          tabIndex="-1"
        >
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title fw-bold">
                  Continuar sin refacciones
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowOmitirModal(false)}
                  disabled={guardandoOmitir}
                />
              </div>

              <div className="modal-body">
                <div className="alert alert-info py-2 small">
                  La orden <strong>no pasará por refaccionaria</strong>. Los
                  servicios que captures aquí aparecerán como partidas del
                  presupuesto para cotizarlos al cliente. Si más adelante
                  necesitas piezas, podrás solicitarlas desde esta misma
                  pestaña.
                </div>

                <table className="table table-sm table-bordered align-middle">
                  <thead className="table-light">
                    <tr>
                      <th>Servicio a realizar</th>
                      <th style={{ width: "120px" }}>Cantidad</th>
                      <th style={{ width: "50px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {serviciosOmitir.map((item, idx) => (
                      <tr key={idx}>
                        <td>
                          <input
                            className="form-control form-control-sm"
                            value={item.concepto}
                            onChange={(e) =>
                              cambiarServicioOmitir(idx, "concepto", e.target.value)
                            }
                            placeholder="Ej. Alineación y balanceo, Diagnóstico eléctrico..."
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="1"
                            className="form-control form-control-sm"
                            value={item.cantidad}
                            onChange={(e) =>
                              cambiarServicioOmitir(idx, "cantidad", e.target.value)
                            }
                          />
                        </td>
                        <td className="text-center">
                          <button
                            type="button"
                            className="btn btn-outline-danger btn-sm"
                            onClick={() => eliminarServicioOmitir(idx)}
                            disabled={serviciosOmitir.length === 1}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={agregarServicioOmitir}
                >
                  + Agregar servicio
                </button>

                {/* ===== MANO DE OBRA (OPCIONAL) ===== */}
                <hr className="my-3" />
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <h6 className="fw-bold text-uppercase mb-0">
                    Mano de obra{" "}
                    <span className="text-muted fw-normal small">(opcional)</span>
                  </h6>
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={agregarMoOmitir}
                  >
                    + Agregar mano de obra
                  </button>
                </div>

                {manoObraOmitir.length === 0 && (
                  <p className="text-muted small mb-0">
                    Si el trabajo requiere mano de obra, agrégala aquí; quedará
                    registrada en la orden igual que en Requisición y Diagnóstico.
                  </p>
                )}

                {manoObraOmitir.map((m, idx) => (
                  <div key={idx} className="border rounded p-2 mb-2 bg-light">
                    <div className="row g-2 mb-2">
                      <div className="col-md-5">
                        <label className="form-label form-label-sm mb-1">
                          Reparación / Servicio
                        </label>
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          placeholder="Concepto o servicio..."
                          value={m.concepto}
                          onChange={(e) =>
                            cambiarMoOmitir(idx, "concepto", e.target.value)
                          }
                        />
                      </div>
                      <div className="col-md-3">
                        <label className="form-label form-label-sm mb-1">
                          {m.esCarroceria ? "Carrocero" : "Mecánico"}
                        </label>
                        {m.esCarroceria ? (
                          <select
                            className="form-select form-select-sm"
                            value={m.carrocero}
                            onChange={(e) =>
                              cambiarMoOmitir(idx, "carrocero", e.target.value)
                            }
                          >
                            <option value="">-- Seleccionar carrocero --</option>
                            {carroceros.map((c) => (
                              <option key={c._id} value={c._id}>{c.nombre}</option>
                            ))}
                          </select>
                        ) : (
                          <select
                            className="form-select form-select-sm"
                            value={m.mecanico}
                            onChange={(e) =>
                              cambiarMoOmitir(idx, "mecanico", e.target.value)
                            }
                          >
                            <option value="">-- Seleccionar --</option>
                            {mecanicos.map((mec) => (
                              <option key={mec._id} value={mec._id}>{mec.nombre}</option>
                            ))}
                          </select>
                        )}
                      </div>
                      <div className="col-md-2">
                        <label className="form-label form-label-sm mb-1">Horas</label>
                        <input
                          type="number"
                          step="0.1"
                          className="form-control form-control-sm"
                          value={m.horas}
                          onChange={(e) =>
                            cambiarMoOmitir(idx, "horas", e.target.value)
                          }
                        />
                      </div>
                      <div className="col-md-2">
                        <label className="form-label form-label-sm mb-1">
                          Fecha de Pago
                        </label>
                        <input
                          type="date"
                          className="form-control form-control-sm"
                          value={m.fechaPago}
                          onChange={(e) =>
                            cambiarMoOmitir(idx, "fechaPago", e.target.value)
                          }
                        />
                      </div>
                    </div>
                    <div className="row g-2 align-items-end">
                      <div className="col-md-7">
                        <label className="form-label form-label-sm mb-1">
                          Observaciones
                        </label>
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          value={m.observaciones}
                          onChange={(e) =>
                            cambiarMoOmitir(idx, "observaciones", e.target.value)
                          }
                        />
                      </div>
                      <div className="col-md-4">
                        <div className="form-check">
                          <input
                            type="checkbox"
                            className="form-check-input"
                            id={`moOmitirCarroceria-${idx}`}
                            checked={m.esCarroceria}
                            onChange={(e) =>
                              cambiarMoOmitir(idx, "esCarroceria", e.target.checked)
                            }
                          />
                          <label
                            className="form-check-label fw-semibold"
                            htmlFor={`moOmitirCarroceria-${idx}`}
                          >
                            ¿Trabajo de Carrocería?
                          </label>
                        </div>
                      </div>
                      <div className="col-md-1 text-end">
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => eliminarMoOmitir(idx)}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowOmitirModal(false)}
                  disabled={guardandoOmitir}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleOmitirRefacciones}
                  disabled={guardandoOmitir}
                >
                  {guardandoOmitir
                    ? "Guardando..."
                    : "Continuar a presupuesto"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}