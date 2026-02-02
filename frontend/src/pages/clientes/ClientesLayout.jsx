import { NavLink, Outlet } from "react-router-dom";
import "../../styles/clientes.css";

export default function ClientesLayout() {
  const base = "/clientes";
  const tab = ({ isActive }) =>
    "px-3 py-2 rounded-pill me-2 " +
    (isActive ? "btn btn-primary" : "btn btn-outline-primary");

  return (
    <div className="clientes-wrap">
      <h2 className="mb-3">👥 Clientes</h2>

      <div className="mb-3">
        <NavLink to={`${base}/alta`} className={tab}>
          Alta
        </NavLink>
        <NavLink to={`${base}/consulta`} className={tab}>
          Consultar
        </NavLink>
      </div>

      <div className="clientes-content">
        <Outlet />
      </div>
    </div>
  );
}
