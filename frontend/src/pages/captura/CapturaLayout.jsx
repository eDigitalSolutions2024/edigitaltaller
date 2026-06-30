import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

export default function CapturaLayout() {
  const tab = ({ isActive }) =>
    'px-3 py-2 rounded-pill me-2 ' + (isActive ? 'btn btn-primary' : 'btn btn-outline-primary');

  return (
    <div className="container-fluid py-3">
      <h2 className="mb-3">📊 Captura</h2>

      <div className="mb-3">
        <NavLink to="/captura/originales" className={tab}>
          Reporte de Originales
        </NavLink>
        <NavLink to="/captura/ventas-asesores" className={tab}>
          Reporte de Ventas (Asesores)
        </NavLink>
      </div>

      <div className="card shadow-sm">
        <div className="card-body">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
