import { NavLink } from "react-router-dom";
import { getUser } from "../../auth";
import { canSeeModule, canSeeAny, isReadOnly } from "../../utils/roles";
import { reportesChireyVisibles } from "./ChireyReportesLayout";
import "../../styles/dashboard.css";

// Opciones del apartado Chirey; `visible(role)` replica el acceso del menú lateral.
const OPCIONES = [
  { emoji: "➕", title: "Nueva Orden", desc: "Abrir una orden para un cliente Chirey", to: "/chirey/nueva-orden",
    visible: (r) => canSeeModule(r, "vehiculo") && !isReadOnly(r, "vehiculo") },
  { emoji: "📂", title: "Órdenes Abiertas", desc: "Consulta general de órdenes Chirey", to: "/chirey/ordenes",
    visible: (r) => canSeeModule(r, "vehiculo") },
  { emoji: "✅", title: "Órdenes Cerradas", desc: "Órdenes Chirey finalizadas", to: "/chirey/ordenes-cerradas",
    visible: (r) => canSeeModule(r, "vehiculo") },
  { emoji: "🚫", title: "Órdenes Canceladas", desc: "Órdenes Chirey canceladas", to: "/chirey/ordenes-canceladas",
    visible: (r) => canSeeModule(r, "vehiculo") },
  { emoji: "📝", title: "Solicitudes de Taller", desc: "Cotizaciones pendientes de refaccionaria", to: "/chirey/solicitudes-taller",
    visible: (r) => canSeeModule(r, "refaccionaria") },
  { emoji: "🚚", title: "Por Surtir", desc: "Refacciones autorizadas por surtir", to: "/chirey/por-surtir",
    visible: (r) => canSeeModule(r, "refaccionaria") },
  { emoji: "📦", title: "Inventario Chirey", desc: "Existencias del almacén propio de Chirey", to: "/chirey/inventario/consultar",
    visible: (r) => canSeeAny(r, ["refaccionaria", "inventario"]) },
  { emoji: "📥", title: "Entrada de Inventario", desc: "Captura de compras al inventario Chirey", to: "/chirey/inventario/entrada",
    visible: (r) => canSeeModule(r, "refaccionaria") },
  { emoji: "🧾", title: "Facturas de Proveedor", desc: "Facturas de proveedor de Chirey", to: "/chirey/inventario/factura-proveedor",
    visible: (r) => canSeeAny(r, ["refaccionaria", "factura_proveedor"]) },
  { emoji: "🧾", title: "Consultar Facturas", desc: "Facturas emitidas a clientes Chirey", to: "/chirey/facturas",
    visible: (r) => canSeeAny(r, ["facturacion", "facturas_consulta"]) },
  { emoji: "📈", title: "Reportes Chirey", desc: "Originales, ventas, órdenes abiertas, garantías y más", to: "/chirey/reportes",
    visible: (r) => reportesChireyVisibles(r).length > 0 },
];

export default function ChireyDashboard() {
  const user = getUser();
  const visibles = OPCIONES.filter((o) => o.visible(user?.role));

  return (
    <div className="dash-wrap">
      <section className="dash-grid">
        {visibles.map((o) => (
          <NavLink key={o.to} to={o.to} className="tile">
            <div className="tile__emoji">{o.emoji}</div>
            <div className="tile__title">{o.title}</div>
            <div className="tile__desc">{o.desc}</div>
          </NavLink>
        ))}
      </section>
    </div>
  );
}
