import CajaFilters from './CajaFilters';

/**
 * Barra superior de las páginas del módulo Cajas.
 * Agrupa el área de filtros (izquierda) y el botón de acción principal (derecha).
 *
 * @param {string} buttonLabel  Texto del botón de acción principal
 */
export default function CajaToolbar({ buttonLabel = 'Nuevo' }) {
  return (
    <div className="caja-toolbar">
      <CajaFilters />

      <button type="button" className="btn btn-primary btn-sm" disabled>
        {buttonLabel}
      </button>
    </div>
  );
}
