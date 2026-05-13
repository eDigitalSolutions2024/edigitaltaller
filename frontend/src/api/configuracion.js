const API_URL = process.env.REACT_APP_API_URL || "http://localhost:4000/api";

function getToken() {
  return localStorage.getItem("token");
}

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}/configuracion${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.message || "Error en la petición");
  }

  return data;
}

export const getTiposCambio = () => request("/tipo-cambio");

export const crearTipoCambio = (payload) =>
  request("/tipo-cambio", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const getUnidadesMedida = () => request("/unidades-medida");

export const crearUnidadMedida = (payload) =>
  request("/unidades-medida", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const cambiarEstadoUnidad = (id, activo) =>
  request(`/unidades-medida/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ activo }),
  });

export const getMecanicos = () => request("/mecanicos");

export const crearMecanico = (payload) =>
  request("/mecanicos", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const cambiarEstadoMecanico = (id, activo) =>
  request(`/mecanicos/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ activo }),
  });