import React, { useState } from 'react';
import PeriodoSelector from './PeriodoSelector';
import { getReporteOriginales } from '../../api/reportes';

export default function ReporteOriginales() {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [rango, setRango] = useState(null);

  const handleBuscar = async (desde, hasta) => {
    setCargando(true);
    setError('');
    setData(null);
    setRango({ desde, hasta });
    try {
      const res = await getReporteOriginales(desde, hasta);
      setData(res.data);
    } catch (err) {
      setError('Error al cargar el reporte. Intenta de nuevo.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div>
      <h5 className="mb-3 fw-bold">Reporte de Originales</h5>
      <p className="text-muted small mb-3">
        Muestra todas las órdenes finalizadas (cerradas) en el período seleccionado.
      </p>

      <PeriodoSelector onBuscar={handleBuscar} cargando={cargando} />

      {error && (
        <div className="alert alert-danger py-2">{error}</div>
      )}

      {data && (
        <>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <span className="text-muted small">
              Período: <strong>{new Date(rango.desde).toLocaleDateString('es-MX')}</strong> — <strong>{new Date(rango.hasta).toLocaleDateString('es-MX')}</strong>
            </span>
            <span className="badge bg-primary fs-6">
              Total: {data.total} orden{data.total !== 1 ? 'es' : ''}
            </span>
          </div>

          {data.data.length === 0 ? (
            <div className="alert alert-info py-2">
              No se encontraron órdenes cerradas en el período seleccionado.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm table-bordered table-hover align-middle">
                <thead className="table-secondary">
                  <tr>
                    <th>#</th>
                    <th>No. Orden</th>
                    <th>Nombre</th>
                    <th>Teléfono</th>
                    <th>No. Serie</th>
                    <th>Marca</th>
                    <th>Tipo</th>
                    <th>Asesor</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((o, i) => (
                    <tr key={i}>
                      <td className="text-center text-muted">{i + 1}</td>
                      <td className="fw-semibold">{o.ordenServicio}</td>
                      <td>{o.nombre || '—'}</td>
                      <td>{o.telefono || '—'}</td>
                      <td>{o.serie || '—'}</td>
                      <td>{o.marca || '—'}</td>
                      <td>{o.tipo || '—'}</td>
                      <td>{o.asesor || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="table-secondary">
                  <tr>
                    <td colSpan={7} className="text-end fw-bold">Total de órdenes:</td>
                    <td className="fw-bold text-center">{data.total}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
