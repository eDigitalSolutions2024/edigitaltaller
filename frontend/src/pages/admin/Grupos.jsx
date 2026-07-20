import { useEffect, useState, useCallback, useMemo } from 'react';
import { getUsers } from '../../api/users';
import { listarGrupos, crearGrupo, actualizarGrupo, cambiarEstadoGrupo } from '../../api/grupos';

const ROLES = [
  { value: 'admin',              label: 'Admin' },
  { value: 'recepcion',          label: 'Recepción' },
  { value: 'cajas',              label: 'Cajas' },
  { value: 'captura',            label: 'Captura' },
  { value: 'refaccionario',      label: 'Refaccionario' },
  { value: 'asesor_servicio',    label: 'Asesor de servicio' },
  { value: 'cuentas_por_pagar',  label: 'Cuentas por pagar' },
  { value: 'auditoria',          label: 'Auditoría' },
  { value: 'cuentas_por_cobrar', label: 'Cuentas por cobrar' },
  { value: 'recursos_humanos',   label: 'Recursos Humanos' },
  { value: 'coordinador',        label: 'Coordinador' },
  { value: 'finanzas',           label: 'Finanzas' },
];

const roleLabel = (v) => ROLES.find(r => r.value === v)?.label ?? v ?? '—';

const emptyForm = { nombre: '', rol: '', miembros: [] };

function formatFecha(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: '2-digit' });
}

