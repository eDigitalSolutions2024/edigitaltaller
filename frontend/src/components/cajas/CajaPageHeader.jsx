import { Link } from 'react-router-dom';

/**
 * Cabecera estándar de las páginas del módulo Cajas.
 * Renderiza el breadcrumb, el título y un subtítulo opcional.
 *
 * @param {Array}  breadcrumb  [{label, to?}] — último elemento es el activo (sin to)
 * @param {string} title
 * @param {string} [subtitle]
 */
export default function CajaPageHeader({ breadcrumb = [], title, subtitle }) {
  return (
    <div className="caja-header-wrap">
      <nav aria-label="breadcrumb">
        <ol className="breadcrumb mb-1">
          {breadcrumb.map((item, i) => {
            const isLast = i === breadcrumb.length - 1;
            return (
              <li
                key={i}
                className={`breadcrumb-item${isLast ? ' active' : ''}`}
                {...(isLast ? { 'aria-current': 'page' } : {})}
              >
                {!isLast && item.to ? (
                  <Link to={item.to}>{item.label}</Link>
                ) : (
                  item.label
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <h2 className="caja-page-title">{title}</h2>
      {subtitle && <p className="caja-page-subtitle">{subtitle}</p>}
    </div>
  );
}
