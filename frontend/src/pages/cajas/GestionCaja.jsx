import React, { useCallback, useEffect, useState } from 'react';
import {
  getCierreCaja,
  guardarCierreCaja,
  cancelarCapturaCierreCaja,
  cerrarCierreCaja,
  restablecerCierreCaja,
  getHistorialCierresCaja,
  getCierreCajaPdfUrl,
} from '../../api/reportes';
import { createTicket } from '../../api/tickets';
import { getUser } from '../../auth';
import { calcularTotalesCierre } from '../../utils/cierreCajaTotales';
import CierreCajaResumen from './components/CierreCajaResumen';
import CajaHistorialCapturas from './components/CajaHistorialCapturas';
import CajaModalVale from './components/CajaModalVale';
import CajaModalCancelarCaptura from './components/CajaModalCancelarCaptura';
import useTipoCambioActual from '../../hooks/useTipoCambioActual';
import usePdfModal from '../../hooks/usePdfModal';
import '../../styles/gestionCaja.css';

function fechaISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hoyISO() {
  return fechaISO(new Date());
}

function fechaHora(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatMoney(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n) || 0);
}

// Suma denominacion × cantidad de una lista de billetes o monedas.
function sumConteo(list) {
  return (list || []).reduce((s, x) => s + Number(x.denominacion || 0) * (Number(x.cantidad) || 0), 0);
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
  const totalDolares = (Number(form.dolares?.cantidad) || 0) * (Number(tipoCambioConfig) || 0);
  return (
    sumConteo(form.billetes) +
    sumConteo(form.monedas) +
    (Number(form.cheques) || 0) +
    (Number(form.transferencias) || 0) +
    totalDolares
  );
}

// Rango por defecto de "Registros de caja": últimos 60 días.
function rangoRegistrosDefault() {
  const desde = new Date();
  desde.setDate(desde.getDate() - 60);
  return { desde: fechaISO(desde), hasta: hoyISO() };
}

