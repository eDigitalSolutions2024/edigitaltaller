import { NavLink } from "react-router-dom";
import "../styles/dashboard.css";

const tiles = [
  { key: "ordenes",   title: "Órdenes de Servicio", desc: "Crear y gestionar órdenes", to: "/ordenes",   emoji: "📋" },
  { key: "clientes",  title: "Clientes",            desc: "Altas, historial y contacto", to: "/clientes", emoji: "👤" },
  { key: "inventario",title: "Inventario",          desc: "Refacciones y existencias",   to: "/inventario", emoji: "🧰" },
  { key: "reportes",  title: "Reportes",            desc: "Ingresos y métricas",         to: "/reportes",  emoji: "📈" },
  { key: "ajustes",   title: "Ajustes",             desc: "Usuarios y taller",           to: "/ajustes",   emoji: "⚙️" },
];

export default function Dashboard() {
  return (
    <div className="dash-wrap">
      {/* Encabezado / Hero */}
      <header className="dash-hero">
        <div className="dash-hero__left">
          <h1 className="dash-title">Bienvenido 👋</h1>
          <p className="dash-subtitle">Edigital Solutions · Panel principal</p>
          <div className="dash-actions">
            <NavLink to="/ordenes" className="btn btn-primary">Nueva orden</NavLink>
            <NavLink to="/clientes" className="btn btn-ghost">Nuevo cliente</NavLink>
          </div>
        </div>
        <div className="dash-hero__right">
          <div className="dash-stat">
            <div className="dash-stat__label">Órdenes hoy</div>
            <div className="dash-stat__value">0</div>
          </div>
          <div className="dash-stat">
            <div className="dash-stat__label">En proceso</div>
            <div className="dash-stat__value">0</div>
          </div>
          <div className="dash-stat">
            <div className="dash-stat__label">Entregadas</div>
            <div className="dash-stat__value">0</div>
          </div>
        </div>
      </header>

      {/* Buscador / Acciones rápidas */}
      <section className="dash-toolbar">
        <input className="dash-search" placeholder="Buscar cliente, orden, placa..." />
        <div className="dash-toolbar__right">
          <NavLink to="/reportes" className="btn btn-light">Ver reportes</NavLink>
          <NavLink to="/inventario" className="btn btn-light">Inventario</NavLink>
        </div>
      </section>

      {/* Secciones */}
      <section className="dash-grid">
        {tiles.map((it) => (
          <NavLink key={it.key} to={it.to} className="tile">
            <div className="tile__emoji">{it.emoji}</div>
            <div className="tile__title">{it.title}</div>
            <div className="tile__desc">{it.desc}</div>
          </NavLink>
        ))}
      </section>
    </div>
  );
}
