import React, { useState, useEffect } from 'react';
import PeriodoSelector from '../captura/PeriodoSelector';
import { getReporteOriginalesAbiertas, openReporteOriginalesAbiertasPdf } from '../../api/reportes';
import { getAsesores } from '../../api/users';
import { formatFecha } from '../../utils/fechas';

export default function ReporteOriginalesAuditoria() {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [rango, setRango] = useState(null);
  const [asesores, setAsesores] = useState([]);
  const [asesor, setAsesor] = useState('');

  useEffect(() => {
    getAsesores().then(setAsesores).catch(() => {});
  }, []);

  const buscar = async (desde, hasta, asesorFiltro) => {
    setCargando(true);
    setError('');
    setData(null);
    setRango({ desde, hasta });
    try {
      const res = await getReporteOriginalesAbiertas(desde, hasta, asesorFiltro);
      setData(res.data);
    } catch (err) {
      setError('Error al cargar el reporte. Intenta de nuevo.');
    } finally {
      setCargando(false);
    }
  };

  const handleBuscar = (desde, hasta) => buscar(desde, hasta, asesor);

  const handleAsesorChange = (e) => {
    const val = e.target.value;
    setAsesor(val);
    if (rango) buscar(rango.desde, rango.hasta, val);
  };

  return (
    <div>
      <h5 className="mb-3 fw-bold">Reporte de Originales</h5>
      {/* <p className="text-muted small mb-3">
        Muestra todas las órdenes abiertas (no cerradas ni canceladas) en el período seleccionado, según su fecha de recepción.
      </p> */}

      <PeriodoSelector onBuscar={handleBuscar} cargando={cargando} soloDia />

      <div className="mb-3" style={{ maxWidth: 280 }}>
        <label className="form-label mb-1 fw-semibold small">Asesor</label>
        <select
          className="form-select form-select-sm"
          value={asesor}
          onChange={handleAsesorChange}
        >
          <option value="">Todos los asesores</option>
          {asesores.map((a) => (
            <option key={a._id} value={a.name}>{a.name}</option>
          ))}
        </select>
      </div>

      {error && <div className="alert alert-danger py-2">{error}</div>}

      {data && (
        <>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <span className="text-muted small">
              Período: <strong>{formatFecha(rango.desde, { timeZone: 'UTC' })}</strong> — <strong>{formatFecha(rango.hasta, { timeZone: 'UTC' })}</strong>
            </span>
            <div className="d-flex align-items-center gap-2">
              <span className="badge bg-primary fs-6">
                Total: {data.total} orden{data.total !== 1 ? 'es' : ''}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={() => openReporteOriginalesAbiertasPdf(rango.desde, rango.hasta, asesor)}
              >
                Ver PDF
              </button>
            </div>
          </div>

          {data.data.length === 0 ? (
            <div className="alert alert-info py-2">
              No se encontraron órdenes abiertas en el período seleccionado.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm table-bordered table-hover align-middle">
                <thead className="table-secondary">
                  <tr>
                    <th>#</th><th>No. Orden</th><th>Fecha</th><th>Nombre</th><th>Teléfono</th>
                    <th>Placas</th><th>No. Serie</th><th>Marca</th><th>Tipo</th><th>Asesor</th><th>Ult Vale</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((o, i) => (
                    <tr key={i}>
                      <td className="text-center text-muted">{i + 1}</td>
                      <td className="fw-semibold">{o.ordenServicio}</td>
                      <td>{formatFecha(o.fecha) || '—'}</td>
                      <td>{o.nombre || '—'}</td>
                      <td>{o.telefono || '—'}</td>
                      <td>{o.placas || '—'}</td>
                      <td>{o.serie || '—'}</td>
                      <td>{o.marca || '—'}</td>
                      <td>{o.tipo || '—'}</td>
                      <td>{o.asesores?.length ? o.asesores.join(', ') : (o.asesor || '—')}</td>
                      <td>{o.ultVale || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="table-secondary">
                  <tr>
                    <td colSpan={10} className="text-end fw-bold">Total de órdenes:</td>
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
