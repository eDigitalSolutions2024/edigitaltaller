// src/api/codigos.js
import http from "./http"; // 👈 igual que en customers, vehiculos, etc.

/**
 * Trae solo códigos de tipo "servicio" para el taller
 */
export async function fetchServiciosTaller() {
  const { data } = await http.get("/codigos/options", {
    params: { tipo: "servicio" },
  });

  // backend responde: { success, data, total? }
  if (!data.success) {
    throw new Error(data.message || "Error al cargar servicios");
  }

  return data.data || [];
}