export default function Grupos() {
  const [grupos,  setGrupos]  = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mensaje, setMensaje] = useState('');
  const [error,   setError]   = useState('');

  const [form, setForm] = useState(emptyForm);
  const [creando, setCreando] = useState(false);

  const [filtroActivo, setFiltroActivo] = useState('activos'); // activos | inactivos | todos
  const [expandido, setExpandido] = useState(null);   // id del grupo con detalle abierto
  const [editandoMiembros, setEditandoMiembros] = useState(null); // id del grupo cuyo roster se edita
  const [miembrosEdit, setMiembrosEdit] = useState([]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [gruposList, userList] = await Promise.all([listarGrupos({}), getUsers()]);
      setGrupos(gruposList);
      setUsuarios(userList.filter(u => u.isActive));
    } catch (err) {
      const msg = err?.response?.data?.mensaje || err?.message || 'Error al cargar datos';
      setError(`Error al cargar datos: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(() => setMensaje(''), 4000);
    return () => clearTimeout(t);
  }, [mensaje]);

  const candidatos = useMemo(
    () => usuarios.filter(u => u.role === form.rol),
    [usuarios, form.rol]
  );

  const toggleMiembro = (id) => {
    setForm(f => ({
      ...f,
      miembros: f.miembros.includes(id)
        ? f.miembros.filter(m => m !== id)
        : [...f.miembros, id],
    }));
  };

  const handleCrear = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) { setError('El nombre del grupo es obligatorio'); return; }
    if (!form.rol) { setError('Selecciona el rol del grupo'); return; }
    if (form.miembros.length < 2) { setError('Selecciona al menos 2 personas para el grupo'); return; }

    try {
      setCreando(true);
      setError('');
      await crearGrupo({ nombre: form.nombre.trim(), rol: form.rol, miembros: form.miembros });
      setForm(emptyForm);
      setMensaje('Grupo creado correctamente');
      await loadData();
    } catch (err) {
      setError(err?.response?.data?.mensaje || err?.message || 'Error al crear el grupo');
    } finally {
      setCreando(false);
    }
  };

  const toggleEstado = async (grupo) => {
    try {
      setError('');
      await cambiarEstadoGrupo(grupo._id, !grupo.activo);
      setMensaje(grupo.activo ? 'Grupo separado (desactivado)' : 'Grupo activado');
      await loadData();
    } catch (err) {
      setError(err?.response?.data?.mensaje || err?.message || 'Error al cambiar el estado del grupo');
    }
  };

  const iniciarEdicionMiembros = (grupo) => {
    setEditandoMiembros(grupo._id);
    setMiembrosEdit(grupo.miembros.map(m => m._id));
  };

  const guardarMiembros = async (grupo) => {
    if (miembrosEdit.length < 2) { setError('Un grupo debe tener al menos 2 miembros'); return; }
    try {
      setError('');
      await actualizarGrupo(grupo._id, { miembros: miembrosEdit });
      setMensaje('Miembros del grupo actualizados');
      setEditandoMiembros(null);
      await loadData();
    } catch (err) {
      setError(err?.response?.data?.mensaje || err?.message || 'Error al actualizar el grupo');
    }
  };

  const listaFiltrada = grupos.filter(g => {
    if (filtroActivo === 'activos'   && !g.activo) return false;
    if (filtroActivo === 'inactivos' &&  g.activo) return false;
    return true;
  });

  return (
    <div className="container-fluid py-4" style={{ maxWidth: 1200 }}>
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <h1 className="h3 mb-0">Grupos</h1>
      </div>

      {mensaje && <div className="alert alert-success py-2 mb-3">{mensaje}</div>}
      {error   && <div className="alert alert-danger  py-2 mb-3">{error}</div>}

      {/* ── Crear grupo ──────────────────────────────────────────────────────── */}
      <div className="card card-taller mb-4">
        <div className="card-header card-taller-header">
          <h5 className="card-title mb-0">Crear grupo</h5>
        </div>
        <div className="card-body">
          <form onSubmit={handleCrear}>
            <div className="row g-3">
              <div className="col-md-5">
                <label className="form-label">Nombre del grupo <span className="text-danger">*</span></label>
                <input
                  type="text" className="form-control"
                  value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej. Asesores Sucursal Norte"
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">Rol <span className="text-danger">*</span></label>
                <select
                  className="form-select"
                  value={form.rol}
                  onChange={e => setForm(f => ({ ...f, rol: e.target.value, miembros: [] }))}
                >
                  <option value="">Selecciona un rol…</option>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <div className="form-text">Solo se puede agrupar personal del mismo rol.</div>
              </div>
            </div>

            <div className="mt-3">
              <label className="form-label">
                Miembros del grupo <span className="text-danger">*</span>{' '}
                <span className="text-muted small">(mínimo 2)</span>
              </label>
              {!form.rol ? (
                <p className="text-muted small mb-0">Selecciona primero un rol para ver el personal disponible.</p>
              ) : candidatos.length === 0 ? (
                <p className="text-muted small mb-0">No hay personal activo con el rol "{roleLabel(form.rol)}".</p>
              ) : (
                <div className="row g-1">
                  {candidatos.map(u => (
                    <div key={u._id} className="col-md-4 col-sm-6">
                      <div className="form-check">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          id={`miembro_${u._id}`}
                          checked={form.miembros.includes(u._id)}
                          onChange={() => toggleMiembro(u._id)}
                        />
                        <label className="form-check-label" htmlFor={`miembro_${u._id}`}>
                          {u.name} <span className="text-muted small">@{u.username}</span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3">
              <button type="submit" className="btn btn-taller-primary" disabled={creando}>
                {creando ? 'Creando…' : 'Crear grupo'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ── Grupos actuales ──────────────────────────────────────────────────── */}
      <div className="card card-taller">
        <div className="card-header card-taller-header">
          <h5 className="card-title mb-0">Grupos actuales</h5>
        </div>
        <div className="card-body">
          <div className="row g-2 mb-3 align-items-center">
            <div className="col-auto">
              <select className="form-select form-select-sm" value={filtroActivo} onChange={e => setFiltroActivo(e.target.value)}>
                <option value="activos">Solo activos</option>
                <option value="inactivos">Solo inactivos</option>
                <option value="todos">Todos los estados</option>
              </select>
            </div>
            <div className="col-auto ms-auto text-muted small">
              {listaFiltrada.length} grupo{listaFiltrada.length !== 1 ? 's' : ''}
            </div>
          </div>

          {loading ? (
            <p className="text-muted">Cargando…</p>
          ) : listaFiltrada.length === 0 ? (
            <p className="text-muted text-center py-3 mb-0">No hay grupos que coincidan.</p>
          ) : (
            <div className="d-flex flex-column gap-2">
              {listaFiltrada.map(g => {
                const abierto = expandido === g._id;
                return (
                  <div key={g._id} className="border rounded">
                    <button
                      type="button"
                      className="btn w-100 text-start d-flex align-items-center justify-content-between px-3 py-2"
                      onClick={() => setExpandido(abierto ? null : g._id)}
                    >
                      <span>
                        <span className="fw-semibold">{g.nombre}</span>{' '}
                        <span className="text-muted small">
                          · {roleLabel(g.rol)} · {g.miembros.length} miembro{g.miembros.length !== 1 ? 's' : ''}
                        </span>
                      </span>
                      <span className={`badge ${g.activo ? 'text-bg-success' : 'text-bg-secondary'}`}>
                        {g.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </button>

                    {abierto && (
                      <div className="px-3 pb-3 border-top pt-3">
                        <div className="row g-3">
                          <div className="col-md-6">
                            <div className="small text-muted mb-1">Miembros</div>
                            <ul className="list-unstyled mb-0">
                              {g.miembros.map(m => (
                                <li key={m._id}>{m.name} <span className="text-muted small">@{m.username}</span></li>
                              ))}
                            </ul>
                          </div>
                          <div className="col-md-6">
                            <div className="small text-muted mb-1">Creado por</div>
                            <div className="mb-2">{g.creadoPor?.name || '—'}</div>
                            <div className="small text-muted mb-1">Fecha de creación</div>
                            <div>{formatFecha(g.createdAt)}</div>
                          </div>
                        </div>

                        {editandoMiembros === g._id ? (
                          <div className="mt-3">
                            <div className="small text-muted mb-1">Editar miembros ({roleLabel(g.rol)})</div>
                            <div className="row g-1">
                              {usuarios.filter(u => u.role === g.rol).map(u => (
                                <div key={u._id} className="col-md-4 col-sm-6">
                                  <div className="form-check">
                                    <input
                                      type="checkbox"
                                      className="form-check-input"
                                      id={`edit_${g._id}_${u._id}`}
                                      checked={miembrosEdit.includes(u._id)}
                                      onChange={() => setMiembrosEdit(prev =>
                                        prev.includes(u._id) ? prev.filter(id => id !== u._id) : [...prev, u._id]
                                      )}
                                    />
                                    <label className="form-check-label" htmlFor={`edit_${g._id}_${u._id}`}>
                                      {u.name} <span className="text-muted small">@{u.username}</span>
                                    </label>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="d-flex gap-2 mt-2">
                              <button className="btn btn-sm btn-taller-primary" onClick={() => guardarMiembros(g)}>
                                Guardar
                              </button>
                              <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditandoMiembros(null)}>
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="d-flex gap-2 mt-3">
                            <button className="btn btn-sm btn-outline-primary" onClick={() => iniciarEdicionMiembros(g)}>
                              Editar miembros
                            </button>
                            <button
                              className={`btn btn-sm ${g.activo ? 'btn-outline-danger' : 'btn-outline-success'}`}
                              onClick={() => toggleEstado(g)}
                            >
                              {g.activo ? 'Separar grupo' : 'Reactivar grupo'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
