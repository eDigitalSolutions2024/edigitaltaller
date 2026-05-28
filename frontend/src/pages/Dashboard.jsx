import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import http from "../api/http";
import "../styles/dashboard.css";

const tiles = [
  { key: "ordenes",    title: "Órdenes de Servicio", desc: "Crear y gestionar órdenes",    to: "/vehiculo/consulta-ordenes", emoji: "📋" },
  { key: "clientes",   title: "Clientes",             desc: "Altas, historial y contacto",  to: "/clientes",         emoji: "👤" },
  { key: "inventario", title: "Inventario",           desc: "Refacciones y existencias",    to: "/inventario",       emoji: "🧰" },
  { key: "reportes",   title: "Reportes",             desc: "Ingresos y métricas",          to: "/reportes",         emoji: "📈" },
  { key: "ajustes",    title: "Ajustes",              desc: "Usuarios y taller",            to: "/ajustes",          emoji: "⚙️" },
];

export default function Dashboard() {
  const [stats, setStats] = useState({ ordenesHoy: 0, enProceso: 0, entregadas: 0 });

  useEffect(() => {
    http.get("/vehiculos/stats/dashboard")
      .then((res) => {
        if (res.data?.ok) setStats(res.data.data);
      })
      .catch((err) => console.error("Error cargando stats:", err));
  }, []);

  return (
    <div className="dash-wrap">
      <header className="dash-hero">
        <div className="dash-hero__left">
          <h1 className="dash-title">Bienvenido 👋</h1>
          <p className="dash-subtitle">Edigital Solutions · Panel principal</p>
          <div className="dash-actions">
            <NavLink to="/vehiculo/entrada" className="btn btn-primary">Nueva orden</NavLink>
            <NavLink to="/clientes/alta" className="btn btn-ghost">Nuevo cliente</NavLink>
          </div>
        </div>
        <div className="dash-hero__right">
          <div className="dash-stat">
            <div className="dash-stat__label">Órdenes hoy</div>
            <div className="dash-stat__value">{stats.ordenesHoy}</div>
          </div>
          <div className="dash-stat">
            <div className="dash-stat__label">En proceso</div>
            <div className="dash-stat__value">{stats.enProceso}</div>
          </div>
          <div className="dash-stat">
            <div className="dash-stat__label">Entregadas</div>
            <div className="dash-stat__value">{stats.entregadas}</div>
          </div>
        </div>
      </header>

      <section className="dash-toolbar">
        <input className="dash-search" placeholder="Buscar cliente, orden, placa..." />
        <div className="dash-toolbar__right">
          <NavLink to="/reportes" className="btn btn-light">Ver reportes</NavLink>
          <NavLink to="/inventario" className="btn btn-light">Inventario</NavLink>
        </div>
      </section>

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