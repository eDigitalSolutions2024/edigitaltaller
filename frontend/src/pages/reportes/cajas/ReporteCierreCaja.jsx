import React, { useState } from 'react';
import PeriodoSelector from '../../captura/PeriodoSelector';
import { getCierreCaja, getHistorialCierresCaja, openCierreCajaPdf } from '../../../api/reportes';
import { formatFecha } from '../../../utils/fechas';
import CierreCajaResumen from '../../cajas/components/CierreCajaResumen';

function formatMoney(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n) || 0);
}

function fechaISODia(fecha) {
  return new Date(fecha).toISOString().slice(0, 10);
}

function mismoDia(desde, hasta) {
  return new Date(desde).toDateString() === new Date(hasta).toDateString();
}

// Solo consulta: la captura del día se hace desde Cajas > Gestión de Caja.
// Esta pantalla sirve para revisar/imprimir los cierres ya guardados, con un
// historial por período (igual que Reporte diario de ingresos) y un detalle
// completo por día al pulsar "Ver detalle".
export default function ReporteCierreCaja() {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [rango, setRango] = useState(null);
  const [historial, setHistorial] = useState(null);

  const [cierre, setCierre] = useState(null);
  const [fechaActiva, setFechaActiva] = useState(null);

  const buscar = async (desde, hasta) => {
    setCargando(true);
    setError('');
    setCierre(null);
    setFechaActiva(null);
    setRango({ desde, hasta });
    try {
      const res = await getHistorialCierresCaja(desde, hasta);
      setHistorial(res.data.data);
    } catch (err) {
      setError('Error al cargar el historial de cierres de caja.');
    } finally {
      setCargando(false);
    }
  };

  const verDetalle = async (fecha) => {
    const f = fechaISODia(fecha);
    setCargando(true);
    setError('');
    try {
      const res = await getCierreCaja(f);
      setCierre(res.data.data);
      setFechaActiva(f);
    } catch (err) {
      setError('Error al cargar el detalle del cierre de este día.');
    } finally {
      setCargando(false);
    }
  };

  const volverALista = () => {
    setCierre(null);
    setFechaActiva(null);
  };

  const tituloRango = rango
    ? mismoDia(rango.desde, rango.hasta)
      ? formatFecha(rango.desde, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : `Del ${formatFecha(rango.desde)} al ${formatFecha(rango.hasta)}`
    : '';

  const tituloDetalle = fechaActiva
    ? `Cierre de Caja — ${formatFecha(fechaActiva, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
    : '';

  return (
    <div>
      {!cierre && <PeriodoSelector onBuscar={buscar} cargando={cargando} soloDia />}

      {error && <div className="alert alert-danger py-2">{error}</div>}

      {cargando && !historial && !cierre && <div className="text-muted">Cargando…</div>}

      {historial && !cierre && (
        <ListaHistorial titulo={tituloRango} historial={historial} onVerDetalle={verDetalle} />
      )}

      {cierre && (
        <>
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
            <div className="d-flex align-items-center gap-2">
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={volverALista}>
                ← Volver a la lista
              </button>
              <h5 className="mb-0">{tituloDetalle}</h5>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              onClick={() => openCierreCajaPdf(fechaActiva)}
            >
              Ver PDF
            </button>
          </div>

          <CierreCajaResumen cierre={cierre} />
        </>
      )}
    </div>
  );
}

function ListaHistorial({ titulo, historial, onVerDetalle }) {
  return (
    <>
      <h5 className="mt-3 mb-2">Cierre de Caja — {titulo}</h5>
      {historial.length === 0 ? (
        <div className="alert alert-info py-2">No hay cierres de caja guardados en el período seleccionado.</div>
      ) : (
        <div className="table-responsive">
          <table className="table table-sm table-bordered table-hover align-middle mb-0">
            <thead className="table-secondary">
              <tr>
                <th>Día</th>
                <th className="text-end">Total Cobrado</th>
                <th className="text-end">Total Reportes</th>
                <th className="text-end">Diferencia</th>
                <th className="text-end">Vales</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {historial.map((c, i) => (
                <tr key={i} style={{ cursor: 'pointer' }} onClick={() => onVerDetalle(c.fecha)}>
                  <td>{formatFecha(c.fecha, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</td>
                  <td className="text-end">{formatMoney(c.totalCobrado)}</td>
                  <td className="text-end">{formatMoney(c.totalReportes)}</td>
                  <td className={`text-end fw-bold ${c.diferencia >= 0 ? 'text-success' : 'text-danger'}`}>
                    {formatMoney(c.diferencia)}
                  </td>
                  <td className="text-end">{formatMoney(c.totalVales)}</td>
                  <td className="text-end">
                    <button type="button" className="btn btn-sm btn-link">Ver detalle</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
