import http from './http';

export const TIPOS_PROBLEMA_OPCIONES = [
  { value: 'VEHICULOS_ORDENES', label: 'Vehículos / Órdenes' },
  { value: 'RESTABLECER_OS', label: 'Restablecer OS' },
  { value: 'CAJAS', label: 'Cajas' },
  { value: 'REFACCIONARIA', label: 'Refaccionaria' },
  { value: 'FACTURACION', label: 'Facturación' },
  { value: 'CLIENTES_PROVEEDORES', label: 'Clientes / Proveedores' },
  { value: 'REPORTES_CONFIGURACION', label: 'Reportes / Configuración' },
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

export function tipoProblemaLabel(value) {
  return TIPOS_PROBLEMA_OPCIONES.find((o) => o.value === value)?.label || value;
}

export const createTicket = (payload) => http.post('/tickets', payload);

export const getMisTickets = (params) => http.get('/tickets/mis-tickets', { params });

export const listTickets = (params) => http.get('/tickets', { params });

export const cambiarEstadoTicket = (id, estado) => http.put(`/tickets/${id}/estado`, { estado });