// Cajero: captura durante el día (efectivo, dólares, vales) y cierra la caja
// al final. Las terminales con lectora se suman solas al registrar un pago
// con Nota de Venta (ver backend/utils/cierreCajaTerminales.js).
export default function GestionCaja() {
  const esAdmin = getUser()?.role === 'admin';
  const { tipoCambio: tipoCambioConfig, loading: cargandoTipoCambio } = useTipoCambioActual();
  const { pdfModal, abrirPdf } = usePdfModal();
  const [cierre, setCierre] = useState(null);
  const [form, setForm] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [cancelandoCapturaId, setCancelandoCapturaId] = useState(null);
  const [capturaACancelar, setCapturaACancelar] = useState(null);
  const [cerrando, setCerrando] = useState(false);
  const [confirmarCierre, setConfirmarCierre] = useState(false);
  const [restableciendo, setRestableciendo] = useState(false);
  const [confirmarRestablecer, setConfirmarRestablecer] = useState(false);
  const [solicitandoRestablecer, setSolicitandoRestablecer] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [mostrarModalVale, setMostrarModalVale] = useState(false);
  // Tres vistas: 'captura' (el formulario), 'caja' (lo que hay en caja) y
  // 'registros' (sesiones de caja anteriores).
  const [vista, setVista] = useState('captura');
  // Registros de caja (sesiones cerradas) + sesión histórica que se está viendo.
  const [registros, setRegistros] = useState(null);
  const [cargandoRegistros, setCargandoRegistros] = useState(false);
  const [errorRegistros, setErrorRegistros] = useState('');
  const [rangoRegistros, setRangoRegistros] = useState(rangoRegistrosDefault);
  const [sesionHistorica, setSesionHistorica] = useState(null);
  const [cargandoSesion, setCargandoSesion] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const res = await getCierreCaja(); // la sesión de caja abierta actual
      setCierre(res.data.data);
      setForm(formularioVacio(res.data.data));
    } catch (err) {
      setError('Error al cargar la caja.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cerrada = cierre?.estado === 'CERRADA';

  // Si la caja ya está cerrada no hay nada que capturar: abre en "lo que hay en caja".
  useEffect(() => {
    if (cerrada) setVista('caja');
  }, [cerrada]);

  const cargarRegistros = useCallback(async () => {
    setCargandoRegistros(true);
    setErrorRegistros('');
    try {
      const res = await getHistorialCierresCaja(rangoRegistros.desde, rangoRegistros.hasta);
      setRegistros(res.data.data || []);
    } catch (err) {
      setErrorRegistros('Error al cargar los registros de caja.');
    } finally {
      setCargandoRegistros(false);
    }
  }, [rangoRegistros.desde, rangoRegistros.hasta]);

  // Carga perezosa la primera vez que se abre la pestaña de registros.
  useEffect(() => {
    if (vista === 'registros' && registros === null && !cargandoRegistros) {
      cargarRegistros();
    }
  }, [vista, registros, cargandoRegistros, cargarRegistros]);

  // Las pestañas siempre muestran la caja ACTUAL; solo un renglón de
  // "Registros de caja" (verSesionHistorica) abre una sesión anterior.
  const irAVista = (v) => {
    setVista(v);
    setSesionHistorica(null);
  };

  const verSesionActual = () => {
    setSesionHistorica(null);
    setVista('caja');
  };

  const verSesionHistorica = async (id) => {
    setCargandoSesion(true);
    setErrorRegistros('');
    try {
      const res = await getCierreCaja(id);
      setSesionHistorica(res.data.data);
      setVista('caja');
    } catch (err) {
      setErrorRegistros('No se pudo cargar el detalle de esa sesión de caja.');
    } finally {
      setCargandoSesion(false);
    }
  };

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
        billetes: form.billetes,
        monedas: form.monedas,
        terminales: { cheques: form.cheques, transferencias: form.transferencias },
        // El T.C. no se captura a mano: siempre es el vigente en Configuración.
        // El fondo de caja tampoco: el backend lo toma de Configuración.
        dolares: { cantidad: form.dolares.cantidad, tipoCambio: tipoCambioConfig },
        vales: form.vales,
      });
      await cargar();
      setMensaje('Captura guardada y sumada al total de la caja.');
    } catch (err) {
      setError(err?.response?.data?.msg || 'Error al guardar la captura.');
    } finally {
      setGuardando(false);
    }
  };

  // Cancelar una captura equivocada (solo admin) — abre el modal de
  // confirmación con motivo. Se resta del total de la caja; queda tachada en
  // el historial como bitácora.
  const confirmarCancelarCaptura = async (motivo) => {
    const captura = capturaACancelar;
    if (!captura) return;
    setCancelandoCapturaId(captura._id);
    setError('');
    setMensaje('');
    try {
      await cancelarCapturaCierreCaja(captura._id, motivo);
      await cargar();
      setCapturaACancelar(null);
      setMensaje('Captura cancelada. El total de la caja se actualizó.');
    } finally {
      setCancelandoCapturaId(null);
    }
  };

  const cerrarCaja = async () => {
    setCerrando(true);
    setError('');
    setMensaje('');
    try {
      await cerrarCierreCaja();
      await cargar();
      setConfirmarCierre(false);
      setRegistros(null); // que se recargue la lista de registros al abrirla
      setMensaje('Caja cerrada correctamente. Ya puedes consultarla en Reportes.');
    } catch (err) {
      setError(err?.response?.data?.msg || 'Error al cerrar la caja.');
    } finally {
      setCerrando(false);
    }
  };

  // Restablecer (reabrir) una sesión ya cerrada: solo admin, y directo — sin
  // pasar por Soporte. Conserva lo capturado, solo vuelve a ABIERTA.
  const restablecerCaja = async () => {
    setRestableciendo(true);
    setError('');
    setMensaje('');
    try {
      await restablecerCierreCaja(cierre?._id);
      await cargar();
      setConfirmarRestablecer(false);
      setRegistros(null);
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
        fechaCierreCaja: hoyISO(),
      });
      alert(`Solicitud ${res.data.data.folio} enviada. Un administrador la revisará.`);
    } catch (err) {
      alert(err.response?.data?.msg || 'Error al enviar la solicitud.');
    } finally {
      setSolicitandoRestablecer(false);
    }
  };

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
              ¿Cerrar la caja? Se congela la sesión actual y no se podrá modificar.
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
              ¿Restablecer esta sesión de caja? Se podrá volver a capturar.
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

  const cajaMostrada = sesionHistorica || cierre;
  const viendoHistorica = !!sesionHistorica;
  const cajaMostradaCerrada = cajaMostrada?.estado === 'CERRADA';
  const totalesActual = cierre ? calcularTotalesCierre(cierre) : null;

  return (
    <div className="container-fluid py-3 gc">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <h2 className="mb-0">Gestión de Caja</h2>
        <span className={`badge ${cerrada ? 'bg-secondary' : 'bg-success'}`}>
          {cerrada ? 'Caja cerrada' : 'Caja abierta'}
        </span>
      </div>

      {cierre?.abiertaEn && !cerrada && (
        <div className="small text-muted mb-2">
          Sesión abierta desde{' '}
          <strong>
            {new Date(cierre.abiertaEn).toLocaleString('es-MX', {
              day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </strong>
          . Acumula todos los pagos hasta que se cierre manualmente, aunque cruce la medianoche.
        </div>
      )}

      {error && <div className="alert alert-danger py-2">{error}</div>}
      {mensaje && <div className="alert alert-success py-2">{mensaje}</div>}

      {cargando || !cierre || !form ? (
        <div className="text-muted">Cargando…</div>
      ) : (
        <>
          <div className="gc-tabs">
            <button
              type="button"
              className={`btn ${vista === 'captura' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => irAVista('captura')}
            >
              Captura de caja
            </button>
            <button
              type="button"
              className={`btn ${vista === 'caja' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => irAVista('caja')}
            >
              Lo que hay en caja
            </button>
            <button
              type="button"
              className={`btn ${vista === 'registros' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => irAVista('registros')}
            >
              Registros de caja
            </button>
          </div>

          {/* ---------- VISTA: CAPTURA DE CAJA ---------- */}
          {vista === 'captura' && (
            <>
              {cerrada ? (
                <div className="alert alert-info py-2">
                  Esta sesión de caja ya está cerrada. Consulta el detalle en «Lo que hay en caja».
                </div>
              ) : (
                <div className="card shadow-sm mb-3">
                  <div className="card-header fw-bold py-2">Captura de caja</div>
                  <div className="card-body">
                    <div className="row g-3">
                      <div className="col-md-6">
                        {/* Billetes */}
                        <div className="gc-sec gc-sec--billetes">
                          <div className="gc-sec__head">
                            <span>Billetes</span>
                            <span>{formatMoney(sumConteo(form.billetes))}</span>
                          </div>
                          <div className="gc-sec__body">
                            <div className="gc-dens">
                              {form.billetes.map((b, i) => (
                                <div className="gc-den" key={b.denominacion}>
                                  <span className="gc-den__label">{formatMoney(b.denominacion)}</span>
                                  <input
                                    type="number"
                                    min="0"
                                    className="form-control form-control-sm gc-den__input"
                                    value={b.cantidad}
                                    onChange={(e) => setCantidadBillete(i, Number(e.target.value))}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Otros ingresos en efectivo */}
                        <div className="gc-sec gc-sec--otros">
                          <div className="gc-sec__head">
                            <span>Otros ingresos en efectivo</span>
                          </div>
                          <div className="gc-sec__body">
                            <div className="row g-2">
                              <div className="col-6 gc-field">
                                <label>Cheques</label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  className="form-control form-control-sm"
                                  value={form.cheques}
                                  onChange={(e) => setForm((f) => ({ ...f, cheques: Number(e.target.value) }))}
                                />
                              </div>
                              <div className="col-6 gc-field">
                                <label>Transferencias</label>
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
                            <div className="gc-note">
                              Las terminales bancarias (Bancomer, Banregio, Banamex, A. Express, Banorte) se suman
                              solas al registrar un pago con Nota de Venta — no se capturan aquí.
                            </div>
                          </div>
                        </div>

                        {/* Fondo de Caja */}
                        <div className="gc-sec gc-sec--fondo">
                          <div className="gc-sec__head">
                            <span>Fondo de Caja</span>
                            <span className="gc-sec__hint">Configuración</span>
                          </div>
                          <div className="gc-sec__body">
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
                        {/* Monedas */}
                        <div className="gc-sec gc-sec--monedas">
                          <div className="gc-sec__head">
                            <span>Monedas</span>
                            <span>{formatMoney(sumConteo(form.monedas))}</span>
                          </div>
                          <div className="gc-sec__body">
                            <div className="gc-dens">
                              {form.monedas.map((m, i) => (
                                <div className="gc-den" key={m.denominacion}>
                                  <span className="gc-den__label">{formatMoney(m.denominacion)}</span>
                                  <input
                                    type="number"
                                    min="0"
                                    className="form-control form-control-sm gc-den__input"
                                    value={m.cantidad}
                                    onChange={(e) => setCantidadMoneda(i, Number(e.target.value))}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Dólares */}
                        <div className="gc-sec gc-sec--dolares">
                          <div className="gc-sec__head">
                            <span>Dólares</span>
                          </div>
                          <div className="gc-sec__body">
                            <div className="row g-2">
                              <div className="col-6 gc-field">
                                <label>Cantidad (USD)</label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  className="form-control form-control-sm"
                                  value={form.dolares.cantidad}
                                  onChange={(e) => setDolares('cantidad', Number(e.target.value))}
                                />
                              </div>
                              <div className="col-6 gc-field">
                                <label>T.C. (Configuración)</label>
                                <input
                                  type="text"
                                  disabled
                                  className="form-control form-control-sm"
                                  value={cargandoTipoCambio ? 'Cargando…' : tipoCambioConfig || 'No configurado'}
                                />
                              </div>
                            </div>
                            {!cargandoTipoCambio && !tipoCambioConfig && Number(form.dolares.cantidad) > 0 && (
                              <div className="gc-note text-danger">
                                No hay tipo de cambio configurado — captúralo en Configuración antes de guardar dólares.
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Vales */}
                        <div className="gc-sec gc-sec--vales">
                          <div className="gc-sec__head">
                            <span>Vales</span>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-dark py-0"
                              onClick={() => setMostrarModalVale(true)}
                            >
                              Generar Vale
                            </button>
                          </div>
                          <div className="gc-sec__body is-flush">
                            <table className="table table-sm mb-0">
                              <tbody>
                                {form.vales.length === 0 && (
                                  <tr>
                                    <td className="text-muted small">Sin vales capturados.</td>
                                  </tr>
                                )}
                                {form.vales.map((v, i) => (
                                  <tr key={i}>
                                    <td>{v.folio || '—'}</td>
                                    <td>{v.motivo || '—'}</td>
                                    <td className="text-end" style={{ width: 100 }}>
                                      {formatMoney(v.monto)}
                                    </td>
                                    <td style={{ width: 36 }}>
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-link text-danger p-0"
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
                    </div>

                    <div className="gc-total mt-3">
                      <span>Total a guardar</span>
                      <span className="gc-total__value">{formatMoney(calcularTotalCaptura(form, tipoCambioConfig))}</span>
                    </div>

                    <button type="button" className="btn btn-primary mt-3" onClick={guardar} disabled={guardando}>
                      {guardando ? <><span className="spinner-border spinner-border-sm me-1" />Guardando…</> : 'Guardar captura'}
                    </button>
                  </div>
                </div>
              )}

              {cierre.capturas?.length > 0 && (
                <div className="card shadow-sm mb-3">
                  <div className="card-header fw-bold py-2">Historial de capturas de la sesión</div>
                  <div className="card-body">
                    <CajaHistorialCapturas
                      capturas={cierre.capturas}
                      esAdmin={esAdmin}
                      cerrada={cerrada}
                      onCancelar={(captura) => setCapturaACancelar(captura)}
                      cancelandoId={cancelandoCapturaId}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* ---------- VISTA: LO QUE HAY EN CAJA ---------- */}
          {vista === 'caja' && (
            <div className="card shadow-sm">
              <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2 py-2">
                <span className="fw-bold">{viendoHistorica ? 'Detalle de sesión de caja' : 'Lo que hay en caja'}</span>
                <div className="d-flex gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => abrirPdf(getCierreCajaPdfUrl(cajaMostrada?._id), "cierre-caja.pdf", "Cierre de Caja")}
                  >
                    Generar PDF
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => abrirPdf(getCierreCajaPdfUrl(cajaMostrada?._id), "cierre-caja.pdf", "Cierre de Caja")}
                    disabled={!cajaMostradaCerrada}
                    title={!cajaMostradaCerrada ? 'Disponible cuando la caja esté cerrada' : ''}
                  >
                    Imprimir
                  </button>
                </div>
              </div>
              <div className="card-body">
                {viendoHistorica && (
                  <div className="alert alert-warning py-2 d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <span>
                      Estás viendo una sesión de caja <strong>cerrada</strong>
                      {' '}({fechaHora(cajaMostrada.abiertaEn || cajaMostrada.fecha)} → {fechaHora(cajaMostrada.cerradoEn)}).
                    </span>
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={verSesionActual}>
                      Volver a la caja actual
                    </button>
                  </div>
                )}
                <CierreCajaResumen
                  cierre={cajaMostrada}
                  accionesCierre={viendoHistorica ? undefined : accionesCierre}
                />
              </div>
            </div>
          )}

          {/* ---------- VISTA: REGISTROS DE CAJA ---------- */}
          {vista === 'registros' && (
            <div className="card shadow-sm">
              <div className="card-header fw-bold py-2">Registros de caja</div>
              <div className="card-body">
                <div className="d-flex flex-wrap align-items-end gap-2 mb-3">
                  <div className="gc-field">
                    <label>Desde</label>
                    <input
                      type="date"
                      className="form-control form-control-sm"
                      value={rangoRegistros.desde}
                      max={rangoRegistros.hasta || undefined}
                      onChange={(e) => setRangoRegistros((r) => ({ ...r, desde: e.target.value }))}
                    />
                  </div>
                  <div className="gc-field">
                    <label>Hasta</label>
                    <input
                      type="date"
                      className="form-control form-control-sm"
                      value={rangoRegistros.hasta}
                      min={rangoRegistros.desde || undefined}
                      onChange={(e) => setRangoRegistros((r) => ({ ...r, hasta: e.target.value }))}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => cargarRegistros()}
                    disabled={cargandoRegistros}
                  >
                    {cargandoRegistros ? 'Buscando…' : 'Buscar'}
                  </button>
                </div>

                {errorRegistros && <div className="alert alert-danger py-2">{errorRegistros}</div>}

                <div className="gc-sec gc-sec--otros">
                  <div className="gc-sec__body is-flush">
                    <div className="table-responsive">
                      <table className="table table-sm table-hover mb-0 align-middle">
                        <thead>
                          <tr>
                            <th>Estado</th>
                            <th>Apertura</th>
                            <th>Cierre</th>
                            <th>Responsable</th>
                            <th className="text-end">Total Cobrado</th>
                            <th className="text-end">Diferencia</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {!cerrada && cierre && (
                            <tr
                              className="table-success"
                              style={{ cursor: 'pointer' }}
                              onClick={verSesionActual}
                            >
                              <td><span className="badge bg-success">Activa</span></td>
                              <td className="text-nowrap">{fechaHora(cierre.abiertaEn || cierre.fecha)}</td>
                              <td className="text-muted">En curso</td>
                              <td>{cierre.capturadoPor || '—'}</td>
                              <td className="text-end">{formatMoney(totalesActual?.totalCobrado)}</td>
                              <td className={`text-end fw-bold ${(totalesActual?.diferencia ?? 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                                {formatMoney(totalesActual?.diferencia)}
                              </td>
                              <td className="text-end">
                                <span className="btn btn-sm btn-link p-0">Abrir</span>
                              </td>
                            </tr>
                          )}

                          {cargandoRegistros && (
                            <tr>
                              <td colSpan={7} className="text-center text-muted">Cargando…</td>
                            </tr>
                          )}

                          {!cargandoRegistros && (registros || []).length === 0 && (
                            <tr>
                              <td colSpan={7} className="text-center text-muted">
                                Sin sesiones de caja cerradas en el período seleccionado.
                              </td>
                            </tr>
                          )}

                          {!cargandoRegistros && (registros || []).map((c) => (
                            <tr
                              key={c._id}
                              style={{ cursor: 'pointer' }}
                              onClick={() => verSesionHistorica(c._id)}
                            >
                              <td><span className="badge bg-secondary">Cerrada</span></td>
                              <td className="text-nowrap">{fechaHora(c.abiertaEn || c.fecha)}</td>
                              <td className="text-nowrap">{fechaHora(c.cerradoEn)}</td>
                              <td>{c.cerradoPor || c.capturadoPor || '—'}</td>
                              <td className="text-end">{formatMoney(c.totalCobrado)}</td>
                              <td className={`text-end fw-bold ${c.diferencia >= 0 ? 'text-success' : 'text-danger'}`}>
                                {formatMoney(c.diferencia)}
                              </td>
                              <td className="text-end">
                                <span className="btn btn-sm btn-link p-0">
                                  {cargandoSesion ? '…' : 'Ver detalle'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="gc-note mt-2">
                  Toca una sesión para ver su detalle completo en «Lo que hay en caja». La sesión
                  <strong> Activa</strong> es la que sigue abierta; el resto ya están cerradas.
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <CajaModalVale
        show={mostrarModalVale}
        onClose={() => setMostrarModalVale(false)}
        onAdd={agregarValeDesdeModal}
      />
      <CajaModalCancelarCaptura
        show={!!capturaACancelar}
        captura={capturaACancelar}
        onClose={() => setCapturaACancelar(null)}
        onConfirm={confirmarCancelarCaptura}
      />
      {pdfModal}
    </div>
  );
}
