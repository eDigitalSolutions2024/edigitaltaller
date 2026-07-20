// backend/routes/grupos.js
const express = require('express');
const router = express.Router();

const Grupo = require('../models/Grupo');
const User = require('../models/User');
const { proteger, requiereRol } = require('../middleware/auth');

const POPULATE_MIEMBROS = 'name username role isActive';

/**
 * Grupos (activos o no) a los que el usuario autenticado alguna vez perteneció.
 * GET /api/grupos/mis-grupos
 * Accesible a cualquier usuario autenticado — el frontend lo usa para saber si
 * puede editar una orden creada por un compañero de grupo (acceso permanente,
 * igual que en /vehiculos/mis-ordenes).
 */
router.get('/mis-grupos', proteger, async (req, res) => {
  try {
    const grupos = await Grupo.find({
      rol: req.user.role,
      historialMiembros: req.user._id,
    }).select('_id');

    res.json(grupos.map((g) => String(g._id)));
  } catch (error) {
    console.error('Error obteniendo mis-grupos:', error);
    res.status(500).json({ mensaje: 'Error al obtener los grupos', error: error.message });
  }
});

/**
 * Listar grupos
 * GET /api/grupos
 * ?activo=true|false
 */
router.get('/', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const filtros = {};
    if (req.query.activo === 'true') filtros.activo = true;
    if (req.query.activo === 'false') filtros.activo = false;

    const grupos = await Grupo.find(filtros)
      .populate('miembros', POPULATE_MIEMBROS)
      .populate('creadoPor', 'name username')
      .sort({ createdAt: -1 });

    res.json(grupos);
  } catch (error) {
    console.error('Error listando grupos:', error);
    res.status(500).json({ mensaje: 'Error al obtener los grupos', error: error.message });
  }
});

/**
 * Crear grupo
 * POST /api/grupos
 * body: { nombre, rol, miembros: [userId,...] }
 */
router.post('/', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { nombre, rol, miembros } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ mensaje: 'El nombre del grupo es obligatorio' });
    }
    if (!rol) {
      return res.status(400).json({ mensaje: 'El rol del grupo es obligatorio' });
    }
    const miembrosIds = Array.isArray(miembros) ? [...new Set(miembros.filter(Boolean))] : [];
    if (miembrosIds.length < 2) {
      return res.status(400).json({ mensaje: 'Un grupo debe tener al menos 2 miembros' });
    }

    const usuarios = await User.find({ _id: { $in: miembrosIds } }).select('_id role');
    if (usuarios.length !== miembrosIds.length) {
      return res.status(400).json({ mensaje: 'Uno o más miembros seleccionados no existen' });
    }
    const rolDistinto = usuarios.some((u) => u.role !== rol);
    if (rolDistinto) {
      return res.status(400).json({ mensaje: 'Todos los miembros deben tener el mismo rol que el grupo' });
    }

    const yaEnGrupoActivo = await Grupo.findOne({
      activo: true,
      miembros: { $in: miembrosIds },
    }).select('nombre');
    if (yaEnGrupoActivo) {
      return res.status(400).json({
        mensaje: `Uno o más miembros ya pertenecen al grupo activo "${yaEnGrupoActivo.nombre}"`,
      });
    }

    const grupo = await Grupo.create({
      nombre: nombre.trim(),
      rol,
      miembros: miembrosIds,
      historialMiembros: miembrosIds,
      creadoPor: req.user._id,
      activo: true,
    });

    const grupoCompleto = await Grupo.findById(grupo._id)
      .populate('miembros', POPULATE_MIEMBROS)
      .populate('creadoPor', 'name username');

    res.status(201).json(grupoCompleto);
  } catch (error) {
    console.error('Error creando grupo:', error);
    res.status(500).json({ mensaje: 'Error al crear el grupo', error: error.message });
  }
});

/**
 * Editar grupo (nombre y/o miembros)
 * PUT /api/grupos/:id
 * body: { nombre?, miembros? }
 */
router.put('/:id', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const grupo = await Grupo.findById(req.params.id);
    if (!grupo) {
      return res.status(404).json({ mensaje: 'Grupo no encontrado' });
    }

    const { nombre, miembros } = req.body;

    if (nombre !== undefined) {
      if (!nombre.trim()) {
        return res.status(400).json({ mensaje: 'El nombre del grupo es obligatorio' });
      }
      grupo.nombre = nombre.trim();
    }

    if (miembros !== undefined) {
      const miembrosIds = Array.isArray(miembros) ? [...new Set(miembros.filter(Boolean))] : [];
      if (miembrosIds.length < 2) {
        return res.status(400).json({ mensaje: 'Un grupo debe tener al menos 2 miembros' });
      }

      const usuarios = await User.find({ _id: { $in: miembrosIds } }).select('_id role');
      if (usuarios.length !== miembrosIds.length) {
        return res.status(400).json({ mensaje: 'Uno o más miembros seleccionados no existen' });
      }
      const rolDistinto = usuarios.some((u) => u.role !== grupo.rol);
      if (rolDistinto) {
        return res.status(400).json({ mensaje: 'Todos los miembros deben tener el mismo rol que el grupo' });
      }

      // Solo se valida doble-membresía activa para los miembros nuevos que se agregan.
      const idsActuales = new Set(grupo.miembros.map(String));
      const nuevosIds = miembrosIds.filter((id) => !idsActuales.has(String(id)));
      if (nuevosIds.length) {
        const yaEnGrupoActivo = await Grupo.findOne({
          _id: { $ne: grupo._id },
          activo: true,
          miembros: { $in: nuevosIds },
        }).select('nombre');
        if (yaEnGrupoActivo) {
          return res.status(400).json({
            mensaje: `Uno o más miembros ya pertenecen al grupo activo "${yaEnGrupoActivo.nombre}"`,
          });
        }
      }

      grupo.miembros = miembrosIds;
      const historial = new Set(grupo.historialMiembros.map(String));
      miembrosIds.forEach((id) => historial.add(String(id)));
      grupo.historialMiembros = [...historial];
    }

    await grupo.save();

    const grupoCompleto = await Grupo.findById(grupo._id)
      .populate('miembros', POPULATE_MIEMBROS)
      .populate('creadoPor', 'name username');

    res.json(grupoCompleto);
  } catch (error) {
    console.error('Error actualizando grupo:', error);
    res.status(500).json({ mensaje: 'Error al actualizar el grupo', error: error.message });
  }
});

/**
 * Activar / desactivar grupo (separar)
 * PATCH /api/grupos/:id/status
 * body: { activo: true/false }
 */
router.patch('/:id/status', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { activo } = req.body;
    if (typeof activo !== 'boolean') {
      return res.status(400).json({ mensaje: 'El campo "activo" debe ser booleano' });
    }

    const grupo = await Grupo.findByIdAndUpdate(req.params.id, { activo }, { new: true })
      .populate('miembros', POPULATE_MIEMBROS)
      .populate('creadoPor', 'name username');

    if (!grupo) {
      return res.status(404).json({ mensaje: 'Grupo no encontrado' });
    }

    res.json(grupo);
  } catch (error) {
    console.error('Error cambiando estado de grupo:', error);
    res.status(500).json({ mensaje: 'Error al cambiar el estado del grupo', error: error.message });
  }
});

module.exports = router;
