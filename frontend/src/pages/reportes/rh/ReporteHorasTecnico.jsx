import React, { useState } from 'react';
import PeriodoSelector from '../../captura/PeriodoSelector';
import { getReporteHorasTecnico, getReporteHorasTecnicoPdfUrl } from '../../../api/reportes';
import usePdfModal from '../../../hooks/usePdfModal';
import { formatFecha } from '../../../utils/fechas';

function formatMoney(n) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}

const ESTADOS = [
  { key: 'cerradas', label: 'Cerradas' },
  { key: 'abiertas', label: 'Abiertas' },
  { key: 'todas', label: 'Todas' },
];

export default function ReporteHorasTecnico() {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [rango, setRango] = useState(null);
  const [estado, setEstado] = useState('cerradas');
  const { pdfModal, abrirPdf } = usePdfModal();

  const buscar = async (desde, hasta, estadoFiltro) => {
    setCargando(true);
    setError('');
    setData(null);
    setRango({ desde, hasta });
    try {
      const res = await getReporteHorasTecnico(desde, hasta, estadoFiltro);
      setData(res.data);
    } catch (err) {
      setError('Error al cargar el reporte. Intenta de nuevo.');
    } finally {
      setCargando(false);
    }
  };

  const handleBuscar = (desde, hasta) => buscar(desde, hasta, estado);

  const handleEstadoChange = (val) => {
    setEstado(val);
    if (rango) buscar(rango.desde, rango.hasta, val);
  };

  return (
    <div>
      <h5 className="mb-3 fw-bold">Reporte de Horas Trabajadas por Técnico</h5>
      <p className="text-muted small mb-3">
        Órdenes en el período seleccionado (según fecha de recepción), agrupadas por técnico.
      </p>

      <PeriodoSelector onBuscar={handleBuscar} cargando={cargando} soloDia />

      <div className="mb-3">
        <label className="form-label mb-1 fw-semibold small d-block">Órdenes</label>
        <div className="btn-group">
          {ESTADOS.map((e) => (
            <button
              key={e.key}
              type="button"
              className={`btn btn-sm ${estado === e.key ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => handleEstadoChange(e.key)}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="alert alert-danger py-2">{error}</div>}

      {data && (
        <>
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
            <span className="text-muted small">
              Período: <strong>{formatFecha(rango.desde, { timeZone: 'UTC' })}</strong> — <strong>{formatFecha(rango.hasta, { timeZone: 'UTC' })}</strong>
            </span>
            <div className="d-flex align-items-center gap-2">
              <span className="badge bg-primary fs-6">
                Servicio: {formatMoney(data.totalGeneralServicio)}
              </span>
              <span className="badge bg-secondary fs-6">
                IVA: {formatMoney(data.totalGeneralIva)}
              </span>
              <span className="badge bg-dark fs-6">
                Horas: {data.totalGeneralHoras}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={() => abrirPdf(getReporteHorasTecnicoPdfUrl(rango.desde, rango.hasta, estado), "reporte-horas-tecnico.pdf", "Reporte de Horas por Técnico")}
              >
                Ver PDF
              </button>
            </div>
          </div>

          {data.data.length === 0 ? (
            <div className="alert alert-info py-2">
              No se encontraron órdenes en el período seleccionado.
            </div>
          ) : (
            data.data.map((grupo) => (
              <div key={grupo.mecanico} className="mb-4">
                <h6 className="fw-bold fst-italic border-bottom pb-1">{grupo.mecanico}</h6>
                <div className="table-responsive">
                  <table className="table table-sm table-bordered table-hover align-middle">
                    <thead className="table-secondary">
                      <tr>
                        <th>No. Orden</th>
                        <th>Fecha Orden</th>
                        <th>No. Serie</th>
                        <th>Nombre</th>
                        <th className="text-center">Cerrada</th>
                        <th>Fecha Cerrada</th>
                        <th className="text-center">Rem</th>
                        <th className="text-end">Servicio</th>
                        <th className="text-end">Total</th>
                        <th className="text-end">IVA</th>
                        <th className="text-end">Horas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grupo.items.map((it, i) => (
                        <tr key={i}>
                          <td className="fw-semibold">{it.ordenServicio}</td>
                          <td>{formatFecha(it.fechaOrden, { timeZone: 'UTC' }) || '—'}</td>
                          <td>{it.serie || '—'}</td>
                          <td>{it.nombre || '—'}</td>
                          <td className="text-center">
                            <input type="checkbox" checked={it.cerrada} readOnly disabled />
                          </td>
                          <td>{formatFecha(it.fechaCierre) || '—'}</td>
                          <td className="text-center">
                            <input type="checkbox" checked={it.remision} readOnly disabled />
                          </td>
                          <td className="text-end">{formatMoney(it.montoServicio)}</td>
                          <td className="text-end">{formatMoney(it.total)}</td>
                          <td className="text-end">{formatMoney(it.iva)}</td>
                          <td className="text-end">{it.horas}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="table-secondary">
                      <tr>
                        <td colSpan={7} className="fst-italic fw-bold">
                          Totales por Técnico: {grupo.mecanico}
                        </td>
                        <td className="text-end fw-bold">{formatMoney(grupo.totalServicio)}</td>
                        <td className="text-end fw-bold">{formatMoney(grupo.totalServicio)}</td>
                        <td className="text-end fw-bold">{formatMoney(grupo.totalIva)}</td>
                        <td className="text-end fw-bold">{grupo.totalHoras}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ))
          )}
        </>
      )}
      {pdfModal}
    </div>
  );
}
