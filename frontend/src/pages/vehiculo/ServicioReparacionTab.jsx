// src/pages/vehiculo/ServicioReparacionTab.jsx
import React, { useEffect, useState } from "react";
import { updateServicioReparacion } from "../../api/vehiculos";
import { fetchServiciosTaller } from "../../api/codigos";

const emptyServicio = {
  serviciosSeleccionados: [],   // ej. ["S1", "S2"]
  infoLlantas: "",
  revisionFallas: "",
};

export default function ServicioReparacionTab({
  ordenId,
  initialData,
  onSaved,
}) {
  const [form, setForm] = useState(emptyServicio);
  const [saving, setSaving] = useState(false);

  const [catalogoServicios, setCatalogoServicios] = useState([]);
  const [cargandoServicios, setCargandoServicios] = useState(false);

  /* =========================
   *  Precargar datos guardados
   * ========================= */
  useEffect(() => {
    if (initialData) {
      setForm((prev) => ({
        ...prev,
        serviciosSeleccionados: initialData.serviciosSeleccionados || [],
        infoLlantas: initialData.infoLlantas || "",
        revisionFallas: initialData.revisionFallas || "",
      }));
    }
  }, [initialData]);

  /* =========================
   *  Catálogo de servicios (Mongo)
   * ========================= */
  useEffect(() => {
    const cargarServicios = async () => {
      try {
        setCargandoServicios(true);
        const servicios = await fetchServiciosTaller(); // /codigos/options?tipo=servicio
        console.log("Servicios taller (tab) =>", servicios);
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
  const handleChangeText = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const toggleServicio = (codigoServicio) => {
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!ordenId) return;

    try {
      setSaving(true);
      // mandamos: { serviciosSeleccionados, infoLlantas, revisionFallas }
      const res = await updateServicioReparacion(ordenId, form);
      alert("Orden de Servicio Iniciada.");
      if (onSaved) onSaved(res.data.vehiculo);
    } catch (err) {
      console.error(err);
      alert("Error al guardar Servicio / Reparación");
    } finally {
      setSaving(false);
    }
  };

  /* =========================
   *  Render
   * ========================= */
  return (
    <form onSubmit={handleSubmit}>
      <div className="card">
        <div className="card-header fw-bold">Servicio o Reparación</div>
        <div className="card-body">
          {/* ==== Tabla de servicios dinámicos con checkbox ==== */}
          <div className="table-responsive mb-3">
            <table className="table table-bordered table-sm">
              <thead>
                <tr>
                  <th>Servicio</th>
                  <th className="text-center">Generales</th>
                </tr>
              </thead>
              <tbody>
                {cargandoServicios && (
                  <tr>
                    <td colSpan={2}>Cargando servicios...</td>
                  </tr>
                )}

                {!cargandoServicios && catalogoServicios.length === 0 && (
                  <tr>
                    <td colSpan={2} className="text-muted">
                      No hay servicios dados de alta en la BD de códigos.
                    </td>
                  </tr>
                )}

                {!cargandoServicios &&
                  catalogoServicios.length > 0 &&
                  catalogoServicios.map((srv) => {
                    const codigo = srv.codigo; // "S2"
                    const activo = form.serviciosSeleccionados.includes(codigo);
                    const descripcion = srv.descripcion || srv.label;

                    return (
                      <tr key={srv._id || codigo}>
                        <td>
                          {/* Puedes cambiar el formato si quieres solo descripción */}
                          {codigo} - {descripcion}
                        </td>
                        <td className="text-center">
                          <input
                            type="checkbox"
                            className="form-check-input"
                            checked={activo}
                            onChange={() => toggleServicio(codigo)}
                          />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* Información de llantas */}
          <div className="mb-3">
            <label className="form-label fw-semibold">
              Información de Llantas
            </label>
            <textarea
              className="form-control"
              rows={3}
              name="infoLlantas"
              value={form.infoLlantas}
              onChange={handleChangeText}
            />
          </div>

          {/* Revisión fallas reportadas */}
          <div className="mb-3">
            <label className="form-label fw-semibold">
              REVISIÓN FALLAS REPORTADAS POR EL CLIENTE
            </label>
            <textarea
              className="form-control"
              rows={3}
              name="revisionFallas"
              value={form.revisionFallas}
              onChange={handleChangeText}
            />
          </div>

          <div className="text-center">
            <button
              type="submit"
              className="btn btn-primary px-5"
              disabled={saving}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
