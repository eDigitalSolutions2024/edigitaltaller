const jwt = require('jsonwebtoken');
const User = require('../models/User');

const sign = (user) =>
  jwt.sign(
    { id: user._id, email: user.email, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

exports.register = async (req, res) => {
  try {
    const { name, workshopName, username, email, password } = req.body;

    if (!name || !username || !email || !password) {
      return res.status(400).json({
        message: 'Nombre, usuario, correo y contraseña son obligatorios'
      });
    }

    const exists = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { username: username.toLowerCase() }
      ]
    });

    if (exists) {
      return res.status(409).json({
        message: 'El correo o usuario ya está registrado'
      });
    }

    const user = await User.create({
      name,
      workshopName,
      username,
      email,
      password
    });

    const token = sign(user);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        workshopName: user.workshopName,
        email: user.email,
        role: user.role
      }
    });
  } catch (e) {
    res.status(500).json({ message: 'Error al registrar', error: e.message });
  }
};

exports.login = async (req, res) => {
  try {
    console.log('🔥 BODY LOGIN =>', req.body);

    const { login, username, email, password, workshopName } = req.body || {};

    const identifier = login || username || email;

    if (!identifier || !password) {
      return res.status(400).json({
        message: 'Usuario/correo y contraseña son obligatorios'
      });
    }

    const normalized = identifier.toLowerCase().trim();

    const user = await User.findOne({
      $or: [
        { email: normalized },
        { username: normalized }
      ]
    });

    if (!user) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        message: 'Usuario inactivo. Contacta al administrador.'
      });
    }

    if (
      workshopName &&
      user.workshopName &&
      user.workshopName.toLowerCase() !== workshopName.toLowerCase()
    ) {
      return res.status(401).json({ message: 'Taller incorrecto' });
    }

    const ok = await user.matchPassword(password);

    if (!ok) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const token = sign(user);

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        workshopName: user.workshopName,
        email: user.email,
        role: user.role,
        isActive: user.isActive
      }
    });
  } catch (e) {
    console.error('❌ Error en login:', e);
    res.status(500).json({
      message: 'Error al iniciar sesión',
      error: e.message
    });
  }
};

exports.me = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (e) {
    res.status(500).json({ message: 'Error', error: e.message });
  }
};