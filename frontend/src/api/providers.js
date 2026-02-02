import http from "./http";

export const createProveedor  = (data)   => http.post("/proveedores", data);
export const listProveedores  = (params) => http.get("/proveedores", { params });
export const getProveedor     = (id)     => http.get(`/proveedores/${id}`);
export const updateProveedor  = (id, d)  => http.put(`/proveedores/${id}`, d);
export const deleteProveedor  = (id)     => http.delete(`/proveedores/${id}`);
