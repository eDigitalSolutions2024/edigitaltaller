// src/api/cajas.js
import http from "./http";
const API = process.env.REACT_APP_API_URL || "http://localhost:8010";

// Lista de órdenes para Cajas: todas las órdenes sin importar su estadoOrden,
// salvo las canceladas y las ya liquidadas (ver backend/routes/cajas.js).
// params.vista: "activas" (default) | "liquidadas" | "garantias".
export const listOrdenesCaja = (params) =>
  http.get("/cajas", { params });

// Detalle de la orden + totales ya calculados (total, abonado, saldo)
export const getOrdenCaja = (id) =>
  http.get(`/cajas/${id}`);

// Registrar un pago/abono/anticipo (con su comprobante: Nota de Venta o Remisión)
export const registrarPago = (id, payload) =>
  http.post(`/cajas/${id}/pagos`, payload);

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
