import { useEffect, useState, useCallback } from 'react';
import { FaEye, FaEyeSlash, FaUserShield, FaUserTimes, FaCopy } from 'react-icons/fa';
import {
  getUsers,
  createUser,
  updateUser,
  updateUserStatus,
  changeUserPassword,
  verifyAdminPassword,
  revealUserPassword
} from '../../api/users';
import {
  listarEmpleados,
  crearEmpleado,
  actualizarEmpleado,
  cambiarEstadoEmpleado,
  vincularUsuario
} from '../../api/empleados';

// ─── Etiquetas de roles ───────────────────────────────────────────────────────
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

const PUESTOS = [
  { value: 'asesor',       label: 'Asesor' },
  { value: 'mecanico',     label: 'Mecánico' },
  { value: 'ayudante',     label: 'Ayudante' },
  { value: 'carrocero',    label: 'Carrocero' },
  { value: 'recepcion',    label: 'Recepción' },
  { value: 'contabilidad', label: 'Contabilidad' },
  { value: 'jefe_taller',  label: 'Jefe de taller' },
  { value: 'jefe',         label: 'Jefe' },
  { value: 'otro',         label: 'Otro' },
];

const roleLabel  = (v) => ROLES.find(r => r.value === v)?.label  ?? v ?? '—';
const puestoLabel = (v) => PUESTOS.find(p => p.value === v)?.label ?? v ?? '—';

// ─── Cookie helpers ───────────────────────────────────────────────────────────
function getRevealToken() {
  const m = document.cookie.match(/(?:^|;\s*)pwd_reveal_token=([^;]+)/);
  return m ? m[1] : null;
}

function setRevealToken(token) {
  document.cookie = `pwd_reveal_token=${token}; max-age=60; SameSite=Strict; path=/`;
}

function clearRevealToken() {
  document.cookie = 'pwd_reveal_token=; max-age=0; path=/';
}

