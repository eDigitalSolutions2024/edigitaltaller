// routes/empleados.js
const express = require('express');
const router = express.Router();

const Empleado = require('../models/Empleado'); // 👈 YA NO Usuario
const { proteger, requiereRol } = require('../middleware/auth');

/**
 * Crear empleado
 * POST /api/empleados
 * Solo jefe o admin pueden crear empleados
 */
router.post(
  '/',
  proteger,
  requiereRol('jefe', 'admin'),
  async (req, res) => {
    try {
      const { nombre, puesto, telefono, correo, fechaAlta, notas } = req.body;

      if (!nombre) {
        return res
          .status(400)
          .json({ mensaje: 'El nombre del empleado es obligatorio' });
      }

      const nuevoEmpleado = new Empleado({
        nombre,
        puesto,
        telefono,
        correo,
        fechaAlta,
        notas
      });

      const guardado = await nuevoEmpleado.save();
      res.status(201).json(guardado);
    } catch (error) {
      console.error('Error creando empleado:', error);
      res
        .status(500)
        .json({ mensaje: 'Error al crear el empleado', error: error.message });
    }
  }
);

/**
 * Listar empleados (con filtros opcionales)
 * GET /api/empleados
 * ?activo=true|false
 * ?puesto=mecanico
 * Cualquier usuario autenticado puede verlos (si quieres)
 */
router.get('/', proteger, async (req, res) => {
  try {
    const filtros = {};

    if (req.query.activo === 'true') filtros.activo = true;
    if (req.query.activo === 'false') filtros.activo = false;
    if (req.query.puesto) filtros.puesto = req.query.puesto;

    const empleados = await Empleado.find(filtros)
      .sort({ nombre: 1 })
      .lean();

    res.json(empleados);
  } catch (error) {
    console.error('Error listando empleados:', error);
    res
      .status(500)
      .json({ mensaje: 'Error al obtener los empleados', error: error.message });
  }
});

/**
 * Obtener un empleado por ID
 * GET /api/empleados/:id
 */
router.get('/:id', proteger, async (req, res) => {
  try {
    const empleado = await Empleado.findById(req.params.id);

    if (!empleado) {
      return res.status(404).json({ mensaje: 'Empleado no encontrado' });
    }

    res.json(empleado);
  } catch (error) {
    console.error('Error obteniendo empleado:', error);
    res
      .status(500)
      .json({ mensaje: 'Error al obtener el empleado', error: error.message });
  }
});

/**
 * Actualizar empleado
 * PUT /api/empleados/:id
 * jefe, admin o contabilidad pueden editar datos
 */
router.put(
  '/:id',
  proteger,
  requiereRol('jefe', 'admin', 'contabilidad'),
  async (req, res) => {
    try {
      const { nombre, puesto, telefono, correo, fechaAlta, notas, activo } =
        req.body;

      const actualizado = await Empleado.findByIdAndUpdate(
        req.params.id,
        {
          nombre,
          puesto,
          telefono,
          correo,
          fechaAlta,
          notas,
          ...(typeof activo === 'boolean' ? { activo } : {})
        },
        { new: true, runValidators: true }
      );

      if (!actualizado) {
        return res.status(404).json({ mensaje: 'Empleado no encontrado' });
      }

      res.json(actualizado);
    } catch (error) {
      console.error('Error actualizando empleado:', error);
      res.status(500).json({
        mensaje: 'Error al actualizar el empleado',
        error: error.message
      });
    }
  }
);

/**
 * Activar / desactivar empleado (cambio rápido de estado)
 * PATCH /api/empleados/:id/estado
 * body: { activo: true/false }
 * Solo jefe o admin
 */
router.patch(
  '/:id/estado',
  proteger,
  requiereRol('jefe', 'admin'),
  async (req, res) => {
    try {
      const { activo } = req.body;

      if (typeof activo !== 'boolean') {
        return res
          .status(400)
          .json({ mensaje: 'El campo "activo" debe ser booleano' });
      }

      const empleado = await Empleado.findByIdAndUpdate(
        req.params.id,
        { activo },
        { new: true }
      );

      if (!empleado) {
        return res.status(404).json({ mensaje: 'Empleado no encontrado' });
      }

      res.json(empleado);
    } catch (error) {
      console.error('Error cambiando estado de empleado:', error);
      res.status(500).json({
        mensaje: 'Error al cambiar el estado del empleado',
        error: error.message
      });
    }
  }
);

module.exports = router;
