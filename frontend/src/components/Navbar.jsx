import { getUser, logout } from '../auth';
import { useNavigate, NavLink, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import '../styles/Navbar.css';
import { canSeeModule } from '../utils/roles';
import http from '../api/http';
import { getRefaccionariaAlerts } from '../api/vehiculos';

export default function Navbar({ collapsed, onToggle }) {
  const user = getUser();
  const navigate = useNavigate();
  const location = useLocation();

  // === CLIENTES ===
  const [clientesOpen, setClientesOpen] = useState(
    location.pathname.startsWith('/clientes')
  );
  useEffect(() => {
    if (location.pathname.startsWith('/clientes')) setClientesOpen(true);
  }, [location.pathname]);

  // === REFACCIONARIA ===
  const [refaOpen, setRefaOpen] = useState(
    location.pathname.startsWith('/refaccionaria')
  );
  useEffect(() => {
    if (location.pathname.startsWith('/refaccionaria')) setRefaOpen(true);
  }, [location.pathname]);



  // arriba de todo, junto a otros useState:
const [ordenesOpen, setOrdenesOpen] = useState(
  location.pathname.startsWith("/ordenes")
  || location.pathname.startsWith("/ordenes-compra")
);

useEffect(() => {
  if (
    location.pathname.startsWith("/ordenes") ||
    location.pathname.startsWith("/ordenes-compra")
  ) {
    setOrdenesOpen(true);
  }
}, [location.pathname]);




  // === PROVEEDORES ===
const [provOpen, setProvOpen] = useState(
  location.pathname.startsWith('/proveedores')
);
useEffect(() => {
  if (location.pathname.startsWith('/proveedores')) setProvOpen(true);
}, [location.pathname]);

  // === NUEVO: VEHÍCULO ===
  const [vehiculoOpen, setVehiculoOpen] = useState(
    location.pathname.startsWith('/vehiculo')
  );
  useEffect(() => {
    if (location.pathname.startsWith('/vehiculo')) setVehiculoOpen(true);
  }, [location.pathname]);



// === ALERTAS REFACCIONARIA ===
const [solicitudesCount, setSolicitudesCount] = useState(0);
const [porSurtirCount, setPorSurtirCount] = useState(0);

useEffect(() => {
  if (user?.role !== 'refaccionario') return;
  const fetch = async () => {
    try {
      const { solicitudes, porSurtir } = await getRefaccionariaAlerts();
      setSolicitudesCount(solicitudes);
      setPorSurtirCount(porSurtir);
    } catch (_) {}
  };
  fetch();
  const id = setInterval(fetch, 30_000);
  return () => clearInterval(id);
}, [user?.role]);

// === ADMINISTRACIÓN ===
const [adminOpen, setAdminOpen] = useState(
  location.pathname.startsWith('/admin')
);

// === FACTURACIÓN ===
const [factOpen, setFactOpen] = useState(
  location.pathname.startsWith('/facturacion')
);
useEffect(() => {
  if (location.pathname.startsWith('/facturacion')) setFactOpen(true);
}, [location.pathname]);

useEffect(() => {
  if (location.pathname.startsWith('/admin')) {
    setAdminOpen(true);
  }
}, [location.pathname]);



  const handleLogout = async () => {
    try {
      await http.post('/auth/logout'); // revoca el refresh token en BD
    } catch (_) {
      // aunque falle, cerramos sesión en el cliente
    }
    logout();
    navigate("/login");
  };

  return (
    <aside className={`sidebar ${collapsed ? "is-collapsed" : ""}`}>
      
      
      
      {/* Top: brand + toggle */}
      <div className="sidebar__top">
        <button
          className="sidebar__toggle"
          onClick={onToggle}
          aria-label="Abrir/cerrar menú"
          title={collapsed ? "Expandir" : "Colapsar"}
          type="button"
        >
          ☰
        </button>


        <div className="sidebar__brand">
          {!collapsed && <span className="brand-text">{user?.workshopName || "ServiCompactos"}</span>}
        </div>
      </div>





      {/* Links */}
      <nav className="sidebar__nav">

        
        <NavLink to="/dashboard" className="sidebar__link" title="Inicio">
          <span className="emoji">🏠</span><span className="label">Inicio</span>
        </NavLink>

        {/* Administración (solo admin) */}
          {user?.role === 'admin' && (
            <div className={`sidebar__group ${adminOpen ? 'open' : ''}`}>
              <button
                type="button"
                className="sidebar__link sidebar__group-toggle"
                onClick={() => setAdminOpen(o => !o)}
                aria-expanded={adminOpen}
                aria-controls="submenu-admin"
                title="Administración"
              >
                <span className="emoji">🛡️</span>
                <span className="label">Administración</span>
                {!collapsed && <span className="chev" aria-hidden>▾</span>}
              </button>

              <div id="submenu-admin" className="sidebar__sublinks">
                <NavLink
                  to="/admin/personal"
                  className={({ isActive }) => `sidebar__sublink ${isActive ? 'active' : ''}`}
                >
                  <span className="label">Personal</span>
                </NavLink>
              </div>

            </div>
          )}

          {user?.role === 'admin' && (
              <NavLink to="/configuracion" className="sidebar__link" title="Configuración">
                <span className="emoji">⚙️</span>
                <span className="label">Configuración</span>
              </NavLink>
            )}

        {canSeeModule(user?.role, 'ordenes') && (
          <NavLink to="/ordenes-compra" className="sidebar__link" title="Órdenes">
            <span className="emoji">📋</span><span className="label">Órdenes de compra</span>
          </NavLink>
        )}

        {/* === GRUPO: CLIENTES === */}
        {canSeeModule(user?.role, 'clientes') && (
        <div className={`sidebar__group ${clientesOpen ? 'open' : ''}`}>
          <button
            type="button"
            className="sidebar__link sidebar__group-toggle"
            onClick={() => setClientesOpen(o => !o)}
            aria-expanded={clientesOpen}
            aria-controls="submenu-clientes"
            title="Clientes"
          >
            <span className="emoji">👤</span>
            <span className="label">Clientes</span>
            {!collapsed && <span className="chev" aria-hidden>▾</span>}
          </button>

          <div id="submenu-clientes" className="sidebar__sublinks">
            <NavLink
              to="/clientes/alta"
              className={({ isActive }) => `sidebar__sublink ${isActive ? 'active' : ''}`}
            >
              <span className="emoji">➕</span><span className="label">Alta</span>
            </NavLink>
            <NavLink
              to="/clientes/consulta"
              className={({ isActive }) => `sidebar__sublink ${isActive ? 'active' : ''}`}
            >
              <span className="emoji">🔎</span><span className="label">Consulta</span>
            </NavLink>
          </div>
        </div>
        )}
        {/* === FIN GRUPO CLIENTES === */}

        {/* === GRUPO: PROVEEDORES === */}
        {canSeeModule(user?.role, 'proveedores') && (
          <div className={`sidebar__group ${provOpen ? 'open' : ''}`}>
            <button
              type="button"
              className="sidebar__link sidebar__group-toggle"
              onClick={() => setProvOpen(o => !o)}
              aria-expanded={provOpen}
              aria-controls="submenu-proveedores"
              title="Proveedores"
            >
              <span className="emoji">🏺</span>
              <span className="label">Proveedores</span>
              {!collapsed && <span className="chev" aria-hidden>▾</span>}
            </button>

            <div id="submenu-proveedores" className="sidebar__sublinks">
              <NavLink
                to="/proveedores/alta"
                className={({ isActive }) => `sidebar__sublink ${isActive ? 'active' : ''}`}
              >
                <span className="label">Alta</span>
              </NavLink>
              <NavLink
                to="/proveedores/consultar"
                className={({ isActive }) => `sidebar__sublink ${isActive ? 'active' : ''}`}
              >
                <span className="label">Consultar</span>
              </NavLink>
            </div>
          </div>
        )}
        {/* === FIN GRUPO PROVEEDORES === */}

        {/* === NUEVO GRUPO: VEHÍCULO === */}
        {canSeeModule(user?.role, 'vehiculo') && (
        <div className={`sidebar__group ${vehiculoOpen ? 'open' : ''}`}>
          <button
            type="button"
            className="sidebar__link sidebar__group-toggle"
            onClick={() => setVehiculoOpen(o => !o)}
            aria-expanded={vehiculoOpen}
            aria-controls="submenu-vehiculo"
            title="Vehículo"
          >
            <span className="emoji">🚗</span>
            <span className="label">Vehículo</span>
            {!collapsed && <span className="chev" aria-hidden>▾</span>}
          </button>

          <div id="submenu-vehiculo" className="sidebar__sublinks">
            <NavLink
              to="/vehiculo/entrada"
              className={({ isActive }) => `sidebar__sublink ${isActive ? 'active' : ''}`}
            >
              <span className="label">Entrada</span>
            </NavLink>

            <NavLink
              to="/vehiculo/consulta-ordenes"
              className={({ isActive }) => `sidebar__sublink ${isActive ? 'active' : ''}`}
            >
              <span className="label">Consulta Órdenes</span>
            </NavLink>

            <NavLink
              to="/vehiculo/consulta-ordenes-cerradas"
              className={({ isActive }) => `sidebar__sublink ${isActive ? 'active' : ''}`}
            >
              <span className="label">Consulta Órdenes Cerradas</span>
            </NavLink>

            <NavLink
              to="/vehiculo/consulta-ordenes-canceladas"
              className={({ isActive }) => `sidebar__sublink ${isActive ? 'active' : ''}`}
            >
              <span className="label">Consulta Órdenes Canceladas</span>
            </NavLink>

            <NavLink
              to="/vehiculo/exportar"
              className={({ isActive }) => `sidebar__sublink ${isActive ? 'active' : ''}`}
            >
              <span className="label">Exportar</span>
            </NavLink>

            {(user?.role === 'admin' || user?.role === 'asesor_servicio') && (
              <NavLink
                to="/vehiculo/garaje"
                className={({ isActive }) => `sidebar__sublink ${isActive ? 'active' : ''}`}
              >
                <span className="label">Garaje</span>
              </NavLink>
            )}
          </div>
        </div>
        )}
        {/* === FIN GRUPO VEHÍCULO === */}

        {/* === GRUPO: FACTURACIÓN === */}
        {canSeeModule(user?.role, 'facturacion') && (
        <div className={`sidebar__group ${factOpen ? 'open' : ''}`}>
          <button
            type="button"
            className="sidebar__link sidebar__group-toggle"
            onClick={() => setFactOpen(o => !o)}
            aria-expanded={factOpen}
            aria-controls="submenu-facturacion"
            title="Facturación"
          >
            <span className="emoji">🧾</span>
            <span className="label">Facturación</span>
            {!collapsed && <span className="chev" aria-hidden>▾</span>}
          </button>

          <div id="submenu-facturacion" className="sidebar__sublinks">
            <NavLink
              to="/facturacion"
              end
              className={({ isActive }) => `sidebar__sublink ${isActive ? 'active' : ''}`}
            >
              <span className="label">Panel</span>
            </NavLink>
            <NavLink
              to="/facturacion/nueva"
              className={({ isActive }) => `sidebar__sublink ${isActive ? 'active' : ''}`}
            >
              <span className="label">Nueva Factura</span>
            </NavLink>
            <NavLink
              to="/facturacion/consultar"
              className={({ isActive }) => `sidebar__sublink ${isActive ? 'active' : ''}`}
            >
              <span className="label">Consultar</span>
            </NavLink>
            <NavLink
              to="/facturacion/configuracion-fiscal"
              className={({ isActive }) => `sidebar__sublink ${isActive ? 'active' : ''}`}
            >
              <span className="label">Config. Fiscal</span>
            </NavLink>
          </div>
        </div>
        )}
        {/* === FIN GRUPO FACTURACIÓN === */}


        {/* === GRUPO: REFACCIONARIA === */}
        {canSeeModule(user?.role, 'refaccionaria') && (
        <div className={`sidebar__group ${refaOpen ? 'open' : ''}`}>
          <button
            type="button"
            className="sidebar__link sidebar__group-toggle"
            onClick={() => setRefaOpen(o => !o)}
            aria-expanded={refaOpen}
            aria-controls="submenu-refaccionaria"
            title="Refaccionaria"
          >
            <span className="emoji">🧰</span>
            <span className="label">Refaccionaria</span>
            {(solicitudesCount + porSurtirCount) > 0 && (
              <span className="nav-badge">{solicitudesCount + porSurtirCount}</span>
            )}
            {!collapsed && <span className="chev" aria-hidden>▾</span>}
          </button>

          <div id="submenu-refaccionaria" className="sidebar__sublinks">
            <NavLink
              to="/refaccionaria/entrada"
              className={({ isActive }) => `sidebar__sublink ${isActive ? 'active' : ''}`}
            >
              <span className="label">Entrada Inventario</span>
            </NavLink>
            {/* <NavLink
              to="/refaccionaria/salida"
              className={({ isActive }) => `sidebar__sublink ${isActive ? 'active' : ''}`}
            >
              <span className="label">Salida Refacción</span>
            </NavLink> */}

            <NavLink
              to="/refaccionaria/solicitudes-taller"
              className={({ isActive }) => `sidebar__sublink ${isActive ? 'active' : ''}`}
            >
              <span className="label">Solicitudes Taller</span>
              {solicitudesCount > 0 && <span className="nav-badge">{solicitudesCount}</span>}
            </NavLink>

            <NavLink
              to="/refaccionaria/por-surtir"
              className={({ isActive }) => `sidebar__sublink ${isActive ? 'active' : ''}`}
            >
              <span className="label">Por Surtir</span>
              {porSurtirCount > 0 && <span className="nav-badge">{porSurtirCount}</span>}
            </NavLink>

            <NavLink
              to="/refaccionaria/consultar"
              className={({ isActive }) => `sidebar__sublink ${isActive ? 'active' : ''}`}
            >
              <span className="label">Consultar Inventario</span>
            </NavLink>
            <NavLink
              to="/refaccionaria/factura-proveedor"
              className={({ isActive }) => `sidebar__sublink ${isActive ? 'active' : ''}`}
              title="Consultar Factura Proveedor"
            >
              <span className="label" style={{display:'block'}}>Consultar Factura</span>
              <span className="label" style={{display:'block'}}>Proveedor</span>
            </NavLink>
            <NavLink
              to="/refaccionaria/bd-codigos"
              className={({ isActive }) => `sidebar__sublink ${isActive ? 'active' : ''}`}
            >
              <span className="label">BD Codigos</span>
            </NavLink>

            <NavLink
              to="/refaccionaria/devoluciones"
              className={({ isActive }) => `sidebar__sublink ${isActive ? 'active' : ''}`}
            >
              <span className="label">Devolución de Refacciones</span>
            </NavLink>

            <NavLink
              to="/refaccionaria/consulta-devoluciones"
              className={({ isActive }) => `sidebar__sublink ${isActive ? 'active' : ''}`}
            >
              <span className="label">Consulta Devoluciones</span>
            </NavLink>
          </div>
        </div>
        )}
        {/* === FIN GRUPO REFACCIONARIA === */}

                  

        {/* === VALES DE SALIDA === */}
        {canSeeModule(user?.role, 'vales') && (
          <NavLink to="/vales/nuevo" className="sidebar__link" title="Vales de Salida">
            <span className="emoji">🎫</span><span className="label">Vales</span>
          </NavLink>
        )}

        {/* === REPORTES === */}
        {canSeeModule(user?.role, 'reportes') && (
          <NavLink to="/reportes" className="sidebar__link" title="Reportes">
            <span className="emoji">📈</span><span className="label">Reportes</span>
          </NavLink>
        )}
          </nav>

      {/* Bottom */}
      <div className="sidebar__bottom">
        {!collapsed && <div className="sidebar__user">{user?.name || "Usuario"}</div>}
        <button className="sidebar__logout" onClick={handleLogout}>Salir</button>
      </div>
    </aside>
  );
}
