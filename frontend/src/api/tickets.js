import http from './http';

export const TIPOS_PROBLEMA_OPCIONES = [
  { value: 'VEHICULOS_ORDENES', label: 'Vehículos / Órdenes' },
  { value: 'RESTABLECER_OS', label: 'Restablecer OS' },
  { value: 'CAMBIO_ASESOR', label: 'Cambio de Asesor' },
  { value: 'RESTABLECER_COBRO', label: 'Restablecer Abono / Remisión / Nota Venta' },
  { value: 'RESTABLECER_CAJA', label: 'Restablecer Caja' },
  { value: 'CAJAS', label: 'Cajas' },
  { value: 'REFACCIONARIA', label: 'Refaccionaria' },
  { value: 'FACTURACION', label: 'Facturación' },
  { value: 'CLIENTES_PROVEEDORES', label: 'Clientes / Proveedores' },
  { value: 'REPORTES_CONFIGURACION', label: 'Reportes / Configuración' },
  // No se ofrece en el formulario general de Soporte (ver SoporteForm, que
  // filtra este valor): se crea solo desde el modal de cancelar orden.
  { value: 'GARANTIA_NO_APLICA', label: 'Garantía no aplica' },
  { value: 'OTRO', label: 'Otro' },
];

export const ESTADO_TICKET_BADGE = {
  PENDIENTE: 'bg-secondary',
  EN_PROCESO: 'bg-warning text-dark',
  FINALIZADO: 'bg-success',
};

export const ESTADO_TICKET_LABEL = {
  PENDIENTE: 'Pendiente',
  EN_PROCESO: 'En Proceso',
  FINALIZADO: 'Finalizado',
};

export const RESULTADO_TICKET_BADGE = {
  APROBADO: 'bg-success',
  RECHAZADO: 'bg-danger',
};

export const RESULTADO_TICKET_LABEL = {
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
};

export function tipoProblemaLabel(value) {
  return TIPOS_PROBLEMA_OPCIONES.find((o) => o.value === value)?.label || value;
}

export const createTicket = (payload) => http.post('/tickets', payload);

export const getMisTickets = (params) => http.get('/tickets/mis-tickets', { params });

export const listTickets = (params) => http.get('/tickets', { params });

export const cambiarEstadoTicket = (id, estado) => http.put(`/tickets/${id}/estado`, { estado });

// Aprobar/negar un ticket de tipo CAMBIO_ASESOR (solo admin). Al aprobar, el
// backend aplica el cambio real de asesor sobre la orden vinculada.
export const resolverCambioAsesorTicket = (id, accion) =>
  http.put(`/tickets/${id}/resolver-cambio-asesor`, { accion });

// Aprobar/negar un ticket de tipo RESTABLECER_CAJA (solo admin). Al aprobar,
// el backend reabre de verdad el día de caja solicitado.
export const resolverRestablecerCajaTicket = (id, accion) =>
  http.put(`/tickets/${id}/resolver-restablecer-caja`, { accion });

// Aplica/No aplica un ticket de tipo GARANTIA_NO_APLICA (solo admin). Al
// marcar "No aplica", el backend cancela la orden y crea automáticamente la
// orden de reemplazo para el mismo asesor, pendiente de capturar el número
// de OS.
export const resolverGarantiaTicket = (id, decision) =>
  http.put(`/tickets/${id}/resolver-garantia`, { decision });
