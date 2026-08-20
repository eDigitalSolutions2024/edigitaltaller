// src/api/ordenesCompra.js
import http from "./http"; // tu instancia axios con baseURL y auth

export async function fetchOrdenesCompra(params = {}) {
  const { data } = await http.get("/ordenes-compra", { params });
  // backend responde { ok, data: [...], ... }
  return data.data || [];
}

export async function createOrdenCompraManual(payload) {
  const { data } = await http.post("/ordenes-compra/manual", payload);
  return data;
}

// Devuelve una blob URL (requiere el token de auth, por eso no es una URL
// directa como los demás PDFs) lista para pasarle a abrirPdf().
export async function getOrdenCompraPdfBlobUrl(id) {
  const resp = await http.get(`/ordenes-compra/${id}/pdf`, {
    responseType: "blob",
  });
  const blob = new Blob([resp.data], { type: "application/pdf" });
  return window.URL.createObjectURL(blob);
}
