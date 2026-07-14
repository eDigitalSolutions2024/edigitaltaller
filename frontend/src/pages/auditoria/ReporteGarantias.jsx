import React, { useState, useEffect } from 'react';
import PeriodoSelector from '../captura/PeriodoSelector';
import { getReporteGarantias, openReporteGarantiasPdf } from '../../api/reportes';
import { getAsesores } from '../../api/users';
import { formatFecha } from '../../utils/fechas';

function formatMoney(n) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}

export default function ReporteGarantias() {
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
      const res = await getReporteGarantias(desde, hasta, asesorFiltro);
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
      <h5 className="mb-3 fw-bold">Reporte de Garantías</h5>
      {/* <p className="text-muted small mb-3">
        Órdenes con garantía autorizada en el período seleccionado (por fecha de recepción).
        El costo es la suma de Venta al Cliente (sin IVA) más la mano de obra.
      </p> */}

      <PeriodoSelector onBuscar={handleBuscar} cargando={cargando} />

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
              Período: <strong>{new Date(rango.desde).toLocaleDateString('es-MX')}</strong> — <strong>{new Date(rango.hasta).toLocaleDateString('es-MX')}</strong>
            </span>
            <div className="d-flex align-items-center gap-2">
              <span className="badge bg-primary fs-6">
                Total: {data.totalOrdenes} orden{data.totalOrdenes !== 1 ? 'es' : ''}
              </span>
              <span className="badge bg-secondary fs-6">
                Costo: {formatMoney(data.totalCosto)}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={() => openReporteGarantiasPdf(rango.desde, rango.hasta, asesor)}
              >
                Ver PDF
              </button>
            </div>
          </div>

          {data.data.length === 0 ? (
            <div className="alert alert-info py-2">
              No se encontraron garantías autorizadas en el período seleccionado.
            </div>
          ) : (
            data.data.map((grupo) => (
              <div key={grupo.asesor} className="mb-4">
                <h6 className="fw-bold fst-italic border-bottom pb-1">
                  Asesor: {grupo.asesor}
                </h6>
                <div className="table-responsive">
                  <table className="table table-sm table-bordered table-hover align-middle">
                    <thead className="table-secondary">
                      <tr>
                        <th>No Orden</th><th>Cliente</th><th>Ord. Ant</th><th>Fecha</th>
                        <th>Marca</th><th>Modelo</th><th>Serie</th>
                        <th className="text-end">Costo c/IVA</th><th>Motivo</th><th>Mecánicos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grupo.ordenes.map((o, i) => (
                        <tr key={i}>
                          <td className="fw-semibold">{o.ordenServicio}</td>
                          <td>{o.cliente || '—'}</td>
                          <td>{o.ordenAnterior || '—'}</td>
                          <td>{formatFecha(o.fecha) || '—'}</td>
                          <td>{o.marca || '—'}</td>
                          <td>{o.modelo || '—'}</td>
                          <td>{o.serie || '—'}</td>
                          <td className="text-end">{formatMoney(o.costo)}</td>
                          <td>{o.motivo || '—'}</td>
                          <td>{o.mecanicos?.length ? o.mecanicos.join('; ') : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="table-secondary">
                      <tr>
                        <td colSpan={10} className="fst-italic fw-bold">
                          Cant. Ordenes: {grupo.totalAsesor}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}
