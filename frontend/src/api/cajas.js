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

// Cancela un pago ya registrado. payload: { modo, motivo, facturaId }.
//  - modo 'ERROR' (solo admin): corrección de captura, exige motivo.
//  - modo 'PASA_A_FACTURA_EXISTENTE' (admin o cajas): exige facturaId de una
//    factura ya generada. (Cancelar hacia una factura futura solo se hace en
//    la pantalla de Facturar, no desde Cajas.)
// El pago conserva su folio pero deja de contar como abonado.
export const cancelarPagoCaja = (id, pagoId, payload = {}) =>
  http.post(`/cajas/${id}/pagos/${pagoId}/cancelar`, payload);

// Deshace una cancelación siempre que el pago no esté ligado a una factura ya
// generada (el modo ERROR solo lo deshace un admin).
export const deshacerCancelacionPago = (id, pagoId) =>
  http.post(`/cajas/${id}/pagos/${pagoId}/deshacer-cancelacion`);

// URL del mini-PDF de vista previa (solo para ver): cómo quedaría esta
// cancelación en el Reporte de Cajas. Se pasa el facturaId destino.
export const getPreviewCancelacionUrl = (id, pagoId, { facturaId } = {}) => {
  const qs = facturaId ? `?facturaId=${encodeURIComponent(facturaId)}` : "";
  return `${API}/cajas/${id}/pagos/${pagoId}/preview-cancelacion${qs}`;
};

// Descuentos (globales o sobre una pieza/servicio vía lineaId)
export const agregarDescuento = (id, payload) =>
  http.post(`/cajas/${id}/descuentos`, payload);

export const actualizarDescuento = (id, descuentoId, payload) =>
  http.put(`/cajas/${id}/descuentos/${descuentoId}`, payload);

export const eliminarDescuento = (id, descuentoId) =>
  http.delete(`/cajas/${id}/descuentos/${descuentoId}`);

// Marca o desmarca la orden como "Pendiente de Factura" (al cliente le
// faltan datos fiscales). Se limpia sola al generar la factura real.
export const marcarPendienteFactura = (id, pendienteFactura) =>
  http.patch(`/cajas/${id}/pendiente-factura`, { pendienteFactura });

// Impresión — el último pago registrado con ese comprobante.
export const getNotaVentaPdfUrl = (id, pagoId) => `${API}/cajas/${id}/nota-venta-pdf?pagoId=${pagoId}`;

export const getRemisionPdfUrl = (id, pagoId) => `${API}/cajas/${id}/remision-pdf?pagoId=${pagoId}`;

export const getReciboProvisionalPdfUrl = (id, pagoId) => `${API}/cajas/${id}/recibo-provisional-pdf?pagoId=${pagoId}`;

export const getReciboDolaresPdfUrl = (id, pagoId) => `${API}/cajas/${id}/recibo-dolares-pdf?pagoId=${pagoId}`;
