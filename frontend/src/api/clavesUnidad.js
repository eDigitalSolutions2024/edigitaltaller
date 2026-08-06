import http from "./http";

export const listClavesUnidad = (params) => http.get("/claves-unidad", { params });

export const createClaveUnidad = (payload) => http.post("/claves-unidad", payload);

export const updateClaveUnidad = (id, payload) => http.put(`/claves-unidad/${id}`, payload);

export const deleteClaveUnidad = (id) => http.delete(`/claves-unidad/${id}`);
