import React, { useState } from 'react';
import PeriodoSelector from '../../captura/PeriodoSelector';
import ReporteCierreCaja from './ReporteCierreCaja';
import ReportePendientesFactura from './ReportePendientesFactura';
import ReporteClientesAnticipos from './ReporteClientesAnticipos';
import ModalRegenerarReporte from './ModalRegenerarReporte';
import {
  getReporteCajasIngresos,
  getReporteCajasIngresosDias,
  getReporteCajasIngresosPdfUrl,
  regenerarReporteCajasIngresos,
  restaurarReporteCajasIngresos,
} from '../../../api/reportes';
import { getUser } from '../../../auth';
import { formatFecha } from '../../../utils/fechas';
import usePdfModal from '../../../hooks/usePdfModal';

import { isAdminLike } from "../../../utils/roles";
const TIPOS = [
  { key: 'NOTA_VENTA', label: 'Facturas' },
  { key: 'REMISION', label: 'Remisiones' },
];

function formatMoney(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n) || 0);
}

function celda(n) {
  return n === undefined || n === null ? '—' : formatMoney(n);
}

function fmtTotal(n) {
  return Number(n) === 0 ? '—' : formatMoney(n);
}

function mismoDia(desde, hasta) {
  return new Date(desde).toDateString() === new Date(hasta).toDateString();
}

