// src/pages/vehiculo/VehiculoServicioReparacion.jsx
import React, { useEffect, useState } from "react";
import { fetchServiciosTaller } from "../../api/codigos";

export default function VehiculoServicioReparacion({ orden, readOnly = false }) {
  const [form, setForm] = useState({
    // ahora usamos un arreglo dinámico de servicios
    serviciosSeleccionados: [], // ej. ["S1", "S2"]
    infoLlantas: "",
    revisionFallasCliente: "",
  });

  const [catalogoServicios, setCatalogoServicios] = useState([]);
  const [cargandoServicios, setCargandoServicios] = useState(false);

  /* =========================
   *  Datos desde la OT
   * ========================= */
  useEffect(() => {
    if (!orden || !orden.servicioReparacion) return;

    const sr = orden.servicioReparacion;

    setForm((prev) => ({
      ...prev,
      serviciosSeleccionados: sr.serviciosSeleccionados || [],
      infoLlantas: sr.infoLlantas || "",
      revisionFallasCliente: sr.revisionFallasCliente || "",
    }));
  }, [orden]);

  /* =========================
   *  Catálogo de servicios
   * ========================= */
  useEffect(() => {
    const cargarServicios = async () => {
      try {
        setCargandoServicios(true);

        const servicios = await fetchServiciosTaller(); // GET /codigos/options?tipo=servicio
        console.log("Servicios taller =>", servicios);
        setCatalogoServicios(servicios);
      } catch (err) {
        console.error("Error cargando servicios:", err);
        setCatalogoServicios([]);
      } finally {
        setCargandoServicios(false);
      }
    };

    cargarServicios();
  }, []);

  /* =========================
   *  Handlers
   * ========================= */
  const handleChange = (e) => {
    if (readOnly) return;
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const toggleServicio = (codigoServicio) => {
    if (readOnly) return;

    setForm((prev) => {
      const yaEsta = prev.serviciosSeleccionados.includes(codigoServicio);
      return {
        ...prev,
        serviciosSeleccionados: yaEsta
          ? prev.serviciosSeleccionados.filter((c) => c !== codigoServicio)
          : [...prev.serviciosSeleccionados, codigoServicio],
      };
    });
  };

  const handleGuardar = () => {
    if (readOnly) return;

    // Aquí vas a mandar `form` al backend como parte de la OT:
    // servicioReparacion: form
    console.log("Datos servicio/reparación a guardar:", form);
    alert("Luego conectamos este Guardar con el backend 😄");
  };

  /* =========================
   *  Render
   * ========================= */
  return (
    <div className="card mt-3">
      <div className="card-header fw-bold">Servicio o Reparación</div>
      <div className="card-body">
        {/* ==== Servicios clickeables desde BD de códigos ==== */}
        <label className="form-label fw-semibold">
          Servicios realizados (selecciona uno o varios)
        </label>

        {cargandoServicios && <p>Cargando servicios...</p>}

        {!cargandoServicios && catalogoServicios.length === 0 && (
          <p className="text-muted">
            No hay servicios dados de alta en la BD de códigos.
          </p>
        )}

        {!cargandoServicios && catalogoServicios.length > 0 && (
          <div className="servicios-grid">
            {catalogoServicios.map((srv) => {
              // /codigos/options devuelve: { _id, codigo, tipo, label, descripcion }
              const codigo = srv.codigo;
              const activo = form.serviciosSeleccionados.includes(codigo);

              return (
                <button
                  key={srv._id || codigo}
                  type="button"
                  onClick={() => toggleServicio(codigo)}
                  className={`servicio-chip ${activo ? "activo" : ""}`}
                  disabled={readOnly}
                >
                    <div className="servicio-codigo">{codigo}</div>
                    <div className="servicio-descripcion">
                      {srv.descripcion || srv.label}
                    </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Información de llantas */}
        <div className="mt-3">
          <label className="form-label fw-semibold">Información de Llantas</label>
          <textarea
            className="form-control"
            rows={2}
            name="infoLlantas"
            value={form.infoLlantas}
            onChange={handleChange}
            disabled={readOnly}
          />
        </div>

        {/* Revisión fallas reportadas por el cliente */}
        <div className="mt-3">
          <label className="form-label fw-semibold">
            REVISIÓN FALLAS REPORTADAS POR EL CLIENTE
          </label>
          <textarea
            className="form-control"
            rows={3}
            name="revisionFallasCliente"
            value={form.revisionFallasCliente}
            onChange={handleChange}
            disabled={readOnly}
          />
        </div>

        {/* Botón Guardar */}
        {!readOnly && (
          <div className="text-center mt-4">
            <button
              type="button"
              className="btn btn-success px-5"
              onClick={handleGuardar}
            >
              Guardar
            </button>
          </div>
        )}

        {/* Debug opcional */}
        {/* <pre>{JSON.stringify(form, null, 2)}</pre> */}
      </div>
    </div>
  );
}
