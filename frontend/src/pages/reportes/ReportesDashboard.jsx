import { NavLink } from 'react-router-dom';
import { getUser } from '../../auth';
import '../../styles/dashboard.css';

const SECCIONES = [
  {
    key: 'captura',
    emoji: '📊',
    title: 'Captura',
    desc: 'Reporte de originales y ventas por asesor',
    to: '/captura/originales',
    roles: ['admin', 'finanzas', 'captura'],
  },
];

export default function ReportesDashboard() {
  const user = getUser();

  const visibles = SECCIONES.filter(
    (s) => !s.roles || s.roles.includes(user?.role)
  );

  return (
    <div className="dash-wrap">
      <header className="dash-hero" style={{ gridTemplateColumns: '1fr' }}>
        <div className="dash-hero__left">
          <h1 className="dash-title">📈 Reportes</h1>
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
            <NavLink key={s.key} to={s.to} className="tile">
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
