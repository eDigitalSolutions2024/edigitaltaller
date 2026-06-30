const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { decrypt } = require('../utils/encryption');
const { proteger, requiereRol } = require('../middleware/auth');

// GET /api/users/asesores — lista de asesores activos (accesible a todos los roles autenticados)
router.get('/asesores', proteger, async (req, res) => {
  try {
    const asesores = await User.find({ role: 'asesor_servicio', isActive: true })
      .select('_id name username')
      .sort({ name: 1 });
    res.json(asesores);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener asesores', error: error.message });
  }
});

// GET /api/users
router.get('/', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const users = await User.find()
      .select('-password -passwordEncrypted')
      .populate('employee', 'nombre nombreCompleto puesto')
      .sort({ createdAt: -1 });

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener usuarios', error: error.message });
  }
});

// POST /api/users
router.post('/', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const {
      name,
      username,
      email,
      password,
      role,
      telefono,
      celular,
      serie,
      serieLlantera,
      employee
    } = req.body;

    if (!name || !username || !email || !password) {
      return res.status(400).json({ message: 'Nombre, usuario, correo y contraseña son obligatorios' });
    }

    // ✅ Después
    const exists = await User.findOne({ username: username.toLowerCase() });

    if (exists) {
      return res.status(400).json({ message: 'Ya existe un usuario con ese nombre de usuario' });
    }

    const user = await User.create({
      name,
      username,
      email,
      password,
      role: role || 'captura',
      telefono,
      celular,
      serie,
      serieLlantera,
      employee: employee || null
    });

    const cleanUser = await User.findById(user._id).select('-password');

    res.status(201).json(cleanUser);
  } catch (error) {
    res.status(500).json({ message: 'Error al crear usuario', error: error.message });
  }
});

// PUT /api/users/:id
router.put('/:id', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const {
      name,
      username,
      email,
      role,
      telefono,
      celular,
      serie,
      serieLlantera,
      employee,
      isActive
    } = req.body;

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // ✅ Después
    if (username) {
      const exists = await User.findOne({
        _id: { $ne: user._id },
        username: username.toLowerCase()
      });

      if (exists) {
        return res.status(400).json({ message: 'Ya existe otro usuario con ese nombre de usuario' });
      }
    }

    user.name = name ?? user.name;
    user.username = username ?? user.username;
    user.email = email ?? user.email;
    user.role = role ?? user.role;
    user.telefono = telefono ?? user.telefono;
    user.celular = celular ?? user.celular;
    user.serie = serie ?? user.serie;
    user.serieLlantera = serieLlantera ?? user.serieLlantera;
    user.employee = employee === '' ? null : employee ?? user.employee;
    user.isActive = typeof isActive === 'boolean' ? isActive : user.isActive;

    await user.save();

    const cleanUser = await User.findById(user._id).select('-password');

    res.json(cleanUser);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar usuario', error: error.message });
  }
});

// PATCH /api/users/:id/password
router.patch('/:id/password', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'La contraseña debe tener mínimo 6 caracteres' });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    user.password = password;
    await user.save();

    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    res.status(500).json({ message: 'Error al cambiar contraseña', error: error.message });
  }
});

// PATCH /api/users/:id/status
router.patch('/:id/status', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { isActive } = req.body;

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    user.isActive = Boolean(isActive);
    await user.save();

    const cleanUser = await User.findById(user._id).select('-password');

    res.json(cleanUser);
  } catch (error) {
    res.status(500).json({ message: 'Error al cambiar estatus', error: error.message });
  }
});

// POST /api/users/verify-admin-password
// El admin verifica su propia contraseña; devuelve un token de 60 s para revelar contraseñas
router.post('/verify-admin-password', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ message: 'Contraseña requerida' });
    }

    const admin = await User.findById(req.user._id || req.user.id);
    const match = await admin.matchPassword(password);
    if (!match) {
      return res.status(401).json({ message: 'Contraseña incorrecta' });
    }

    const token = jwt.sign(
      { adminId: String(req.user._id || req.user.id), type: 'pwd_reveal' },
      process.env.JWT_SECRET,
      { expiresIn: '60s' }
    );

    res.json({ token });
  } catch (error) {
    res.status(500).json({ message: 'Error al verificar contraseña', error: error.message });
  }
});

// GET /api/users/:id/password-reveal
// Devuelve la contraseña descifrada; requiere el token de verificación (60 s)
router.get('/:id/password-reveal', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { revealToken } = req.query;
    if (!revealToken) {
      return res.status(401).json({ message: 'Token de verificación requerido' });
    }

    let payload;
    try {
      payload = jwt.verify(revealToken, process.env.JWT_SECRET);
    } catch (_) {
      return res.status(401).json({ message: 'Token expirado o inválido' });
    }

    if (payload.type !== 'pwd_reveal') {
      return res.status(401).json({ message: 'Token inválido' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    if (user.role === 'admin' && String(user._id) !== String(req.user._id || req.user.id)) {
      return res.status(403).json({ message: 'No tienes permiso para ver la contraseña de otro administrador' });
    }
    if (!user.passwordEncrypted) {
      return res.status(404).json({ message: 'Contraseña no disponible para este usuario' });
    }

    const password = decrypt(user.passwordEncrypted);
    res.json({ password });
  } catch (error) {
    res.status(500).json({ message: 'Error al revelar contraseña', error: error.message });
  }
});

module.exports = router;