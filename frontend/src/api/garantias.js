// src/api/garantias.js
import http from "./http";

// Listar solicitudes de garantía (params: estado, searchOs, page, limit)
export const listGarantias = (params) => http.get("/garantias", { params });

// Editar motivo / costo-diferencia / autorización mientras está PENDIENTE
export const updateGarantia = (id, payload) => http.put(`/garantias/${id}`, payload);

// Aprobar o negar: payload { accion: 'APROBAR' | 'NEGAR', motivo, costoDiferencia, autorizaCarreon }
export const resolverGarantia = (id, payload) =>
  http.put(`/garantias/${id}/resolver`, payload);
