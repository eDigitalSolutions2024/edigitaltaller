import React, { useState } from 'react';
import PeriodoSelector from '../captura/PeriodoSelector';
import { getReporteOrdenesAbiertas, openReporteOrdenesAbiertasPdf } from '../../api/reportes';
import { formatFecha } from '../../utils/fechas';

export default function OrdenesAbiertas() {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);
  const [rango, setRango] = useState(null);

  const handleBuscar = async (desde, hasta) => {
    setCargando(true);
    setError('');
    setResultado(null);
    setRango({ desde, hasta });
    try {
      const res = await getReporteOrdenesAbiertas(desde, hasta);
      setResultado(res.data);
    } catch (err) {
      setError('Error al cargar el reporte. Intenta de nuevo.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div>
      <h5 className="mb-3 fw-bold">Órdenes Abiertas</h5>
      <p className="text-muted small mb-3">
        Muestra las órdenes abiertas (no cerradas ni canceladas) agrupadas por asesor, según su fecha de recepción.
      </p>

      <PeriodoSelector onBuscar={handleBuscar} cargando={cargando} soloDia />

      {error && <div className="alert alert-danger py-2">{error}</div>}

      {resultado && (
        <>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <span className="text-muted small">
              Período: <strong>{formatFecha(rango.desde, { timeZone: 'UTC' })}</strong> — <strong>{formatFecha(rango.hasta, { timeZone: 'UTC' })}</strong>
            </span>
            <div className="d-flex gap-2 align-items-center">
              <span className="badge bg-secondary fs-6">
                Asesores: {resultado.data.length}
              </span>
              <span className="badge bg-primary fs-6">
                Total órdenes: {resultado.totalOrdenes}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={() => openReporteOrdenesAbiertasPdf(rango.desde, rango.hasta)}
              >
                Ver PDF
              </button>
            </div>
          </div>

          {resultado.data.length === 0 ? (
            <div className="alert alert-info py-2">
              No se encontraron órdenes abiertas en el período seleccionado.
            </div>
          ) : (
            <>
              {resultado.data.map((grupo, gi) => (
                <div key={gi} className="mb-4">
                  <div className="d-flex justify-content-between align-items-center bg-secondary text-white px-3 py-2 rounded-top">
                    <span className="fw-bold">
                      Asesor: {grupo.asesor}
                    </span>
                    <span className="badge bg-light text-dark">
                      {grupo.ordenes.length} orden{grupo.ordenes.length !== 1 ? 'es' : ''}
                    </span>
                  </div>

                  <div className="table-responsive border border-top-0 rounded-bottom">
                    <table className="table table-sm table-hover align-middle mb-0">
                      <thead className="table-secondary">
                        <tr>
                          <th>Ult Vale</th>
                          <th>No. Orden</th>
                          <th>Status Orden</th>
                          <th>Fecha</th>
                          <th>Nombre</th>
                          <th>Placas</th>
                          <th>No. Serie</th>
                          <th>Marca</th>
                          <th>Tipo</th>
                          <th>Observaciones</th>
                          <th>Asesores</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grupo.ordenes.map((o, i) => (
                          <tr key={i}>
                            <td>{o.ultVale || '—'}</td>
                            <td className="fw-semibold">{o.ordenServicio}</td>
                            <td>{o.statusOrden || '—'}</td>
                            <td>{formatFecha(o.fecha) || '—'}</td>
                            <td>{o.nombre || '—'}</td>
                            <td>{o.placas || '—'}</td>
                            <td>{o.serie || '—'}</td>
                            <td>{o.marca || '—'}</td>
                            <td>{o.tipo || '—'}</td>
                            <td>{o.observaciones || '—'}</td>
                            <td>{o.asesores?.length ? o.asesores.join(', ') : grupo.asesor}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="table-warning">
                        <tr>
                          <td colSpan={11} className="fw-bold">
                            Total {grupo.asesor}: {grupo.ordenes.length} orden{grupo.ordenes.length !== 1 ? 'es' : ''}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              ))}

              <div className="card border-primary mt-3">
                <div className="card-body py-2">
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <span className="fw-bold me-3">Resumen del período</span>
                      <span className="text-muted small">
                        {formatFecha(rango.desde, { timeZone: 'UTC' })} — {formatFecha(rango.hasta, { timeZone: 'UTC' })}
                      </span>
                    </div>
                    <div className="text-end">
                      <div className="text-muted small">
                        Total de asesores: <strong>{resultado.data.length}</strong>
                      </div>
                      <div className="fs-5 fw-bold text-primary">
                        Total de órdenes: {resultado.totalOrdenes}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
