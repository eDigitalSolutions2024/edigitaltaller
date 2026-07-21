// src/api/serviciosCatalogo.js
// Catálogo de "Servicios" (paquetes de refacciones), distinto de BD Códigos (api/codigos.js).
import http from "./http";

export const listServiciosCatalogo = () => http.get("/servicios-catalogo");

export const listServiciosCatalogoOptions = () => http.get("/servicios-catalogo/options");

export const getServicioCatalogo = (id) => http.get(`/servicios-catalogo/${id}`);

export const createServicioCatalogo = (payload) => http.post("/servicios-catalogo", payload);

export const updateServicioCatalogo = (id, payload) =>
  http.put(`/servicios-catalogo/${id}`, payload);

export const deleteServicioCatalogo = (id) => http.delete(`/servicios-catalogo/${id}`);
