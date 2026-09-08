// src/api/auditoria.js
import http from "./http";

// GET /api/auditoria/registro — log de actividad (solo admin)
export async function getRegistroActividad(params = {}) {
  const limpio = {};
  Object.entries(params).forEach(([k, v]) => {
    if (v !== "" && v != null) limpio[k] = v;
  });
  const { data } = await http.get("/auditoria/registro", { params: limpio });
  return data;
}

// GET /api/auditoria/registro/filtros — valores para poblar los selects
export async function getRegistroActividadFiltros() {
  const { data } = await http.get("/auditoria/registro/filtros");
  return data;
}
