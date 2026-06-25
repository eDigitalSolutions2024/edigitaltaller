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
// papel: 'a4' | 'carta' | 'oficio'
export const openOperativoPdf = (id, papel = 'a4') => {
  const url = `${API}/vehiculos/${id}/operativo-pdf?papel=${papel}`;
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

export const openPresupuestoPdf = (id) => {
  const url = `${API}/vehiculos/${id}/presupuesto-pdf`;
  window.open(url, "_blank", "noopener");
};

// Cerrar orden
export const closeOrden = (id) =>
  http.put(`/vehiculos/${id}/cerrar`);

export const openVentaClientePdf = (id) => {
  const url = `${API}/vehiculos/${id}/venta-cliente-pdf`;
  window.open(url, "_blank", "noopener");
};

export const marcarSurtidas = (id, presupuesto) =>
  http.put(`/vehiculos/${id}/surtir`, { presupuesto });

export const updateDatosOrden = (id, payload) =>
  http.put(`/vehiculos/${id}/datos`, payload);

export const getMisOrdenes = () =>
  http.get('/vehiculos/mis-ordenes');

export const getRefaccionariaAlerts = () =>
  Promise.all([
    http.get('/vehiculos/ordenes', { params: { estado: 'PENDIENTE_REFACCIONARIA', limit: 1 } }),
    http.get('/vehiculos/ordenes', { params: { estado: 'PENDIENTE_SURTIR', limit: 1 } }),
    http.get('/vehiculos/ordenes', { params: { estado: 'REPARACION_EN_CURSO', limit: 1 } }),
  ]).then(([sol, ps, ric]) => ({
    solicitudes: sol.data.total ?? 0,
    porSurtir: (ps.data.total ?? 0) + (ric.data.total ?? 0),
  }));

