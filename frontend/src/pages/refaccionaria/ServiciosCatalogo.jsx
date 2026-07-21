// src/pages/refaccionaria/ServiciosCatalogo.jsx
// Catálogo de "Servicios" (paquetes de refacciones necesarias por servicio).
// Distinto del catálogo de BD Códigos (SAT/facturación) — ver BDCodigos.jsx.
import { useEffect, useState } from "react";
import {
  listServiciosCatalogo,
  createServicioCatalogo,
  updateServicioCatalogo,
  deleteServicioCatalogo,
} from "../../api/serviciosCatalogo";
import "../../styles/ajustes.css";


const emptyRefaccion = () => ({ nombre: "", obligatoria: true });

export default function ServiciosCatalogo() {
  const [servicios, setServicios] = useState([]);
  const [cargando, setCargando] = useState(false);

  const [nombreForm, setNombreForm] = useState("");
  const [refaccionesForm, setRefaccionesForm] = useState([emptyRefaccion()]);
  const [guardando, setGuardando] = useState(false);

  const [modalServicio, setModalServicio] = useState(null); // servicio abierto en el modal
  const [modalRefacciones, setModalRefacciones] = useState([]);
  const [modalNombre, setModalNombre] = useState("");
  const [nuevaRefaccionModal, setNuevaRefaccionModal] = useState(emptyRefaccion());
  const [guardandoModal, setGuardandoModal] = useState(false);

  const cargar = async () => {
    try {
      setCargando(true);
      const { data } = await listServiciosCatalogo();
      setServicios(data?.data || []);
    } catch (err) {
      console.error(err);
      alert("Error al cargar los servicios.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  // ===== Formulario de creación =====
  const agregarRefaccionForm = () =>
    setRefaccionesForm((prev) => [...prev, emptyRefaccion()]);

  const eliminarRefaccionForm = (idx) =>
    setRefaccionesForm((prev) => prev.filter((_, i) => i !== idx));

  const cambiarRefaccionForm = (idx, field, value) =>
    setRefaccionesForm((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    );

  const handleCrearServicio = async () => {
    const nombre = nombreForm.trim();
    if (!nombre) {
      alert("Captura el nombre del servicio.");
      return;
    }
    const refacciones = refaccionesForm
      .map((r) => ({ nombre: r.nombre.trim(), obligatoria: !!r.obligatoria }))
      .filter((r) => r.nombre);

    if (refacciones.length === 0) {
      alert("Agrega al menos una refacción necesaria para el servicio.");
      return;
    }

    try {
      setGuardando(true);
      await createServicioCatalogo({ nombre, refacciones });
      setNombreForm("");
      setRefaccionesForm([emptyRefaccion()]);
      await cargar();
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || "Error al crear el servicio.");
    } finally {
      setGuardando(false);
    }
  };

  // ===== Modal de detalle / edición =====
  const abrirModal = (servicio) => {
    setModalServicio(servicio);
    setModalNombre(servicio.nombre);
    setModalRefacciones(
      (servicio.refacciones || []).map((r) => ({ ...r }))
    );
    setNuevaRefaccionModal(emptyRefaccion());
  };

  const cerrarModal = () => {
    setModalServicio(null);
    setModalRefacciones([]);
    setModalNombre("");
  };

  const agregarRefaccionModal = () => {
    const nombre = nuevaRefaccionModal.nombre.trim();
    if (!nombre) return;
    setModalRefacciones((prev) => [
      ...prev,
      { nombre, obligatoria: !!nuevaRefaccionModal.obligatoria },
    ]);
    setNuevaRefaccionModal(emptyRefaccion());
  };

  const eliminarRefaccionModal = (idx) =>
    setModalRefacciones((prev) => prev.filter((_, i) => i !== idx));

  const guardarCambiosModal = async () => {
    const nombre = modalNombre.trim();
    if (!nombre) {
      alert("El nombre del servicio no puede quedar vacío.");
      return;
    }
    const refacciones = modalRefacciones
      .map((r) => ({ nombre: r.nombre.trim(), obligatoria: !!r.obligatoria }))
      .filter((r) => r.nombre);

    if (refacciones.length === 0) {
      alert("El servicio debe tener al menos una refacción.");
      return;
    }

    try {
      setGuardandoModal(true);
      await updateServicioCatalogo(modalServicio._id, { nombre, refacciones });
      await cargar();
      cerrarModal();
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || "Error al guardar los cambios.");
    } finally {
      setGuardandoModal(false);
    }
  };

  const eliminarServicio = async () => {
    if (!window.confirm(`¿Eliminar por completo el servicio "${modalServicio.nombre}"?`)) {
      return;
    }
    try {
      setGuardandoModal(true);
      await deleteServicioCatalogo(modalServicio._id);
      await cargar();
      cerrarModal();
    } catch (err) {
      console.error(err);
      alert("Error al eliminar el servicio.");
    } finally {
      setGuardandoModal(false);
    }
  };

  return (
    <div className="container-fluid py-3">
      <div className="row justify-content-center">
        <div className="col-12 col-xxl-10">
          <div className="card shadow-sm border-0 mb-4">
            <div className="card-header bg-white border-0">
              <h2 className="h4 mb-0 text-center">Servicios</h2>
            </div>
            <div className="card-body">
              <h6 className="fw-bold text-uppercase mb-3 border-bottom pb-2">
                Crear servicio
              </h6>

              <div className="mb-3">
                <label className="form-label">
                  Nombre del servicio: <span className="text-danger">*</span>
                </label>
                <input
                  className="form-control"
                  placeholder="Ej. Afinación mayor"
                  value={nombreForm}
                  onChange={(e) => setNombreForm(e.target.value)}
                />
              </div>

              <label className="form-label">Refacciones necesarias:</label>
              <table className="table table-sm table-bordered align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Nombre de la refacción</th>
                    <th style={{ width: 130 }} className="text-center">
                      Obligatoria
                    </th>
                    <th style={{ width: 50 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {refaccionesForm.map((r, idx) => (
                    <tr key={idx}>
                      <td>
                        <input
                          className="form-control form-control-sm"
                          value={r.nombre}
                          placeholder="Ej. Bujías, Filtro de aceite..."
                          onChange={(e) =>
                            cambiarRefaccionForm(idx, "nombre", e.target.value)
                          }
                        />
                      </td>
                      <td className="text-center">
                        <input
                          type="checkbox"
                          checked={r.obligatoria}
                          onChange={(e) =>
                            cambiarRefaccionForm(idx, "obligatoria", e.target.checked)
                          }
                        />
                      </td>
                      <td className="text-center">
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => eliminarRefaccionForm(idx)}
                          disabled={refaccionesForm.length === 1}
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
                onClick={agregarRefaccionForm}
              >
                + Agregar refacción
              </button>

              <div className="d-flex justify-content-end mt-3">
                <button
                  type="button"
                  className="btn btn-primary px-4"
                  onClick={handleCrearServicio}
                  disabled={guardando}
                >
                  {guardando ? "Creando..." : "Crear servicio"}
                </button>
              </div>
            </div>
          </div>

          <div className="card shadow-sm border-0">
            <div className="card-header bg-white border-0">
              <h5 className="mb-0">Servicios Creados</h5>
            </div>
            <div className="card-body">
              {cargando ? (
                <p className="text-muted mb-0">Cargando servicios...</p>
              ) : servicios.length === 0 ? (
                <div className="alert alert-info mb-0">
                  Aún no hay servicios creados.
                </div>
              ) : (
                <div className="row row-cols-2 row-cols-md-3 g-3">
                  {servicios.map((s) => (
                    <div className="col" key={s._id}>
                      <button
                        type="button"
                        className="btn btn-outline-secondary w-100 h-100 text-start p-3 card-center"
                        onClick={() => abrirModal(s)}
                      >
                        <div className="fw-bold">{s.nombre}<br/></div>
                        <small className="text-muted">
                          {(s.refacciones || []).length} refacción(es)
                        </small>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {modalServicio && (
        <>
          <div
            onClick={cerrarModal}
            style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1040 }}
          />
          <div
            style={{
              position: "fixed", top: "50%", left: "50%",
              transform: "translate(-50%,-50%)",
              zIndex: 1050, width: "90%", maxWidth: 640, maxHeight: "85vh",
              background: "white", borderRadius: 8,
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
              display: "flex", flexDirection: "column", overflow: "hidden",
            }}
          >
            <div className="d-flex justify-content-between align-items-center p-3 border-bottom">
              <input
                className="form-control form-control-sm fw-bold"
                style={{ maxWidth: 380 }}
                value={modalNombre}
                onChange={(e) => setModalNombre(e.target.value)}
              />
              <button
                onClick={cerrarModal}
                style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <div className="p-3" style={{ overflowY: "auto", flex: 1 }}>
              <table className="table table-sm table-bordered align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Refacción</th>
                    <th style={{ width: 110 }} className="text-center">Tipo</th>
                    <th style={{ width: 50 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {modalRefacciones.map((r, idx) => (
                    <tr key={idx}>
                      <td>{r.nombre}</td>
                      <td className="text-center">
                        <span className={`badge ${r.obligatoria ? "bg-primary" : "bg-secondary"}`}>
                          {r.obligatoria ? "Obligatoria" : "Opcional"}
                        </span>
                      </td>
                      <td className="text-center">
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => eliminarRefaccionModal(idx)}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="d-flex gap-2 align-items-end mt-2">
                <div className="flex-grow-1">
                  <label className="form-label form-label-sm mb-1">Agregar refacción</label>
                  <input
                    className="form-control form-control-sm"
                    placeholder="Nombre de la refacción..."
                    value={nuevaRefaccionModal.nombre}
                    onChange={(e) =>
                      setNuevaRefaccionModal((prev) => ({ ...prev, nombre: e.target.value }))
                    }
                  />
                </div>
                <div className="form-check mb-1">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id="nuevaRefaccionObligatoria"
                    checked={nuevaRefaccionModal.obligatoria}
                    onChange={(e) =>
                      setNuevaRefaccionModal((prev) => ({ ...prev, obligatoria: e.target.checked }))
                    }
                  />
                  <label className="form-check-label small" htmlFor="nuevaRefaccionObligatoria">
                    Obligatoria
                  </label>
                </div>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={agregarRefaccionModal}
                >
                  + Agregar
                </button>
              </div>
            </div>

            <div className="p-3 border-top d-flex justify-content-between">
              <button
                type="button"
                className="btn btn-outline-danger"
                onClick={eliminarServicio}
                disabled={guardandoModal}
              >
                Eliminar servicio
              </button>
              <div className="d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={cerrarModal}
                  disabled={guardandoModal}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={guardarCambiosModal}
                  disabled={guardandoModal}
                >
                  {guardandoModal ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
