// src/pages/Empleados.jsx
import React, { useEffect, useState } from "react";
import {
  listarEmpleados,
  crearEmpleado,
  actualizarEmpleado,
  cambiarEstadoEmpleado,
} from "../api/empleados";
import "../styles/Empleados.css";

const puestos = [
  { value: "mecanico", label: "Mecánico" },
  { value: "ayudante", label: "Ayudante" },
  { value: "recepcion", label: "Recepción" },
  { value: "contabilidad", label: "Contabilidad" },
  { value: "jefe_taller", label: "Jefe de taller" },
  { value: "otro", label: "Otro" },
];

const emptyForm = {
  nombre: "",
  puesto: "mecanico",
  telefono: "",
  correo: "",
  fechaAlta: "",
  notas: "",
};

function Empleados() {
  const [empleados, setEmpleados] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editandoId, setEditandoId] = useState(null);
  const [filtroActivo, setFiltroActivo] = useState("todos");

  async function cargarEmpleados() {
    try {
      setCargando(true);
      setError("");

      const filtros = {};
      if (filtroActivo === "true") filtros.activo = true;
      if (filtroActivo === "false") filtros.activo = false;

      const data = await listarEmpleados(filtros);
      setEmpleados(data);
    } catch (err) {
      console.error(err);
      setError("Error al cargar empleados");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarEmpleados();
  }, [filtroActivo]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleEditar(empleado) {
    setEditandoId(empleado._id);
    setForm({
      nombre: empleado.nombre || "",
      puesto: empleado.puesto || "mecanico",
      telefono: empleado.telefono || "",
      correo: empleado.correo || "",
      fechaAlta: empleado.fechaAlta ? empleado.fechaAlta.slice(0, 10) : "",
      notas: empleado.notas || "",
    });
  }

  function handleCancelarEdicion() {
    setEditandoId(null);
    setForm(emptyForm);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setCargando(true);
      setError("");

      if (!form.nombre.trim()) {
        setError("El nombre es obligatorio");
        return;
      }

      if (editandoId) {
        await actualizarEmpleado(editandoId, form);
      } else {
        await crearEmpleado(form);
      }

      handleCancelarEdicion();
      await cargarEmpleados();
    } catch (err) {
      console.error(err);
      setError("Hubo un error al guardar el empleado");
    } finally {
      setCargando(false);
    }
  }

  async function handleToggleActivo(empleado) {
    try {
      await cambiarEstadoEmpleado(empleado._id, !empleado.activo);
      await cargarEmpleados();
    } catch (err) {
      console.error(err);
      setError("No se pudo cambiar el estado del empleado");
    }
  }

  return (
    <div className="container-fluid empleados-page mt-3">
      <div className="empleados-header mb-3">
        <h1 className="empleados-title">Empleados del taller</h1>
      </div>

      {error && (
        <div className="alert alert-danger py-2 mb-3 empleados-alert">
          {error}
        </div>
      )}

      {/* CARD FORM */}
      <div className="card card-taller mb-3">
        <div className="card-header card-taller-header">
          <h2 className="card-title mb-0">
            {editandoId ? "Editar empleado" : "Nuevo empleado"}
          </h2>
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit} className="empleados-form">
            <div className="row g-3 align-items-end">
              <div className="col-md-3">
                <label className="form-label fw-semibold">
                  Nombre<span className="text-danger">*</span>
                </label>
                <input
                  name="nombre"
                  value={form.nombre}
                  onChange={handleChange}
                  required
                  className="form-control"
                  placeholder="Nombre completo"
                />
              </div>

              <div className="col-md-3">
                <label className="form-label fw-semibold">Puesto</label>
                <select
                  name="puesto"
                  value={form.puesto}
                  onChange={handleChange}
                  className="form-select"
                >
                  {puestos.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-md-2">
                <label className="form-label fw-semibold">Teléfono</label>
                <input
                  name="telefono"
                  value={form.telefono}
                  onChange={handleChange}
                  className="form-control"
                  placeholder="Opcional"
                />
              </div>

              <div className="col-md-3">
                <label className="form-label fw-semibold">Correo</label>
                <input
                  type="email"
                  name="correo"
                  value={form.correo}
                  onChange={handleChange}
                  className="form-control"
                  placeholder="correo@ejemplo.com"
                />
              </div>

              <div className="col-md-2 mt-2">
                <label className="form-label fw-semibold">Fecha de alta</label>
                <input
                  type="date"
                  name="fechaAlta"
                  value={form.fechaAlta}
                  onChange={handleChange}
                  className="form-control"
                />
              </div>
            </div>

            <div className="row mt-3">
              <div className="col-12">
                <label className="form-label fw-semibold">Notas</label>
                <textarea
                  name="notas"
                  rows={2}
                  className="form-control"
                  value={form.notas}
                  onChange={handleChange}
                  placeholder="Comentarios, habilidades, turno, etc."
                />
              </div>
            </div>

            <div className="mt-3 d-flex gap-2">
              <button
                type="submit"
                className="btn btn-taller-primary"
                disabled={cargando}
              >
                {editandoId ? "Guardar cambios" : "Crear empleado"}
              </button>
              {editandoId && (
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={handleCancelarEdicion}
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* FILTROS + TABLA */}
      <div className="card card-taller">
        <div className="card-body">
          <div className="d-flex align-items-center justify-content-between mb-2 flex-wrap gap-2">
            <div className="empleados-filtro">
              <span className="fw-semibold me-2">Filtrar por estado:</span>
              <select
                value={filtroActivo}
                onChange={(e) => setFiltroActivo(e.target.value)}
                className="form-select form-select-sm d-inline-block w-auto"
              >
                <option value="todos">Todos</option>
                <option value="true">Solo activos</option>
                <option value="false">Solo inactivos</option>
              </select>
            </div>

            {cargando && (
              <span className="text-muted small">
                Cargando empleados...
              </span>
            )}
          </div>

          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle empleados-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Puesto</th>
                  <th>Teléfono</th>
                  <th>Correo</th>
                  <th className="text-center">Activo</th>
                  <th className="text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {empleados.length === 0 && !cargando && (
                  <tr>
                    <td colSpan={6} className="text-center text-muted py-3">
                      No hay empleados registrados
                    </td>
                  </tr>
                )}

                {empleados.map((emp) => (
                  <tr key={emp._id}>
                    <td>{emp.nombre}</td>
                    <td>{emp.puesto}</td>
                    <td>{emp.telefono}</td>
                    <td>{emp.correo}</td>
                    <td className="text-center">
                      <span
                        className={`badge ${
                          emp.activo ? "bg-success" : "bg-secondary"
                        }`}
                      >
                        {emp.activo ? "Sí" : "No"}
                      </span>
                    </td>
                    <td className="text-center">
                      <button
                        className="btn btn-link btn-sm p-0 me-2"
                        onClick={() => handleEditar(emp)}
                      >
                        ✏️ Editar
                      </button>
                      <button
                        className={`btn btn-sm ${
                          emp.activo
                            ? "btn-outline-danger"
                            : "btn-outline-success"
                        }`}
                        onClick={() => handleToggleActivo(emp)}
                      >
                        {emp.activo ? "Desactivar" : "Activar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Empleados;
