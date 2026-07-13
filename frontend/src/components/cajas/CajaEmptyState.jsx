/**
 * Fila de estado vacío para las tablas del módulo Cajas.
 *
 * @param {number} colSpan  Número de columnas de la tabla
 * @param {string} [message]
 */
export default function CajaEmptyState({ colSpan = 1, message = 'Sin registros' }) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <div className="caja-empty-state d-flex flex-column align-items-center">
          <span className="empty-icon">📂</span>
          <span>{message}</span>
        </div>
      </td>
    </tr>
  );
}
