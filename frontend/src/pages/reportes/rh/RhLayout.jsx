import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

export default function RhLayout() {
  const tab = ({ isActive }) =>
    'px-3 py-2 rounded-pill me-2 ' + (isActive ? 'btn btn-primary' : 'btn btn-outline-primary');

  return (
    <div className="container-fluid py-3">
      <h2 className="mb-3">👷 Recursos Humanos</h2>

      <div className="mb-3">
        <NavLink to="/reportes/rh/horas-tecnico" className={tab}>
          Reporte de Horas por Técnico
        </NavLink>
        {/* <NavLink to="/reportes/rh/cxc" className={tab}>
          Reporte de C x C
        </NavLink> */}
      </div>

      <div className="card shadow-sm">
        <div className="card-body">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
