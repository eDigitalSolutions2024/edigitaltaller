import { NavLink } from "react-router-dom";
import { getUser } from '../auth';
import { useEffect, useState } from "react";
import http from "../api/http";
import { canSeeModule } from "../utils/roles";
import { getRefaccionariaAlerts } from "../api/vehiculos";
import "../styles/dashboard.css";

const PERIODOS = [
  { key: "dia", label: "Día" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mes" },
];

// Accesos directos disponibles. `module` se valida con canSeeModule (mismo
// criterio que el Navbar); `roles` restringe a una lista explícita de roles
// cuando el acceso no depende de un módulo del Navbar (p. ej. Administración).
// Sin `module` ni `roles` → visible para cualquier rol (p. ej. Soporte).
const ALL_TILES = [
  { key: "ordenes",      title: "Órdenes de Servicio", desc: "Crear y gestionar órdenes",          to: "/vehiculo/consulta-ordenes",        emoji: "📋", module: "vehiculo" },
  { key: "clientes",     title: "Clientes",             desc: "Altas, historial y contacto",        to: "/clientes/consulta",                emoji: "👤", module: "clientes" },
  { key: "inventario",   title: "Inventario",           desc: "Refacciones y existencias",          to: "/refaccionaria/consultar",          emoji: "🧰", module: "refaccionaria" },
  { key: "solicitudes",  title: "Solicitudes Taller",   desc: "Peticiones de refacciones del taller", to: "/refaccionaria/solicitudes-taller", emoji: "📥", roles: ["refaccionario"], badgeKey: "solicitudes" },
  { key: "por-surtir",   title: "Por Surtir",           desc: "Refacciones pendientes de entregar", to: "/refaccionaria/por-surtir",         emoji: "📦", roles: ["refaccionario"], badgeKey: "porSurtir" },
  { key: "cajas",        title: "Cajas",                desc: "Cobro y cierre de órdenes",          to: "/cajas/buscar",                     emoji: "💰", module: "cajas" },
  { key: "proveedores",  title: "Proveedores",          desc: "Altas y consulta",                   to: "/proveedores/consultar",            emoji: "🏺", module: "proveedores" },
  { key: "facturacion",  title: "Facturación",          desc: "Timbrado y consulta de facturas",    to: "/facturacion",                      emoji: "🧾", module: "facturacion" },
  { key: "ordenes-compra", title: "Órdenes de Compra",  desc: "Compras a proveedores",              to: "/ordenes-compra",                   emoji: "🛒", module: "ordenes" },
  { key: "vales",        title: "Vales de Salida",      desc: "Salida de refacciones sin OS",       to: "/vales/nuevo",                      emoji: "🎫", module: "vales" },
  { key: "garantias",    title: "Garantías",            desc: "Solicitudes y seguimiento",          to: "/garantias",                        emoji: "🛡️", roles: ["admin", "jefe", "asesor_servicio", "auditoria"] },
  { key: "reportes",     title: "Reportes",             desc: "Ingresos y métricas",                to: "/reportes",                         emoji: "📈", module: "reportes" },
  { key: "soporte",      title: "Soporte",              desc: "Reporta o da seguimiento a tickets", to: "/soporte/mis-tickets",              emoji: "🛟" },
  { key: "administracion", title: "Administración",     desc: "Personal y grupos de trabajo",       to: "/admin/personal",                   emoji: "🗂️", roles: ["admin"] },
  { key: "ajustes",      title: "Ajustes",              desc: "Configuración del taller",           to: "/configuracion",                    emoji: "⚙️", roles: ["admin"] },
];

// Acción principal del hero: la tarea más frecuente de cada rol. Los roles
// que no aparecen aquí (admin y demás roles sin restricciones) usan el
// primer módulo al que tengan acceso como acción por defecto.
const PRIMARY_ACTION_BY_ROLE = {
  asesor_servicio: { to: "/vehiculo/entrada", label: "Nueva orden" },
  refaccionario:   { to: "/refaccionaria/entrada", label: "Registrar entrada" },
  cajas:           { to: "/cajas/buscar", label: "Buscar orden" },
  captura:         { to: "/reportes", label: "Ver reportes" },
};

function tilesForUser(role) {
  const isAdmin = role === "admin";
  return ALL_TILES
    .filter((t) => (t.roles ? t.roles.includes(role) : t.module ? canSeeModule(role, t.module) : true))
    .map((t) => (t.key === "soporte" && isAdmin ? { ...t, to: "/soporte/admin", desc: "Panel de tickets del taller" } : t));
}

export default function Dashboard() {
  const user = getUser();
  const role = user?.role;

  const [periodo, setPeriodo] = useState("dia");
  const [stats, setStats] = useState({ abiertas: 0, cerradas: 0 });
  const [refaAlerts, setRefaAlerts] = useState({ solicitudes: 0, porSurtir: 0 });

  useEffect(() => {
    if (role === "refaccionario") return;
    http.get("/vehiculos/stats/dashboard", { params: { periodo } })
      .then((res) => {
        if (res.data?.ok) setStats(res.data.data);
      })
      .catch((err) => console.error("Error cargando stats:", err));
  }, [role, periodo]);

  useEffect(() => {
    if (role !== "refaccionario") return;
    getRefaccionariaAlerts(user?.name)
      .then(setRefaAlerts)
      .catch((err) => console.error("Error cargando alertas de refaccionaria:", err));
  }, [role, user?.name]);

  const tiles = tilesForUser(role);

  const primaryAction = PRIMARY_ACTION_BY_ROLE[role]
    || (canSeeModule(role, "vehiculo") ? { to: "/vehiculo/entrada", label: "Nueva orden" } : null);
  const secondaryAction = canSeeModule(role, "clientes") ? { to: "/clientes/alta", label: "Nuevo cliente" } : null;

  // Para refaccionaria, abiertas/cerradas por periodo no aplican a su
  // trabajo: lo relevante son las solicitudes que le llegan del taller y lo
  // que le falta por surtir. El resto de roles ve abiertas/cerradas del
  // periodo elegido; el admin ve todo el taller, el asesor solo lo suyo
  // (el backend hace ese recorte según el rol de la sesión).
  const esRefaccionaria = role === "refaccionario";
  const prefijo = role === "asesor_servicio" ? "Mis " : "";
  const heroStats = esRefaccionaria
    ? [
        { label: "Solicitudes pendientes", value: refaAlerts.solicitudes },
        { label: "Por surtir", value: refaAlerts.porSurtir },
      ]
    : [
        { label: `${prefijo}Abiertas`, value: stats.abiertas },
        { label: `${prefijo}Cerradas`, value: stats.cerradas },
      ];

  return (
    <div className="dash-wrap">
      <header className="dash-hero">
        <div className="dash-hero__left">
          <h1 className="dash-title">Bienvenido 👋</h1>
          <p className="dash-subtitle">{user?.name} · Panel principal</p>
          <div className="dash-actions">
            {primaryAction && (
              <NavLink to={primaryAction.to} className="btn btn-primary">{primaryAction.label}</NavLink>
            )}
            {secondaryAction && (
              <NavLink to={secondaryAction.to} className="btn btn-ghost">{secondaryAction.label}</NavLink>
            )}
          </div>
        </div>
        <div className="dash-hero__right">
          {!esRefaccionaria && (
            <div className="dash-period">
              {PERIODOS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`dash-period__btn ${periodo === p.key ? "is-active" : ""}`}
                  onClick={() => setPeriodo(p.key)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
          <div className="dash-hero__stats">
            {heroStats.map((s) => (
              <div className="dash-stat" key={s.label}>
                <div className="dash-stat__label">{s.label}</div>
                <div className="dash-stat__value">{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      </header>

      <section className="dash-toolbar">
        <input className="dash-search" placeholder="Buscar cliente, orden, placa..." />
        <div className="dash-toolbar__right">
          {canSeeModule(role, "reportes") && <NavLink to="/reportes" className="btn btn-light">Ver reportes</NavLink>}
          {canSeeModule(role, "refaccionaria") && <NavLink to="/refaccionaria/consultar" className="btn btn-light">Inventario</NavLink>}
        </div>
      </section>

      <section className="dash-grid">
        {tiles.map((it) => (
          <NavLink key={it.key} to={it.to} className="tile">
            {it.badgeKey && refaAlerts[it.badgeKey] > 0 && (
              <span className="tile__badge">{refaAlerts[it.badgeKey]}</span>
            )}
            <div className="tile__emoji">{it.emoji}</div>
            <div className="tile__title">{it.title}</div>
            <div className="tile__desc">{it.desc}</div>
          </NavLink>
        ))}
      </section>
    </div>
  );
}
