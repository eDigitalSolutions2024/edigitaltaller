import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import 'bootstrap/dist/css/bootstrap.min.css';
// El CSS de Bootstrap ya se importaba, pero nunca su JS: sin esto,
// data-bs-toggle="dropdown" (menú "Opciones" de Consulta de Clientes,
// selector de tamaño de PDF en VehiculoOrdenDetalle) no hace nada.
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { canSeeModule, isReadOnly, defaultRouteForRole, isAdminLike } from "./utils/roles";
import { setAccessToken, getAccessToken } from "./api/http";
import useGlobalUppercase from "./hooks/useGlobalUppercase";
import useAutoReloadOnDeploy from "./hooks/useAutoReloadOnDeploy";
import AvisoActualizacion from "./components/AvisoActualizacion";

import LoginPage from "./pages/LoginPage";
import AppLayout from "./layouts/AppLayout";
import Dashboard from "./pages/Dashboard";

// Clientes
import ClientesLayout from "./pages/clientes/ClientesLayout";
import AltaCliente from "./pages/clientes/AltaCliente";
import ConsultaClientes from "./pages/clientes/ConsultaClientes";

// Refaccionaria
import RefaccionariaLayout from "./pages/refaccionaria/RefaccionariaLayout";
import EntradaInventario from "./pages/refaccionaria/EntradaInventario";
import SalidaRefaccion from "./pages/refaccionaria/SalidaRefaccion";
import ConsultarInventario from "./pages/refaccionaria/ConsultarInventario";
import ConsultarFacturaProveedor from "./pages/refaccionaria/ConsultarFacturaProveedor.jsx";
import BDCodigos from "./pages/refaccionaria/BDCodigos";
import ServiciosCatalogo from "./pages/refaccionaria/ServiciosCatalogo";
import SolicitudesTaller from "./pages/refaccionaria/SolicitudesTaller";
import SolicitudTallerDetalle from "./pages/refaccionaria/SolicitudTallerDetalle";
import PorSurtir from "./pages/refaccionaria/PorSurtir";


// Proveedores
import ProveedoresLayout from "./pages/proveedores/ProveedoresLayout";
import AltaProveedor from "./pages/proveedores/AltaProveedor";
import ConsultaProveedores from "./pages/proveedores/ConsultaProveedores";

// Vehículo
import VehiculosLayout from "./pages/vehiculo/VehiculosLayout";
import VehiculoEntrada from "./pages/vehiculo/VehiculosEntrada";
import VehiculoConsultaOrdenes from "./pages/vehiculo/VehiculosConsultaOrdenes";
import VehiculoConsultaCerradas from "./pages/vehiculo/VehiculosConsultaCerradas";
import VehiculoOrdenDetalle from "./pages/vehiculo/VehiculoOrdenDetalle";
import VehiculoConsultaCanceladas from "./pages/vehiculo/VehiculosConsultaCanceladas";
import VehiculosConsultaGarantias from "./pages/vehiculo/VehiculosConsultaGarantias";
import GarageAdminPage from "./pages/vehiculo/GarageAdminPage";

// Devoluciones
import DevolucionRefaccion from "./pages/refaccionaria/devoluciones/DevolucionRefaccion";
import ConsultaDevoluciones from "./pages/refaccionaria/devoluciones/ConsultaDevoluciones";

import Empleados from "./pages/Empleados";
import OrdenesCompraList from "./pages/OrdenesCompraList";
import OrdenesCompraNueva from "./pages/OrdenesCompraNueva";

//Administracion
import Usuarios from "./pages/admin/Usuarios";
import Personal from "./pages/admin/Personal";
import Grupos from "./pages/admin/Grupos";
import RegistroActividad from "./pages/admin/RegistroActividad";

//Configuracion
import Configuracion from "./pages/configuration/Configuracion";

// Reportes
import ReportesDashboard from "./pages/reportes/ReportesDashboard";

// Captura (Reportes)
import CapturaLayout from "./pages/captura/CapturaLayout";
import ReporteOriginales from "./pages/captura/ReporteOriginales";
import ReporteVentasAsesores from "./pages/captura/ReporteVentasAsesores";

