const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { proteger, requiereRol } = require('../middleware/auth');

// GET /api/users
router.get('/', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
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

    const exists = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }]
    });

    if (exists) {
      return res.status(400).json({ message: 'Ya existe un usuario con ese correo o usuario' });
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

    if (email || username) {
      const exists = await User.findOne({
        _id: { $ne: user._id },
        $or: [
          ...(email ? [{ email: email.toLowerCase() }] : []),
          ...(username ? [{ username: username.toLowerCase() }] : [])
        ]
      });

      if (exists) {
        return res.status(400).json({ message: 'Ya existe otro usuario con ese correo o usuario' });
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

module.exports = router;