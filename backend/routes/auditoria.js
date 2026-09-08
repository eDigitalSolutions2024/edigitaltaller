// backend/routes/auditoria.js
//
// Lectura del log de actividad del sistema (RegistroAccion). SOLO rol 'admin'.
// Lo alimentan middleware/auditoria.js (origen 'auto') y utils/registrarAccion.js
// (origen 'manual'). Retención 15 días vía índice TTL del modelo; además aquí se
// filtra por createdAt para no devolver nada fuera de esa ventana.

const express = require('express');
const router = express.Router();
const RegistroAccion = require('../models/RegistroAccion');
const { proteger, requiereRol } = require('../middleware/auth');

const RETENCION_DIAS = RegistroAccion.RETENCION_DIAS || 15;
const RETENCION_MS = RETENCION_DIAS * 24 * 60 * 60 * 1000;

const ventanaMin = () => new Date(Date.now() - RETENCION_MS);

// Escapa una cadena para usarla literal dentro de un RegExp.
const escaparRegex = (s) => String(s).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.use(proteger, requiereRol('admin'));

// GET /api/auditoria/registro/filtros
// Valores presentes en la ventana de retención, para poblar los selects.
router.get('/registro/filtros', async (_req, res) => {
  try {
    const desde = ventanaMin();
    const base = { createdAt: { $gte: desde } };
    const [usuarios, acciones, entidades, roles] = await Promise.all([
      RegistroAccion.distinct('usuario', { ...base, usuario: { $nin: ['', null] } }),
      RegistroAccion.distinct('accion', base),
      RegistroAccion.distinct('entidad', { ...base, entidad: { $nin: ['', null] } }),
      RegistroAccion.distinct('rol', { ...base, rol: { $nin: ['', null] } }),
    ]);
    res.json({
      usuarios: usuarios.sort((a, b) => a.localeCompare(b, 'es')),
      acciones: acciones.sort(),
      entidades: entidades.sort(),
      roles: roles.sort(),
      retencionDias: RETENCION_DIAS,
    });
  } catch (err) {
    console.error('GET /auditoria/registro/filtros:', err);
    res.status(500).json({ message: 'Error al obtener los filtros del registro' });
  }
});

// GET /api/auditoria/registro
// Query: page, limit, q, usuario, accion, entidad, rol, origen, ok, desde, hasta
router.get('/registro', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));

    const q = {};

    // Ventana de retención, siempre.
    const rango = { $gte: ventanaMin() };
    if (req.query.desde) {
      const d = new Date(req.query.desde);
      if (!Number.isNaN(d.getTime()) && d > rango.$gte) rango.$gte = d;
    }
    if (req.query.hasta) {
      const h = new Date(req.query.hasta);
      if (!Number.isNaN(h.getTime())) rango.$lte = h;
    }
    q.createdAt = rango;

    if (req.query.usuario) q.usuario = new RegExp(escaparRegex(req.query.usuario), 'i');
    if (req.query.accion) q.accion = String(req.query.accion).trim();
    if (req.query.entidad) q.entidad = String(req.query.entidad).trim();
    if (req.query.rol) q.rol = String(req.query.rol).trim();
    if (req.query.origen === 'auto' || req.query.origen === 'manual') q.origen = req.query.origen;
    if (req.query.ok === 'true') q.ok = true;
    if (req.query.ok === 'false') q.ok = false;

    if (req.query.q) {
      const rx = new RegExp(escaparRegex(req.query.q), 'i');
      q.$or = [
        { usuario: rx },
        { accion: rx },
        { entidad: rx },
        { referencia: rx },
        { ruta: rx },
      ];
    }

    const [rows, total] = await Promise.all([
      RegistroAccion.find(q)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      RegistroAccion.countDocuments(q),
    ]);

    res.json({
      rows,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      limit,
      retencionDias: RETENCION_DIAS,
    });
  } catch (err) {
    console.error('GET /auditoria/registro:', err);
    res.status(500).json({ message: 'Error al obtener el registro de actividad' });
  }
});

module.exports = router;
