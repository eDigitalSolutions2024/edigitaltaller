// src/pages/vehiculo/ServicioReparacionTab.jsx
import React, { useEffect, useState } from "react";
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
};

export default function ServicioReparacionTab({ ordenId, initialData, onSaved }) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

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

  // Guardar solo el servicio (sin enviar a refaccionaria)
  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!ordenId) return;
    try {
      setSaving(true);
      const res = await updateServicioReparacion(ordenId, form);
      alert("Servicio / Reparación guardado correctamente.");
      if (onSaved) onSaved(res.data.vehiculo);
    } catch (err) {
      console.error(err);
      alert("Error al guardar Servicio / Reparación.");
    } finally {
      setSaving(false);
    }
  };

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

      // 2. Enviar refacciones a refaccionaria
      const res = await saveRequisicionDiagnostico(ordenId, {
        refacciones: validas,
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
      <form onSubmit={handleGuardar}>
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
                            onClick={() => toggleServicio(srv.codigo)}
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
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, revisionFallas: e.target.value }))
                }
              />
            </div>

            {/* ===== BOTONES ===== */}
            <div className="d-flex gap-2 justify-content-between align-items-center flex-wrap">
              <button
                type="button"
                className="btn btn-outline-primary"
                onClick={() => setShowModal(true)}
              >
                Solicitar refacciones a refaccionaria
              </button>

              <button
                type="submit"
                className="btn btn-success px-5"
                disabled={saving}
              >
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      </form>

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