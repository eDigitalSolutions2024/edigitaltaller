import React from "react";
import { NavLink, Outlet } from "react-router-dom";

export default function VehiculosLayout() {
  const base = "/vehiculo";
  const tab = ({ isActive }) =>
    "px-3 py-2 rounded-pill me-2 " + (isActive ? "btn btn-primary" : "btn btn-outline-primary");

  return (
    <div className="container-fluid py-3">
      <h2 className="mb-3">🚗 Vehículo</h2>

      <div className="mb-3">
        <NavLink to={`${base}/entrada`} className={tab}>Entrada</NavLink>
        <NavLink to={`${base}/consulta-ordenes`} className={tab}>Consulta Órdenes</NavLink>
        <NavLink to={`${base}/consulta-ordenes-cerradas`} className={tab}>Consulta Órdenes Cerradas</NavLink>
        <NavLink to={`${base}/exportar`} className={tab}>Exportar</NavLink>
      </div>

      <div className="card shadow-sm">
        <div className="card-body">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
