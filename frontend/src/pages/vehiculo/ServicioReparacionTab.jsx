// src/pages/vehiculo/ServicioReparacionTab.jsx
import React, { useEffect, useRef, useState } from "react";
import { updateServicioReparacion, saveRequisicionDiagnostico } from "../../api/vehiculos";
import { fetchServiciosTaller } from "../../api/codigos";

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

export default function ServicioReparacionTab({ ordenId, initialData, existingRefacciones = [], onSaved, readOnly = false }) {
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

  return (
    <>
      <div>
        <div className="card">
          <div className="card-header fw-bold text-center bg-light">
            SERVICIO O REPARACIÓN
          </div>

          <div className="card-body">

            {/* ===== SERVICIOS DESDE BD CÓDIGOS ===== */}
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
            {PDF_SECTIONS.map(({ label, textKey }) => (
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
    </>
  );
}