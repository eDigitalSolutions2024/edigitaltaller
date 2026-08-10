import React, { useEffect, useRef, useState } from 'react';
import { getUser } from '../../auth';
import { listOrdenesServicio } from '../../api/vehiculos';
import { getAsesores } from '../../api/users';
import {
  TIPOS_PROBLEMA_OPCIONES,
  ESTADO_TICKET_BADGE,
  ESTADO_TICKET_LABEL,
  RESULTADO_TICKET_BADGE,
  RESULTADO_TICKET_LABEL,
  tipoProblemaLabel,
  createTicket,
  getMisTickets,
} from '../../api/tickets';

const VACIO = {
  tipoProblema: TIPOS_PROBLEMA_OPCIONES[0].value,
  detalle: '',
};

function nombreCliente(c) {
  if (!c) return '';
  // apellidoPaterno/apellidoMaterno son de "Particular"; en empresas/gobierno
  // no se concatenan porque en registros migrados/viejos pueden quedar
  // huérfanos con datos que ya no aplican.
  if (c.tipoCliente === 'Empresa Privada' || c.tipoCliente === 'Empresa Arrendadora') {
    return c.empresa?.razonSocial || c.empresa?.contacto?.nombre || c.nombre || '';
  }
  if (c.tipoCliente === 'Empresa Gobierno') return c.gobierno?.nombreGobierno || c.nombre || '';
  return [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(' ');
}

export default function SoporteForm() {
  const user = getUser();
  const esAsesor = user?.role === 'asesor_servicio';

  const [form, setForm] = useState(VACIO);
  const esCambioAsesor = form.tipoProblema === 'CAMBIO_ASESOR';
  const esRestablecerCobro = form.tipoProblema === 'RESTABLECER_COBRO';
  const esRestablecerCaja = form.tipoProblema === 'RESTABLECER_CAJA';
  const ordenRequerida = esCambioAsesor || esRestablecerCobro;

  // ── Día de caja a restablecer (solo RESTABLECER_CAJA) ──
  const [fechaCierreCaja, setFechaCierreCaja] = useState(new Date().toISOString().slice(0, 10));

  // ── Orden de servicio (opcional, requerida si es CAMBIO_ASESOR) ──
  const [searchOs, setSearchOs] = useState('');
  const [ordenServicio, setOrdenServicio] = useState(null); // _id seleccionado
  const [folioOrdenServicio, setFolioOrdenServicio] = useState('');
  const [sugerencias, setSugerencias] = useState([]);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const [buscandoOrden, setBuscandoOrden] = useState(false);
  const debounceRef = useRef(null);

  // ── Asesor destino (solo CAMBIO_ASESOR) ──
  const [asesores, setAsesores] = useState([]);
  const [asesorSolicitadoId, setAsesorSolicitadoId] = useState('');

  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null); // { tipo, texto }

  const [historial, setHistorial] = useState(null);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  useEffect(() => {
    getAsesores()
      .then((data) => setAsesores(Array.isArray(data) ? data : []))
      .catch(() => setAsesores([]));
  }, []);

  const cargarHistorial = () => {
    setCargandoHistorial(true);
    getMisTickets({ limit: 50 })
      .then((res) => setHistorial(res.data?.data || []))
      .catch(() => {})
      .finally(() => setCargandoHistorial(false));
  };

  useEffect(() => {
    cargarHistorial();
  }, []);

  const resetForm = () => {
    setForm(VACIO);
    setSearchOs('');
    setOrdenServicio(null);
    setFolioOrdenServicio('');
    setAsesorSolicitadoId('');
    setFechaCierreCaja(new Date().toISOString().slice(0, 10));
    setMensaje(null);
    setSugerencias([]);
    setMostrarSugerencias(false);
  };

  const handleChange = (campo) => (e) => {
    setForm((f) => ({ ...f, [campo]: e.target.value }));
  };

  // ── Orden de servicio: autocompletado con búsqueda en el servidor ──
  const handleSearchOsChange = (e) => {
    const valor = e.target.value;
    setSearchOs(valor);
    setOrdenServicio(null);
    setFolioOrdenServicio('');

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (valor.trim().length < 2) {
      setSugerencias([]);
      setMostrarSugerencias(false);
      return;
    }
    setBuscandoOrden(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await listOrdenesServicio({
          searchOs: valor.trim(),
          limit: 8,
          soloMisOrdenes: esAsesor || undefined,
        });
        setSugerencias(res.data?.data || []);
        setMostrarSugerencias(true);
      } catch {
        setSugerencias([]);
      } finally {
        setBuscandoOrden(false);
      }
    }, 300);
  };

  const seleccionarOrden = (o) => {
    setSearchOs(o.ordenServicio);
    setOrdenServicio(o._id);
    setFolioOrdenServicio(o.ordenServicio);
    setSugerencias([]);
    setMostrarSugerencias(false);
  };

  const validar = () => {
    if (!form.tipoProblema) return 'Selecciona el tipo de problema.';
    if (!form.detalle.trim()) return 'Captura el motivo/detalle del problema.';
    if (esCambioAsesor && !ordenServicio) return 'Busca y selecciona la orden de servicio a reasignar.';
    if (esCambioAsesor && !asesorSolicitadoId) return 'Selecciona el asesor al que quieres cambiar la orden.';
    if (esRestablecerCobro && !ordenServicio) return 'Busca y selecciona la orden de servicio con el cobro a restablecer.';
    if (esRestablecerCaja && !fechaCierreCaja) return 'Selecciona el día de caja a restablecer.';
    return null;
  };

  const handleGuardar = async () => {
    const err = validar();
    if (err) {
      setMensaje({ tipo: 'danger', texto: err });
      return;
    }
    setGuardando(true);
    setMensaje(null);
    try {
      const res = await createTicket({
        tipoProblema: form.tipoProblema,
        detalle: form.detalle.trim(),
        ordenServicio,
        folioOrdenServicio,
        asesorSolicitadoId: esCambioAsesor ? asesorSolicitadoId : undefined,
        fechaCierreCaja: esRestablecerCaja ? fechaCierreCaja : undefined,
      });
      const creado = res.data.data;
      setMensaje({ tipo: 'success', texto: `Ticket ${creado.folio} creado correctamente.` });
      resetForm();
      cargarHistorial();
    } catch (err2) {
      setMensaje({ tipo: 'danger', texto: err2.response?.data?.msg || 'Error al guardar el ticket.' });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div>
      <div className="card shadow-sm mb-3">
        <div className="card-body">
          <h5 className="fw-bold mb-3">Nuevo Ticket</h5>

          {mensaje && (
            <div className={`alert alert-${mensaje.tipo} py-2`}>{mensaje.texto}</div>
          )}

          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label small fw-semibold">Fecha</label>
              <input type="text" className="form-control" value={new Date().toLocaleString('es-MX')} readOnly data-no-uppercase />
            </div>

            <div className="col-md-4">
              <label className="form-label small fw-semibold">Usuario que reporta</label>
              <input type="text" className="form-control" value={user?.name || ''} readOnly data-no-uppercase />
            </div>

            <div className="col-md-4">
              <label className="form-label small fw-semibold">Tipo de problema</label>
              <select className="form-select" value={form.tipoProblema} onChange={handleChange('tipoProblema')}>
                {TIPOS_PROBLEMA_OPCIONES.map((op) => (
                  <option key={op.value} value={op.value}>{op.label}</option>
                ))}
              </select>
            </div>

            {!esRestablecerCaja && (
              <div className="col-md-6 position-relative">
                <label className="form-label small fw-semibold">
                  Orden de servicio {ordenRequerida ? '' : '(opcional)'}
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={searchOs}
                  onChange={handleSearchOsChange}
                  onFocus={() => sugerencias.length > 0 && setMostrarSugerencias(true)}
                  onBlur={() => setTimeout(() => setMostrarSugerencias(false), 150)}
                  placeholder="Buscar orden…"
                  autoComplete="off"
                />
                {buscandoOrden && <div className="form-text">Buscando…</div>}
                {mostrarSugerencias && sugerencias.length > 0 && (
                  <div className="list-group position-absolute w-100 shadow-sm" style={{ zIndex: 20 }}>
                    {sugerencias.map((o) => (
                      <button
                        type="button"
                        key={o._id}
                        className="list-group-item list-group-item-action py-1 px-2 small"
                        onMouseDown={() => seleccionarOrden(o)}
                      >
                        <strong>{o.ordenServicio}</strong> — {nombreCliente(o.cliente) || 'Sin cliente'} · {o.marca || ''} {o.modelo || ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {esRestablecerCaja && (
              <div className="col-md-6">
                <label className="form-label small fw-semibold">Día de caja a restablecer</label>
                <input
                  type="date"
                  className="form-control"
                  value={fechaCierreCaja}
                  onChange={(e) => setFechaCierreCaja(e.target.value)}
                />
              </div>
            )}

            {esCambioAsesor && (
              <div className="col-md-6">
                <label className="form-label small fw-semibold">Cambiar a asesor</label>
                <select
                  className="form-select"
                  value={asesorSolicitadoId}
                  onChange={(e) => setAsesorSolicitadoId(e.target.value)}
                >
                  <option value="">-- Seleccionar --</option>
                  {asesores.map((a) => (
                    <option key={a._id} value={a._id}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="col-12">
              <label className="form-label small fw-semibold">Motivo / Detalle</label>
              <textarea
                className="form-control"
                rows={3}
                value={form.detalle}
                onChange={handleChange('detalle')}
                placeholder={
                  esRestablecerCobro
                    ? 'Ej: Cancelar la Remisión N°123 / el Abono del 05-ago, se capturó por error…'
                    : esRestablecerCaja
                    ? 'Ej: Cerré la caja del día sin capturar los vales, necesito volver a abrirla…'
                    : ''
                }
              />
            </div>
          </div>

          <div className="d-flex gap-2 mt-4">
            <button type="button" className="btn btn-primary" onClick={handleGuardar} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>

      <div className="card shadow-sm">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h5 className="fw-bold mb-0">Historial de Tickets</h5>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={cargarHistorial} disabled={cargandoHistorial}>
              {cargandoHistorial ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>

          {!historial || historial.length === 0 ? (
            <div className="alert alert-info py-2 mb-0">
              {cargandoHistorial ? 'Cargando…' : 'Aún no has reportado ningún ticket.'}
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm table-bordered table-hover align-middle">
                <thead className="table-secondary">
                  <tr>
                    <th>Folio</th>
                    <th>Fecha</th>
                    <th>Tipo de problema</th>
                    <th>Detalle</th>
                    <th>Orden de servicio</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map((t) => (
                    <tr key={t._id}>
                      <td>{t.folio}</td>
                      <td>{new Date(t.createdAt).toLocaleString('es-MX')}</td>
                      <td>{tipoProblemaLabel(t.tipoProblema)}</td>
                      <td>{t.detalle}</td>
                      <td>{t.folioOrdenServicio || '—'}</td>
                      <td>
                        <span className={`badge ${ESTADO_TICKET_BADGE[t.estado] || 'bg-secondary'}`}>
                          {ESTADO_TICKET_LABEL[t.estado] || t.estado}
                        </span>
                        {t.resultado && (
                          <span className={`badge ms-1 ${RESULTADO_TICKET_BADGE[t.resultado] || 'bg-secondary'}`}>
                            {RESULTADO_TICKET_LABEL[t.resultado] || t.resultado}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
