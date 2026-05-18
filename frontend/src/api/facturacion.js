import axiosClient from "./http"; // tu axios custom

export function generarVistaPreviaPDF(payload) {
  return axiosClient.post("/facturacion/preview", payload, {
    responseType: "arraybuffer", // 👈 importante para PDF
  });
}
