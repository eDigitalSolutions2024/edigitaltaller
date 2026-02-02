const jwt = require('jsonwebtoken');
const User = require('../models/User');

const sign = (user) =>
  jwt.sign(
    { id: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );


exports.register = async (req, res) => {
  try {
    const { name, workshopName, email, password } = req.body;
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ message: 'El correo ya está registrado' });

    const user = await User.create({ name, workshopName, email, password });
    const token = sign(user);
    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, workshopName: user.workshopName, email: user.email, role: user.role }
    });
  } catch (e) {
    res.status(500).json({ message: 'Error al registrar', error: e.message });
  }
};

exports.login = async (req, res) => {
  try {
    console.log('🔥 BODY LOGIN =>', req.body);

    const { email, password, workshopName } = req.body || {};

    // Validación mínima para evitar 400 raros
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: 'Email y contraseña son obligatorios' });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Credenciales inválidas' });

    if (
      workshopName &&
      user.workshopName.toLowerCase() !== workshopName.toLowerCase()
    ) {
      return res.status(401).json({ message: 'Taller incorrecto' });
    }

    const ok = await user.matchPassword(password);
    if (!ok) return res.status(401).json({ message: 'Credenciales inválidas' });

    const token = sign(user);
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        workshopName: user.workshopName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (e) {
    console.error('❌ Error en login:', e);
    res
      .status(500)
      .json({ message: 'Error al iniciar sesión', error: e.message });
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
