import { useEffect, useState } from 'react';
import {
  getUsers,
  createUser,
  updateUser,
  updateUserStatus,
  changeUserPassword
} from '../../api/users';
import '../../styles/Usuarios.css';

import { FaEye, FaEyeSlash } from 'react-icons/fa';

export default function Usuarios() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);

  const [form, setForm] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    role: 'captura'
  });

  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      setLoading(true);
      const data = await getUsers();
      setUsers(data);
    } catch (err) {
      console.error(err);
      setError('Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function resetForm() {
    setEditingId(null);
    setNewPassword('');
    setShowEditPassword(false);
    setForm({
      name: '',
      username: '',
      email: '',
      password: '',
      role: 'staff'
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMensaje('');
    setError('');

    try {
      if (editingId) {
        await updateUser(editingId, {
          name: form.name,
          username: form.username,
          email: form.email,
          role: form.role
        });

        if (newPassword.trim()) {
            await changeUserPassword(editingId, newPassword.trim());
        }
        setMensaje('Usuario actualizado correctamente');
      } else {
        await createUser(form);
        setMensaje('Usuario creado correctamente');
      }

      resetForm();
      loadUsers();
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || 'Error al guardar usuario');
    }
  }

  function handleEdit(user) {
    setEditingId(user._id);
    setNewPassword('');
    setShowEditPassword(false);
    setForm({
      name: user.name || '',
      username: user.username || '',
      email: user.email || '',
      password: '',
      role: user.role || 'staff'
    });
  }

  async function toggleStatus(user) {
    setMensaje('');
    setError('');

    try {
      await updateUserStatus(user._id, !user.isActive);
      setMensaje(user.isActive ? 'Usuario desactivado' : 'Usuario activado');
      loadUsers();
    } catch (err) {
      console.error(err);
      setError('Error al cambiar estado');
    }
  }

  return (
    <div className="usuarios-page container-fluid py-4">
      <div className="usuarios-header mb-4">
        <h1 className="usuarios-title">Administración de Usuarios</h1>
      </div>

      {mensaje && (
        <div className="alert alert-success usuarios-alert mb-3">
          {mensaje}
        </div>
      )}

      {error && (
        <div className="alert alert-danger usuarios-alert mb-3">
          {error}
        </div>
      )}

      <div className="card card-taller mb-4">
        <div className="card-header card-taller-header">
          <h5 className="card-title mb-0">
            {editingId ? 'Editar usuario' : 'Nuevo usuario'}
          </h5>
        </div>

        <div className="card-body">
          <form className="usuarios-form" onSubmit={handleSubmit}>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label">Nombre</label>
                <input
                  type="text"
                  name="name"
                  className="form-control"
                  value={form.name}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="col-md-6">
                <label className="form-label">Usuario</label>
                <input
                  type="text"
                  name="username"
                  className="form-control"
                  value={form.username}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="col-md-6">
                <label className="form-label">Correo</label>
                <input
                  type="email"
                  name="email"
                  className="form-control"
                  value={form.email}
                  onChange={handleChange}
                  required
                />
              </div>

              {!editingId && (
                <div className="col-md-6">
                    <label className="form-label">Contraseña</label>

                    <div className="input-group">
                        <input
                        type={showPassword ? "text" : "password"}
                        name="password"
                        className="form-control"
                        value={form.password}
                        onChange={handleChange}
                        required
                        />

                        <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={() => setShowPassword((v) => !v)}
                        >
                        {showPassword ? <FaEyeSlash /> : <FaEye />}
                        </button>
                    </div>
                </div>
              )}

              <div className="col-md-6">
                <label className="form-label">Rol</label>
                <select
                  name="role"
                  className="form-select"
                  value={form.role}
                  onChange={handleChange}
                >
                    <option value="admin">Admin</option>
                    <option value="mecanico">Mecánico</option>
                    <option value="recepcion">Recepción</option>
                    <option value="cajas">Cajas</option>
                    <option value="captura">Captura</option>
                    <option value="refaccionario">Refaccionario</option>
                    <option value="asesor_servicio">Asesor de servicio</option>
                    <option value="cuentas_por_pagar">Cuentas por pagar</option>
                    <option value="auditoria">Auditoría</option>
                    <option value="cuentas_por_cobrar">Cuentas por cobrar</option>
                    <option value="recursos_humanos">Recursos Humanos</option>
                </select>
              </div>
            </div>

            {editingId && (
            <div className="col-md-6 mt-3">
                <label className="form-label">Nueva contraseña</label>

                <div className="input-group">
                <input
                    type={showEditPassword ? 'text' : 'password'}
                    className="form-control"
                    placeholder="Dejar vacío para no cambiar"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={6}
                />

                <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => setShowEditPassword(v => !v)}
                >
                    {showEditPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
                </div>
            </div>
            )}

            <div className="d-flex gap-2 mt-4">
              <button type="submit" className="btn btn-taller-primary">
                {editingId ? 'Actualizar usuario' : 'Crear usuario'}
              </button>

              {editingId && (
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={resetForm}
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      <div className="card card-taller">
        <div className="card-header card-taller-header">
          <h5 className="card-title mb-0">Usuarios registrados</h5>
        </div>

        <div className="card-body">
          {loading ? (
            <p className="mb-0">Cargando usuarios...</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover usuarios-table align-middle">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Usuario</th>
                    <th>Correo</th>
                    <th>Rol</th>
                    <th>Estatus</th>
                    <th>Acciones</th>
                  </tr>
                </thead>

                <tbody>
                  {users.map((user) => (
                    <tr key={user._id}>
                      <td>{user.name}</td>
                      <td>{user.username}</td>
                      <td>{user.email}</td>
                      <td>
                        <span className="badge text-bg-secondary">
                          {user.role}
                        </span>
                      </td>
                      <td>
                        <span
                          className={
                            user.isActive
                              ? 'badge text-bg-success'
                              : 'badge text-bg-danger'
                          }
                        >
                          {user.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>
                        <div className="d-flex gap-2">
                          <button
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => handleEdit(user)}
                          >
                            Editar
                          </button>

                          <button
                            className={
                              user.isActive
                                ? 'btn btn-sm btn-outline-danger'
                                : 'btn btn-sm btn-outline-success'
                            }
                            onClick={() => toggleStatus(user)}
                          >
                            {user.isActive ? 'Desactivar' : 'Activar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {users.length === 0 && (
                    <tr>
                      <td colSpan="6" className="text-center text-muted">
                        No hay usuarios registrados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}