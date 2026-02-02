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
