// src/api/garantias.js
import http from "./http";

// Listar solicitudes de garantía (params: estado, searchOs, page, limit)
export const listGarantias = (params) => http.get("/garantias", { params });

// Cuántas órdenes de garantía están bloqueadas esperando autorización del admin
// (para el badge del menú "Solicitudes de Garantías")
export const getGarantiasPendientesCount = () =>
  http.get("/garantias/pendientes-count");

// Editar motivo / autorización mientras está PENDIENTE
export const updateGarantia = (id, payload) => http.put(`/garantias/${id}`, payload);

// Aprobar, negar o marcar "no aplica": payload { accion: 'APROBAR' | 'NEGAR' | 'NO_APLICA', motivo, autorizaCarreon }
export const resolverGarantia = (id, payload) =>
  http.put(`/garantias/${id}/resolver`, payload);

// Cancela la orden nueva de una solicitud marcada como "No aplica". Con
// payload { crearReemplazo: true, asesorId } el backend además crea la orden
// de reemplazo (sin folio) asignada a ese asesor.
export const cancelarOrdenGarantia = (id, payload) =>
  http.put(`/garantias/${id}/cancelar`, payload);

// Cuáles de esas órdenes ya fueron usadas como origen de una garantía
export const getGarantiasUsadas = (ordenIds) =>
  http.get("/garantias/usadas", { params: { ordenIds: (ordenIds || []).join(",") } });
