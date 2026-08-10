import React, { useCallback, useEffect, useState } from 'react';
import {
  getCierreCaja,
  guardarCierreCaja,
  cerrarCierreCaja,
  restablecerCierreCaja,
  openCierreCajaPdf,
} from '../../api/reportes';
import { createTicket } from '../../api/tickets';
import { getUser } from '../../auth';
import CierreCajaResumen from './components/CierreCajaResumen';
import CajaModalVale from './components/CajaModalVale';
import useTipoCambioActual from '../../hooks/useTipoCambioActual';

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatMoney(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n) || 0);
}

// La Captura del día es acumulativa (ver guardar() más abajo): el formulario
// siempre arranca en 0, nunca refleja lo ya guardado — cada "Guardar" suma
// esta ronda al total del día y el formulario se vuelve a limpiar. Solo se
// toman las denominaciones (billetes/monedas) de `data`, no sus cantidades.
function formularioVacio(data) {
  return {
    billetes: (data.billetes || []).map((b) => ({ denominacion: b.denominacion, cantidad: 0 })),
    monedas: (data.monedas || []).map((m) => ({ denominacion: m.denominacion, cantidad: 0 })),
    dolares: { cantidad: 0 },
    vales: [],
    cheques: 0,
    transferencias: 0,
  };
}

// Total de lo que el formulario de captura va a guardar (billetes + monedas +
// cheques + transferencias + dólares). No incluye vales (no cuentan como
// cobrado, ver utils/cierreCajaTotales) ni las terminales automáticas (esas
// no se capturan aquí, se suman solas desde los pagos).
function calcularTotalCaptura(form, tipoCambioConfig) {
  const totalBilletes = (form.billetes || []).reduce((s, b) => s + b.denominacion * (Number(b.cantidad) || 0), 0);
  const totalMonedas = (form.monedas || []).reduce((s, m) => s + m.denominacion * (Number(m.cantidad) || 0), 0);
  const totalDolares = (Number(form.dolares?.cantidad) || 0) * (Number(tipoCambioConfig) || 0);
  return totalBilletes + totalMonedas + (Number(form.cheques) || 0) + (Number(form.transferencias) || 0) + totalDolares;
}

