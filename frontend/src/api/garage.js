import http from "./http";

export const getGarageVehiculos = (lineaNegocio) =>
  http.get("/garage", { params: lineaNegocio ? { lineaNegocio } : {} });

export const searchGarageVehiculos = (search, lineaNegocio) =>
  http.get("/garage", { params: { search, ...(lineaNegocio ? { lineaNegocio } : {}) } });

export const getGarageVehiculosDetalle = (lineaNegocio) =>
  http.get("/garage", { params: { detalle: 1, ...(lineaNegocio ? { lineaNegocio } : {}) } });

export const upsertGarageVehiculo = (data) => http.post("/garage", data);

export const importarVehiculosCerrados = () => http.post("/garage/importar-cerradas");