// Auditoria (Reportes)
import AuditoriaLayout from "./pages/auditoria/AuditoriaLayout";
import OrdenesAbiertas from "./pages/auditoria/OrdenesAbiertas";
import ReporteOriginalesAuditoria from "./pages/auditoria/ReporteOriginalesAuditoria";
import ReporteGarantias from "./pages/auditoria/ReporteGarantias";

// Reporte de Cajas (Reportes)
import ReporteCajasIngresos from "./pages/reportes/cajas/ReporteCajasIngresos";
import ReportePendientesFactura from "./pages/reportes/cajas/ReportePendientesFactura";

// Recursos Humanos (Reportes)
import RhLayout from "./pages/reportes/rh/RhLayout";
import ReporteHorasTecnico from "./pages/reportes/rh/ReporteHorasTecnico";
import ReporteRhCxC from "./pages/reportes/rh/ReporteRhCxC";

// Vales de Salida
import ValeSalidaForm from "./pages/vales/ValeSalidaForm";

// Solicitudes de Garantía
import SolicitudesGarantia from "./pages/garantias/SolicitudesGarantia";

// Soporte (Tickets)
import SoporteLayout from "./pages/soporte/SoporteLayout";
import SoporteForm from "./pages/soporte/SoporteForm";
import SoporteAdminTickets from "./pages/soporte/SoporteAdminTickets";
import SoporteAdminHistorial from "./pages/soporte/SoporteAdminHistorial";

// Cajas
import CajasLayout from "./pages/cajas/CajasLayout";
import CajasBuscarOrden from "./pages/cajas/CajasBuscarOrden";
import CajaOrdenDetalle from "./pages/cajas/CajaOrdenDetalle";
import GestionCaja from "./pages/cajas/GestionCaja";
import CajasAnticipos from "./pages/cajas/CajasAnticipos";

// Chirey (órdenes, inventario y reportes propios de la línea Chirey)
import ChireyLayout from "./pages/chirey/ChireyLayout";
import ChireyDashboard from "./pages/chirey/ChireyDashboard";
import ChireyReportesLayout from "./pages/chirey/ChireyReportesLayout";

// Facturación
import FacturacionLayout from "./pages/facturacion/FacturacionLayout";
import FacturacionPanel from "./pages/facturacion/FacturacionPanel";
import NuevaFactura from "./pages/facturacion/NuevaFactura";
import ConsultarFacturas from "./pages/facturacion/ConsultarFacturas";
import ConfiguracionFiscal from "./pages/facturacion/ConfiguracionFiscal";


/**
 * PrivateRoute — verifica sesión al montar.
 * Si hay usuario en localStorage pero no hay access token en memoria
 * (ej. el usuario recargó la página), intenta un refresh silencioso.
 */
const PrivateRoute = ({ children }) => {
  const [status, setStatus] = useState('loading'); // 'loading' | 'ok' | 'unauth'
  const calledRef = useRef(false); // evita la doble llamada de React.StrictMode

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    const user = localStorage.getItem('user');

    if (!user) {
      setStatus('unauth');
      return;
    }

    if (getAccessToken()) {
      setStatus('ok');
      return;
    }

    // Refresh silencioso: el navegador envía la cookie automáticamente
    const BASE = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';
    axios.post(`${BASE}/auth/refresh`, {}, { withCredentials: true })
      .then(({ data }) => {
        setAccessToken(data.accessToken);
        if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
        setStatus('ok');
      })
      .catch(() => {
        localStorage.removeItem('user');
        setStatus('unauth');
      });
  }, []);

  if (status === 'loading') {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100">
        <div className="spinner-border text-danger" role="status" />
      </div>
    );
  }

  return status === 'ok' ? children : <Navigate to="/login" replace />;
};

/** Redirige al módulo correcto según el rol al entrar a la app */
const RoleRedirect = () => {
  const raw = localStorage.getItem("user");
  const user = raw ? JSON.parse(raw) : null;
  return <Navigate to={defaultRouteForRole(user?.role)} replace />;
};

