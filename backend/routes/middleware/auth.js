// backend/middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // tu modelo de usuario actual

// --- Autenticar: verifica token y carga el usuario de la BD ---
async function proteger(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'No autorizado, falta token' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // payload lo generas tú en el login: normalmente { id, email }

    const usuario = await User.findById(payload.id).select('-password');

    if (!usuario) {
      return res.status(401).json({ message: 'Usuario no encontrado' });
    }

    req.user = usuario; // aquí tienes .role, .email, etc.
    next();
  } catch (err) {
    console.error('Error en auth:', err);
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }
}

// --- Autorizar: permitir solo ciertos roles ---
function requiereRol(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'No autorizado' });
    }

    const rolUsuario = req.user.role; // 'admin' o 'staff' según tu modelo

    if (!rolesPermitidos.includes(rolUsuario)) {
      return res.status(403).json({
        message: `Acceso denegado. Solo permitido para: ${rolesPermitidos.join(
          ', '
        )}`
      });
    }

    next();
  };
}

// 👈 ESTA línea es la clave: exporta ambas funciones
module.exports = { proteger, requiereRol };
