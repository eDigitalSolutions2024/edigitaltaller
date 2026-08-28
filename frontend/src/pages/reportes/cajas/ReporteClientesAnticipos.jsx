import React, { useEffect, useState } from 'react';
import { getReporteClientesAnticipos, getReporteClientesAnticiposPdfUrl } from '../../../api/reportes';
import usePdfModal from '../../../hooks/usePdfModal';
import { formatFecha } from '../../../utils/fechas';

function formatMoney(n) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}

// A diferencia de los demás reportes de Cajas, este no usa PeriodoSelector:
// es una fotografía del saldo a favor ACTUAL de cada cliente (un balance),
// no un rango de fechas.
export default function ReporteClientesAnticipos() {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const { pdfModal, abrirPdf } = usePdfModal();

  const cargar = async () => {
    setCargando(true);
    setError('');
    try {
      const res = await getReporteClientesAnticipos();
      setData(res.data);
    } catch (err) {
      setError('Error al cargar el reporte. Intenta de nuevo.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  return (
    <div>
      <h5 className="mb-3 fw-bold">Reporte de Clientes con Anticipos</h5>
      <p className="text-muted small mb-3">
        Clientes con saldo a favor disponible actualmente (depósitos de anticipo pendientes de usar).
      </p>

      <div className="mb-3">
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={cargar} disabled={cargando}>
          {cargando ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      {error && <div className="alert alert-danger py-2">{error}</div>}

      {data && (
        <>
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
            <div className="d-flex align-items-center gap-2">
              <span className="badge bg-warning text-dark fs-6">Clientes: {data.total}</span>
              <span className="badge bg-success fs-6">Saldo total: {formatMoney(data.totalSaldo)}</span>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              onClick={() => abrirPdf(getReporteClientesAnticiposPdfUrl(), "reporte-clientes-anticipos.pdf", "Reporte de Clientes con Anticipos")}
            >
              Ver PDF
            </button>
          </div>

          {data.data.length === 0 ? (
            <div className="alert alert-info py-2">
              No hay clientes con saldo a favor actualmente.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm table-bordered table-hover align-middle">
                <thead className="table-secondary">
                  <tr>
                    <th>Cliente</th>
                    <th>Teléfono</th>
                    <th>Último Movimiento</th>
                    <th className="text-end">Saldo a Favor</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((it, i) => (
                    <tr key={i}>
                      <td className="fw-semibold">{it.cliente || '—'}</td>
                      <td>{it.telefono || '—'}</td>
                      <td>{formatFecha(it.ultimoMovimiento) || '—'}</td>
                      <td className="text-end fw-bold text-success">{formatMoney(it.saldoAFavor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {pdfModal}
    </div>
  );
}
