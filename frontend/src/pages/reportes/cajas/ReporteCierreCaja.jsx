import React, { useState } from 'react';
import PeriodoSelector from '../../captura/PeriodoSelector';
import {
  getCierreCaja,
  getHistorialCierresCaja,
  getCierreCajaPdfUrl,
  restablecerCierreCaja,
} from '../../../api/reportes';
import { formatFecha } from '../../../utils/fechas';
import { getUser } from '../../../auth';
import CierreCajaResumen from '../../cajas/components/CierreCajaResumen';
import usePdfModal from '../../../hooks/usePdfModal';

function formatMoney(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n) || 0);
}

function fechaHora(v) {
  if (!v) return '—';
  return new Date(v).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
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
  const [restableciendo, setRestableciendo] = useState(false);
  const { pdfModal, abrirPdf } = usePdfModal();
  const esAdmin = getUser()?.role === 'admin';

  const buscar = async (desde, hasta) => {
    setCargando(true);
    setError('');
    setCierre(null);
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

  const verDetalle = async (row) => {
    setCargando(true);
    setError('');
    try {
      const res = await getCierreCaja(row._id);
      setCierre(res.data.data);
    } catch (err) {
      setError('Error al cargar el detalle de esta sesión de caja.');
    } finally {
      setCargando(false);
    }
  };

  const volverALista = () => {
    setCierre(null);
  };

  const restablecerSesion = async () => {
    if (!cierre?._id) return;
    if (!window.confirm('¿Reabrir esta sesión de caja? Solo se puede si no hay otra caja abierta.')) return;
    setRestableciendo(true);
    setError('');
    try {
      await restablecerCierreCaja(cierre._id);
      const res = await getCierreCaja(cierre._id);
      setCierre(res.data.data);
      if (rango) buscar(rango.desde, rango.hasta);
    } catch (err) {
      setError(err?.response?.data?.msg || 'No se pudo restablecer la sesión.');
    } finally {
      setRestableciendo(false);
    }
  };

  const tituloRango = rango
    ? mismoDia(rango.desde, rango.hasta)
      ? formatFecha(rango.desde, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : `Del ${formatFecha(rango.desde)} al ${formatFecha(rango.hasta)}`
    : '';

  const cerrada = cierre?.estado === 'CERRADA';
  const tituloDetalle = cierre
    ? `Sesión de caja — ${fechaHora(cierre.abiertaEn || cierre.fecha)} → ${
        cierre.cerradoEn ? fechaHora(cierre.cerradoEn) : 'ABIERTA'
      }`
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
            <div className="d-flex gap-2">
              {esAdmin && cerrada && (
                <button
                  type="button"
                  className="btn btn-sm btn-warning"
                  onClick={restablecerSesion}
                  disabled={restableciendo}
                >
                  {restableciendo ? 'Restableciendo…' : 'Restablecer sesión'}
                </button>
              )}
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={() => abrirPdf(getCierreCajaPdfUrl(cierre._id), "cierre-caja.pdf", "Cierre de Caja")}
              >
                Ver PDF
              </button>
            </div>
          </div>

          <CierreCajaResumen cierre={cierre} />
        </>
      )}
      {pdfModal}
    </div>
  );
}

function ListaHistorial({ titulo, historial, onVerDetalle }) {
  return (
    <>
      <h5 className="mt-3 mb-2">Sesiones de caja cerradas — {titulo}</h5>
      {historial.length === 0 ? (
        <div className="alert alert-info py-2">No hay sesiones de caja cerradas en el período seleccionado.</div>
      ) : (
        <div className="table-responsive">
          <table className="table table-sm table-bordered table-hover align-middle mb-0">
            <thead className="table-secondary">
              <tr>
                <th>Apertura</th>
                <th>Cierre</th>
                <th>Cerró</th>
                <th className="text-end">Total Cobrado</th>
                <th className="text-end">Total Reportes</th>
                <th className="text-end">Diferencia</th>
                <th className="text-end">Vales</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {historial.map((c, i) => (
                <tr key={c._id || i} style={{ cursor: 'pointer' }} onClick={() => onVerDetalle(c)}>
                  <td>{fechaHora(c.abiertaEn || c.fecha)}</td>
                  <td>{fechaHora(c.cerradoEn)}</td>
                  <td>{c.cerradoPor || '—'}</td>
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
