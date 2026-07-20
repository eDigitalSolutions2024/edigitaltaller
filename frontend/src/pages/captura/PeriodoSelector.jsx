import React, { useState } from 'react';

const PERIODOS = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'semanal', label: 'Esta semana' },
  { key: 'mensual', label: 'Este mes' },
  { key: 'anual', label: 'Este año' },
  { key: 'rango', label: 'Rango personalizado' },
];

// Devuelve inicio y fin del día local como ISO UTC strings
function rangoLocal(fechaInicio, fechaFin) {
  const d = new Date(fechaInicio);
  d.setHours(0, 0, 0, 0);
  const h = new Date(fechaFin);
  h.setHours(23, 59, 59, 999);
  return { desde: d.toISOString(), hasta: h.toISOString() };
}

// Para filtrar campos "solo día" (p. ej. fechaRecepcion, guardados como
// medianoche UTC del día capturado). Usa el año/mes/día LOCAL de las fechas
// recibidas pero construye los límites en UTC, para coincidir con cómo se
// guardan esos campos y no perder el día actual por el offset del navegador.
function rangoUTC(fechaInicio, fechaFin) {
  const d = new Date(Date.UTC(fechaInicio.getFullYear(), fechaInicio.getMonth(), fechaInicio.getDate(), 0, 0, 0, 0));
  const h = new Date(Date.UTC(fechaFin.getFullYear(), fechaFin.getMonth(), fechaFin.getDate(), 23, 59, 59, 999));
  return { desde: d.toISOString(), hasta: h.toISOString() };
}

function calcularRango(periodo, soloDia) {
  const rango = soloDia ? rangoUTC : rangoLocal;
  const hoy = new Date();
  const y = hoy.getFullYear();
  const m = hoy.getMonth();
  const d = hoy.getDate();

  if (periodo === 'hoy') {
    return rango(new Date(y, m, d), new Date(y, m, d));
  }
  if (periodo === 'semanal') {
    const diffLun = (hoy.getDay() + 6) % 7;
    const lun = new Date(y, m, d - diffLun);
    const dom = new Date(y, m, d - diffLun + 6);
    return rango(lun, dom);
  }
  if (periodo === 'mensual') {
    return rango(new Date(y, m, 1), new Date(y, m + 1, 0));
  }
  if (periodo === 'anual') {
    return rango(new Date(y, 0, 1), new Date(y, 11, 31));
  }
  return null;
}

export default function PeriodoSelector({ onBuscar, cargando, soloDia = false }) {
  const [periodo, setPeriodo] = useState('mensual');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [error, setError] = useState('');

  const handleBuscar = () => {
    setError('');
    let rango;
    if (periodo === 'rango') {
      if (!desde || !hasta) {
        setError('Selecciona fecha inicial y final.');
        return;
      }
      if (desde > hasta) {
        setError('La fecha inicial no puede ser mayor que la final.');
        return;
      }
      // Convertir YYYY-MM-DD a inicio/fin del día en hora local → UTC
      rango = (soloDia ? rangoUTC : rangoLocal)(new Date(desde + 'T00:00:00'), new Date(hasta + 'T00:00:00'));
    } else {
      rango = calcularRango(periodo, soloDia);
    }
    onBuscar(rango.desde, rango.hasta);
  };

  return (
    <div className="card bg-light border-0 mb-3">
      <div className="card-body py-2">
        <div className="d-flex flex-wrap align-items-end gap-2">
          <div>
            <label className="form-label mb-1 fw-semibold small">Período</label>
            <div className="btn-group">
              {PERIODOS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`btn btn-sm ${periodo === p.key ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => { setPeriodo(p.key); setError(''); }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {periodo === 'rango' && (
            <>
              <div>
                <label className="form-label mb-1 small">Desde</label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label mb-1 small">Hasta</label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="ms-1">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={handleBuscar}
              disabled={cargando}
            >
              {cargando ? (
                <><span className="spinner-border spinner-border-sm me-1" />Cargando…</>
              ) : (
                'Generar reporte'
              )}
            </button>
          </div>
        </div>

        {error && <div className="text-danger small mt-1">{error}</div>}
      </div>
    </div>
  );
}
