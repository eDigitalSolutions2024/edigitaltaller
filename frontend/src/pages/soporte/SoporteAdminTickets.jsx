import React, { useCallback, useEffect, useState } from 'react';
import Dropdown from '../../components/Dropdown';
import { getUser } from '../../auth';
import {
  ESTADO_TICKET_BADGE,
  ESTADO_TICKET_LABEL,
  RESULTADO_TICKET_BADGE,
  RESULTADO_TICKET_LABEL,
  tipoProblemaLabel,
  listTickets,
  cambiarEstadoTicket,
  resolverCambioAsesorTicket,
  resolverRestablecerCajaTicket,
  resolverGarantiaTicket,
} from '../../api/tickets';
import OrdenServicioTicketLink from '../../components/OrdenServicioTicketLink';

const LIMIT = 10;
const ESTADOS_ACTIVOS = 'PENDIENTE,EN_PROCESO';

export default function SoporteAdminTickets() {
  const user = getUser();
  const puedeGestionar = user?.role === 'admin';

  const [filtroEstado, setFiltroEstado] = useState('');
  const [tickets, setTickets] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [procesando, setProcesando] = useState(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await listTickets({
        estado: filtroEstado || ESTADOS_ACTIVOS,
        page,
        limit: LIMIT,
      });
      setTickets(res.data?.data || []);
      setTotal(res.data?.total || 0);
    } catch (err) {
      console.error('Error cargando tickets:', err);
      setError('No se pudieron cargar los tickets.');
    } finally {
      setLoading(false);
    }
  }, [filtroEstado, page]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const handleCambiarEstado = async (t, nuevoEstado) => {
    const accion = nuevoEstado === 'EN_PROCESO' ? 'marcar en proceso' : 'marcar como finalizado';
    const ok = window.confirm(`¿Deseas ${accion} el ticket ${t.folio}?`);
    if (!ok) return;
    try {
      setProcesando(t._id);
      await cambiarEstadoTicket(t._id, nuevoEstado);
      cargar();
    } catch (err) {
      alert(err.response?.data?.msg || 'Error al actualizar el ticket.');
    } finally {
      setProcesando(null);
    }
  };

  const handleResolverCambioAsesor = async (t, accion) => {
    const pregunta =
      accion === 'APROBAR'
        ? `¿Aprobar el cambio de asesor a "${t.asesorSolicitadoNombre}" en la orden ${t.folioOrdenServicio}?`
        : `¿Negar esta solicitud de cambio de asesor para la orden ${t.folioOrdenServicio}?`;
    const ok = window.confirm(pregunta);
    if (!ok) return;
    try {
      setProcesando(t._id);
      await resolverCambioAsesorTicket(t._id, accion);
      cargar();
    } catch (err) {
      alert(err.response?.data?.msg || 'Error al resolver la solicitud.');
    } finally {
      setProcesando(null);
    }
  };

  const handleResolverGarantia = async (t, decision) => {
    const pregunta =
      decision === 'APLICA'
        ? `¿Marcar "Aplica" la garantía de la orden ${t.folioOrdenServicio}? Se desbloqueará para que el asesor la siga trabajando.`
        : `¿Marcar "No aplica" la garantía de la orden ${t.folioOrdenServicio}? Se cancelará esa orden y se creará automáticamente una nueva orden para el mismo asesor, pendiente de capturar el número de OS.`;
    const ok = window.confirm(pregunta);
    if (!ok) return;
    try {
      setProcesando(t._id);
      await resolverGarantiaTicket(t._id, decision);
      cargar();
    } catch (err) {
      alert(err.response?.data?.msg || 'Error al resolver la solicitud.');
    } finally {
      setProcesando(null);
    }
  };

  const handleResolverRestablecerCaja = async (t, accion) => {
    const fechaTexto = t.fechaCierreCaja
      ? new Date(t.fechaCierreCaja).toLocaleDateString('es-MX', { timeZone: 'UTC' })
      : '';
    const pregunta =
      accion === 'APROBAR'
        ? `¿Aprobar y reabrir la caja del ${fechaTexto}?`
        : `¿Negar esta solicitud de restablecer la caja del ${fechaTexto}?`;
    const ok = window.confirm(pregunta);
    if (!ok) return;
    try {
      setProcesando(t._id);
      await resolverRestablecerCajaTicket(t._id, accion);
      cargar();
    } catch (err) {
      alert(err.response?.data?.msg || 'Error al resolver la solicitud.');
    } finally {
      setProcesando(null);
    }
  };

  return (
    <div>
      <div className="card shadow-sm mb-3">
        <div className="card-body py-2">
          <div className="row g-2 align-items-end">
            <div className="col-12 col-md-3">
              <label className="form-label mb-1 fw-semibold">Estado</label>
              <Dropdown
                className="form-select-sm"
                value={filtroEstado}
                onChange={(e) => {
                  setFiltroEstado(e.target.value);
                  setPage(1);
                }}
              >
                <Dropdown.Option value="">Todos activos</Dropdown.Option>
                <Dropdown.Option value="PENDIENTE">Pendientes</Dropdown.Option>
                <Dropdown.Option value="EN_PROCESO">En Proceso</Dropdown.Option>
              </Dropdown>
            </div>
            <div className="col-12 col-md-2">
              <button type="button" className="btn btn-outline-primary btn-sm w-100" onClick={cargar} disabled={loading}>
                {loading ? 'Cargando...' : 'Actualizar'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && <p className="text-danger">{error}</p>}

      <div className="table-responsive">
        <table className="table table-bordered table-sm align-middle">
          <thead className="table-light text-center">
            <tr>
              <th>Folio</th>
              <th>Reportado por</th>
              <th>Tipo de problema</th>
              <th>Detalle</th>
              <th>Orden de servicio</th>
              <th>Estado</th>
              <th>Fecha</th>
              <th style={{ width: 180 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {!loading && tickets.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-muted py-4">
                  No hay tickets activos.
                </td>
              </tr>
            )}
            {tickets.map((t) => (
              <tr key={t._id}>
                <td className="text-center fw-semibold">{t.folio}</td>
                <td>{t.nombreUsuarioReporta}</td>
                <td>{tipoProblemaLabel(t.tipoProblema)}</td>
                <td>
                  {t.detalle}
                  {t.tipoProblema === 'CAMBIO_ASESOR' && t.asesorSolicitadoNombre && (
                    <div className="small text-muted">
                      Nuevo asesor solicitado: <strong>{t.asesorSolicitadoNombre}</strong>
                    </div>
                  )}
                  {t.tipoProblema === 'RESTABLECER_CAJA' && t.fechaCierreCaja && (
                    <div className="small text-muted">
                      Día de caja: <strong>{new Date(t.fechaCierreCaja).toLocaleDateString('es-MX', { timeZone: 'UTC' })}</strong>
                    </div>
                  )}
                </td>
                <td className="text-center">
                  <OrdenServicioTicketLink ticket={t} />
                </td>
                <td className="text-center">
                  <span className={`badge ${ESTADO_TICKET_BADGE[t.estado] || 'bg-secondary'}`}>
                    {ESTADO_TICKET_LABEL[t.estado] || t.estado}
                  </span>
                  {t.resultado && (
                    <div className="mt-1">
                      <span className={`badge ${RESULTADO_TICKET_BADGE[t.resultado] || 'bg-secondary'}`}>
                        {RESULTADO_TICKET_LABEL[t.resultado] || t.resultado}
                      </span>
                    </div>
                  )}
                </td>
                <td className="text-center">{new Date(t.createdAt).toLocaleString('es-MX')}</td>
                <td className="text-center">
                  {!puedeGestionar ? (
                    <small className="text-muted">Sin permiso</small>
                  ) : t.tipoProblema === 'CAMBIO_ASESOR' && t.estado !== 'FINALIZADO' ? (
                    <div className="d-flex gap-1 justify-content-center">
                      <button
                        type="button"
                        className="btn btn-success btn-sm py-0"
                        style={{ fontSize: 12 }}
                        disabled={procesando === t._id}
                        onClick={() => handleResolverCambioAsesor(t, 'APROBAR')}
                      >
                        Aprobar
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm py-0"
                        style={{ fontSize: 12 }}
                        disabled={procesando === t._id}
                        onClick={() => handleResolverCambioAsesor(t, 'NEGAR')}
                      >
                        Negar
                      </button>
                    </div>
                  ) : t.tipoProblema === 'RESTABLECER_CAJA' && t.estado !== 'FINALIZADO' ? (
                    <div className="d-flex gap-1 justify-content-center">
                      <button
                        type="button"
                        className="btn btn-success btn-sm py-0"
                        style={{ fontSize: 12 }}
                        disabled={procesando === t._id}
                        onClick={() => handleResolverRestablecerCaja(t, 'APROBAR')}
                      >
                        Aprobar
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm py-0"
                        style={{ fontSize: 12 }}
                        disabled={procesando === t._id}
                        onClick={() => handleResolverRestablecerCaja(t, 'NEGAR')}
                      >
                        Negar
                      </button>
                    </div>
                  ) : t.tipoProblema === 'GARANTIA_NO_APLICA' && t.estado !== 'FINALIZADO' ? (
                    <div className="d-flex gap-1 justify-content-center">
                      <button
                        type="button"
                        className="btn btn-success btn-sm py-0"
                        style={{ fontSize: 12 }}
                        disabled={procesando === t._id}
                        onClick={() => handleResolverGarantia(t, 'APLICA')}
                      >
                        Aplica
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm py-0"
                        style={{ fontSize: 12 }}
                        disabled={procesando === t._id}
                        onClick={() => handleResolverGarantia(t, 'NO_APLICA')}
                      >
                        No aplica
                      </button>
                    </div>
                  ) : t.estado === 'PENDIENTE' ? (
                    <button
                      type="button"
                      className="btn btn-warning btn-sm py-0"
                      style={{ fontSize: 12 }}
                      disabled={procesando === t._id}
                      onClick={() => handleCambiarEstado(t, 'EN_PROCESO')}
                    >
                      Marcar en proceso
                    </button>
                  ) : t.estado === 'EN_PROCESO' ? (
                    <button
                      type="button"
                      className="btn btn-success btn-sm py-0"
                      style={{ fontSize: 12 }}
                      disabled={procesando === t._id}
                      onClick={() => handleCambiarEstado(t, 'FINALIZADO')}
                    >
                      Marcar finalizado
                    </button>
                  ) : (
                    <small className="text-muted">—</small>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="d-flex justify-content-between align-items-center">
        <small className="text-muted">
          {total} ticket{total !== 1 ? 's' : ''}
        </small>
        <div className="btn-group">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </button>
          <span className="btn btn-sm btn-outline-secondary disabled">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}
