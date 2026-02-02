import { Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import Sidebar from "../components/Navbar";
import "../styles/Navbar.css";

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sidebar_collapsed") === "1"
  );
  const [hidden, setHidden] = useState(true); // en móvil: empieza oculto

  const toggleCollapse = () => setCollapsed(c => !c);
  const showSidebar   = () => setHidden(false);
  const hideSidebar   = () => setHidden(true);

  useEffect(() => {
    localStorage.setItem("sidebar_collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <div className={`app-shell ${collapsed ? "is-collapsed" : ""} ${hidden ? "is-hidden" : ""}`}>
      {/* Tu Navbar SIN cambios de diseño ni props extra */}
      <Sidebar collapsed={collapsed} onToggle={toggleCollapse} />

      {/* Overlay móvil para cerrar tocando fuera */}
      <div className="app-overlay" onClick={hideSidebar} />

      {/* Contenido */}
      <main className="app-content">
        {/* Puedes abrir/cerrar desde páginas con useOutletContext si quieres */}
        <Outlet context={{ collapsed, toggleCollapse, showSidebar, hideSidebar }} />
      </main>
    </div>
  );
}
