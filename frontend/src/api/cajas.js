// src/api/cajas.js
import http from "./http";
const API = process.env.REACT_APP_API_URL || "http://localhost:8010";

// Búsqueda unificada: folio de orden, cliente o serie, en REPARACION_EN_CURSO
// más todas las órdenes de garantía sin importar su estatus.
export const listOrdenesEnCurso = (params) =>
  http.get("/vehiculos/ordenes", {
    params: { estado: "REPARACION_EN_CURSO", incluirGarantias: true, ...params },
  });

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
