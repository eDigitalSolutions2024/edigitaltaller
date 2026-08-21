import React, { useState } from 'react';
import PeriodoSelector from '../../captura/PeriodoSelector';
import { getReportePendientesFactura, getReportePendientesFacturaPdfUrl } from '../../../api/reportes';
import usePdfModal from '../../../hooks/usePdfModal';
import { formatFecha } from '../../../utils/fechas';

function formatMoney(n) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}

export default function ReportePendientesFactura() {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [rango, setRango] = useState(null);
  const { pdfModal, abrirPdf } = usePdfModal();

  const handleBuscar = async (desde, hasta) => {
    setCargando(true);
    setError('');
    setData(null);
    setRango({ desde, hasta });
    try {
      const res = await getReportePendientesFactura(desde, hasta);
      setData(res.data);
    } catch (err) {
      setError('Error al cargar el reporte. Intenta de nuevo.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div>
      <h5 className="mb-3 fw-bold">Reporte de Pendientes de Factura</h5>
      <p className="text-muted small mb-3">
        Órdenes marcadas "Pendiente de Factura" desde Cajas en el período seleccionado (según la
        fecha en que se marcaron), que todavía no se han facturado.
      </p>

      <PeriodoSelector onBuscar={handleBuscar} cargando={cargando} soloDia />

      {error && <div className="alert alert-danger py-2">{error}</div>}

      {data && (
        <>
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
            <span className="text-muted small">
              Período: <strong>{formatFecha(rango.desde, { timeZone: 'UTC' })}</strong> — <strong>{formatFecha(rango.hasta, { timeZone: 'UTC' })}</strong>
            </span>
            <div className="d-flex align-items-center gap-2">
              <span className="badge bg-warning text-dark fs-6">
                Órdenes: {data.total}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={() => abrirPdf(getReportePendientesFacturaPdfUrl(rango.desde, rango.hasta), "reporte-pendientes-factura.pdf", "Reporte de Pendientes de Factura")}
              >
                Ver PDF
              </button>
            </div>
          </div>

          {data.data.length === 0 ? (
            <div className="alert alert-info py-2">
              No se encontraron órdenes pendientes de factura en el período seleccionado.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm table-bordered table-hover align-middle">
                <thead className="table-secondary">
                  <tr>
                    <th>No. Orden</th>
                    <th>Cliente</th>
                    <th>Marca / Modelo</th>
                    <th>No. Serie</th>
                    <th>Fecha Cierre</th>
                    <th>Marcada Pendiente</th>
                    <th>Marcada Por</th>
                    <th className="text-end">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((it, i) => (
                    <tr key={i}>
                      <td className="fw-semibold">{it.ordenServicio}</td>
                      <td>{it.cliente || '—'}</td>
                      <td>{[it.marca, it.modelo].filter(Boolean).join(' ') || '—'}</td>
                      <td>{it.serie || '—'}</td>
                      <td>{formatFecha(it.fechaCierre) || '—'}</td>
                      <td>{formatFecha(it.pendienteFacturaEn) || '—'}</td>
                      <td>{it.pendienteFacturaPor || '—'}</td>
                      <td className="text-end">{formatMoney(it.total)}</td>
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
