// src/api/ordenesCompra.js
import http from "./http"; // tu instancia axios con baseURL y auth

export async function fetchOrdenesCompra(params = {}) {
  const { data } = await http.get("/ordenes-compra", { params });
  // backend responde { ok, data: [...], ... }
  return data.data || [];
}

export async function downloadOrdenCompraPdf(id) {
  const resp = await http.get(`/ordenes-compra/${id}/pdf`, {
    responseType: "blob",
  });
  const blob = new Blob([resp.data], { type: "application/pdf" });
  const url = window.URL.createObjectURL(blob);
  window.open(url, "_blank");
}
