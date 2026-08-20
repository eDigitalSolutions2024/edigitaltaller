// src/api/vehiculos.js
import http from "./http";
import axios from "axios"
import { getUser } from "../auth";
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

// Continuar sin refacciones: los servicios capturados entran al presupuesto
// (cada uno puede traer ya su mecánico/carrocero asignado, que se liga a la
// partida de presupuesto recién creada); la orden no pasa por refaccionaria.
// serviciosCatalogo: bundles seleccionados del catálogo de Servicios (con sus
// refacciones incluidas/excluidas y observaciones), también saltan refaccionaria.
export const omitirRefacciones = (id, { servicios = [], serviciosCatalogo = [] }) =>
  http.put(`/vehiculos/${id}/omitir-refacciones`, { servicios, serviciosCatalogo });



// 🔹 NUEVO: guardar presupuesto + venta al cliente
export const savePresupuestoVenta = (id, payload) =>
  http.put(`/vehiculos/${id}/presupuesto-venta`, payload);



// 👇 nuevo ayudante
// papel: 'a4' | 'carta' | 'oficio'
// formato: 'operativo' (recepción/servicio + contrato) | 'cliente' (solo resumen)
export const getOperativoPdfUrl = (id, papel = 'carta', formato = 'operativo') => {
  const usuario = getUser();
  const asesor = usuario?.name || usuario?.username || '';
  // El backend solo usa este nombre si la orden pertenece a un grupo (para
  // mostrar en el PDF a quien lo está imprimiendo, no a quien la creó).
  return `${API}/vehiculos/${id}/operativo-pdf?papel=${papel}&asesor=${encodeURIComponent(asesor)}&formato=${formato}`;
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

export const getPresupuestoPdfUrl = (id) => `${API}/vehiculos/${id}/presupuesto-pdf`;

// Cerrar orden
export const closeOrden = (id) =>
  http.put(`/vehiculos/${id}/cerrar`);

// Restablecer orden cerrada/cancelada a su estado anterior (solo admin)
export const restoreOrden = (id) =>
  http.put(`/vehiculos/${id}/restablecer`);

// Reasignar la orden a otro asesor de servicio (solo admin)
export const cambiarAsesorOrden = (id, asesorId) =>
  http.put(`/vehiculos/${id}/cambiar-asesor`, { asesorId });

export const getVentaClientePdfUrl = (id) => `${API}/vehiculos/${id}/venta-cliente-pdf`;

export const marcarSurtidas = (id, presupuesto) =>
  http.put(`/vehiculos/${id}/surtir`, { presupuesto });

export const updateDatosOrden = (id, payload) =>
  http.put(`/vehiculos/${id}/datos`, payload);

// Subir una o más imágenes (fotos del vehículo, daños, etc.) adjuntas a la orden.
export const subirImagenesOrden = (id, files, subidoPor = "") => {
  const formData = new FormData();
  Array.from(files).forEach((file) => formData.append("imagenes", file));
  if (subidoPor) formData.append("subidoPor", subidoPor);
  return http.post(`/vehiculos/${id}/imagenes`, formData);
};

export const eliminarImagenOrden = (id, imagenId) =>
  http.delete(`/vehiculos/${id}/imagenes/${imagenId}`);

// Imágenes subidas antes de guardar la orden (aún no existe el folio real):
// viven en una carpeta temporal identificada por tempId y se migran a la
// orden definitiva al crearla (ver createVehiculo / handleSubmit).
export const subirImagenesTemp = (tempId, files) => {
  const formData = new FormData();
  Array.from(files).forEach((file) => formData.append("imagenes", file));
  return http.post(`/vehiculos/imagenes/temp/${tempId}`, formData);
};

export const eliminarImagenTemp = (tempId, filename) =>
  http.delete(`/vehiculos/imagenes/temp/${tempId}/${encodeURIComponent(filename)}`);

export const descartarImagenesTemp = (tempId) =>
  http.delete(`/vehiculos/imagenes/temp/${tempId}`);

export const getMisOrdenes = () =>
  http.get('/vehiculos/mis-ordenes');

// Filtro condicional: solo las órdenes que atendió este refaccionario, o las
// que nadie ha atendido aún (el backend resuelve devueltoPor vacío/null como
// "sin dueño, visible a todos"). Pasar null/undefined para no filtrar.
export const filtroDevueltoPor = (nombreRefaccionario) =>
  nombreRefaccionario ? { devueltoPor: nombreRefaccionario } : {};

// Filtros que definen lo que un refaccionario tiene realmente por surtir:
// sus propias órdenes (o las que nadie atendió) y que aún traigan refacciones
// autorizadas sin surtir.
export const filtrosPorSurtir = (nombreRefaccionario) => ({
  conPendientesSurtir: true,
  ...filtroDevueltoPor(nombreRefaccionario),
});

export const getRefaccionariaAlerts = (nombreRefaccionario) => {
  const surtir = filtrosPorSurtir(nombreRefaccionario);
  return Promise.all([
    http.get('/vehiculos/ordenes', {
      params: { ...filtroDevueltoPor(nombreRefaccionario), estado: 'PENDIENTE_REFACCIONARIA', limit: 1 },
    }),
    http.get('/vehiculos/ordenes', { params: { ...surtir, estado: 'PENDIENTE_SURTIR', limit: 1 } }),
    http.get('/vehiculos/ordenes', { params: { ...surtir, estado: 'REPARACION_EN_CURSO', limit: 1 } }),
  ]).then(([sol, ps, ric]) => ({
    solicitudes: sol.data.total ?? 0,
    porSurtir: (ps.data.total ?? 0) + (ric.data.total ?? 0),
  }));
};

