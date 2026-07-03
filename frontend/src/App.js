import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import 'bootstrap/dist/css/bootstrap.min.css';
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { canSeeModule, defaultRouteForRole } from "./utils/roles";
import { setAccessToken, getAccessToken } from "./api/http";
import useGlobalUppercase from "./hooks/useGlobalUppercase";

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
import Devoluciones from "./pages/refaccionaria/devoluciones/DevolucionesLayout";
import ConsultarInventario from "./pages/refaccionaria/ConsultarInventario";
import ConsultarFacturaProveedor from "./pages/refaccionaria/ConsultarFacturaProveedor.jsx";
import BDCodigos from "./pages/refaccionaria/BDCodigos";
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
import VehiculoExportar from "./pages/vehiculo/VehiculosExportar";
import VehiculoOrdenDetalle from "./pages/vehiculo/VehiculoOrdenDetalle";
import VehiculoConsultaCanceladas from "./pages/vehiculo/VehiculosConsultaCanceladas";
import GarageAdminPage from "./pages/vehiculo/GarageAdminPage";

// Devoluciones
import DevDinero from "./pages/refaccionaria/devoluciones/dinero";
import DevPieza from "./pages/refaccionaria/devoluciones/pieza";
import DevVale from "./pages/refaccionaria/devoluciones/vale";
import ConsultaDevoluciones from "./pages/refaccionaria/devoluciones/consultas";
import ConsultaVales from "./pages/refaccionaria/devoluciones/consultas-vales";

import Empleados from "./pages/Empleados";
import OrdenesCompraList from "./pages/OrdenesCompraList";

//Administracion
import Usuarios from "./pages/admin/Usuarios";
import Personal from "./pages/admin/Personal";

//Configuracion
import Configuracion from "./pages/configuration/Configuracion";

// Reportes
import ReportesDashboard from "./pages/reportes/ReportesDashboard";

// Captura (Reportes)
import CapturaLayout from "./pages/captura/CapturaLayout";
import ReporteOriginales from "./pages/captura/ReporteOriginales";
import ReporteVentasAsesores from "./pages/captura/ReporteVentasAsesores";

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

/** Protege una ruta: si el rol no tiene acceso al módulo lo manda a su ruta por defecto */
const RoleRoute = ({ children, module }) => {
  const raw = localStorage.getItem("user");
  const user = raw ? JSON.parse(raw) : null;
  if (!canSeeModule(user?.role, module)) {
    return <Navigate to={defaultRouteForRole(user?.role)} replace />;
  }
  return children;
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

  return (
    <BrowserRouter>
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
            <Route path="alta" element={<AltaCliente />} />
            {/* misma pantalla para editar cliente */}
            <Route path="alta/:id" element={<AltaCliente />} /> {/* 👈 CORREGIDO */}
            <Route path="consulta" element={<ConsultaClientes />} />
          </Route>

          {/* Proveedores */}
          <Route path="proveedores/*" element={<ProveedoresLayout />}>
            <Route index element={<Navigate to="alta" replace />} />
            <Route path="alta" element={<AltaProveedor />} />
            {/* misma pantalla para editar proveedor */}
            <Route path="alta/:id" element={<AltaProveedor />} /> {/* 👈 NUEVO */}
            <Route path="consultar" element={<ConsultaProveedores />} />
          </Route>

          {/* Vehículo */}
          <Route path="vehiculo/*" element={<RoleRoute module="vehiculo"><VehiculosLayout /></RoleRoute>}>
            <Route index element={<Navigate to="entrada" replace />} />
            <Route path="entrada" element={<VehiculoEntrada />} />
            <Route path="consulta-ordenes" element={<VehiculoConsultaOrdenes />} />
            <Route path="consulta-ordenes-cerradas" element={<VehiculoConsultaCerradas />} />
            <Route path="consulta-ordenes-canceladas" element={<VehiculoConsultaCanceladas />} />
            <Route path="exportar" element={<VehiculoExportar />} />
            <Route path="garaje" element={<GarageAdminPage />} />
            <Route path="orden/:id" element={<VehiculoOrdenDetalle />} />
          </Route>

          {/* Refaccionaria */}
          <Route path="refaccionaria/*" element={<RoleRoute module="refaccionaria"><RefaccionariaLayout /></RoleRoute>}>
            <Route index element={<Navigate to="entrada" replace />} />
            <Route path="entrada" element={<EntradaInventario />} />
            <Route path="salida" element={<SalidaRefaccion />} />
            <Route path="solicitudes-taller" element={<SolicitudesTaller />} />
            <Route path="solicitudes-taller/:id" element={<SolicitudTallerDetalle />} />
            <Route path="por-surtir" element={<PorSurtir />} />



            {/* Devoluciones */}
            <Route path="devoluciones/*" element={<Devoluciones />}>
              <Route index element={<Navigate to="dinero" replace />} />
              <Route path="dinero" element={<DevDinero />} />
              <Route path="pieza" element={<DevPieza />} />
              <Route path="vale" element={<DevVale />} />
              <Route path="consultas" element={<ConsultaDevoluciones />} />
              <Route path="consultas-vales" element={<ConsultaVales />} />
            </Route>

            <Route path="consultar" element={<ConsultarInventario />} />
            <Route path="factura-proveedor" element={<ConsultarFacturaProveedor />} />
            <Route path="bd-codigos" element={<BDCodigos />} />
          </Route>

          {/* Empleados (mantener por compatibilidad, redirige a personal) */}
          <Route path="empleados" element={<Navigate to="/admin/personal" replace />} />

          {/* Administración de usuarios (mantener por compatibilidad) */}
          <Route path="admin/usuarios" element={<Navigate to="/admin/personal" replace />} />

          {/* Personal unificado */}
          <Route path="admin/personal" element={<Personal />} />

          {/* Órdenes de compra */}
          <Route path="ordenes-compra" element={<OrdenesCompraList />} />

          {/* Configuración */}
          <Route path="configuracion" element={<Configuracion />} />


          {/* Reportes dashboard */}
          <Route path="reportes" element={<RoleRoute module="reportes"><ReportesDashboard /></RoleRoute>} />

          {/* Captura (solo admin y finanzas) */}
          <Route
            path="captura/*"
            element={<RolesRoute roles={['admin', 'finanzas', 'captura']}><CapturaLayout /></RolesRoute>}
          >
            <Route index element={<Navigate to="originales" replace />} />
            <Route path="originales" element={<ReporteOriginales />} />
            <Route path="ventas-asesores" element={<ReporteVentasAsesores />} />
          </Route>

          {/* Facturación */}
          <Route path="facturacion/*" element={<FacturacionLayout />}>
            <Route index element={<FacturacionPanel />} />
            <Route path="nueva" element={<NuevaFactura />} />
            <Route path="consultar" element={<ConsultarFacturas />} />
            <Route path="configuracion-fiscal" element={<ConfiguracionFiscal />} />
          </Route>


        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
