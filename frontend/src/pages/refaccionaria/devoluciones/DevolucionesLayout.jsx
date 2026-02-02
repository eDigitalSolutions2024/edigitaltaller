import { NavLink, Outlet } from "react-router-dom";

export default function DevolucionesLayout() {
  return (
    <div className="p-4">
      {/* aquí se renderiza dinero/pieza/vale/etc */}
      <Outlet />
    </div>
  );
}
