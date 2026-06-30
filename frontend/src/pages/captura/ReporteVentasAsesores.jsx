import React, { useState } from 'react';
import PeriodoSelector from './PeriodoSelector';
import { getReporteVentasAsesores } from '../../api/reportes';

const fmt = (n) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0);

export default function ReporteVentasAsesores() {
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
      const res = await getReporteVentasAsesores(desde, hasta);
      setResultado(res.data);
    } catch (err) {
      setError('Error al cargar el reporte. Intenta de nuevo.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div>
      <h5 className="mb-3 fw-bold">Reporte de Ventas (Asesores)</h5>
      <p className="text-muted small mb-3">
        Órdenes finalizadas agrupadas por asesor, con importe por orden y totales.
      </p>

      <PeriodoSelector onBuscar={handleBuscar} cargando={cargando} />

      {error && (
        <div className="alert alert-danger py-2">{error}</div>
      )}

      {resultado && (
        <>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <span className="text-muted small">
              Período: <strong>{new Date(rango.desde).toLocaleDateString('es-MX')}</strong> — <strong>{new Date(rango.hasta).toLocaleDateString('es-MX')}</strong>
            </span>
            <div className="d-flex gap-2">
              <span className="badge bg-secondary fs-6">
                Total órdenes: {resultado.totalOrdenes}
              </span>
              <span className="badge bg-primary fs-6">
                Total general: {fmt(resultado.totalGeneral)}
              </span>
            </div>
          </div>

          {resultado.data.length === 0 ? (
            <div className="alert alert-info py-2">
              No se encontraron órdenes cerradas en el período seleccionado.
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
                          <th>#</th>
                          <th>No. Orden</th>
                          <th>Nombre Cliente</th>
                          <th>Marca</th>
                          <th>Tipo</th>
                          <th className="text-end">Importe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grupo.ordenes.map((o, i) => (
                          <tr key={i}>
                            <td className="text-muted text-center">{i + 1}</td>
                            <td className="fw-semibold">{o.ordenServicio}</td>
                            <td>{o.nombreCliente || '—'}</td>
                            <td>{o.marca || '—'}</td>
                            <td>{o.tipo || '—'}</td>
                            <td className="text-end">{fmt(o.importe)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="table-warning">
                        <tr>
                          <td colSpan={5} className="text-end fw-bold">
                            Total {grupo.asesor}:
                          </td>
                          <td className="text-end fw-bold">{fmt(grupo.totalAsesor)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              ))}

              {/* Resumen final */}
              <div className="card border-primary mt-3">
                <div className="card-body py-2">
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <span className="fw-bold me-3">Resumen del período</span>
                      <span className="text-muted small">
                        {new Date(rango.desde).toLocaleDateString('es-MX')} — {new Date(rango.hasta).toLocaleDateString('es-MX')}
                      </span>
                    </div>
                    <div className="text-end">
                      <div className="text-muted small">
                        Total órdenes: <strong>{resultado.totalOrdenes}</strong>
                      </div>
                      <div className="fs-5 fw-bold text-primary">
                        {fmt(resultado.totalGeneral)}
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
