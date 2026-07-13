import CajaEmptyState from './CajaEmptyState';

/**
 * Tabla estándar del módulo Cajas.
 * Muestra CajaEmptyState cuando no hay filas.
 * Preparada para recibir `rows` en la siguiente etapa.
 *
 * @param {string[]} columns  Encabezados de columna
 * @param {Array}    [rows]   Filas de datos (vacío en esta etapa)
 */
export default function CajaTable({ columns = [], rows = [] }) {
  return (
    <div className="table-responsive">
      <table className="table table-striped table-bordered align-middle mb-0">
        <thead className="table-light">
          <tr>
            {columns.map((col) => (
              <th key={col} className="fw-semibold small text-uppercase text-secondary">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <CajaEmptyState colSpan={columns.length} />
          ) : (
            rows.map((row, i) => (
              <tr key={i}>
                {/* Las celdas se implementarán al conectar el backend */}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
