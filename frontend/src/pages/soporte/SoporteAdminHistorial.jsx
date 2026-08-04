import React, { useEffect, useMemo, useState } from 'react';
import {
  TIPOS_PROBLEMA_OPCIONES,
  ESTADO_TICKET_BADGE,
  ESTADO_TICKET_LABEL,
  tipoProblemaLabel,
  listTickets,
} from '../../api/tickets';
import OrdenServicioTicketLink from '../../components/OrdenServicioTicketLink';

const PAGE_SIZE = 20;

function chevron(sort, key) {
  if (sort.key !== key) return <span className="text-muted">▲▼</span>;
  return sort.dir === 'asc' ? <span>▲</span> : <span>▼</span>;
}

export default function SoporteAdminHistorial() {
  const [loading, setLoading] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: 'createdAt', dir: 'desc' });

  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        setLoading(true);
        const res = await listTickets({
          tipoProblema: filtroTipo || undefined,
          estado: filtroEstado || undefined,
          limit: 500,
        });
        if (!abort) setTickets(res.data?.data || []);
      } catch (err) {
        console.error('Error cargando historial de tickets:', err);
        if (!abort) setTickets([]);
      } finally {
        if (!abort) setLoading(false);
      }
    })();
    return () => { abort = true; };
  }, [filtroTipo, filtroEstado]);

  const sorted = useMemo(() => {
    const arr = [...tickets];
    arr.sort((a, b) => {
      const dir = sort.dir === 'asc' ? 1 : -1;
      if (sort.key === 'createdAt') {
        return (new Date(a.createdAt) - new Date(b.createdAt)) * dir;
      }
      const av = String(a[sort.key] || '').toLowerCase();
      const bv = String(b[sort.key] || '').toLowerCase();
      return av.localeCompare(bv) * dir;
    });
    return arr;
  }, [tickets, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageData = useMemo(() => {
    const start = (pageSafe - 1) * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }, [sorted, pageSafe]);

  function changeSort(key) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }

  return (
    <div>
      <div className="card shadow-sm mb-3">
        <div className="card-body py-2">
          <div className="row g-2 align-items-end">
            <div className="col-12 col-md-4">
              <label className="form-label mb-1 fw-semibold">Tipo de problema</label>
              <select
                className="form-select form-select-sm"
                value={filtroTipo}
                onChange={(e) => { setFiltroTipo(e.target.value); setPage(1); }}
              >
                <option value="">Todos</option>
                {TIPOS_PROBLEMA_OPCIONES.map((op) => (
                  <option key={op.value} value={op.value}>{op.label}</option>
                ))}
              </select>
            </div>
            <div className="col-12 col-md-3">
              <label className="form-label mb-1 fw-semibold">Estado</label>
              <select
                className="form-select form-select-sm"
                value={filtroEstado}
                onChange={(e) => { setFiltroEstado(e.target.value); setPage(1); }}
              >
                <option value="">Todos</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="EN_PROCESO">En Proceso</option>
                <option value="FINALIZADO">Finalizado</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="table-responsive">
        <table className="table table-bordered table-sm align-middle">
          <thead className="table-light text-center">
            <tr>
              <th role="button" onClick={() => changeSort('folio')}>Folio {chevron(sort, 'folio')}</th>
              <th role="button" onClick={() => changeSort('nombreUsuarioReporta')}>
                Reportado por {chevron(sort, 'nombreUsuarioReporta')}
              </th>
              <th role="button" onClick={() => changeSort('tipoProblema')}>
                Tipo de problema {chevron(sort, 'tipoProblema')}
              </th>
              <th>Detalle</th>
              <th>Orden de servicio</th>
              <th role="button" onClick={() => changeSort('estado')}>Estado {chevron(sort, 'estado')}</th>
              <th role="button" onClick={() => changeSort('createdAt')}>Fecha {chevron(sort, 'createdAt')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-4">Cargando…</td></tr>
            ) : pageData.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-4 text-muted">Sin tickets registrados.</td></tr>
            ) : (
              pageData.map((t) => (
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="d-flex justify-content-between align-items-center">
        <small className="text-muted">{sorted.length} ticket{sorted.length !== 1 ? 's' : ''}</small>
        <div className="btn-group">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={pageSafe <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </button>
          <span className="btn btn-sm btn-outline-secondary disabled">{pageSafe} / {totalPages}</span>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={pageSafe >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}
