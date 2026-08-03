import http from "./http";

export const listFacturasCfdi = (params) => http.get("/facturas-cfdi", { params });

export const getFacturaCfdiById = (id) => http.get(`/facturas-cfdi/${id}`);

// PDF (representación impresa) de una factura ya guardada
export const getFacturaCfdiPdf = (id) =>
  http.get(`/facturacion/factura/${id}/pdf`, { responseType: "arraybuffer" });
