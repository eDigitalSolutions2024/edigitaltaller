import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { getUser } from "../../auth";

// Reportes de órdenes que existen en el sistema, filtrados a Chirey. Cada uno
// conserva el mismo acceso por rol que tiene en su sección original.
export const REPORTES_CHIREY = [
  { to: "originales",          label: "Originales (cerradas)", roles: ["admin", "coordinador", "finanzas", "captura"] },
  { to: "ventas-asesores",     label: "Ventas por asesor",     roles: ["admin", "coordinador", "finanzas", "captura"] },
  { to: "ordenes-abiertas",    label: "Órdenes abiertas",      roles: ["admin", "coordinador", "auditoria"] },
  { to: "originales-abiertas", label: "Originales (abiertas)", roles: ["admin", "coordinador", "auditoria"] },
  { to: "garantias",           label: "Garantías",             roles: ["admin", "coordinador", "auditoria"] },
  { to: "horas-tecnico",       label: "Horas por técnico",     roles: ["admin", "coordinador", "recursos_humanos"] },
  { to: "pendientes-factura",  label: "Pendientes de factura", roles: ["admin", "coordinador", "finanzas"] },
];

export function reportesChireyVisibles(role) {
  return REPORTES_CHIREY.filter((r) => r.roles.includes(role));
}

export default function ChireyReportesLayout() {
  const visibles = reportesChireyVisibles(getUser()?.role);
  const tab = ({ isActive }) =>
    "px-3 py-2 rounded-pill me-2 mb-2 " + (isActive ? "btn btn-primary" : "btn btn-outline-primary");

  return (
    <div className="container-fluid py-3">
      <h3 className="mb-3">📈 Reportes Chirey</h3>
      <div className="mb-2">
        {visibles.map((r) => (
          <NavLink key={r.to} to={`/chirey/reportes/${r.to}`} className={tab}>
            {r.label}
          </NavLink>
        ))}
      </div>
      <div className="card shadow-sm">
        <div className="card-body">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
