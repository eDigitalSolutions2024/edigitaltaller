import http from "./http";

export const listFacturasCfdi = (params) => http.get("/facturas-cfdi", { params });

export const getFacturaCfdiById = (id) => http.get(`/facturas-cfdi/${id}`);

// Facturas de ingreso previas de una orden (vigentes y canceladas) + si hay cobro de Cajas que
// una refactura hereda. Para saber en Nueva Factura si es una refacturación (sustitución 04).
export const getFacturasPreviasDeOrden = (vehiculoId) =>
  http.get(`/facturas-cfdi/por-orden/${vehiculoId}`);

// Números de nota de venta de una Factura Global que ya se acreditaron con una nota de crédito.
export const getNotasLiberadasDeGlobal = (id) => http.get(`/facturas-cfdi/${id}/notas-liberadas`);

// Solo admin: REGISTRA la cancelación de una factura de ingreso (la real, ante el SAT, se hace
// fuera del sistema). body: { motivo: '01'..'04', sustituidaPorFolio?, nota? }
export const cancelarFacturaCfdi = (id, body) => http.post(`/facturas-cfdi/${id}/cancelar`, body);

// PDF (representación impresa) de una factura ya guardada
export const getFacturaCfdiPdf = (id) =>
  http.get(`/facturacion/factura/${id}/pdf`, { responseType: "arraybuffer" });

// ZIP con el PDF de cada factura seleccionada en el historial
export const exportFacturasCfdiZip = (ids) =>
  http.post(
    "/facturacion/facturas/export-zip",
    { ids },
    { responseType: "arraybuffer" }
  );

// PDF(s) renombrados como WT-AS-700910-SERVICOMPACTOS DE JUAREZ-UUID-MES-AÑO
// (un PDF si es una sola factura, ZIP si son varias). Nombre final en el header x-filename.
export const exportFacturasPdfWt = (ids) =>
  http.post(
    "/facturacion/facturas/export-pdf-wt",
    { ids },
    { responseType: "arraybuffer" }
  );
