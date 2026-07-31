import http from "./http";

export const listConceptosPreset = (params) => http.get("/conceptos-preset", { params });

export const createConceptoPreset = (payload) => http.post("/conceptos-preset", payload);

export const updateConceptoPreset = (id, payload) => http.put(`/conceptos-preset/${id}`, payload);

export const deleteConceptoPreset = (id) => http.delete(`/conceptos-preset/${id}`);
