import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { getUser } from "../../auth";

export default function SoporteLayout() {
  const user = getUser();
  const esAdmin = user?.role === "admin";
  const base = "/soporte";
  const tab = ({ isActive }) =>
    "px-3 py-2 rounded-pill me-2 " + (isActive ? "btn btn-primary" : "btn btn-outline-primary");

  return (
    <div className="container-fluid py-3">
      <h2 className="mb-3">🛟 Soporte</h2>

      <div className="mb-3">
        {esAdmin ? (
          <>
            <NavLink to={`${base}/admin`} className={tab}>Panel Admin</NavLink>
            <NavLink to={`${base}/admin/historial`} className={tab}>Historial</NavLink>
          </>
        ) : (
          <NavLink to={`${base}/mis-tickets`} className={tab}>Mis Tickets</NavLink>
        )}
      </div>

      <div className="card shadow-sm">
        <div className="card-body">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
