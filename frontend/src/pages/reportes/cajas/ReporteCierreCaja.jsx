import React, { useCallback, useEffect, useState } from 'react';
import { getCierreCaja, guardarCierreCaja, openCierreCajaPdf } from '../../../api/reportes';

const DENOMINACIONES_BILLETES = [1000, 500, 200, 100, 50, 20];
const DENOMINACIONES_MONEDAS = [10, 5, 2, 1, 0.5, 0.2, 0.1];

const TERMINALES = [
  { key: 'bancomer', label: 'Terminal Bancomer' },
  { key: 'banregio', label: 'Terminal Banregio' },
  { key: 'banamex', label: 'Terminal Banamex' },
  { key: 'americanExpress', label: 'Terminal A. Express' },
  { key: 'cheques', label: 'Cheques' },
  { key: 'transferencias', label: 'Transferencias' },
];

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatMoney(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n) || 0);
}

function cierreVacio() {
  return {
    billetes: DENOMINACIONES_BILLETES.map((denominacion) => ({ denominacion, cantidad: 0 })),
    monedas: DENOMINACIONES_MONEDAS.map((denominacion) => ({ denominacion, cantidad: 0 })),
    terminales: Object.fromEntries(TERMINALES.map((t) => [t.key, 0])),
    dolares: { cantidad: 0, tipoCambio: 0 },
    vales: [],
    totalReportes: 0,
    fondoCaja: 0,
    capturadoPor: '',
  };
}

function calcularTotales(cierre) {
  const totalBilletes = cierre.billetes.reduce((s, b) => s + b.denominacion * (Number(b.cantidad) || 0), 0);
  const totalMonedas = cierre.monedas.reduce((s, m) => s + m.denominacion * (Number(m.cantidad) || 0), 0);
  const totalTerminales = TERMINALES.reduce((s, t) => s + (Number(cierre.terminales[t.key]) || 0), 0);
  const totalDolares = (Number(cierre.dolares.cantidad) || 0) * (Number(cierre.dolares.tipoCambio) || 0);
  const totalVales = cierre.vales.reduce((s, v) => s + (Number(v.monto) || 0), 0);
  const totalCobrado = totalBilletes + totalMonedas + totalTerminales + totalDolares;
  const totalReportes = Number(cierre.totalReportes) || 0;
  const fondoCaja = Number(cierre.fondoCaja) || 0;
  const diferencia = totalCobrado - totalReportes - fondoCaja;
  return { totalBilletes, totalMonedas, totalTerminales, totalDolares, totalVales, totalCobrado, diferencia };
}

