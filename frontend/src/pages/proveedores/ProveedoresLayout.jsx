import React from "react";
import { NavLink, Outlet } from "react-router-dom";

export default function ProveedoresLayout() {
  const base = "/proveedores";
  const tab = ({ isActive }) =>
    "px-3 py-2 rounded-pill me-2 " + (isActive ? "btn btn-primary" : "btn btn-outline-primary");

  return (
    <div className="container-fluid py-3">
      <h2 className="mb-3">🧾 Proveedores</h2>

      <div className="mb-3">
        <NavLink to={`${base}/alta`} className={tab}>Alta</NavLink>
        <NavLink to={`${base}/consultar`} className={tab}>Consultar</NavLink>
      </div>

      <div className="card shadow-sm">
        <div className="card-body">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
