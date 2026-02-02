// src/api/customers.js
import http from "./http"; // ya lo tienes

export const createCustomer = (data) => http.post("/clientes", data);

export const listCustomers = (params) =>
  http.get("/clientes", { params });

// opcional: obtener todos sin filtros
export const getClientes = () => http.get("/clientes");

// 👇 NUEVA: obtener un cliente por id
export const getCustomer = (id) =>
  http.get(`/clientes/${id}`);

// 👇 NUEVA: actualizar cliente
export const updateCustomer = (id, payload) =>
  http.put(`/clientes/${id}`, payload);