function fechaHora(v) {
  const d = new Date(v);
  if (!v || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ReporteCajasIngresos() {
  const [vista, setVista] = useState('ingresos');
  const [tipo, setTipo] = useState('REMISION');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [rango, setRango] = useState(null);

  // Modo lista: rango de más de un día (Facturas o Remisiones) -> se muestra
  // un índice por día (Total Ingreso de cada uno) en vez del detalle completo.
  const [dias, setDias] = useState(null);

  // Detalle mostrado (ya sea de un rango de un solo día, de Facturas, o del
  // día elegido dentro de la lista). diaActivo son las fechas exactas usadas
  // para pedirlo, y con las que se genera el PDF.
  const [data, setData] = useState(null);
  const [diaActivo, setDiaActivo] = useState(null);
  const { pdfModal, abrirPdf } = usePdfModal();

  // Regenerar día (solo admin): un día ya terminado queda congelado la primera
  // vez que se abre; si algo llegó tarde, el admin lo recalcula con su motivo.
  // Cada regeneración (y cada restauración) guarda un respaldo completo de
  // cómo estaba el reporte justo antes, así que un error se puede deshacer
  // (ver data.cache.historial / restaurarDia más abajo).
  const esAdmin = isAdminLike(getUser()?.role);
  const [modalRegenerar, setModalRegenerar] = useState(false);
  const [restaurarVersion, setRestaurarVersion] = useState(null); // null = regenerar; número = restaurar a esa versión
  const [verHistorial, setVerHistorial] = useState(false);
  const [avisoRegen, setAvisoRegen] = useState(null);

  const buscar = async (desde, hasta, tipoActual) => {
    setCargando(true);
    setError('');
    setData(null);
    setDias(null);
    setDiaActivo(null);
    setAvisoRegen(null);
    setVerHistorial(false);
    setRango({ desde, hasta });
    try {
      if (!mismoDia(desde, hasta)) {
        const res = await getReporteCajasIngresosDias(desde, hasta, tipoActual);
        setDias(res.data.dias);
      } else {
        const res = await getReporteCajasIngresos(desde, hasta, tipoActual);
        setData(res.data);
        setDiaActivo({ desde, hasta });
      }
    } catch (err) {
      setError('Error al cargar el reporte. Intenta de nuevo.');
    } finally {
      setCargando(false);
    }
  };

  const verDia = async (dia) => {
    setCargando(true);
    setError('');
    setAvisoRegen(null);
    setVerHistorial(false);
    try {
      const res = await getReporteCajasIngresos(dia.desde, dia.hasta, tipo);
      setData(res.data);
      setDiaActivo({ desde: dia.desde, hasta: dia.hasta });
    } catch (err) {
      setError('Error al cargar el detalle del día. Intenta de nuevo.');
    } finally {
      setCargando(false);
    }
  };

  const volverALista = () => {
    setData(null);
    setDiaActivo(null);
    setAvisoRegen(null);
    setVerHistorial(false);
  };

  // Común a regenerar y restaurar: aplica la respuesta (misma forma en los
  // dos endpoints), cierra el modal y, en modo lista, refresca los totales
  // del día en el índice.
  const aplicarResultado = async (res) => {
    const { cambio, ...reporte } = res.data;
    setData(reporte);
    setAvisoRegen(cambio || null);
    setModalRegenerar(false);
    setRestaurarVersion(null);
    if (dias && rango) {
      try {
        const lista = await getReporteCajasIngresosDias(rango.desde, rango.hasta, tipo);
        setDias(lista.data.dias);
      } catch (_) {
        /* la lista se actualiza al volver a generar el reporte */
      }
    }
  };

  // Recalcula el día que se está viendo con los datos de hoy.
  const regenerarDia = async (motivo) => {
    const res = await regenerarReporteCajasIngresos(diaActivo.desde, diaActivo.hasta, tipo, motivo);
    await aplicarResultado(res);
  };

  // Deshace una regeneración (o restauración) anterior: vuelve el día a como
  // estaba justo antes de la versión elegida en el historial
  // (restaurarVersion; undefined = la última acción registrada).
  const restaurarDia = async (motivo) => {
    const res = await restaurarReporteCajasIngresos(diaActivo.desde, diaActivo.hasta, tipo, motivo, restaurarVersion ?? undefined);
    await aplicarResultado(res);
  };

  const handleBuscar = (desde, hasta) => buscar(desde, hasta, tipo);

  const handleTipoChange = (t) => {
    setTipo(t);
    if (rango) buscar(rango.desde, rango.hasta, t);
  };

  const tituloRango = rango
    ? mismoDia(rango.desde, rango.hasta)
      ? formatFecha(rango.desde, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : `Del ${formatFecha(rango.desde)} al ${formatFecha(rango.hasta)}`
    : '';

  const tituloDetalle = diaActivo
    ? `Reporte diario de ingresos — ${formatFecha(diaActivo.desde, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })}`
    : '';

  const tituloDiaActivo = diaActivo
    ? formatFecha(diaActivo.desde, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : '';
  const tipoLabel = TIPOS.find((t) => t.key === tipo)?.label || '';

  return (
    <div className="container-fluid py-3">
      <h2 className="mb-3">💰 Reporte de Cajas</h2>

      <div className="mb-3">
        <button
          type="button"
          className={'px-3 py-2 rounded-pill me-2 ' + (vista === 'ingresos' ? 'btn btn-primary' : 'btn btn-outline-primary')}
          onClick={() => setVista('ingresos')}
        >
          Reporte diario de ingresos
        </button>
        <button
          type="button"
          className={'px-3 py-2 rounded-pill me-2 ' + (vista === 'cierre' ? 'btn btn-primary' : 'btn btn-outline-primary')}
          onClick={() => setVista('cierre')}
        >
          Cierre de Caja
        </button>
        <button
          type="button"
          className={'px-3 py-2 rounded-pill me-2 ' + (vista === 'pendientes-factura' ? 'btn btn-primary' : 'btn btn-outline-primary')}
          onClick={() => setVista('pendientes-factura')}
        >
          Pendientes de Factura
        </button>
        <button
          type="button"
          className={'px-3 py-2 rounded-pill me-2 ' + (vista === 'clientes-anticipos' ? 'btn btn-primary' : 'btn btn-outline-primary')}
          onClick={() => setVista('clientes-anticipos')}
        >
          Clientes con Anticipos
        </button>
      </div>

      {vista === 'cierre' && (
        <div className="card shadow-sm">
          <div className="card-body">
            <ReporteCierreCaja />
          </div>
        </div>
      )}

      {vista === 'pendientes-factura' && (
        <div className="card shadow-sm">
          <div className="card-body">
            <ReportePendientesFactura />
          </div>
        </div>
      )}

      {vista === 'clientes-anticipos' && (
        <div className="card shadow-sm">
          <div className="card-body">
            <ReporteClientesAnticipos />
          </div>
        </div>
      )}

      {vista === 'ingresos' && (
        <div className="card shadow-sm">
          <div className="card-body">
            <div className="mb-3">
              <label className="form-label mb-1 fw-semibold small d-block">Tipo de comprobante</label>
              <div className="btn-group">
                {TIPOS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className={`btn btn-sm ${tipo === t.key ? 'btn-primary' : 'btn-outline-primary'}`}
                    onClick={() => handleTipoChange(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <PeriodoSelector
              onBuscar={handleBuscar}
              cargando={cargando}
              acciones={
                esAdmin && data?.cache ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    title="Recalcula el día que estás viendo con los datos de hoy (pide motivo)"
                    onClick={() => { setRestaurarVersion(null); setModalRegenerar(true); }}
                  >
                    Regenerar día
                  </button>
                ) : null
              }
            />

            {error && <div className="alert alert-danger py-2">{error}</div>}

            {dias && !data && (
              <ListaDias
                titulo={tituloRango}
                dias={dias}
                onVerDia={verDia}
              />
            )}

            {data && (
              <>
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-3 mb-2">
                  <div className="d-flex align-items-center gap-2">
                    {dias && (
                      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={volverALista}>
                        ← Volver a la lista
                      </button>
                    )}
                    <h5 className="mb-0">{dias ? tituloDetalle : `Reporte de ingresos — ${tituloRango}`}</h5>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => abrirPdf(getReporteCajasIngresosPdfUrl(diaActivo.desde, diaActivo.hasta, tipo), "reporte-cajas-ingresos.pdf", "Reporte de Ingresos")}
                  >
                    Ver PDF
                  </button>
                </div>

                {avisoRegen && (
                  <div className="alert alert-success py-2 mb-2">
                    Reporte regenerado. Venta del día: {fmtTotal(avisoRegen.antes?.totalVentaDia)} →{' '}
                    <strong>{fmtTotal(avisoRegen.despues?.totalVentaDia)}</strong> · Total Ingreso:{' '}
                    {fmtTotal(avisoRegen.antes?.totalIngreso)} →{' '}
                    <strong>{fmtTotal(avisoRegen.despues?.totalIngreso)}</strong>
                  </div>
                )}

                {tipo === 'REMISION' ? <ReporteRemisiones data={data} /> : <ReporteFacturas data={data} />}

                {data.cache && (
                  <div className="text-center mt-3">
                    {data.cache.historial?.length > 0 ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => setVerHistorial((v) => !v)}
                      >
                        {verHistorial ? '▲ ' : '▼ '}
                        Generado el {fechaHora(data.cache.generadoEn)} · {data.cache.historial.length}{' '}
                        {data.cache.historial.length === 1 ? 'cambio' : 'cambios'}
                      </button>
                    ) : (
                      <span className="text-muted small">Generado el {fechaHora(data.cache.generadoEn)}</span>
                    )}

                    {verHistorial && (
                      <div className="text-start mt-2">
                        <HistorialRegeneraciones
                          historial={data.cache.historial || []}
                          esAdmin={esAdmin}
                          onRestaurar={(version) => { setRestaurarVersion(version); setModalRegenerar(true); }}
                          onVerPdf={(version) =>
                            abrirPdf(
                              getReporteCajasIngresosPdfUrl(diaActivo.desde, diaActivo.hasta, tipo, version),
                              'reporte-cajas-ingresos-anterior.pdf',
                              'Reporte de Ingresos (versión anterior)'
                            )
                          }
                        />
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {pdfModal}
      <ModalRegenerarReporte
        show={modalRegenerar}
        modo={restaurarVersion !== null ? 'restaurar' : 'regenerar'}
        tituloDia={tituloDiaActivo}
        tipoLabel={tipoLabel}
        onClose={() => { setModalRegenerar(false); setRestaurarVersion(null); }}
        onConfirm={restaurarVersion !== null ? restaurarDia : regenerarDia}
      />
    </div>
  );
}

function ListaDias({ titulo, dias, onVerDia }) {
  return (
    <>
      <h5 className="mt-3 mb-2">Reporte de ingresos — {titulo}</h5>
      {dias.length === 0 ? (
        <div className="alert alert-info py-2">No se encontraron movimientos en el período seleccionado.</div>
      ) : (
        <div className="table-responsive">
          <table className="table table-sm table-bordered table-hover align-middle mb-0">
            <thead className="table-secondary">
              <tr>
                <th>Día</th>
                <th className="text-end">Movimientos</th>
                <th className="text-end">Total Ingreso</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {dias.map((d, i) => (
                <tr key={i} style={{ cursor: 'pointer' }} onClick={() => onVerDia(d)}>
                  <td>
                    {formatFecha(d.desde, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </td>
                  <td className="text-end">{d.totalMovimientos}</td>
                  <td className="text-end fw-bold">{formatMoney(d.totales?.totalIngreso)}</td>
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

// Bitácora de "Regenerar día"/"Restaurar" de este día (ver
// ReporteCajasSnapshot.regeneraciones en el backend): cada fila es una
// acción ya aplicada, con sus totales de antes y de después, un botón para
// VER (y de ahí descargar) el PDF de cómo se veía el reporte justo ANTES de
// esa acción, y — solo admin — uno para restaurarlo a ese mismo punto.
function HistorialRegeneraciones({ historial, esAdmin, onRestaurar, onVerPdf }) {
  if (!historial.length) return null;
  return (
    <div className="card mb-3">
      <div className="card-header py-2 fw-semibold small">Historial de este día</div>
      <div className="table-responsive">
        <table className="table table-sm table-bordered mb-0 align-middle">
          <thead className="table-light">
            <tr>
              <th>Cuándo</th>
              <th>Quién</th>
              <th>Acción</th>
              <th>Motivo</th>
              <th className="text-end">Venta del día</th>
              <th className="text-end">Total Ingreso</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {[...historial].reverse().map((h) => (
              <tr key={h.version}>
                <td className="small">{fechaHora(h.fecha)}</td>
                <td className="small">{h.usuario || '—'}</td>
                <td className="small">
                  <span className={`badge ${h.accion === 'restaurar' ? 'text-bg-info' : 'text-bg-warning'}`}>
                    {h.accion === 'restaurar' ? 'Restaurar' : 'Regenerar'}
                  </span>
                </td>
                <td className="small">{h.motivo || '—'}</td>
                <td className="text-end small">
                  {fmtTotal(h.totalesAntes?.totalVentaDia)} → <strong>{fmtTotal(h.totalesDespues?.totalVentaDia)}</strong>
                </td>
                <td className="text-end small">
                  {fmtTotal(h.totalesAntes?.totalIngreso)} → <strong>{fmtTotal(h.totalesDespues?.totalIngreso)}</strong>
                </td>
                <td className="text-end text-nowrap">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary me-1"
                    title="Ver (y descargar) el PDF de cómo estaba el reporte justo antes de esta acción"
                    onClick={() => onVerPdf(h.version)}
                  >
                    Ver PDF
                  </button>
                  {esAdmin && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      title="Vuelve el reporte a como estaba justo antes de esta acción"
                      onClick={() => onRestaurar(h.version)}
                    >
                      Restaurar a antes
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilaRemision({ r }) {
  return (
    <tr>
      <td style={{ whiteSpace: 'pre-line' }}>{r.folio ?? '—'}</td>
      <td style={{ whiteSpace: 'pre-line' }}>{r.ordenServicio || '—'}</td>
      <td style={{ whiteSpace: 'pre-line' }}>{r.cliente || '—'}</td>
      <td className="text-end">{celda(r.ventaDia)}</td>
      <td className="text-end">{celda(r.ingresoContado)}</td>
      <td className="text-end">{celda(r.ingresoCredito)}</td>
      <td className="text-end">{celda(r.anticipo)}</td>
      <td className="text-end">{celda(r.cuentasPorCobrar)}</td>
      <td>{r.notas || '—'}</td>
    </tr>
  );
}

function BandaRemision({ titulo, filas }) {
  if (!filas.length) return null;
  return (
    <>
      <tr className="table-secondary">
        <td colSpan={9} className="fw-bold">{titulo}</td>
      </tr>
      {filas.map((r, i) => (
        <FilaRemision key={i} r={r} />
      ))}
    </>
  );
}

function ReporteRemisiones({ data }) {
  const {
    anticipos = [],
    canceladas = [],
    abonos = [],
    nuevaVenta = [],
    ordenesCanceladas = [],
    totales = {},
  } = data;
  const sinDatos =
    !anticipos.length &&
    !canceladas.length &&
    !abonos.length &&
    !nuevaVenta.length &&
    !ordenesCanceladas.length;

  return (
    <>
      {sinDatos ? (
        <div className="alert alert-info py-2">No se encontraron movimientos en el período seleccionado.</div>
      ) : (
        <div className="table-responsive mb-2">
          <table className="table table-sm table-bordered align-middle mb-0">
            <thead className="table-secondary">
              <tr>
                <th>No. Rem</th>
                <th>No. Orden</th>
                <th>Nombre del cliente</th>
                <th className="text-end">Venta del día</th>
                <th className="text-end">Ingreso de contado</th>
                <th className="text-end">Ingreso de crédito</th>
                <th className="text-end">Anticipo</th>
                <th className="text-end">Cuentas por cobrar</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              <BandaRemision titulo="Anticipos" filas={anticipos} />
              <BandaRemision titulo="Canceladas y pasan a factura" filas={canceladas} />
              <BandaRemision titulo="Abonos y liquidaciones" filas={abonos} />
              <BandaRemision titulo="Nueva venta del día" filas={nuevaVenta} />
              <BandaRemision titulo="Órdenes canceladas del día" filas={ordenesCanceladas} />
            </tbody>
            <tfoot>
              <tr className="table-light">
                <td colSpan={3} className="fw-bold">TOTALES</td>
                <td className="text-end fw-bold">{fmtTotal(totales.totalVentaDia)}</td>
                <td className="text-end fw-bold">{fmtTotal(totales.totalContado)}</td>
                <td className="text-end fw-bold">{fmtTotal(totales.totalCredito)}</td>
                <td className="text-end fw-bold">{fmtTotal(totales.totalAnticipo)}</td>
                <td className="text-end fw-bold">{fmtTotal(totales.totalPorCobrar)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="d-flex justify-content-end mb-2">
        <span className="badge bg-primary fs-6">Total Ingreso: {formatMoney(totales.totalIngreso)}</span>
      </div>
    </>
  );
}

function ReporteFacturas({ data }) {
  const {
    anticipos = [],
    anticiposCancelados = [],
    complementosPago = [],
    notasCredito = [],
    facturasCanceladas = [],
    facturas = [],
    facturaGlobal = [],
    totales = {},
    deposito = {},
  } = data;
  const sinDatos =
    !anticipos.length &&
    !anticiposCancelados.length &&
    !complementosPago.length &&
    !notasCredito.length &&
    !facturasCanceladas.length &&
    !facturas.length &&
    !facturaGlobal.length;

  return (
    <>
      {sinDatos ? (
        <div className="alert alert-info py-2">No se encontraron movimientos en el período seleccionado.</div>
      ) : (
        <div className="table-responsive mb-2">
          <table className="table table-sm table-bordered align-middle mb-0">
            <thead className="table-secondary">
              <tr>
                <th>No. Fact</th>
                <th>No. Orden</th>
                <th>Nombre del cliente</th>
                <th className="text-end">Venta del día</th>
                <th className="text-end">Ingreso de contado</th>
                <th className="text-end">Ingreso de crédito</th>
                <th className="text-end">Anticipo</th>
                <th className="text-end">Cuentas por cobrar</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              <BandaRemision titulo="Anticipos" filas={anticipos} />
              <BandaRemision titulo="Anticipos cancelados" filas={anticiposCancelados} />
              <BandaRemision titulo="Complementos de pago" filas={complementosPago} />
              <BandaRemision titulo="Notas de crédito" filas={notasCredito} />
              <BandaRemision titulo="Facturas canceladas" filas={facturasCanceladas} />
              <BandaRemision titulo="Facturas" filas={facturas} />
              <BandaRemision titulo="Factura global" filas={facturaGlobal} />
            </tbody>
            <tfoot>
              <tr className="table-light">
                <td colSpan={3} className="fw-bold">TOTALES</td>
                <td className="text-end fw-bold">{fmtTotal(totales.totalVentaDia)}</td>
                <td className="text-end fw-bold">{fmtTotal(totales.totalContado)}</td>
                <td className="text-end fw-bold">{fmtTotal(totales.totalCredito)}</td>
                <td className="text-end fw-bold">{fmtTotal(totales.totalAnticipo)}</td>
                <td className="text-end fw-bold">{fmtTotal(totales.totalPorCobrar)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="d-flex justify-content-end mb-2">
        <span className="badge bg-primary fs-6">Total Ingreso: {formatMoney(totales.totalIngreso)}</span>
      </div>

      <TablaDeposito deposito={deposito} totalIngreso={totales.totalIngreso} />
    </>
  );
}

const DEPOSITO_LABELS = [
  ['cheques', 'Cheques'],
  ['transferencias', 'Transferencias'],
  ['tarjetasCD', 'Tarjetas C/D'],
  ['efectivo', 'Efectivo'],
];

function TablaDeposito({ deposito, totalIngreso }) {
  // Depósito y Total Ingreso miden cosas distintas (Depósito es todo lo que
  // físicamente entró a Cajas por cualquier forma de cobro; Total Ingreso
  // excluye Cuentas por Cobrar) y por eso casi nunca coinciden exacto: por
  // ejemplo una factura a crédito (PPD) que igual se cobró con tarjeta en el
  // momento suma a Depósito pero no a Total Ingreso. Se deja la diferencia a
  // la vista para no tener que restarla a mano.
  const diferencia = (Number(deposito.total) || 0) - (Number(totalIngreso) || 0);
  return (
    <div className="d-flex align-items-center gap-4 flex-wrap">
      <div className="table-responsive" style={{ maxWidth: 420 }}>
        <table className="table table-sm table-bordered align-middle mb-0">
          <thead className="table-secondary">
            <tr>
              <th colSpan={2}>Depósito</th>
            </tr>
          </thead>
          <tbody>
            {DEPOSITO_LABELS.map(([key, label]) => (
              <tr key={key}>
                <td>{label}</td>
                <td className="text-end">{fmtTotal(deposito[key])}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="table-light">
            <tr>
              <td className="fw-bold">Total</td>
              <td className="text-end fw-bold">{formatMoney(deposito.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {/* Como un sello: solo texto, sin contorno ni fondo, junto a Depósito. */}
      <div
        className="fw-bold text-center"
        style={{ marginLeft: "5%", fontSize: "1.5rem", color: "#383636", opacity: 0.85 }}
      >
        DIFERENCIA
        <br />
        {formatMoney(diferencia)}
      </div>
    </div>
  );
}
