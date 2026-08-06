import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUser } from '../auth';
import {
  tipoProblemaLabel,
  ESTADO_TICKET_BADGE,
  ESTADO_TICKET_LABEL,
  listTickets,
  cambiarEstadoTicket,
  resolverCambioAsesorTicket,
} from '../api/tickets';
import '../styles/OSFlotante.css';

function tiempoTranscurrido(fecha) {
  const diff = Date.now() - new Date(fecha).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

const SECCIONES = [
  { key: 'pendientes', label: 'Pendientes', color: '#6c757d' },
  { key: 'enProceso', label: 'En Proceso', color: '#ffc107' },
];

export default function SoporteFlotante() {
  const user = getUser();
  const esAdmin = user?.role === 'admin';
  const navigate = useNavigate();

  const [tickets, setTickets] = useState({ pendientes: [], enProceso: [] });
  const [minimizado, setMinimizado] = useState(false);
  const [expandida, setExpandida] = useState(null); // null | 'pendientes' | 'enProceso'
  const [ticketSeleccionado, setTicketSeleccionado] = useState(null); // ticket con el modal abierto
  const [procesando, setProcesando] = useState(false);

  const [pos, setPos] = useState({ x: window.innerWidth - 300, y: 20 });
  const dragging = useRef(false);
  const hasDragged = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const widgetRef = useRef(null);

  const cargar = useCallback(async () => {
    try {
      const res = await listTickets({ estado: 'PENDIENTE,EN_PROCESO', limit: 50 });
      const data = res.data?.data || [];
      setTickets({
        pendientes: data.filter((t) => t.estado === 'PENDIENTE'),
        enProceso: data.filter((t) => t.estado === 'EN_PROCESO'),
      });
      // Si el ticket abierto en el modal ya cambió/desapareció, refresca su copia local
      setTicketSeleccionado((prev) => (prev ? data.find((t) => t._id === prev._id) || null : null));
    } catch {
      // silencioso
    }
  }, []);

  useEffect(() => {
    if (!esAdmin) return;
    cargar();
    const id = setInterval(cargar, 30000);
    return () => clearInterval(id);
  }, [esAdmin, cargar]);

  useEffect(() => {
    if (!esAdmin) return;
    const onVisible = () => { if (document.visibilityState === 'visible') cargar(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [esAdmin, cargar]);

  const onMouseDown = useCallback((e) => {
    if (e.target.closest('.os-flotante__toggle, .osref-seccion, .osref-orden')) return;
    dragging.current = true;
    hasDragged.current = false;
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.preventDefault();
  }, [pos]);

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dragging.current) return;
      hasDragged.current = true;
      const newX = e.clientX - offset.current.x;
      const newY = e.clientY - offset.current.y;
      const maxX = window.innerWidth - (widgetRef.current?.offsetWidth || 280);
      const maxY = window.innerHeight - (widgetRef.current?.offsetHeight || 50);
      setPos({ x: Math.max(0, Math.min(newX, maxX)), y: Math.max(0, Math.min(newY, maxY)) });
    };
    const onMouseUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const total = tickets.pendientes.length + tickets.enProceso.length;

  if (!esAdmin || total === 0) return null;

  const resetDrag = () => { hasDragged.current = false; };

  const toggleSeccion = (key) => {
    if (hasDragged.current) return;
    setExpandida((prev) => (prev === key ? null : key));
  };

  const abrirTicket = (e, t) => {
    e.stopPropagation();
    if (hasDragged.current) return;
    setTicketSeleccionado(t);
  };

  const cerrarModal = () => setTicketSeleccionado(null);

  const handleCambiarEstado = async (nuevoEstado) => {
    if (!ticketSeleccionado) return;
    try {
      setProcesando(true);
      await cambiarEstadoTicket(ticketSeleccionado._id, nuevoEstado);
      cerrarModal();
      cargar();
    } catch {
      // silencioso
    } finally {
      setProcesando(false);
    }
  };

  const handleResolverCambioAsesor = async (accion) => {
    if (!ticketSeleccionado) return;
    try {
      setProcesando(true);
      await resolverCambioAsesorTicket(ticketSeleccionado._id, accion);
      cerrarModal();
      cargar();
    } catch (err) {
      alert(err.response?.data?.msg || 'Error al resolver la solicitud.');
    } finally {
      setProcesando(false);
    }
  };

  const irAOrden = () => {
    if (!ticketSeleccionado?.ordenServicio) return;
    cerrarModal();
    navigate(`/vehiculo/orden/${ticketSeleccionado.ordenServicio}?tab=general`);
  };

  return (
    <>
      <div
        ref={widgetRef}
        className="os-flotante osref"
        style={{ left: pos.x, top: pos.y }}
      >
        <div
          className="os-flotante__header os-flotante__header--refac"
          onMouseDown={onMouseDown}
          onClick={() => { if (!hasDragged.current) setMinimizado((m) => !m); }}
        >
          <span className="os-flotante__titulo">
            🛟 Soporte
            <span className="os-flotante__badge">{total}</span>
          </span>
          <button
            className="os-flotante__toggle"
            title={minimizado ? 'Expandir' : 'Minimizar'}
            onClick={(e) => { e.stopPropagation(); setMinimizado((m) => !m); }}
          >
            {minimizado ? '▲' : '▼'}
          </button>
        </div>

        {!minimizado && (
          <div className="os-flotante__body">
            {SECCIONES.map(({ key, label, color }) => {
              const lista = tickets[key];
              if (lista.length === 0) return null;
              const abierta = expandida === key;

              return (
                <div key={key} className="osref-seccion" onMouseDown={resetDrag} onClick={() => toggleSeccion(key)}>
                  <div className="osref-seccion__header">
                    <span className="osref-seccion__badge" style={{ backgroundColor: color }}>
                      {lista.length}
                    </span>
                    <span className="osref-seccion__label">{label}</span>
                    <span className="osref-seccion__chevron">{abierta ? '▾' : '▸'}</span>
                  </div>

                  {abierta && (
                    <ul className="osref-lista">
                      {lista.map((t) => (
                        <li
                          key={t._id}
                          className="osref-orden"
                          onMouseDown={(e) => { e.stopPropagation(); resetDrag(); }}
                          onClick={(e) => abrirTicket(e, t)}
                        >
                          <div className="osref-orden__top">
                            <span className="osref-orden__num">{t.folio}</span>
                            <span className="osref-orden__tiempo">{tiempoTranscurrido(t.createdAt)}</span>
                          </div>
                          <div className="osref-orden__cliente">{t.nombreUsuarioReporta}</div>
                          <div className="osref-orden__vehiculo">{tipoProblemaLabel(t.tipoProblema)}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {ticketSeleccionado && (
        <>
          <div
            className="modal-backdrop fade show"
            style={{ zIndex: 2050 }}
            onClick={cerrarModal}
          />
          <div
            className="modal fade show d-block"
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            style={{ zIndex: 2055 }}
            onKeyDown={(e) => e.key === 'Escape' && cerrarModal()}
          >
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <div>
                    <h5 className="modal-title mb-1">{ticketSeleccionado.folio}</h5>
                    <span className={`badge ${ESTADO_TICKET_BADGE[ticketSeleccionado.estado] || 'bg-secondary'}`}>
                      {ESTADO_TICKET_LABEL[ticketSeleccionado.estado] || ticketSeleccionado.estado}
                    </span>
                  </div>
                  <button type="button" className="btn-close" onClick={cerrarModal} />
                </div>

                <div className="modal-body">
                  <div className="row g-2 mb-3 small">
                    <div className="col-6">
                      <div className="text-muted">Reportado por</div>
                      <div className="fw-semibold">{ticketSeleccionado.nombreUsuarioReporta}</div>
                    </div>
                    <div className="col-6">
                      <div className="text-muted">Fecha</div>
                      <div className="fw-semibold">{new Date(ticketSeleccionado.createdAt).toLocaleString('es-MX')}</div>
                    </div>
                    <div className="col-12">
                      <div className="text-muted">Tipo de problema</div>
                      <div className="fw-semibold">{tipoProblemaLabel(ticketSeleccionado.tipoProblema)}</div>
                    </div>
                  </div>

                  <div className="text-muted small mb-1">Motivo / Detalle</div>
                  <div className="border rounded p-2 bg-light fw-semibold mb-3">
                    {ticketSeleccionado.detalle}
                  </div>

                  {ticketSeleccionado.tipoProblema === 'CAMBIO_ASESOR' && ticketSeleccionado.asesorSolicitadoNombre && (
                    <div className="mb-3">
                      <div className="text-muted small mb-1">Nuevo asesor solicitado</div>
                      <div className="border rounded p-2 bg-light fw-semibold">
                        {ticketSeleccionado.asesorSolicitadoNombre}
                      </div>
                    </div>
                  )}

                  {ticketSeleccionado.ordenServicio && (
                    <button type="button" className="btn btn-outline-primary btn-sm w-100" onClick={irAOrden}>
                      Ir a la orden de servicio {ticketSeleccionado.folioOrdenServicio || ''} →
                    </button>
                  )}
                </div>

                <div className="modal-footer">
                  {ticketSeleccionado.tipoProblema === 'CAMBIO_ASESOR' ? (
                    <>
                      <button type="button" className="btn btn-danger" disabled={procesando} onClick={() => handleResolverCambioAsesor('NEGAR')}>
                        Negar
                      </button>
                      <button type="button" className="btn btn-success" disabled={procesando} onClick={() => handleResolverCambioAsesor('APROBAR')}>
                        Aprobar cambio
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="btn btn-warning" disabled={procesando} onClick={() => handleCambiarEstado('EN_PROCESO')}>
                        En proceso
                      </button>
                      <button type="button" className="btn btn-success" disabled={procesando} onClick={() => handleCambiarEstado('FINALIZADO')}>
                        Completado
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