/** Soporte: los admins van directo al Panel Admin, el resto a Mis Tickets */
const SoporteIndexRedirect = () => {
  const raw = localStorage.getItem("user");
  const user = raw ? JSON.parse(raw) : null;
  return <Navigate to={isAdminLike(user?.role) ? "admin" : "mis-tickets"} replace />;
};

/**
 * Protege una ruta: si el rol no tiene acceso al módulo lo manda a su ruta por
 * defecto. `module` puede ser un módulo o una lista (basta con uno). Con
 * `write` la ruta es de captura/edición: los roles de "solo consulta" en ese
 * módulo también quedan fuera.
 */
const RoleRoute = ({ children, module, write = false }) => {
  const raw = localStorage.getItem("user");
  const user = raw ? JSON.parse(raw) : null;
  const modules = Array.isArray(module) ? module : [module];
  const permitidos = modules.filter((m) => canSeeModule(user?.role, m));
  const ok = write
    ? permitidos.some((m) => !isReadOnly(user?.role, m))
    : permitidos.length > 0;
  if (!ok) {
    return <Navigate to={defaultRouteForRole(user?.role)} replace />;
  }
  return children;
};

/** Índice de Facturación: Panel para quien factura; los de solo consulta van a Consultar */
const FacturacionIndex = () => {
  const raw = localStorage.getItem("user");
  const user = raw ? JSON.parse(raw) : null;
  if (!canSeeModule(user?.role, "facturacion")) {
    return <Navigate to="/facturacion/consultar" replace />;
  }
  return <FacturacionPanel />;
};

/** Índice de un módulo con varias pantallas: va a la primera a la que el rol tiene acceso */
const ModuleIndexRedirect = ({ options }) => {
  const raw = localStorage.getItem("user");
  const user = raw ? JSON.parse(raw) : null;
  const first = options.find((o) => canSeeModule(user?.role, o.module));
  return <Navigate to={first ? first.to : defaultRouteForRole(user?.role)} replace />;
};

/** Protege una ruta para roles específicos */
const RolesRoute = ({ children, roles }) => {
  const raw = localStorage.getItem("user");
  const user = raw ? JSON.parse(raw) : null;
  if (!roles.includes(user?.role)) {
    return <Navigate to={defaultRouteForRole(user?.role)} replace />;
  }
  return children;
};

