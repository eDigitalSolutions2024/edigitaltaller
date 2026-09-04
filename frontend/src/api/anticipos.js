// src/api/anticipos.js — Anticipos de clientes (saldo a favor)
import http from "./http";
const API = process.env.REACT_APP_API_URL || "http://localhost:4000/api";

// Registrar un depósito de anticipo para un cliente (sin ligarlo a una orden).
export const registrarAnticipo = (payload) => http.post("/anticipos", payload);

// Lista operativa de clientes con saldo a favor disponible (>0), para
// mostrarla de entrada en la pantalla de Cajas sin tener que buscar cliente
// por cliente.
export const getClientesConSaldo = () => http.get("/anticipos/clientes");

// Historial de movimientos de saldo de un cliente (depósitos, usos, reembolsos).
export const getHistorialAnticipos = (clienteId) =>
  http.get(`/anticipos/cliente/${clienteId}`);

// Recibos de anticipo / provisionales del cliente con saldo sin gastar
// (restante > 0), para elegir de cuál aplicar en Registrar Pago.
export const getAnticiposDisponibles = (clienteId) =>
  http.get(`/anticipos/cliente/${clienteId}/disponibles`);

// Cancela un depósito (solo admin, corrección de captura).
export const cancelarAnticipo = (id, payload) =>
  http.post(`/anticipos/${id}/cancelar`, payload);

// PDF del recibo — se abre con window.open()/iframe, sin header Authorization.
export const getAnticipoReciboPdfUrl = (id) => `${API}/anticipos/${id}/recibo-pdf`;
