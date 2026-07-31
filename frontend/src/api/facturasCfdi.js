import http from "./http";

export const listFacturasCfdi = (params) => http.get("/facturas-cfdi", { params });

export const getFacturaCfdiById = (id) => http.get(`/facturas-cfdi/${id}`);
