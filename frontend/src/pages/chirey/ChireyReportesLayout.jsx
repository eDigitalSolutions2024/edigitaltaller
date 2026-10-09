import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { getUser } from "../../auth";
import "../../styles/dashboard.css";

// Mismas secciones que el dashboard de Reportes normal (pages/reportes/ReportesDashboard.jsx),
// sin Reporte de Cajas, y filtradas a la línea Chirey. Cada sección conserva el acceso por rol
// que tiene en el sistema normal.
export const SECCIONES_CHIREY = [
  {
    key: "captura",
    emoji: "📊",
    title: "Captura",
    desc: "Reporte de originales y ventas por asesor",
    roles: ["admin", "coordinador", "finanzas", "captura"],
    tabs: [
      { to: "originales", label: "Reporte de Originales" },
      { to: "ventas-asesores", label: "Reporte de Ventas (Asesores)" },
    ],
  },
  {
    key: "auditoria",
    emoji: "📃",
    title: "Auditoría",
    desc: "Órdenes abiertas, reporte de originales y garantías",
    roles: ["admin", "coordinador", "auditoria"],
    tabs: [
      { to: "ordenes-abiertas", label: "Órdenes Abiertas" },
      { to: "originales", label: "Reporte de Originales" },
      { to: "garantias", label: "Reporte de Garantías" },
    ],
  },
  {
    key: "rh",
    emoji: "👷",
    title: "Recursos Humanos",
    desc: "Reporte de Horas Trabajadas por Técnico",
    roles: ["admin", "coordinador", "recursos_humanos"],
    tabs: [{ to: "horas-tecnico", label: "Reporte de Horas por Técnico" }],
  },
];

export function seccionesChireyVisibles(role) {
  return SECCIONES_CHIREY.filter((s) => s.roles.includes(role));
}

// Contenedor de /chirey/reportes/*: el dashboard o la sección elegida.
export default function ChireyReportesLayout() {
  return <Outlet />;
}

// Dashboard: una tarjeta por sección visible para el rol (igual que Reportes normal).
export function ChireyReportesIndex() {
  const user = getUser();
  const visibles = seccionesChireyVisibles(user?.role);

  return (
    <div className="dash-wrap">
      <header className="dash-hero" style={{ gridTemplateColumns: "1fr" }}>
        <div className="dash-hero__left">
          <h1 className="dash-title">📈 Reportes Chirey</h1>
          <p className="dash-subtitle">
            {user?.name} · Selecciona la sección que deseas consultar
          </p>
        </div>
      </header>

      {visibles.length === 0 ? (
        <div className="alert alert-info mt-3">
          No tienes acceso a ninguna sección de reportes por el momento.
        </div>
      ) : (
        <section className="dash-grid">
          {visibles.map((s) => (
            <NavLink key={s.key} to={`/chirey/reportes/${s.key}/${s.tabs[0].to}`} className="tile">
              <div className="tile__emoji">{s.emoji}</div>
              <div className="tile__title">{s.title}</div>
              <div className="tile__desc">{s.desc}</div>
            </NavLink>
          ))}
        </section>
      )}
    </div>
  );
}

// Layout de una sección (Captura / Auditoría / RH): título, pestañas y el reporte.
export function ChireySeccionReportes({ seccion }) {
  const s = SECCIONES_CHIREY.find((x) => x.key === seccion);
  const tab = ({ isActive }) =>
    "px-3 py-2 rounded-pill me-2 " + (isActive ? "btn btn-primary" : "btn btn-outline-primary");

  return (
    <div className="container-fluid py-3">
      <h2 className="mb-3">
        <NavLink to="/chirey/reportes" className="btn btn-sm btn-outline-secondary me-2">← Reportes</NavLink>
        {s.emoji} {s.title}
      </h2>

      <div className="mb-3">
        {s.tabs.map((t) => (
          <NavLink key={t.to} to={`/chirey/reportes/${s.key}/${t.to}`} className={tab}>
            {t.label}
          </NavLink>
        ))}
      </div>

      <div className="card shadow-sm">
        <div className="card-body">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
