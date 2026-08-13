import React, { useState, useEffect } from 'react';
import Dropdown from '../../../components/Dropdown';
import PeriodoSelector from '../../captura/PeriodoSelector';
import { getReporteRhCxC, openReporteRhCxCPdf } from '../../../api/reportes';
import { listarEmpleados } from '../../../api/empleados';
import { formatFecha } from '../../../utils/fechas';

function formatMoney(n) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}

export default function ReporteRhCxC() {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [rango, setRango] = useState(null);
  const [mecanicos, setMecanicos] = useState([]);
  const [mecanico, setMecanico] = useState('');

  useEffect(() => {
    listarEmpleados({ puesto: 'mecanico', activo: true })
      .then(setMecanicos)
      .catch(() => {});
  }, []);

  const buscar = async (desde, hasta, mecanicoFiltro) => {
    setCargando(true);
    setError('');
    setData(null);
    setRango({ desde, hasta });
    try {
      const res = await getReporteRhCxC(desde, hasta, mecanicoFiltro);
      setData(res.data);
    } catch (err) {
      setError('Error al cargar el reporte. Intenta de nuevo.');
    } finally {
      setCargando(false);
    }
  };

  const handleBuscar = (desde, hasta) => buscar(desde, hasta, mecanico);

  const handleMecanicoChange = (e) => {
    const val = e.target.value;
    setMecanico(val);
    if (rango) buscar(rango.desde, rango.hasta, val);
  };

  return (
    <div>
      <h5 className="mb-3 fw-bold">Reporte de C x C</h5>
      <p className="text-muted small mb-3">
        Órdenes cerradas en el período seleccionado, agrupadas por mecánico:
        monto de los servicios asignados y monto de mano de obra a pagar
        (horas × tarifa).
      </p>

      <PeriodoSelector onBuscar={handleBuscar} cargando={cargando} />

      <div className="mb-3" style={{ maxWidth: 280 }}>
        <label className="form-label mb-1 fw-semibold small">Mecánico</label>
        <Dropdown
          className="form-select-sm"
          value={mecanico}
          onChange={handleMecanicoChange}
        >
          <Dropdown.Option value="">Todos los mecánicos</Dropdown.Option>
          {mecanicos.map((m) => (
            <Dropdown.Option key={m._id} value={m._id}>{m.nombre}</Dropdown.Option>
          ))}
        </Dropdown>
      </div>

      {error && <div className="alert alert-danger py-2">{error}</div>}

      {data && (
        <>
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
            <span className="text-muted small">
              Período: <strong>{formatFecha(rango.desde)}</strong> — <strong>{formatFecha(rango.hasta)}</strong>
            </span>
            <div className="d-flex align-items-center gap-2">
              <span className="badge bg-primary fs-6">
                Servicios: {formatMoney(data.totalServiciosGeneral)}
              </span>
              <span className="badge bg-secondary fs-6">
                Mano de obra a pagar: {formatMoney(data.totalManoObraGeneral)}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={() => openReporteRhCxCPdf(rango.desde, rango.hasta, mecanico)}
              >
                Ver PDF
              </button>
            </div>
          </div>

          {data.data.length === 0 ? (
            <div className="alert alert-info py-2">
              No se encontró mano de obra registrada en el período seleccionado.
            </div>
          ) : (
            data.data.map((grupo) => (
              <div key={grupo.mecanico} className="mb-4">
                <h6 className="fw-bold fst-italic border-bottom pb-1">
                  Mecánico: {grupo.mecanico}
                </h6>
                <div className="table-responsive">
                  <table className="table table-sm table-bordered table-hover align-middle">
                    <thead className="table-secondary">
                      <tr>
                        <th>No Orden</th>
                        <th>Cliente</th>
                        <th>Fecha Cierre</th>
                        <th>Servicio</th>
                        <th className="text-end">Horas</th>
                        <th className="text-end">Monto Servicio</th>
                        <th className="text-end">Mano de Obra a Pagar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grupo.items.map((it, i) => (
                        <tr key={i}>
                          <td className="fw-semibold">{it.ordenServicio}</td>
                          <td>{it.cliente || '—'}</td>
                          <td>{formatFecha(it.fechaCierre) || '—'}</td>
                          <td>{it.concepto || '—'}</td>
                          <td className="text-end">{it.horas}</td>
                          <td className="text-end">{formatMoney(it.montoServicio)}</td>
                          <td className="text-end">{formatMoney(it.montoManoObra)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="table-secondary">
                      <tr>
                        <td colSpan={5} className="fst-italic fw-bold">
                          Subtotal {grupo.mecanico}
                        </td>
                        <td className="text-end fw-bold">{formatMoney(grupo.totalServicios)}</td>
                        <td className="text-end fw-bold">{formatMoney(grupo.totalManoObra)}</td>
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
