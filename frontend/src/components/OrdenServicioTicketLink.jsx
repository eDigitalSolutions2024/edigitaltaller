import React from 'react';
import { Link } from 'react-router-dom';

// Celda "Orden de servicio" de las tablas de tickets. El ticket guarda un
// snapshot del folio (folioOrdenServicio) tomado al momento de crearse; si la
// orden referenciada (ordenServicio, poblada por el backend) fue renombrada
// después, se muestra el cambio "antes → después" en vez de solo el folio
// viejo, para no confundir con un link que dice un número pero lleva a otro.
export default function OrdenServicioTicketLink({ ticket }) {
  const orden = ticket.ordenServicio;
  const folioAntes = ticket.folioOrdenServicio;

  if (!orden) {
    return folioAntes ? (
      <span className="text-muted" title="La orden ya no existe">{folioAntes}</span>
    ) : '—';
  }

  const folioActual = orden.ordenServicio || '';
  const cambio = Boolean(folioAntes && folioActual && folioAntes !== folioActual);

  // RESTABLECER_COBRO manda a Cajas (con la orden ya cargada) en vez de a la
  // orden en sí: ahí es donde el admin ve el historial de pagos y cancela el
  // abono/anticipo/remisión/nota de venta puntual.
  const destino =
    ticket.tipoProblema === 'RESTABLECER_COBRO'
      ? `/cajas/orden/${orden._id}`
      : `/vehiculo/orden/${orden._id}?tab=general`;

  const link = (
    <Link to={destino}>
      {folioActual || 'Ver orden'}
    </Link>
  );

  if (!cambio) return link;

  return (
    <span>
      <span className="text-muted text-decoration-line-through" title="Número antes de editar">
        {folioAntes}
      </span>
      {' → '}
      {link}
    </span>
  );
}
