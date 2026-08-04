import React, { useCallback, useEffect, useState } from 'react';
import { getUser } from '../../auth';
import {
  ESTADO_TICKET_BADGE,
  ESTADO_TICKET_LABEL,
  tipoProblemaLabel,
  listTickets,
  cambiarEstadoTicket,
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

  return (
    <div>
      <div className="card shadow-sm mb-3">
        <div className="card-body py-2">
          <div className="row g-2 align-items-end">
            <div className="col-12 col-md-3">
              <label className="form-label mb-1 fw-semibold">Estado</label>
              <select
                className="form-select form-select-sm"
                value={filtroEstado}
                onChange={(e) => {
                  setFiltroEstado(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos activos</option>
                <option value="PENDIENTE">Pendientes</option>
                <option value="EN_PROCESO">En Proceso</option>
              </select>
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
                <td>{t.detalle}</td>
                <td className="text-center">
                  <OrdenServicioTicketLink ticket={t} />
                </td>
                <td className="text-center">
                  <span className={`badge ${ESTADO_TICKET_BADGE[t.estado] || 'bg-secondary'}`}>
                    {ESTADO_TICKET_LABEL[t.estado] || t.estado}
                  </span>
                </td>
                <td className="text-center">{new Date(t.createdAt).toLocaleString('es-MX')}</td>
                <td className="text-center">
                  {!puedeGestionar ? (
                    <small className="text-muted">Sin permiso</small>
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