// ─── Modal de verificación ────────────────────────────────────────────────────
function VerificarModal({ onSuccess, onClose }) {
  const [pwd, setPwd]       = useState('');
  const [show, setShow]     = useState(false);
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { token } = await verifyAdminPassword(pwd);
      setRevealToken(token);
      onSuccess(token);
    } catch {
      setError('Contraseña incorrecta');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1055 }}>
      <div className="modal-dialog modal-sm modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Verificar identidad</h5>
            <button className="btn-close" onClick={onClose} />
          </div>
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              <p className="text-muted small mb-2">
                Ingresa tu contraseña de administrador para desbloquear la visualización
                de contraseñas durante 1 minuto.
              </p>
              <div className="input-group">
                <input
                  type={show ? 'text' : 'password'}
                  className="form-control"
                  value={pwd}
                  onChange={e => setPwd(e.target.value)}
                  placeholder="Tu contraseña"
                  autoFocus
                />
                <button type="button" className="btn btn-outline-secondary" onClick={() => setShow(v => !v)}>
                  {show ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
              {error && <div className="text-danger small mt-1">{error}</div>}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-taller-primary btn-sm" disabled={loading || !pwd}>
                {loading ? 'Verificando…' : 'Verificar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Estado inicial del formulario ───────────────────────────────────────────
const emptyForm = {
  // Empleado
  nombre:    '',
  puesto:    'mecanico',
  telefono:  '',
  correo:    '',
  fechaAlta: '',
  notas:     '',
  // Control
  tipo: 'empleado',          // 'empleado' | 'empleado_acceso' | 'solo_usuario'
  // Usuario
  username:    '',
  email:       '',
  password:    '',
  newPassword: '',
  role:        'captura',
};

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Personal() {
  const [personas,    setPersonas]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [mensaje,     setMensaje]     = useState('');
  const [error,       setError]       = useState('');
  const [search,      setSearch]      = useState('');
  const [filtro,      setFiltro]      = useState('todos');   // todos | con_acceso | sin_acceso
  const [filtroActivo, setFiltroActivo] = useState('activos'); // todos | activos | inactivos

  const [editando,    setEditando]    = useState(null);   // persona actual en edición
  const [form,        setForm]        = useState(emptyForm);
  const [showPwd,     setShowPwd]     = useState(false);
  const [showNewPwd,  setShowNewPwd]  = useState(false);

  const [revealed,    setRevealed]    = useState({});     // { [userId]: password }
  const [verifyFor,   setVerifyFor]   = useState(null);   // userId pendiente de reveal
  const [pwdError,    setPwdError]    = useState({});     // { [userId]: mensaje de error }

  // ── Carga de datos ──────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [empList, userList] = await Promise.all([listarEmpleados({}), getUsers()]);

      const lista = [];
      const userIdsEnEmpleados = new Set();

      // Empleados (con o sin usuario vinculado)
      for (const emp of empList) {
        const u = emp.usuario;
        if (u) userIdsEnEmpleados.add(String(u._id));
        lista.push({
          key:         emp._id,
          empleadoId:  emp._id,
          userId:      u?._id    || null,
          nombre:      emp.nombre,
          puesto:      emp.puesto,
          telefono:    emp.telefono  || '',
          correo:      emp.correo    || '',
          fechaAlta:   emp.fechaAlta || null,
          notas:       emp.notas     || '',
          activo:      emp.activo,
          tieneAcceso: !!u,
          username:    u?.username   || null,
          userEmail:   u?.email      || null,
          role:        u?.role       || null,
          userIsActive: u?.isActive  ?? null,
        });
      }

      // Usuarios puros (sin empleado vinculado)
      for (const u of userList) {
        if (!u.employee && !userIdsEnEmpleados.has(String(u._id))) {
          lista.push({
            key:         u._id,
            empleadoId:  null,
            userId:      u._id,
            nombre:      u.name,
            puesto:      null,
            telefono:    u.telefono  || '',
            correo:      u.email     || '',
            fechaAlta:   null,
            notas:       '',
            activo:      u.isActive,
            tieneAcceso: true,
            username:    u.username,
            userEmail:   u.email,
            role:        u.role,
            userIsActive: u.isActive,
          });
        }
      }

      setPersonas(lista);
    } catch (err) {
      console.error('loadData error:', err);
      const msg = err?.response?.data?.message || err?.message || 'Error al cargar datos';
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

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(''), 4000);
    return () => clearTimeout(t);
  }, [error]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function flash(msg, isError = false) {
    if (isError) { setError(msg); setMensaje(''); }
    else         { setMensaje(msg); setError(''); }
  }

  function resetForm() {
    setEditando(null);
    setForm(emptyForm);
    setShowPwd(false);
    setShowNewPwd(false);
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  }

  function handleEdit(persona) {
    setEditando(persona);
    const tipo = persona.tieneAcceso
      ? (persona.empleadoId ? 'empleado_acceso' : 'solo_usuario')
      : 'empleado';
    setForm({
      nombre:      persona.nombre      || '',
      puesto:      persona.puesto      || 'mecanico',
      telefono:    persona.telefono    || '',
      correo:      persona.correo      || '',
      fechaAlta:   persona.fechaAlta ? persona.fechaAlta.slice(0, 10) : '',
      notas:       persona.notas       || '',
      tipo,
      username:    persona.username    || '',
      email:       persona.userEmail   || persona.correo || '',
      password:    '',
      newPassword: '',
      role:        persona.role        || 'captura',
    });
    setShowPwd(false);
    setShowNewPwd(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Guardar ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    setMensaje('');
    setError('');

    const esEmpleado  = form.tipo !== 'solo_usuario';
    const tieneAcceso = form.tipo !== 'empleado';

    try {
      if (editando) {
        // ─ Editar ─
        if (editando.empleadoId) {
          await actualizarEmpleado(editando.empleadoId, {
            nombre:    form.nombre,
            puesto:    form.puesto,
            telefono:  form.telefono,
            correo:    form.correo,
            fechaAlta: form.fechaAlta || undefined,
            notas:     form.notas,
          });
        }

        if (editando.userId) {
          await updateUser(editando.userId, {
            name:     form.nombre,
            username: form.username,
            email:    form.email,
            role:     form.role,
          });
          if (form.newPassword.trim()) {
            await changeUserPassword(editando.userId, form.newPassword.trim());
          }
        } else if (tieneAcceso && editando.empleadoId) {
          // Dar acceso al sistema a un empleado que no tenía
          const nuevoUser = await createUser({
            name:     form.nombre,
            username: form.username,
            email:    form.email,
            password: form.password,
            role:     form.role,
            employee: editando.empleadoId,
          });
          await vincularUsuario(editando.empleadoId, nuevoUser._id);
        }

        flash('Registro actualizado correctamente');
      } else {
        // ─ Crear ─
        let empleadoId = null;

        if (esEmpleado) {
          const emp = await crearEmpleado({
            nombre:    form.nombre,
            puesto:    form.puesto,
            telefono:  form.telefono,
            correo:    form.correo,
            fechaAlta: form.fechaAlta || undefined,
            notas:     form.notas,
          });
          empleadoId = emp._id;
        }

        if (tieneAcceso) {
          const nuevoUser = await createUser({
            name:     form.nombre,
            username: form.username,
            email:    form.email,
            password: form.password,
            role:     form.role,
            employee: empleadoId,
          });
          if (empleadoId) {
            await vincularUsuario(empleadoId, nuevoUser._id);
          }
        }

        flash('Registro creado correctamente');
      }

      resetForm();
      loadData();
    } catch (err) {
      console.error(err);
      flash(err?.response?.data?.message || 'Error al guardar', true);
    }
  }

  // ── Toggle activo ────────────────────────────────────────────────────────────
  async function toggleActivo(persona) {
    try {
      const nuevoEstado = !persona.activo;
      if (persona.empleadoId) {
        await cambiarEstadoEmpleado(persona.empleadoId, nuevoEstado);
      }
      if (persona.userId) {
        await updateUserStatus(persona.userId, nuevoEstado);
      }
      flash(nuevoEstado ? 'Activado correctamente' : 'Desactivado correctamente');
      loadData();
    } catch (err) {
      console.error(err);
      flash('Error al cambiar estado', true);
    }
  }

  // ── Revelar contraseña ───────────────────────────────────────────────────────
  async function handleReveal(persona) {
    const token = getRevealToken();
    if (!token) {
      setVerifyFor(persona.userId);
      return;
    }
    await fetchPassword(persona.userId, token);
  }

  async function fetchPassword(userId, token) {
    try {
      const { password } = await revealUserPassword(userId, token);
      setRevealed(prev => ({ ...prev, [userId]: password }));
      setPwdError(prev => { const n = { ...prev }; delete n[userId]; return n; });
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401) {
        // Token expirado → pedir verificación de nuevo
        clearRevealToken();
        setVerifyFor(userId);
      } else if (status === 403) {
        setPwdError(prev => ({ ...prev, [userId]: 'No puedes ver la contraseña de otro administrador.' }));
      } else if (status === 404) {
        // Contraseña no disponible (usuario creado antes del cifrado)
        setPwdError(prev => ({
          ...prev,
          [userId]: 'Sin contraseña guardada. Cámbiala para activar esta función.'
        }));
      } else {
        setPwdError(prev => ({ ...prev, [userId]: 'Error al obtener la contraseña' }));
      }
    }
  }

  async function handleVerifySuccess(token) {
    const uid = verifyFor;
    setVerifyFor(null);
    if (uid) await fetchPassword(uid, token);
  }

  function hidePassword(userId) {
    setRevealed(prev => { const n = { ...prev }; delete n[userId]; return n; });
  }

  // ── Filtrado ─────────────────────────────────────────────────────────────────
  const listaFiltrada = personas.filter(p => {
    if (filtro === 'con_acceso'  && !p.tieneAcceso) return false;
    if (filtro === 'sin_acceso'  &&  p.tieneAcceso) return false;
    if (filtroActivo === 'activos'   && !p.activo) return false;
    if (filtroActivo === 'inactivos' &&  p.activo) return false;

    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.nombre?.toLowerCase().includes(q)    ||
      p.username?.toLowerCase().includes(q)  ||
      p.correo?.toLowerCase().includes(q)    ||
      p.userEmail?.toLowerCase().includes(q) ||
      p.puesto?.toLowerCase().includes(q)    ||
      p.role?.toLowerCase().includes(q)
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="container-fluid py-4" style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <h1 className="h3 mb-0">Personal del Taller</h1>
        {!editando && (
          <button
            className="btn btn-taller-primary"
            onClick={() => { setEditando({}); setForm(emptyForm); }}
          >
            + Nuevo
          </button>
        )}
      </div>

      {/* Alertas */}
      {mensaje && <div className="alert alert-success py-2 mb-3">{mensaje}</div>}
      {error   && <div className="alert alert-danger  py-2 mb-3">{error}</div>}

      {/* ── Formulario ────────────────────────────────────────────────────────── */}
      {editando !== null && (
        <div className="card card-taller mb-4">
          <div className="card-header card-taller-header">
            <h5 className="card-title mb-0">
              {editando._id || editando.key ? 'Editar registro' : 'Nuevo registro'}
            </h5>
          </div>
          <div className="card-body">
            <form onSubmit={handleSubmit}>

              {/* Tipo */}
              <div className="mb-3">
                <label className="form-label fw-semibold">Tipo</label>
                <div className="d-flex gap-3 flex-wrap">
                  {[
                    { val: 'empleado',        label: 'Solo empleado (sin acceso al sistema)' },
                    { val: 'empleado_acceso', label: 'Empleado con acceso al sistema' },
                    { val: 'solo_usuario',    label: 'Solo usuario del sistema' },
                  ].map(opt => (
                    <div key={opt.val} className="form-check">
                      <input
                        type="radio"
                        className="form-check-input"
                        id={`tipo_${opt.val}`}
                        name="tipo"
                        value={opt.val}
                        checked={form.tipo === opt.val}
                        onChange={handleChange}
                        disabled={!!editando.key}
                      />
                      <label className="form-check-label" htmlFor={`tipo_${opt.val}`}>
                        {opt.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="row g-3">
                {/* ─ Campos de empleado ─ */}
                {form.tipo !== 'solo_usuario' && (
                  <>
                    <div className="col-md-4">
                      <label className="form-label">Nombre completo <span className="text-danger">*</span></label>
                      <input
                        type="text" name="nombre" className="form-control"
                        value={form.nombre} onChange={handleChange} required
                      />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label">Puesto</label>
                      <select name="puesto" className="form-select" value={form.puesto} onChange={handleChange}>
                        {PUESTOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                    </div>
                    <div className="col-md-3">
                      <label className="form-label">Teléfono</label>
                      <input type="text" name="telefono" className="form-control" value={form.telefono} onChange={handleChange} />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label">Correo</label>
                      <input type="email" name="correo" className="form-control" value={form.correo} onChange={handleChange} />
                    </div>
                    <div className="col-md-2">
                      <label className="form-label">Fecha de alta</label>
                      <input type="date" name="fechaAlta" className="form-control" value={form.fechaAlta} onChange={handleChange} />
                    </div>
                    <div className="col-12">
                      <label className="form-label">Notas</label>
                      <textarea name="notas" rows={2} className="form-control" value={form.notas} onChange={handleChange} />
                    </div>
                  </>
                )}

                {/* ─ Campos de usuario del sistema ─ */}
                {form.tipo !== 'empleado' && (
                  <>
                    {form.tipo === 'solo_usuario' && (
                      <div className="col-md-4">
                        <label className="form-label">Nombre completo <span className="text-danger">*</span></label>
                        <input
                          type="text" name="nombre" className="form-control"
                          value={form.nombre} onChange={handleChange} required
                        />
                      </div>
                    )}
                    <div className="col-md-3">
                      <label className="form-label">Usuario <span className="text-danger">*</span></label>
                      <input
                        type="text" name="username" className="form-control"
                        value={form.username} onChange={handleChange}
                        required={form.tipo !== 'empleado'}
                      />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label">Email del sistema <span className="text-danger">*</span></label>
                      <input
                        type="email" name="email" className="form-control"
                        value={form.email} onChange={handleChange}
                        required={form.tipo !== 'empleado'}
                      />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label">Rol</label>
                      <select name="role" className="form-select" value={form.role} onChange={handleChange}>
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </div>

                    {/* Contraseña — al crear O al dar acceso nuevo */}
                    {(!editando.key || (editando.key && !editando.userId)) && (
                      <div className="col-md-3">
                        <label className="form-label">Contraseña <span className="text-danger">*</span></label>
                        <div className="input-group">
                          <input
                            type={showPwd ? 'text' : 'password'}
                            name="password" className="form-control"
                            value={form.password} onChange={handleChange}
                            required minLength={6}
                          />
                          <button type="button" className="btn btn-outline-secondary" onClick={() => setShowPwd(v => !v)}>
                            {showPwd ? <FaEyeSlash /> : <FaEye />}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Nueva contraseña — al editar usuario existente */}
                    {editando.key && editando.userId && (
                      <div className="col-md-3">
                        <label className="form-label">Nueva contraseña</label>
                        <div className="input-group">
                          <input
                            type={showNewPwd ? 'text' : 'password'}
                            name="newPassword" className="form-control"
                            placeholder="Dejar vacío para no cambiar"
                            value={form.newPassword} onChange={handleChange}
                            minLength={6}
                          />
                          <button type="button" className="btn btn-outline-secondary" onClick={() => setShowNewPwd(v => !v)}>
                            {showNewPwd ? <FaEyeSlash /> : <FaEye />}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="d-flex gap-2 mt-4">
                <button type="submit" className="btn btn-taller-primary">
                  {editando.key ? 'Guardar cambios' : 'Crear registro'}
                </button>
                <button type="button" className="btn btn-outline-secondary" onClick={resetForm}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Buscador + filtros ─────────────────────────────────────────────────── */}
      <div className="card card-taller">
        <div className="card-body">
          <div className="row g-2 mb-3 align-items-center">
            <div className="col-md-4">
              <input
                type="search"
                className="form-control"
                placeholder="Buscar por nombre, usuario, correo, puesto…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="col-auto">
              <select className="form-select form-select-sm" value={filtro} onChange={e => setFiltro(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="con_acceso">Con acceso al sistema</option>
                <option value="sin_acceso">Sin acceso al sistema</option>
              </select>
            </div>
            <div className="col-auto">
              <select className="form-select form-select-sm" value={filtroActivo} onChange={e => setFiltroActivo(e.target.value)}>
                <option value="activos">Solo activos</option>
                <option value="inactivos">Solo inactivos</option>
                <option value="todos">Todos los estados</option>
              </select>
            </div>
            <div className="col-auto ms-auto text-muted small">
              {listaFiltrada.length} registro{listaFiltrada.length !== 1 ? 's' : ''}
            </div>
          </div>

          {loading ? (
            <p className="text-muted">Cargando…</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0" style={{ fontSize: '0.9rem' }}>
                <thead className="table-light">
                  <tr>
                    <th>Nombre</th>
                    <th>Puesto</th>
                    <th>Contacto</th>
                    <th>Acceso al sistema</th>
                    <th>Contraseña</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {listaFiltrada.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-3">
                        No hay registros que coincidan.
                      </td>
                    </tr>
                  )}
                  {listaFiltrada.map(p => (
                    <tr key={p.key}>
                      {/* Nombre */}
                      <td>
                        <div className="fw-semibold">{p.nombre}</div>
                        {p.username && (
                          <div className="text-muted small">@{p.username}</div>
                        )}
                      </td>

                      {/* Puesto */}
                      <td>{p.puesto ? puestoLabel(p.puesto) : <span className="text-muted">—</span>}</td>

                      {/* Contacto */}
                      <td>
                        {p.correo && <div className="small">{p.correo}</div>}
                        {p.telefono && <div className="small text-muted">{p.telefono}</div>}
                      </td>

                      {/* Acceso */}
                      <td>
                        {p.tieneAcceso ? (
                          <span>
                            <FaUserShield className="text-primary me-1" />
                            <span className="badge text-bg-secondary">{roleLabel(p.role)}</span>
                          </span>
                        ) : (
                          <span className="text-muted small">
                            <FaUserTimes className="me-1" />Sin acceso
                          </span>
                        )}
                      </td>

                      {/* Contraseña */}
                      <td>
                        {p.tieneAcceso && p.userId ? (
                          revealed[p.userId] ? (
                            <div className="d-flex align-items-center gap-1">
                              <code className="small">{revealed[p.userId]}</code>
                              <button
                                className="btn btn-sm btn-outline-secondary py-0 px-1"
                                title="Copiar"
                                onClick={() => navigator.clipboard.writeText(revealed[p.userId])}
                              >
                                <FaCopy size={11} />
                              </button>
                              <button
                                className="btn btn-sm btn-outline-secondary py-0 px-1"
                                title="Ocultar"
                                onClick={() => hidePassword(p.userId)}
                              >
                                <FaEyeSlash size={11} />
                              </button>
                            </div>
                          ) : pwdError[p.userId] ? (
                            <span
                              className="text-danger"
                              title={pwdError[p.userId]}
                              style={{ cursor: 'default', fontSize: '1.3rem' }}
                            >
                              ⚠
                            </span>
                          ) : (
                            <button
                              className="btn btn-sm btn-outline-secondary"
                              title="Ver contraseña"
                              onClick={() => handleReveal(p)}
                            >
                              <FaEye size={12} className="me-1" />Ver
                            </button>
                          )
                        ) : (
                          <span className="text-muted small">—</span>
                        )}
                      </td>

                      {/* Estado */}
                      <td>
                        <span className={`badge ${p.activo ? 'text-bg-success' : 'text-bg-secondary'}`}>
                          {p.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>

                      {/* Acciones */}
                      <td>
                        <div className="d-flex gap-1 flex-wrap">
                          <button className="btn btn-sm btn-outline-primary" onClick={() => handleEdit(p)}>
                            Editar
                          </button>
                          <button
                            className={`btn btn-sm ${p.activo ? 'btn-outline-danger' : 'btn-outline-success'}`}
                            onClick={() => toggleActivo(p)}
                          >
                            {p.activo ? 'Desactivar' : 'Activar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal de verificación */}
      {verifyFor && (
        <VerificarModal
          onSuccess={handleVerifySuccess}
          onClose={() => setVerifyFor(null)}
        />
      )}
    </div>
  );
}
