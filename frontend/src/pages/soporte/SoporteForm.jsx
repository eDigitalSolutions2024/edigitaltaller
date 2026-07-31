import React, { useEffect, useRef, useState } from 'react';
import { getUser } from '../../auth';
import { listOrdenesServicio } from '../../api/vehiculos';
import {
  TIPOS_PROBLEMA_OPCIONES,
  ESTADO_TICKET_BADGE,
  ESTADO_TICKET_LABEL,
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
  if (c.tipoCliente === 'Empresa') return c.empresa?.razonSocial || c.empresa?.contacto?.nombre || '';
  if (c.tipoCliente === 'Gobierno') return c.gobierno?.nombreGobierno || '';
  return [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(' ');
}

export default function SoporteForm() {
  const user = getUser();

  const [form, setForm] = useState(VACIO);

  // ── Orden de servicio (opcional) ──
  const [searchOs, setSearchOs] = useState('');
  const [ordenServicio, setOrdenServicio] = useState(null); // _id seleccionado
  const [folioOrdenServicio, setFolioOrdenServicio] = useState('');
  const [sugerencias, setSugerencias] = useState([]);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const [buscandoOrden, setBuscandoOrden] = useState(false);
  const debounceRef = useRef(null);

  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null); // { tipo, texto }

  const [historial, setHistorial] = useState(null);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

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
        const res = await listOrdenesServicio({ searchOs: valor.trim(), limit: 8 });
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

            <div className="col-md-6 position-relative">
              <label className="form-label small fw-semibold">Orden de servicio (opcional)</label>
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

            <div className="col-12">
              <label className="form-label small fw-semibold">Motivo / Detalle</label>
              <textarea
                className="form-control"
                rows={3}
                value={form.detalle}
                onChange={handleChange('detalle')}
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
