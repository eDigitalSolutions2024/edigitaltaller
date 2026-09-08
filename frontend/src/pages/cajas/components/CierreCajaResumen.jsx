import React, { useMemo, useState } from 'react';
import Dropdown from '../../../components/Dropdown';
import { TERMINALES, calcularTotalesCierre } from '../../../utils/cierreCajaTotales';
import { getNotaVentaPdfUrl, getRemisionPdfUrl, getReciboProvisionalPdfUrl } from '../../../api/cajas';
import { getValePdfUrl } from '../../../api/vales';
import usePdfModal from '../../../hooks/usePdfModal';
import '../../../styles/gestionCaja.css';

function formatMoney(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n) || 0);
}

// Abre el PDF del comprobante (Nota de Venta / Remisión / Recibo Provisional)
// al pulsar su fila en la tabla combinada — mismos endpoints que usa
// CajaOrdenDetalle para imprimir el comprobante de un pago.
function abrirComprobantePdf(c, abrirPdf) {
  if (!c.vehiculoId || !c.pagoId) return;
  if (c.tipo === 'NOTA_VENTA') abrirPdf(getNotaVentaPdfUrl(c.vehiculoId, c.pagoId), 'nota-venta.pdf', 'Nota de Venta');
  else if (c.tipo === 'REMISION') abrirPdf(getRemisionPdfUrl(c.vehiculoId, c.pagoId), 'remision.pdf', 'Remisión');
  else if (c.tipo === 'RECIBO_PROVISIONAL') abrirPdf(getReciboProvisionalPdfUrl(c.vehiculoId, c.pagoId), 'recibo-provisional.pdf', 'Recibo Provisional');
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
function combinarPorOrden(cierre, filtroTipo, abrirPdf) {
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
      onClick: () => abrirComprobantePdf(c, abrirPdf),
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
      onClick: () => v._id && abrirPdf(getValePdfUrl(v._id), 'vale.pdf', 'Vale de Salida'),
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

// Fila de denominación de solo lectura: importe · ×cantidad · subtotal.
function DenominacionRO({ denominacion, cantidad }) {
  const n = Number(cantidad) || 0;
  return (
    <div className="gc-den gc-den--ro">
      <span className="gc-den__label">{formatMoney(denominacion)}</span>
      <span className="gc-den__qty">×{n}</span>
      <span className="gc-den__amount">{formatMoney(denominacion * n)}</span>
    </div>
  );
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
  const { pdfModal, abrirPdf } = usePdfModal();
  const grupos = useMemo(() => combinarPorOrden(cierre, filtroTipo, abrirPdf), [cierre, filtroTipo, abrirPdf]);

  return (
    <div className="row g-3 gc">
      <div className="col-md-6">
        {/* Billetes */}
        <div className="gc-sec gc-sec--billetes">
          <div className="gc-sec__head">
            <span>Billetes</span>
            <span>{formatMoney(totales.totalBilletes)}</span>
          </div>
          <div className="gc-sec__body">
            <div className="gc-dens gc-dens--ro">
              {(cierre.billetes || []).map((b) => (
                <DenominacionRO key={b.denominacion} denominacion={b.denominacion} cantidad={b.cantidad} />
              ))}
            </div>
          </div>
        </div>

        {/* Terminales */}
        <div className="gc-sec gc-sec--terminales">
          <div className="gc-sec__head">
            <span>Terminales</span>
            <span>{formatMoney(totales.totalTerminales)}</span>
          </div>
          <div className="gc-sec__body">
            {TERMINALES.map((t) => (
              <div className="gc-den gc-den--ro" key={t.key}>
                <span className="gc-den__label">{t.label}</span>
                <span className="gc-den__amount">{formatMoney(cierre.terminales?.[t.key])}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Totales del día */}
        <div className="gc-sec gc-sec--totales">
          <div className="gc-sec__head">
            <span>Totales</span>
          </div>
          <div className="gc-sec__body">
            <div className="gc-kv">
              <span>Total Cobrado</span>
              <span className="gc-kv__value">{formatMoney(totales.totalCobrado)}</span>
            </div>
            <div className="gc-kv">
              <span>
                Total Reportes
                <span className="gc-kv__hint d-block">Ingresos registrados desde que abrió la caja</span>
              </span>
              <span className="gc-kv__value">{formatMoney(cierre.totalReportes)}</span>
            </div>
            <div className="gc-kv">
              <span>Fondo de Caja</span>
              <span className="gc-kv__value">{formatMoney(cierre.fondoCaja)}</span>
            </div>
            <div className="gc-kv">
              <span>Diferencia</span>
              <span className={`gc-kv__value ${totales.diferencia >= 0 ? 'text-success' : 'text-danger'}`}>
                {formatMoney(totales.diferencia)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="col-md-6">
        {/* Monedas */}
        <div className="gc-sec gc-sec--monedas">
          <div className="gc-sec__head">
            <span>Monedas</span>
            <span>{formatMoney(totales.totalMonedas)}</span>
          </div>
          <div className="gc-sec__body">
            <div className="gc-dens gc-dens--ro">
              {(cierre.monedas || []).map((m) => (
                <DenominacionRO key={m.denominacion} denominacion={m.denominacion} cantidad={m.cantidad} />
              ))}
            </div>
          </div>
        </div>

        {/* Dólares */}
        <div className="gc-sec gc-sec--dolares">
          <div className="gc-sec__head">
            <span>Dólares</span>
            <span>{formatMoney(totales.totalDolares)}</span>
          </div>
          <div className="gc-sec__body">
            <div className="gc-kv">
              <span>Cantidad (USD)</span>
              <span className="gc-kv__value">{Number(cierre.dolares?.cantidad) || 0}</span>
            </div>
            <div className="gc-kv">
              <span>T.C.</span>
              <span className="gc-kv__value">{Number(cierre.dolares?.tipoCambio) || 0}</span>
            </div>
          </div>
        </div>

        {/* Vales */}
        <div className="gc-sec gc-sec--vales">
          <div className="gc-sec__head">
            <span>Vales</span>
            <span>{formatMoney(totales.totalVales)}</span>
          </div>
          <div className="gc-sec__body is-flush">
            <table className="table table-sm mb-0">
              <tbody>
                {(cierre.vales || []).length === 0 && (
                  <tr>
                    <td className="text-muted small">Sin vales capturados.</td>
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
            </table>
          </div>
        </div>

        {accionesCierre && <div className="mt-3">{accionesCierre}</div>}

        {cierre.capturadoPor && (
          <div className="text-muted small mt-2">Última captura por: {cierre.capturadoPor}</div>
        )}
        {cierre.estado === 'CERRADA' && cierre.cerradoPor && (
          <div className="text-muted small">Caja cerrada por: {cierre.cerradoPor}</div>
        )}
      </div>

      <div className="col-12">
        <div className="gc-sec gc-sec--otros">
          <div className="gc-sec__head">
            <span>Comprobantes y Vales de Salida</span>
            <Dropdown
              className="form-select-sm w-auto"
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
            >
              {TIPOS_FILTRO.map((t) => (
                <Dropdown.Option key={t.value} value={t.value}>{t.label}</Dropdown.Option>
              ))}
            </Dropdown>
          </div>
          <div className="gc-sec__body is-flush">
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
      {pdfModal}
    </div>
  );
}
