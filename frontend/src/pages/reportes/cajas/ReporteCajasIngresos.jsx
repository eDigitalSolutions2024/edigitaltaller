import React, { useState } from 'react';
import PeriodoSelector from '../../captura/PeriodoSelector';
import ReporteCierreCaja from './ReporteCierreCaja';
import {
  getReporteCajasIngresos,
  getReporteRemisionesDias,
  openReporteCajasIngresosPdf,
} from '../../../api/reportes';
import { formatFecha } from '../../../utils/fechas';

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

export default function ReporteCajasIngresos() {
  const [vista, setVista] = useState('ingresos');
  const [tipo, setTipo] = useState('REMISION');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [rango, setRango] = useState(null);

  // Modo lista: rango de más de un día en Remisiones -> se muestra un índice
  // por día (Total Ingreso de cada uno) en vez del detalle completo.
  const [dias, setDias] = useState(null);

  // Detalle mostrado (ya sea de un rango de un solo día, de Facturas, o del
  // día elegido dentro de la lista). diaActivo son las fechas exactas usadas
  // para pedirlo, y con las que se genera el PDF.
  const [data, setData] = useState(null);
  const [diaActivo, setDiaActivo] = useState(null);

  const buscar = async (desde, hasta, tipoActual) => {
    setCargando(true);
    setError('');
    setData(null);
    setDias(null);
    setDiaActivo(null);
    setRango({ desde, hasta });
    try {
      if (tipoActual === 'REMISION' && !mismoDia(desde, hasta)) {
        const res = await getReporteRemisionesDias(desde, hasta);
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
    try {
      const res = await getReporteCajasIngresos(dia.desde, dia.hasta, 'REMISION');
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
      </div>

      {vista === 'cierre' && (
        <div className="card shadow-sm">
          <div className="card-body">
            <ReporteCierreCaja />
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

            <PeriodoSelector onBuscar={handleBuscar} cargando={cargando} />

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
                    <h5 className="mb-0">{tipo === 'REMISION' ? tituloDetalle : `Reporte de ingresos — ${tituloRango}`}</h5>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => openReporteCajasIngresosPdf(diaActivo.desde, diaActivo.hasta, tipo)}
                  >
                    Ver PDF
                  </button>
                </div>

                {tipo === 'REMISION' ? <ReporteRemisiones data={data} /> : <ReporteFacturas data={data} />}
              </>
            )}
          </div>
        </div>
      )}
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

function FilaRemision({ r }) {
  return (
    <tr>
      <td>{r.folio ?? '—'}</td>
      <td>{r.ordenServicio || '—'}</td>
      <td>{r.cliente || '—'}</td>
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
    facturas = [],
    facturaGeneral = [],
    totales = {},
    deposito = {},
  } = data;
  const sinDatos =
    !anticipos.length &&
    !anticiposCancelados.length &&
    !complementosPago.length &&
    !notasCredito.length &&
    !facturas.length &&
    !facturaGeneral.length;

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
              <BandaRemision titulo="Facturas" filas={facturas} />
              <BandaRemision titulo="Factura general" filas={facturaGeneral} />
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

      <TablaDeposito deposito={deposito} />
    </>
  );
}

const DEPOSITO_LABELS = [
  ['cheques', 'Cheques'],
  ['transferencias', 'Transferencias'],
  ['tarjetasCD', 'Tarjetas C/D'],
  ['efectivo', 'Efectivo'],
];

function TablaDeposito({ deposito }) {
  return (
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
  );
}
