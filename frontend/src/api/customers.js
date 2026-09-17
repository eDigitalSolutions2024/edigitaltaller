// src/api/customers.js
import http from "./http"; // ya lo tienes

export const createCustomer = (data) => http.post("/clientes", data);

export const listCustomers = (params) =>
  http.get("/clientes", { params });

// opcional: obtener todos sin filtros
export const getClientes = (params) => http.get("/clientes", { params });

// 👇 NUEVA: obtener un cliente por id
export const getCustomer = (id) =>
  http.get(`/clientes/${id}`);

// 👇 NUEVA: actualizar cliente
export const updateCustomer = (id, payload) =>
  http.put(`/clientes/${id}`, payload);

// 👇 NUEVA: buscar clientes para facturación (por nombre, RFC, email)
export const buscarClientesFacturacion = (q) =>
  http.get("/clientes", { params: { search: q, limit: 20 } });

// 👇 Catálogo de códigos de servicio propios del cliente (solo admin/cajas).
// Se usan al timbrar para llenar NoIdentificacion en el CFDI.
export const getCustomerCodigos = (id) =>
  http.get(`/clientes/${id}/codigos-servicio`);

export const updateCustomerCodigos = (id, rows) =>
  http.put(`/clientes/${id}/codigos-servicio`, rows);

// 👇 Activar / desactivar cliente (baja lógica, ver Cliente.activo). El
// backend exige `motivo` al desactivar (ver PATCH /clientes/:id/estado).
export const setCustomerEstado = (id, activo, motivo) =>
  http.patch(`/clientes/${id}/estado`, { activo, ...(motivo ? { motivo } : {}) });

// 👇 Botón "Empleados" de Nueva Orden de Servicio y editor de "Datos de
// facturación" de Personal: busca o crea la ficha de cliente ligada a esa
// persona (Empleado o usuario "solo_usuario") — ver POST /clientes/desde-personal
export const crearClienteDesdePersonal = ({ empleadoId, userId }) =>
  http.post(`/clientes/desde-personal`, { empleadoId, userId });

// 👇 Migración manual de un cliente "es empleado" ya existente hacia el
// registro real de Empleado (Consulta de Clientes → "Convertir a Empleado")
export const convertirClienteAEmpleado = (id, payload) =>
  http.post(`/clientes/${id}/convertir-a-empleado`, payload);