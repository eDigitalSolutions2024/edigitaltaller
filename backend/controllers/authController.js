const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const User         = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const { encrypt }  = require('../utils/encryption');

// ─── Helpers ────────────────────────────────────────────────────────────────

const REFRESH_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 días

/** Access token — 30 minutos */
const signAccess = (user) =>
  jwt.sign(
    { id: user._id, email: user.email, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '30m' }  // access token — 30 minutos
  );

/** Genera un refresh token seguro aleatorio */
const generateRefreshToken = () => crypto.randomBytes(40).toString('hex');

/** Hashea el token para guardarlo en BD (nunca el valor plano) */
const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

/** Opciones de la cookie del refresh token */
const cookieOpts = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  maxAge:   REFRESH_TTL_MS,
};

// ─── Formato de usuario para respuesta ──────────────────────────────────────

const userPayload = (user) => ({
  id:           user._id,
  name:         user.name,
  username:     user.username,
  workshopName: user.workshopName,
  email:        user.email,
  role:         user.role,
  isActive:     user.isActive,
});

// ─── Controllers ────────────────────────────────────────────────────────────

exports.register = async (req, res) => {
  try {
    const { name, workshopName, username, email, password } = req.body;

    if (!name || !username || !email || !password) {
      return res.status(400).json({
        message: 'Nombre, usuario, correo y contraseña son obligatorios'
      });
    }

    const exists = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }]
    });

    if (exists) {
      return res.status(409).json({ message: 'El correo o usuario ya está registrado' });
    }

    const user = await User.create({ name, workshopName, username, email, password });

    const accessToken      = signAccess(user);
    const refreshTokenValue = generateRefreshToken();

    await RefreshToken.create({
      tokenHash: hashToken(refreshTokenValue),
      userId:    user._id,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });

    res.cookie('refreshToken', refreshTokenValue, cookieOpts);

    res.status(201).json({ accessToken, user: userPayload(user) });
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
      return res.status(400).json({ message: 'Usuario/correo y contraseña son obligatorios' });
    }

    const normalized = identifier.toLowerCase().trim();

    const user = await User.findOne({
      $or: [{ email: normalized }, { username: normalized }]
    });

    if (!user) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Usuario inactivo. Contacta al administrador.' });
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

    // Migración silenciosa: si el usuario existe antes del sistema de cifrado,
    // guardamos la contraseña cifrada en este login sin disparar el pre-save hook
    if (!user.passwordEncrypted) {
      try {
        await User.updateOne(
          { _id: user._id },
          { $set: { passwordEncrypted: encrypt(password) } }
        );
      } catch (_) {
        // No bloqueamos el login si falla el cifrado
      }
    }

    const accessToken       = signAccess(user);
    const refreshTokenValue = generateRefreshToken();

    await RefreshToken.create({
      tokenHash: hashToken(refreshTokenValue),
      userId:    user._id,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });

    res.cookie('refreshToken', refreshTokenValue, cookieOpts);

    res.json({ accessToken, user: userPayload(user) });
  } catch (e) {
    console.error('❌ Error en login:', e);
    res.status(500).json({ message: 'Error al iniciar sesión', error: e.message });
  }
};

exports.refresh = async (req, res) => {
  try {
    const refreshTokenValue = req.cookies?.refreshToken;

    if (!refreshTokenValue) {
      return res.status(401).json({ message: 'Sin refresh token' });
    }

    const tokenHash = hashToken(refreshTokenValue);
    const stored    = await RefreshToken.findOne({ tokenHash });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      return res.status(401).json({ message: 'Refresh token inválido o expirado' });
    }

    // Verificar que el usuario siga activo
    const user = await User.findById(stored.userId).select('-password');
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Usuario inactivo o no encontrado' });
    }

    // Rotar: revocar el token viejo y emitir uno nuevo
    stored.revokedAt = new Date();
    await stored.save();

    const newRefreshTokenValue = generateRefreshToken();

    await RefreshToken.create({
      tokenHash: hashToken(newRefreshTokenValue),
      userId:    user._id,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });

    const newAccessToken = signAccess(user);

    res.cookie('refreshToken', newRefreshTokenValue, cookieOpts);

    res.json({ accessToken: newAccessToken, user: userPayload(user) });
  } catch (e) {
    console.error('❌ Error en refresh:', e);
    res.status(500).json({ message: 'Error al refrescar sesión', error: e.message });
  }
};

exports.logout = async (req, res) => {
  try {
    const refreshTokenValue = req.cookies?.refreshToken;

    if (refreshTokenValue) {
      const tokenHash = hashToken(refreshTokenValue);
      await RefreshToken.findOneAndUpdate({ tokenHash }, { revokedAt: new Date() });
    }

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    });

    res.json({ message: 'Sesión cerrada correctamente' });
  } catch (e) {
    res.status(500).json({ message: 'Error al cerrar sesión', error: e.message });
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
