// src/api/grupos.js
import http from "./http";

// GET /api/grupos/mis-grupos — ids de los grupos a los que pertenece el usuario actual
export async function getMisGrupos() {
  const { data } = await http.get("/grupos/mis-grupos");
  return data;
}

// GET /api/grupos
export async function listarGrupos(filtros = {}) {
  const params = {};
  if (filtros.activo === true) params.activo = "true";
  if (filtros.activo === false) params.activo = "false";

  const { data } = await http.get("/grupos", { params });
  return data;
}

// POST /api/grupos
export async function crearGrupo(payload) {
  const { data } = await http.post("/grupos", payload);
  return data;
}

// PUT /api/grupos/:id
export async function actualizarGrupo(id, payload) {
  const { data } = await http.put(`/grupos/${id}`, payload);
  return data;
}

// PATCH /api/grupos/:id/status
export async function cambiarEstadoGrupo(id, activo) {
  const { data } = await http.patch(`/grupos/${id}/status`, { activo });
  return data;
}