// Cajero: captura durante el día (efectivo, dólares, vales) y cierra la caja
// al final. Las terminales con lectora se suman solas al registrar un pago
// con Nota de Venta (ver backend/utils/cierreCajaTerminales.js).
export default function GestionCaja() {
  const fecha = hoyISO();
  const esAdmin = getUser()?.role === 'admin';
  const { tipoCambio: tipoCambioConfig, loading: cargandoTipoCambio } = useTipoCambioActual();
  const [cierre, setCierre] = useState(null);
  const [form, setForm] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [confirmarCierre, setConfirmarCierre] = useState(false);
  const [restableciendo, setRestableciendo] = useState(false);
  const [confirmarRestablecer, setConfirmarRestablecer] = useState(false);
  const [solicitandoRestablecer, setSolicitandoRestablecer] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [mostrarModalVale, setMostrarModalVale] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const res = await getCierreCaja(fecha);
      setCierre(res.data.data);
      setForm(formularioVacio(res.data.data));
    } catch (err) {
      setError('Error al cargar la caja de hoy.');
    } finally {
      setCargando(false);
    }
  }, [fecha]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const setCantidadBillete = (idx, cantidad) => {
    setForm((f) => ({ ...f, billetes: f.billetes.map((b, i) => (i === idx ? { ...b, cantidad } : b)) }));
  };

  const setCantidadMoneda = (idx, cantidad) => {
    setForm((f) => ({ ...f, monedas: f.monedas.map((m, i) => (i === idx ? { ...m, cantidad } : m)) }));
  };

  const setDolares = (campo, valor) => {
    setForm((f) => ({ ...f, dolares: { ...f.dolares, [campo]: valor } }));
  };

  const agregarValeDesdeModal = (vale) => {
    setForm((f) => ({ ...f, vales: [...f.vales, vale] }));
    setMostrarModalVale(false);
  };

  const quitarVale = (idx) => {
    setForm((f) => ({ ...f, vales: f.vales.filter((_, i) => i !== idx) }));
  };

  const guardar = async () => {
    setGuardando(true);
    setError('');
    setMensaje('');
    try {
      await guardarCierreCaja({
        fecha,
        billetes: form.billetes,
        monedas: form.monedas,
        terminales: { cheques: form.cheques, transferencias: form.transferencias },
        // El T.C. no se captura a mano: siempre es el vigente en Configuración.
        // El fondo de caja tampoco: el backend lo toma de Configuración.
        dolares: { cantidad: form.dolares.cantidad, tipoCambio: tipoCambioConfig },
        vales: form.vales,
      });
      await cargar();
      setMensaje('Captura guardada y sumada al total del día.');
    } catch (err) {
      setError(err?.response?.data?.msg || 'Error al guardar la captura.');
    } finally {
      setGuardando(false);
    }
  };

  const cerrarCaja = async () => {
    setCerrando(true);
    setError('');
    setMensaje('');
    try {
      await cerrarCierreCaja(fecha);
      await cargar();
      setConfirmarCierre(false);
      setMensaje('Caja cerrada correctamente. Ya puedes consultarla en Reportes.');
    } catch (err) {
      setError(err?.response?.data?.msg || 'Error al cerrar la caja.');
    } finally {
      setCerrando(false);
    }
  };

  // Restablecer (reabrir) un día ya cerrado: solo admin, y directo — sin
  // pasar por Soporte. Conserva lo capturado, solo vuelve a ABIERTA.
  const restablecerCaja = async () => {
    setRestableciendo(true);
    setError('');
    setMensaje('');
    try {
      await restablecerCierreCaja(fecha);
      await cargar();
      setConfirmarRestablecer(false);
      setMensaje('Caja restablecida: ya puedes volver a capturar.');
    } catch (err) {
      setError(err?.response?.data?.msg || 'Error al restablecer la caja.');
    } finally {
      setRestableciendo(false);
    }
  };

  // El rol cajas no puede reabrir directo: manda un ticket RESTABLECER_CAJA
  // con motivo (mismo patrón que solicitar cancelación de un pago, ver
  // CajaHistorialPagos.jsx) para que un admin lo apruebe o niegue en Soporte.
  const solicitarRestablecimiento = async () => {
    const detalle = window.prompt(
      'Describe el motivo de la solicitud de restablecimiento de caja (se enviará a un administrador):'
    );
    if (detalle === null) return;
    if (!detalle.trim()) {
      alert('Captura el motivo de la solicitud.');
      return;
    }
    setSolicitandoRestablecer(true);
    try {
      const res = await createTicket({
        tipoProblema: 'RESTABLECER_CAJA',
        detalle: detalle.trim(),
        fechaCierreCaja: fecha,
      });
      alert(`Solicitud ${res.data.data.folio} enviada. Un administrador la revisará.`);
    } catch (err) {
      alert(err.response?.data?.msg || 'Error al enviar la solicitud.');
    } finally {
      setSolicitandoRestablecer(false);
    }
  };

  const cerrada = cierre?.estado === 'CERRADA';

  const accionesCierre = !cerrada ? (
    <div className="card border-danger">
      <div className="card-body py-3">
        {!confirmarCierre ? (
          <button type="button" className="btn btn-danger w-100" onClick={() => setConfirmarCierre(true)}>
            Cerrar Caja
          </button>
        ) : (
          <>
            <div className="small text-danger fw-bold mb-2">
              ¿Cerrar la caja de hoy? No se podrá modificar.
            </div>
            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary flex-fill"
                onClick={() => setConfirmarCierre(false)}
                disabled={cerrando}
              >
                Cancelar
              </button>
              <button type="button" className="btn btn-danger flex-fill" onClick={cerrarCaja} disabled={cerrando}>
                {cerrando ? 'Cerrando…' : 'Sí, cerrar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  ) : esAdmin ? (
    <div className="card border-warning">
      <div className="card-body py-3">
        {!confirmarRestablecer ? (
          <button type="button" className="btn btn-warning w-100" onClick={() => setConfirmarRestablecer(true)}>
            Restablecer Caja
          </button>
        ) : (
          <>
            <div className="small text-warning-emphasis fw-bold mb-2">
              ¿Restablecer la caja de hoy? Se podrá volver a capturar.
            </div>
            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary flex-fill"
                onClick={() => setConfirmarRestablecer(false)}
                disabled={restableciendo}
              >
                Cancelar
              </button>
              <button type="button" className="btn btn-warning flex-fill" onClick={restablecerCaja} disabled={restableciendo}>
                {restableciendo ? 'Restableciendo…' : 'Sí, restablecer'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  ) : (
    <div className="card">
      <div className="card-body py-3">
        <button
          type="button"
          className="btn btn-outline-warning w-100"
          onClick={solicitarRestablecimiento}
          disabled={solicitandoRestablecer}
        >
          {solicitandoRestablecer ? 'Enviando…' : 'Solicitar Restablecimiento'}
        </button>
        <div className="small text-muted mt-2">
          Se enviará un ticket con el motivo a un administrador, quien podrá aceptar o negar la solicitud.
        </div>
      </div>
    </div>
  );

  return (
    <div className="container-fluid py-3">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <h2 className="mb-0">💰 Gestión de Caja</h2>
        <span className={`badge ${cerrada ? 'bg-secondary' : 'bg-success'}`}>
          {cerrada ? 'Caja cerrada' : 'Caja abierta'}
        </span>
      </div>

      {error && <div className="alert alert-danger py-2">{error}</div>}
      {mensaje && <div className="alert alert-success py-2">{mensaje}</div>}

      {cargando || !cierre || !form ? (
        <div className="text-muted">Cargando…</div>
      ) : (
        <>
          {cerrada && (
            <div className="alert alert-info py-2">
              La caja de hoy ya está cerrada. El reporte quedó guardado y disponible en Reportes → Cajas.
            </div>
          )}

          {!cerrada && (
            <div className="card shadow-sm mb-3">
              <div className="card-header fw-bold">Captura del día</div>
              <div className="card-body">
                <div className="row g-3">
                  <div className="col-md-6">
                    <div className="card mb-3">
                      <div className="card-header py-2 fw-bold">Billetes</div>
                      <table className="table table-sm mb-0">
                        <tbody>
                          {form.billetes.map((b, i) => (
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
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="card mb-3">
                      <div className="card-header py-2 fw-bold">Otros ingresos en efectivo</div>
                      <div className="card-body py-2">
                        <div className="row g-2">
                          <div className="col-6">
                            <label className="form-label mb-1 small">Cheques</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="form-control form-control-sm"
                              value={form.cheques}
                              onChange={(e) => setForm((f) => ({ ...f, cheques: Number(e.target.value) }))}
                            />
                          </div>
                          <div className="col-6">
                            <label className="form-label mb-1 small">Transferencias</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="form-control form-control-sm"
                              value={form.transferencias}
                              onChange={(e) => setForm((f) => ({ ...f, transferencias: Number(e.target.value) }))}
                            />
                          </div>
                        </div>
                        <div className="small text-muted mt-2">
                          Las terminales bancarias (Bancomer, Banregio, Banamex, A. Express, Banorte) se suman
                          solas al registrar un pago con Nota de Venta — no se capturan aquí.
                        </div>
                      </div>
                    </div>

                    <div className="card mb-3">
                      <div className="card-body py-2">
                        <label className="form-label mb-1 small fw-bold">Fondo de Caja (Configuración)</label>
                        <input
                          type="text"
                          disabled
                          className="form-control form-control-sm"
                          value={formatMoney(cierre.fondoCaja)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="card mb-3">
                      <div className="card-header py-2 fw-bold">Monedas</div>
                      <table className="table table-sm mb-0">
                        <tbody>
                          {form.monedas.map((m, i) => (
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
                            </tr>
                          ))}
                        </tbody>
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
                              value={form.dolares.cantidad}
                              onChange={(e) => setDolares('cantidad', Number(e.target.value))}
                            />
                          </div>
                          <div className="col-6">
                            <label className="form-label mb-1 small">T.C. (Configuración)</label>
                            <input
                              type="text"
                              disabled
                              className="form-control form-control-sm"
                              value={cargandoTipoCambio ? 'Cargando…' : tipoCambioConfig || 'No configurado'}
                            />
                          </div>
                        </div>
                        {!cargandoTipoCambio && !tipoCambioConfig && Number(form.dolares.cantidad) > 0 && (
                          <div className="small text-danger mt-2">
                            No hay tipo de cambio configurado — captúralo en Configuración antes de guardar dólares.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="card mb-3">
                      <div className="card-header py-2 d-flex justify-content-between align-items-center">
                        <span className="fw-bold">Vales</span>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() => setMostrarModalVale(true)}
                        >
                          Generar Vale
                        </button>
                      </div>
                      <table className="table table-sm mb-0">
                        <tbody>
                          {form.vales.length === 0 && (
                            <tr>
                              <td className="text-muted">Sin vales capturados.</td>
                            </tr>
                          )}
                          {form.vales.map((v, i) => (
                            <tr key={i}>
                              <td>{v.folio || '—'}</td>
                              <td>{v.motivo || '—'}</td>
                              <td className="text-end" style={{ width: 110 }}>
                                {formatMoney(v.monto)}
                              </td>
                              <td style={{ width: 40 }}>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-link text-danger"
                                  onClick={() => quitarVale(i)}
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="d-flex justify-content-between align-items-center border-top pt-3 mb-2">
                  <span className="fw-bold">Total a guardar</span>
                  <span className="fw-bold fs-5">{formatMoney(calcularTotalCaptura(form, tipoCambioConfig))}</span>
                </div>

                <button type="button" className="btn btn-primary" onClick={guardar} disabled={guardando}>
                  {guardando ? <><span className="spinner-border spinner-border-sm me-1" />Guardando…</> : 'Guardar'}
                </button>
              </div>
            </div>
          )}

          <div className="card shadow-sm">
            <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
              <span className="fw-bold">Resumen del día</span>
              <div className="d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  onClick={() => openCierreCajaPdf(fecha)}
                >
                  Generar PDF
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  onClick={() => openCierreCajaPdf(fecha)}
                  disabled={!cerrada}
                  title={!cerrada ? 'Disponible cuando la caja esté cerrada' : ''}
                >
                  Imprimir
                </button>
              </div>
            </div>
            <div className="card-body">
              <CierreCajaResumen cierre={cierre} accionesCierre={accionesCierre} />
            </div>
          </div>
        </>
      )}

      <CajaModalVale
        show={mostrarModalVale}
        onClose={() => setMostrarModalVale(false)}
        onAdd={agregarValeDesdeModal}
      />
    </div>
  );
}