export default function ReporteCierreCaja() {
  const [fecha, setFecha] = useState(hoyISO());
  const [cierre, setCierre] = useState(cierreVacio());
  const [guardado, setGuardado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const cargar = useCallback(async (f) => {
    setCargando(true);
    setError('');
    setMensaje('');
    try {
      const res = await getCierreCaja(f);
      setCierre({
        billetes: res.data.data.billetes,
        monedas: res.data.data.monedas,
        terminales: res.data.data.terminales,
        dolares: res.data.data.dolares,
        vales: res.data.data.vales,
        totalReportes: res.data.data.totalReportes,
        fondoCaja: res.data.data.fondoCaja,
        capturadoPor: res.data.data.capturadoPor,
      });
      setGuardado(!!res.data.guardado);
    } catch (err) {
      setError('Error al cargar el cierre de caja de esta fecha.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar(fecha);
  }, [fecha, cargar]);

  const totales = calcularTotales(cierre);

  const setCantidadBillete = (idx, cantidad) => {
    setCierre((c) => ({
      ...c,
      billetes: c.billetes.map((b, i) => (i === idx ? { ...b, cantidad } : b)),
    }));
  };

  const setCantidadMoneda = (idx, cantidad) => {
    setCierre((c) => ({
      ...c,
      monedas: c.monedas.map((m, i) => (i === idx ? { ...m, cantidad } : m)),
    }));
  };

  const setTerminal = (key, valor) => {
    setCierre((c) => ({ ...c, terminales: { ...c.terminales, [key]: valor } }));
  };

  const setDolares = (campo, valor) => {
    setCierre((c) => ({ ...c, dolares: { ...c.dolares, [campo]: valor } }));
  };

  const agregarVale = () => {
    setCierre((c) => ({ ...c, vales: [...c.vales, { folio: '', monto: 0 }] }));
  };

  const setVale = (idx, campo, valor) => {
    setCierre((c) => ({
      ...c,
      vales: c.vales.map((v, i) => (i === idx ? { ...v, [campo]: valor } : v)),
    }));
  };

  const quitarVale = (idx) => {
    setCierre((c) => ({ ...c, vales: c.vales.filter((_, i) => i !== idx) }));
  };

  const guardar = async () => {
    setGuardando(true);
    setError('');
    setMensaje('');
    try {
      const res = await guardarCierreCaja({ fecha, ...cierre });
      setCierre((c) => ({ ...c, capturadoPor: res.data.data.capturadoPor }));
      setGuardado(true);
      setMensaje('Cierre de caja guardado correctamente.');
    } catch (err) {
      setError('Error al guardar el cierre de caja.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div>
      <div className="d-flex flex-wrap align-items-end gap-2 mb-3">
        <div>
          <label className="form-label mb-1 small">Fecha del cierre</label>
          <input
            type="date"
            className="form-control form-control-sm"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>
        <button type="button" className="btn btn-sm btn-primary" onClick={guardar} disabled={guardando || cargando}>
          {guardando ? <><span className="spinner-border spinner-border-sm me-1" />Guardando…</> : 'Guardar cierre'}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline-danger"
          onClick={() => openCierreCajaPdf(fecha)}
          disabled={!guardado}
          title={guardado ? '' : 'Guarda el cierre primero para poder ver el PDF'}
        >
          Ver PDF
        </button>
      </div>

      {error && <div className="alert alert-danger py-2">{error}</div>}
      {mensaje && <div className="alert alert-success py-2">{mensaje}</div>}

      {cargando ? (
        <div className="text-muted">Cargando…</div>
      ) : (
        <div className="row g-3">
          <div className="col-md-6">
            <div className="card mb-3">
              <div className="card-header py-2 fw-bold">Billetes</div>
              <table className="table table-sm mb-0">
                <tbody>
                  {cierre.billetes.map((b, i) => (
                    <tr key={b.denominacion}>
                      <td className="align-middle">{formatMoney(b.denominacion)}</td>
                      <td style={{ width: 110 }}>
                        <input
                          type="number"
                          min="0"
                          className="form-control form-control-sm"
                          value={b.cantidad}
                          onChange={(e) => setCantidadBillete(i, Number(e.target.value))}
                        />
                      </td>
                      <td className="text-end align-middle">{formatMoney(b.denominacion * (Number(b.cantidad) || 0))}</td>
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
                      <td className="align-middle">{t.label}</td>
                      <td style={{ width: 140 }}>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="form-control form-control-sm"
                          value={cierre.terminales[t.key]}
                          onChange={(e) => setTerminal(t.key, Number(e.target.value))}
                        />
                      </td>
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
                <label className="form-label mb-1 small fw-bold d-flex justify-content-between">
                  Total Reportes
                  <span className="text-muted fw-normal">Captura manual</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="form-control form-control-sm"
                  value={cierre.totalReportes}
                  onChange={(e) => setCierre((c) => ({ ...c, totalReportes: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="card mb-3">
              <div className="card-body py-2">
                <label className="form-label mb-1 small fw-bold">Fondo de Caja</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="form-control form-control-sm"
                  value={cierre.fondoCaja}
                  onChange={(e) => setCierre((c) => ({ ...c, fondoCaja: Number(e.target.value) }))}
                />
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
                  {cierre.monedas.map((m, i) => (
                    <tr key={m.denominacion}>
                      <td className="align-middle">{formatMoney(m.denominacion)}</td>
                      <td style={{ width: 110 }}>
                        <input
                          type="number"
                          min="0"
                          className="form-control form-control-sm"
                          value={m.cantidad}
                          onChange={(e) => setCantidadMoneda(i, Number(e.target.value))}
                        />
                      </td>
                      <td className="text-end align-middle">{formatMoney(m.denominacion * (Number(m.cantidad) || 0))}</td>
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
                <div className="row g-2">
                  <div className="col-6">
                    <label className="form-label mb-1 small">Cantidad (USD)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="form-control form-control-sm"
                      value={cierre.dolares.cantidad}
                      onChange={(e) => setDolares('cantidad', Number(e.target.value))}
                    />
                  </div>
                  <div className="col-6">
                    <label className="form-label mb-1 small">T.C.</label>
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      className="form-control form-control-sm"
                      value={cierre.dolares.tipoCambio}
                      onChange={(e) => setDolares('tipoCambio', Number(e.target.value))}
                    />
                  </div>
                </div>
                <div className="d-flex justify-content-between mt-2">
                  <span className="fw-bold">Total</span>
                  <span className="fw-bold">{formatMoney(totales.totalDolares)}</span>
                </div>
              </div>
            </div>

            <div className="card mb-3">
              <div className="card-header py-2 d-flex justify-content-between align-items-center">
                <span className="fw-bold">Vales</span>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={agregarVale}>
                  + Agregar
                </button>
              </div>
              <table className="table table-sm mb-0">
                <tbody>
                  {cierre.vales.length === 0 && (
                    <tr>
                      <td className="text-muted">Sin vales capturados.</td>
                    </tr>
                  )}
                  {cierre.vales.map((v, i) => (
                    <tr key={i}>
                      <td>
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          placeholder="Folio"
                          value={v.folio}
                          onChange={(e) => setVale(i, 'folio', e.target.value)}
                        />
                      </td>
                      <td style={{ width: 140 }}>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="form-control form-control-sm"
                          value={v.monto}
                          onChange={(e) => setVale(i, 'monto', Number(e.target.value))}
                        />
                      </td>
                      <td style={{ width: 40 }}>
                        <button type="button" className="btn btn-sm btn-link text-danger" onClick={() => quitarVale(i)}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="table-light">
                    <td className="fw-bold">Total</td>
                    <td className="text-end fw-bold">{formatMoney(totales.totalVales)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
              <div className="card-body py-2 small text-muted">
                Pendiente de definir si los vales afectan el Total Cobrado / Diferencia.
              </div>
            </div>

            {cierre.capturadoPor && (
              <div className="text-muted small">Última captura por: {cierre.capturadoPor}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
