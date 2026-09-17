// src/api/empleados.js
import http from "./http";

// GET /api/empleados
export async function listarEmpleados(filtros = {}) {
  const params = {};

  if (filtros.activo === true) params.activo = "true";
  if (filtros.activo === false) params.activo = "false";
  if (filtros.puesto) params.puesto = filtros.puesto;

  const { data } = await http.get("/empleados", { params });
  return data;
}

// POST /api/empleados
export async function crearEmpleado(payload) {
  const { data } = await http.post("/empleados", payload);
  return data;
}

// PUT /api/empleados/:id
export async function actualizarEmpleado(id, payload) {
  const { data } = await http.put(`/empleados/${id}`, payload);
  return data;
}

// PATCH /api/empleados/:id/estado
export async function cambiarEstadoEmpleado(id, activo) {
  const { data } = await http.patch(`/empleados/${id}/estado`, { activo });
  return data;
}

// Vincula/desvincula un usuario al empleado
export async function vincularUsuario(empleadoId, usuarioId) {
  const { data } = await http.put(`/empleados/${empleadoId}`, { usuario: usuarioId || null });
  return data;
}

// GET /api/empleados/personal — roster unificado de Administración → Personal
// (Empleados + usuarios "solo_usuario" sin ficha de Empleado), accesible a
// cualquier rol autenticado. Lo usa el botón "Empleados" de Nueva Orden de
// Servicio para no depender de GET /users (admin-only).
export async function listarPersonal(filtros = {}) {
  const params = {};
  if (filtros.activo === false) params.activo = "false";

  const { data } = await http.get("/empleados/personal", { params });
  return data;
}
