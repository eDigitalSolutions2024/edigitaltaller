import React from "react";
import 'bootstrap/dist/css/bootstrap.min.css';
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

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

// Devoluciones
import DevDinero from "./pages/refaccionaria/devoluciones/dinero";
import DevPieza from "./pages/refaccionaria/devoluciones/pieza";
import DevVale from "./pages/refaccionaria/devoluciones/vale";
import ConsultaDevoluciones from "./pages/refaccionaria/devoluciones/consultas";
import ConsultaVales from "./pages/refaccionaria/devoluciones/consultas-vales";

import Empleados from "./pages/Empleados";
import OrdenesCompraList from "./pages/OrdenesCompraList";

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem("token");
  return token ? children : <Navigate to="/login" replace />;
};

export default function App() {
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
          {/* index → /dashboard */}
          <Route index element={<Navigate to="dashboard" replace />} />

          {/* Dashboard */}
          <Route path="dashboard" element={<Dashboard />} />

          {/* Clientes */}
          <Route path="clientes/*" element={<ClientesLayout />}>
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
          <Route path="vehiculo/*" element={<VehiculosLayout />}>
            <Route index element={<Navigate to="entrada" replace />} />
            <Route path="entrada" element={<VehiculoEntrada />} />
            <Route path="consulta-ordenes" element={<VehiculoConsultaOrdenes />} />
            <Route path="consulta-ordenes-cerradas" element={<VehiculoConsultaCerradas />} />
            <Route path="exportar" element={<VehiculoExportar />} />
            <Route path="orden/:id" element={<VehiculoOrdenDetalle />} />
          </Route>

          {/* Refaccionaria */}
          <Route path="refaccionaria/*" element={<RefaccionariaLayout />}>
            <Route index element={<Navigate to="entrada" replace />} />
            <Route path="entrada" element={<EntradaInventario />} />
            <Route path="salida" element={<SalidaRefaccion />} />

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

          {/* Empleados */}
          <Route path="empleados" element={<Empleados />} />

          {/* Órdenes de compra */}
          <Route path="ordenes-compra" element={<OrdenesCompraList />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