export default function App() {
  useGlobalUppercase();
  const hayNuevaVersion = useAutoReloadOnDeploy();

  return (
    <BrowserRouter>
      <AvisoActualizacion visible={hayNuevaVersion} />
      <Routes>
        {/* Público */}
        <Route path="/login" element={<LoginPage />} />

        {/* Zona privada */}
        <Route
          path="/*"
          element={
            <PrivateRoute>
              <AppLayout />
            </PrivateRoute>
          }
        >
          {/* index → ruta según rol */}
          <Route index element={<RoleRedirect />} />

          {/* Dashboard */}
          <Route path="dashboard" element={<Dashboard />} />

          {/* Clientes */}
          <Route path="clientes/*" element={<RoleRoute module="clientes"><ClientesLayout /></RoleRoute>}>
            <Route index element={<Navigate to="consulta" replace />} />
            <Route path="alta" element={<RoleRoute module="clientes" write><AltaCliente /></RoleRoute>} />
            {/* misma pantalla para editar cliente */}
            <Route path="alta/:id" element={<RoleRoute module="clientes" write><AltaCliente /></RoleRoute>} /> {/* 👈 CORREGIDO */}
            <Route path="consulta" element={<ConsultaClientes />} />
          </Route>

          {/* Proveedores */}
          <Route path="proveedores/*" element={<RoleRoute module="proveedores"><ProveedoresLayout /></RoleRoute>}>
            <Route index element={<Navigate to="alta" replace />} />
            <Route path="alta" element={<AltaProveedor />} />
            {/* misma pantalla para editar proveedor */}
            <Route path="alta/:id" element={<AltaProveedor />} /> {/* 👈 NUEVO */}
            <Route path="consultar" element={<ConsultaProveedores />} />
          </Route>

          {/* Vehículo */}
          <Route path="vehiculo/*" element={<RoleRoute module="vehiculo"><VehiculosLayout /></RoleRoute>}>
            <Route index element={<ModuleIndexRedirect options={[{ module: "vehiculo", to: "consulta-ordenes" }]} />} />
            <Route path="entrada" element={<RoleRoute module="vehiculo" write><VehiculoEntrada /></RoleRoute>} />
            <Route path="consulta-ordenes" element={<VehiculoConsultaOrdenes />} />
            <Route path="consulta-ordenes-cerradas" element={<VehiculoConsultaCerradas />} />
            <Route path="consulta-ordenes-canceladas" element={<VehiculoConsultaCanceladas />} />
            <Route path="garantias" element={<VehiculosConsultaGarantias />} />
            <Route path="garaje" element={<GarageAdminPage />} />
            <Route path="orden/:id" element={<VehiculoOrdenDetalle />} />
          </Route>

          {/* Chirey: mismas pantallas que el resto del sistema, pero filtradas/escritas
              con la línea CHIREY (ver hooks/useLineaNegocio) y con inventario propio. */}
          <Route path="chirey/*" element={<RoleRoute module={["vehiculo", "refaccionaria", "inventario", "factura_proveedor"]}><ChireyLayout /></RoleRoute>}>
            <Route index element={<ChireyDashboard />} />

            {/* Órdenes */}
            <Route path="nueva-orden" element={<RoleRoute module="vehiculo" write><VehiculoEntrada /></RoleRoute>} />
            <Route path="ordenes" element={<RoleRoute module="vehiculo"><VehiculoConsultaOrdenes /></RoleRoute>} />
            <Route path="ordenes-cerradas" element={<RoleRoute module="vehiculo"><VehiculoConsultaCerradas /></RoleRoute>} />
            <Route path="ordenes-canceladas" element={<RoleRoute module="vehiculo"><VehiculoConsultaCanceladas /></RoleRoute>} />

            {/* Refaccionaria sobre órdenes Chirey */}
            <Route path="solicitudes-taller" element={<RoleRoute module="refaccionaria"><SolicitudesTaller /></RoleRoute>} />
            <Route path="solicitudes-taller/:id" element={<RoleRoute module="refaccionaria"><SolicitudTallerDetalle /></RoleRoute>} />
            <Route path="por-surtir" element={<RoleRoute module="refaccionaria"><PorSurtir /></RoleRoute>} />

            {/* Inventario propio de Chirey */}
            <Route path="inventario/consultar" element={<RoleRoute module={["refaccionaria", "inventario"]}><ConsultarInventario /></RoleRoute>} />
            <Route path="inventario/entrada" element={<RoleRoute module="refaccionaria"><EntradaInventario /></RoleRoute>} />
            <Route path="inventario/factura-proveedor" element={<RoleRoute module={["refaccionaria", "factura_proveedor"]}><ConsultarFacturaProveedor /></RoleRoute>} />

            {/* Reportes de las órdenes Chirey (mismo acceso por rol que en su sección original) */}
            <Route path="reportes/*" element={<ChireyReportesLayout />}>
              <Route index element={<Navigate to="originales" replace />} />
              <Route path="originales" element={<RolesRoute roles={['admin', 'coordinador', 'finanzas', 'captura']}><ReporteOriginales /></RolesRoute>} />
              <Route path="ventas-asesores" element={<RolesRoute roles={['admin', 'coordinador', 'finanzas', 'captura']}><ReporteVentasAsesores /></RolesRoute>} />
              <Route path="ordenes-abiertas" element={<RolesRoute roles={['admin', 'coordinador', 'auditoria']}><OrdenesAbiertas /></RolesRoute>} />
              <Route path="originales-abiertas" element={<RolesRoute roles={['admin', 'coordinador', 'auditoria']}><ReporteOriginalesAuditoria /></RolesRoute>} />
              <Route path="garantias" element={<RolesRoute roles={['admin', 'coordinador', 'auditoria']}><ReporteGarantias /></RolesRoute>} />
              <Route path="horas-tecnico" element={<RolesRoute roles={['admin', 'coordinador', 'recursos_humanos']}><ReporteHorasTecnico /></RolesRoute>} />
              <Route path="pendientes-factura" element={<RolesRoute roles={['admin', 'coordinador', 'finanzas']}><ReportePendientesFactura /></RolesRoute>} />
            </Route>
          </Route>

          {/* Cajas */}
          <Route path="cajas/*" element={<RoleRoute module="cajas"><CajasLayout /></RoleRoute>}>
            <Route index element={<Navigate to="buscar" replace />} />
            <Route path="buscar" element={<CajasBuscarOrden />} />
            <Route path="orden/:id" element={<CajaOrdenDetalle />} />
            <Route path="gestion" element={<GestionCaja />} />
            <Route path="anticipos" element={<CajasAnticipos />} />
          </Route>

          {/* Refaccionaria */}
          <Route
            path="refaccionaria/*"
            element={
              <RoleRoute module={["refaccionaria", "devoluciones", "inventario", "factura_proveedor"]}>
                <RefaccionariaLayout />
              </RoleRoute>
            }
          >
            <Route
              index
              element={
                <ModuleIndexRedirect
                  options={[
                    { module: "refaccionaria", to: "entrada" },
                    { module: "devoluciones", to: "consulta-devoluciones" },
                    { module: "inventario", to: "consultar" },
                    { module: "factura_proveedor", to: "factura-proveedor" },
                  ]}
                />
              }
            />
            <Route path="entrada" element={<RoleRoute module="refaccionaria"><EntradaInventario /></RoleRoute>} />
            <Route path="salida" element={<RoleRoute module="refaccionaria"><SalidaRefaccion /></RoleRoute>} />
            <Route path="solicitudes-taller" element={<RoleRoute module="refaccionaria"><SolicitudesTaller /></RoleRoute>} />
            <Route path="solicitudes-taller/:id" element={<RoleRoute module="refaccionaria"><SolicitudTallerDetalle /></RoleRoute>} />
            <Route path="por-surtir" element={<RoleRoute module="refaccionaria"><PorSurtir /></RoleRoute>} />

            {/* Devoluciones (registrar = captura; consulta = también roles de solo consulta) */}
            <Route path="devoluciones" element={<RoleRoute module="devoluciones" write><DevolucionRefaccion /></RoleRoute>} />
            <Route path="consulta-devoluciones" element={<RoleRoute module="devoluciones"><ConsultaDevoluciones /></RoleRoute>} />

            <Route path="consultar" element={<RoleRoute module={["refaccionaria", "inventario"]}><ConsultarInventario /></RoleRoute>} />
            <Route path="factura-proveedor" element={<RoleRoute module={["refaccionaria", "factura_proveedor"]}><ConsultarFacturaProveedor /></RoleRoute>} />
            <Route path="bd-codigos" element={<RoleRoute module="refaccionaria"><BDCodigos /></RoleRoute>} />
            {/* Catálogo de paquetes de servicio (servicio + refacciones necesarias),
                distinto de BD Códigos → tipo "servicio" (SAT/facturación). Admin y refaccionario. */}
            <Route
              path="servicios"
              element={<RolesRoute roles={['admin', 'coordinador', 'refaccionario']}><ServiciosCatalogo /></RolesRoute>}
            />
          </Route>

          {/* Empleados (mantener por compatibilidad, redirige a personal) */}
          <Route path="empleados" element={<Navigate to="/admin/personal" replace />} />

          {/* Administración de usuarios (mantener por compatibilidad) */}
          <Route path="admin/usuarios" element={<Navigate to="/admin/personal" replace />} />

          {/* Personal unificado */}
          <Route path="admin/personal" element={<RoleRoute module="personal"><Personal /></RoleRoute>} />

          {/* Grupos de trabajo */}
          <Route path="admin/grupos" element={<Grupos />} />

          {/* Registro de actividad (log del sistema, solo admin) */}
          <Route
            path="admin/actividad"
            element={
              <RolesRoute roles={['admin', 'coordinador']}>
                <RegistroActividad />
              </RolesRoute>
            }
          />

          {/* Órdenes de compra */}
          <Route path="ordenes-compra" element={<OrdenesCompraList />} />
          <Route path="ordenes-compra/nueva" element={<OrdenesCompraNueva />} />

          {/* Configuración */}
          <Route path="configuracion" element={<Configuracion />} />


          {/* Reportes dashboard */}
          <Route path="reportes" element={<RoleRoute module="reportes"><ReportesDashboard /></RoleRoute>} />

          {/* Vales de Salida (nuevo vale + historial) */}
          <Route path="vales/nuevo" element={<RoleRoute module="vales"><ValeSalidaForm /></RoleRoute>} />

          {/* Solicitudes de Garantía */}
          <Route
            path="garantias"
            element={
              <RolesRoute roles={['admin', 'coordinador', 'jefe', 'asesor_servicio', 'auditoria']}>
                <SolicitudesGarantia />
              </RolesRoute>
            }
          />

          {/* Soporte (Tickets) — disponible para todos los roles, sin RoleRoute/canSeeModule */}
          <Route path="soporte/*" element={<SoporteLayout />}>
            <Route index element={<SoporteIndexRedirect />} />
            <Route path="mis-tickets" element={<SoporteForm />} />
            <Route
              path="admin"
              element={<RolesRoute roles={['admin', 'coordinador']}><SoporteAdminTickets /></RolesRoute>}
            />
            <Route
              path="admin/historial"
              element={<RolesRoute roles={['admin', 'coordinador']}><SoporteAdminHistorial /></RolesRoute>}
            />
          </Route>

          {/* Captura (solo admin y finanzas) */}
          <Route
            path="captura/*"
            element={<RolesRoute roles={['admin', 'coordinador', 'finanzas', 'captura']}><CapturaLayout /></RolesRoute>}
          >
            <Route index element={<Navigate to="originales" replace />} />
            <Route path="originales" element={<ReporteOriginales />} />
            <Route path="ventas-asesores" element={<ReporteVentasAsesores />} />
          </Route>

          {/* Auditoría (solo admin y auditoria) */}
          <Route
            path="auditoria/*"
            element={<RolesRoute roles={['admin', 'coordinador', 'auditoria']}><AuditoriaLayout /></RolesRoute>}
          >
            <Route index element={<Navigate to="ordenes-abiertas" replace />} />
            <Route path="ordenes-abiertas" element={<OrdenesAbiertas />} />
            <Route path="originales" element={<ReporteOriginalesAuditoria />} />
            <Route path="garantias" element={<ReporteGarantias />} />
          </Route>

          {/* Reporte de Cajas (solo admin y finanzas) */}
          <Route
            path="reportes/cajas"
            element={<RolesRoute roles={['admin', 'coordinador', 'finanzas']}><ReporteCajasIngresos /></RolesRoute>}
          />

          {/* Recursos Humanos (solo admin y recursos_humanos) */}
          <Route
            path="reportes/rh/*"
            element={<RolesRoute roles={['admin', 'coordinador', 'recursos_humanos']}><RhLayout /></RolesRoute>}
          >
            <Route index element={<Navigate to="horas-tecnico" replace />} />
            <Route path="horas-tecnico" element={<ReporteHorasTecnico />} />
            <Route path="cxc" element={<ReporteRhCxC />} />
          </Route>

          {/* Facturación */}
          <Route path="facturacion/*" element={<RoleRoute module={["facturacion", "facturas_consulta"]}><FacturacionLayout /></RoleRoute>}>
            <Route index element={<FacturacionIndex />} />
            <Route path="nueva" element={<RoleRoute module="facturacion"><NuevaFactura /></RoleRoute>} />
            <Route path="consultar" element={<ConsultarFacturas />} />
            <Route
              path="configuracion-fiscal"
              element={<RolesRoute roles={['admin', 'coordinador']}><ConfiguracionFiscal /></RolesRoute>}
            />
          </Route>


        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
