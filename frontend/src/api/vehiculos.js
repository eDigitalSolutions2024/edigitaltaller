// src/api/vehiculos.js
import http from "./http";
import axios from "axios"
const API = process.env.REACT_APP_API_URL || "http://localhost:8010";


// Crear una nueva "entrada de vehículo" para un cliente
export const createVehiculo = (clienteId, data) =>
  http.post("/vehiculos", { clienteId, ...data });

// (opcional) listar vehículos de un cliente
export const listVehiculosByCliente = (clienteId) =>
  http.get(`/vehiculos/cliente/${clienteId}`);

// NUEVO: consulta general de órdenes
export const listOrdenesServicio = (params) =>
  http.get("/vehiculos/ordenes", { params });

export const getVehiculoById = (id) =>
  http.get(`/vehiculos/${id}`);

export const updateServicioReparacion = (id, servicioReparacion) =>
  http.put(`/vehiculos/${id}/servicio`, { servicioReparacion });


export const saveRequisicionDiagnostico = (id, payload) =>
  http.put(`/vehiculos/${id}/requisicion-diagnostico`, payload);



// 🔹 NUEVO: guardar presupuesto + venta al cliente
export const savePresupuestoVenta = (id, payload) =>
  http.put(`/vehiculos/${id}/presupuesto-venta`, payload);



// 👇 nuevo ayudante
export const openOperativoPdf = (id) => {
  const url = `${API}/vehiculos/${id}/operativo-pdf`;
  window.open(url, "_blank", "noopener");
};

// 👇 abre el PDF de impresión / contrato
export const openImprimirPdf = (id) => {
  const url = `${API}/vehiculos/${id}/orden-pdf`;
  window.open(url, "_blank", "noopener");
};

export async function generarOrdenCompra(ordenId, refaccion) {
  const { data } = await http.post(`/vehiculos/${ordenId}/orden-compra`, {
    refaccion,
  });
  return data; // aquí te puede regresar { numeroOC, idOC, ... }
};

// Cerrar orden
export const closeOrden = (id) =>
  http.put(`/vehiculos/${id}/cerrar`);
