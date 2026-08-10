import React, { useMemo, useState } from 'react';
import { TERMINALES, calcularTotalesCierre } from '../../../utils/cierreCajaTotales';
import { openNotaVentaPdf, openRemisionPdf, openReciboProvisionalPdf } from '../../../api/cajas';
import { openValePdf } from '../../../api/vales';

function formatMoney(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n) || 0);
}

// Abre el PDF del comprobante (Nota de Venta / Remisión / Recibo Provisional)
// al pulsar su fila en la tabla combinada — mismos endpoints que usa
// CajaOrdenDetalle para imprimir el comprobante de un pago.
function abrirComprobantePdf(c) {
  if (!c.vehiculoId || !c.pagoId) return;
  if (c.tipo === 'NOTA_VENTA') openNotaVentaPdf(c.vehiculoId, c.pagoId);
  else if (c.tipo === 'REMISION') openRemisionPdf(c.vehiculoId, c.pagoId);
  else if (c.tipo === 'RECIBO_PROVISIONAL') openReciboProvisionalPdf(c.vehiculoId, c.pagoId);
}

const TIPOS_FILTRO = [
  { value: '', label: 'Todos los tipos' },
  { value: 'NOTA_VENTA', label: 'Nota de Venta' },
  { value: 'REMISION', label: 'Remisión' },
  { value: 'RECIBO_PROVISIONAL', label: 'Recibo Provisional' },
  { value: 'VALE_SALIDA', label: 'Vale de Salida' },
];

// Combina comprobantes (Nota de Venta / Remisión / Recibo Provisional) y
// vales de salida en una sola lista agrupada por Orden, para ver de un
// vistazo todo lo generado para una misma orden en el día.
function combinarPorOrden(cierre, filtroTipo) {
  const filas = [
    ...(cierre.comprobantes || []).map((c, i) => ({
      key: `c-${i}`,
      orden: c.ordenServicio || '—',
      cliente: c.cliente || '—',
      tipo: c.tipo,
      tipoLabel: c.tipoLabel,
      folio: c.folio ?? '—',
      monto: c.monto,
      estatus: '',
      registradoPor: c.registradoPor || '—',
      fecha: c.fecha,
      clickable: !!(c.vehiculoId && c.pagoId),
      onClick: () => abrirComprobantePdf(c),
    })),
    ...(cierre.valesSalida || []).map((v) => ({
      key: `v-${v._id || v.noVale}`,
      orden: v.noOrden || '—',
      cliente: v.nombreCliente || '—',
      tipo: 'VALE_SALIDA',
      tipoLabel: 'Vale de Salida',
      folio: v.noVale,
      monto: null,
      estatus: v.estatus || '—',
      registradoPor: v.cajero || '—',
      fecha: v.fecha,
      clickable: !!v._id,
      onClick: () => v._id && openValePdf(v._id),
    })),
  ].filter((f) => !filtroTipo || f.tipo === filtroTipo);

  const grupos = new Map();
  for (const f of filas) {
    if (!grupos.has(f.orden)) grupos.set(f.orden, []);
    grupos.get(f.orden).push(f);
  }
  return [...grupos.entries()]
    .map(([orden, filasOrden]) => [
      orden,
      [...filasOrden].sort((a, b) => new Date(a.fecha) - new Date(b.fecha)),
    ])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'es', { numeric: true }));
}

