import axiosClient from "./http"; // tu axios custom

export function generarVistaPreviaPDF(payload) {
  return axiosClient.post("/facturacion/preview", payload, {
    responseType: "arraybuffer", // 👈 importante para PDF
  });
}

// Todas las notas de venta de Caja (comprobante NOTA_VENTA, no canceladas) que
// aún no están en ninguna factura global. Es la base de la factura global.
export function getNotasVentaPendientes() {
  return axiosClient.get("/facturacion/notas-venta-pendientes");
}
