// src/api/cajas.js
import http from "./http";
const API = process.env.REACT_APP_API_URL || "http://localhost:8010";

// Lista de órdenes para Cajas: todas las órdenes sin importar su estadoOrden,
// salvo las canceladas y las ya liquidadas (ver backend/routes/cajas.js).
// params.vista: "activas" (default) | "cerradas" | "liquidadas" | "pendientes" | "garantias".
// params.sort: "recientes" (default) | "os_asc" | "os_desc".
export const listOrdenesCaja = (params) =>
  http.get("/cajas", { params });

// Detalle de la orden + totales ya calculados (total, abonado, saldo)
export const getOrdenCaja = (id) =>
  http.get(`/cajas/${id}`);

// Registrar un pago/abono/anticipo (con su comprobante: Nota de Venta o Remisión)
export const registrarPago = (id, payload) =>
  http.post(`/cajas/${id}/pagos`, payload);

// Cancela un pago ya registrado (p. ej. el anticipo o la remisión de una orden
// que ahora se va a facturar). El pago conserva su folio pero deja de contar
// como abonado.
export const cancelarPagoCaja = (id, pagoId, payload = {}) =>
  http.post(`/cajas/${id}/pagos/${pagoId}/cancelar`, payload);

// Descuentos (globales o sobre una pieza/servicio vía lineaId)
export const agregarDescuento = (id, payload) =>
  http.post(`/cajas/${id}/descuentos`, payload);

export const actualizarDescuento = (id, descuentoId, payload) =>
  http.put(`/cajas/${id}/descuentos/${descuentoId}`, payload);

export const eliminarDescuento = (id, descuentoId) =>
  http.delete(`/cajas/${id}/descuentos/${descuentoId}`);

// Impresión (pendiente de implementar el PDF real) — imprime el último pago
// registrado con ese comprobante.
export const openNotaVentaPdf = (id, pagoId) => {
  const url = `${API}/cajas/${id}/nota-venta-pdf?pagoId=${pagoId}`;
  window.open(url, "_blank", "noopener");
};

export const openRemisionPdf = (id, pagoId) => {
  const url = `${API}/cajas/${id}/remision-pdf?pagoId=${pagoId}`;
  window.open(url, "_blank", "noopener");
};

export const openReciboProvisionalPdf = (id, pagoId) => {
  const url = `${API}/cajas/${id}/recibo-provisional-pdf?pagoId=${pagoId}`;
  window.open(url, "_blank", "noopener");
};

export const openReciboDolaresPdf = (id, pagoId) => {
  const url = `${API}/cajas/${id}/recibo-dolares-pdf?pagoId=${pagoId}`;
  window.open(url, "_blank", "noopener");
};
