/**
 * Área de filtros del módulo Cajas — solo estructura visual.
 * Sin lógica ni estado: listo para conectar en la siguiente etapa.
 */
export default function CajaFilters() {
  return (
    <div className="caja-filters">
      <div>
        <label>Desde</label>
        <input type="date" className="form-control form-control-sm" readOnly />
      </div>

      <div>
        <label>Hasta</label>
        <input type="date" className="form-control form-control-sm" readOnly />
      </div>

      <div>
        <label>Buscar</label>
        <input
          type="text"
          className="form-control form-control-sm"
          placeholder="Buscar..."
          readOnly
        />
      </div>

      <button type="button" className="btn btn-outline-secondary btn-sm" disabled>
        Buscar
      </button>
    </div>
  );
}
