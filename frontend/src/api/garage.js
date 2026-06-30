import http from "./http";

export const getGarageVehiculos = () => http.get("/garage");

export const getGarageVehiculosDetalle = () => http.get("/garage?detalle=1");

export const upsertGarageVehiculo = (data) => http.post("/garage", data);

export const importarVehiculosCerrados = () => http.post("/garage/importar-cerradas");