// Vista de solo lectura del cierre de caja de un día — mismo formato visual
// que el papel de Cierre de Caja. La usan Gestión de Caja (resumen del día en
// curso) y Reportes > Cierre de Caja (consulta de días ya cerrados).
// `accionesCierre` es un slot opcional (botón de Cerrar Caja + confirmación)
// que Gestión de Caja inserta debajo de Vales, en el hueco que deja la
// columna derecha al ser más corta que la izquierda.
export default function CierreCajaResumen({ cierre, accionesCierre }) {
  const totales = calcularTotalesCierre(cierre);
  const [filtroTipo, setFiltroTipo] = useState('');
  const grupos = useMemo(() => combinarPorOrden(cierre, filtroTipo), [cierre, filtroTipo]);

  return (
    <div className="row g-3">
      <div className="col-md-6">
        <div className="card mb-3">
          <div className="card-header py-2 fw-bold">Billetes</div>
          <table className="table table-sm mb-0">
            <tbody>
              {(cierre.billetes || []).map((b) => (
                <tr key={b.denominacion}>
                  <td>{formatMoney(b.denominacion)}</td>
                  <td className="text-end">{Number(b.cantidad) || 0}</td>
                  <td className="text-end">{formatMoney(b.denominacion * (Number(b.cantidad) || 0))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="table-light">
                <td colSpan={2} className="fw-bold">Total</td>
                <td className="text-end fw-bold">{formatMoney(totales.totalBilletes)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="card mb-3">
          <div className="card-header py-2 fw-bold">Terminales</div>
          <table className="table table-sm mb-0">
            <tbody>
              {TERMINALES.map((t) => (
                <tr key={t.key}>
                  <td>{t.label}</td>
                  <td className="text-end">{formatMoney(cierre.terminales?.[t.key])}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="table-light">
                <td className="fw-bold">Total</td>
                <td className="text-end fw-bold">{formatMoney(totales.totalTerminales)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="card mb-3">
          <div className="card-body py-2 d-flex justify-content-between">
            <span className="fw-bold">Total Cobrado</span>
            <span className="fw-bold">{formatMoney(totales.totalCobrado)}</span>
          </div>
        </div>

        <div className="card mb-3">
          <div className="card-body py-2">
            <div className="d-flex justify-content-between">
              <span className="fw-bold">Total Reportes</span>
              <span className="text-muted small">Ingresos del día registrados en el sistema</span>
            </div>
            <div className="text-end">{formatMoney(cierre.totalReportes)}</div>
          </div>
        </div>

        <div className="card mb-3">
          <div className="card-body py-2 d-flex justify-content-between">
            <span className="fw-bold">Fondo de Caja</span>
            <span>{formatMoney(cierre.fondoCaja)}</span>
          </div>
        </div>

        <div className="card mb-3">
          <div className="card-body py-2 d-flex justify-content-between">
            <span className="fw-bold">Diferencia</span>
            <span className={`fw-bold ${totales.diferencia >= 0 ? 'text-success' : 'text-danger'}`}>
              {formatMoney(totales.diferencia)}
            </span>
          </div>
        </div>
      </div>

      <div className="col-md-6">
        <div className="card mb-3">
          <div className="card-header py-2 fw-bold">Monedas</div>
          <table className="table table-sm mb-0">
            <tbody>
              {(cierre.monedas || []).map((m) => (
                <tr key={m.denominacion}>
                  <td>{formatMoney(m.denominacion)}</td>
                  <td className="text-end">{Number(m.cantidad) || 0}</td>
                  <td className="text-end">{formatMoney(m.denominacion * (Number(m.cantidad) || 0))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="table-light">
                <td colSpan={2} className="fw-bold">Total</td>
                <td className="text-end fw-bold">{formatMoney(totales.totalMonedas)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="card mb-3">
          <div className="card-header py-2 fw-bold">Dólares</div>
          <div className="card-body py-2">
            <div className="d-flex justify-content-between">
              <span>Cantidad (USD)</span>
              <span>{Number(cierre.dolares?.cantidad) || 0}</span>
            </div>
            <div className="d-flex justify-content-between">
              <span>T.C.</span>
              <span>{Number(cierre.dolares?.tipoCambio) || 0}</span>
            </div>
            <div className="d-flex justify-content-between mt-2">
              <span className="fw-bold">Total</span>
              <span className="fw-bold">{formatMoney(totales.totalDolares)}</span>
            </div>
          </div>
        </div>

        <div className="card mb-3">
          <div className="card-header py-2 fw-bold">Vales</div>
          <table className="table table-sm mb-0">
            <tbody>
              {(cierre.vales || []).length === 0 && (
                <tr>
                  <td className="text-muted">Sin vales capturados.</td>
                </tr>
              )}
              {(cierre.vales || []).map((v, i) => (
                <tr key={i}>
                  <td>{v.folio || '—'}</td>
                  <td>{v.motivo || '—'}</td>
                  <td className="text-end">{formatMoney(v.monto)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="table-light">
                <td colSpan={2} className="fw-bold">Total</td>
                <td className="text-end fw-bold">{formatMoney(totales.totalVales)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {accionesCierre && <div className="mb-3">{accionesCierre}</div>}

        {cierre.capturadoPor && (
          <div className="text-muted small">Última captura por: {cierre.capturadoPor}</div>
        )}
        {cierre.estado === 'CERRADA' && cierre.cerradoPor && (
          <div className="text-muted small">Caja cerrada por: {cierre.cerradoPor}</div>
        )}
      </div>

      <div className="col-12">
        <div className="card mb-3">
          <div className="card-header py-2 d-flex justify-content-between align-items-center flex-wrap gap-2">
            <span className="fw-bold">Comprobantes y Vales de Salida</span>
            <select
              className="form-select form-select-sm w-auto"
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
            >
              {TIPOS_FILTRO.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="table-responsive">
            <table className="table table-sm mb-0">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Folio</th>
                  <th>Cliente</th>
                  <th className="text-end">Monto</th>
                  <th>Estatus</th>
                  <th>Registrado por</th>
                </tr>
              </thead>
              <tbody>
                {grupos.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-muted">Sin comprobantes ni vales generados.</td>
                  </tr>
                )}
                {grupos.map(([orden, filas]) => (
                  <React.Fragment key={orden}>
                    <tr className="table-light">
                      <td colSpan={6} className="fw-bold">
                        Orden {orden}
                        {filas[0]?.cliente && filas[0].cliente !== '—' ? ` — ${filas[0].cliente}` : ''}
                      </td>
                    </tr>
                    {filas.map((f) => (
                      <tr
                        key={f.key}
                        style={{ cursor: f.clickable ? 'pointer' : undefined }}
                        onClick={f.onClick}
                        title={f.tipo === 'VALE_SALIDA' ? 'Ver vale' : 'Ver comprobante'}
                      >
                        <td>{f.tipoLabel}</td>
                        <td>{f.folio}</td>
                        <td>{f.cliente}</td>
                        <td className="text-end">{f.monto != null ? formatMoney(f.monto) : '—'}</td>
                        <td>{f.estatus || '—'}</td>
                        <td>{f.registradoPor}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
