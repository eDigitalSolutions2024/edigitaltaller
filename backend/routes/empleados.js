// routes/empleados.js
const express = require('express');
const router = express.Router();

const Empleado = require('../models/Empleado'); // 👈 YA NO Usuario
const User = require('../models/User');
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
      .populate('usuario', '_id name username email role isActive')
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
 * Roster unificado de "personal": Empleados (con o sin usuario vinculado) +
 * Usuarios que no tienen ficha de Empleado (alta "solo_usuario" desde
 * Administración → Personal, ver frontend/src/pages/admin/Personal.jsx).
 * Mismo criterio de merge que esa pantalla, pero accesible a cualquier rol
 * autenticado (a diferencia de GET /api/users, que es admin-only) porque lo
 * usa el botón "Empleados" de Nueva Orden de Servicio, al que entran asesores,
 * cajas, mecánicos, etc. Debe ir ANTES de GET /:id para que "personal" no se
 * interprete como un id.
 * GET /api/empleados/personal  ?activo=false para incluir inactivos
 */
router.get('/personal', proteger, async (req, res) => {
  try {
    const soloActivos = req.query.activo !== 'false';

    const [empleados, usuarios] = await Promise.all([
      Empleado.find(soloActivos ? { activo: true } : {})
        .populate('usuario', '_id name role isActive')
        .sort({ nombre: 1 })
        .lean(),
      User.find(soloActivos ? { isActive: true } : {})
        .select('_id name role isActive employee')
        .lean(),
    ]);

    const usuarioIdsEnEmpleados = new Set(
      empleados.filter((e) => e.usuario).map((e) => String(e.usuario._id))
    );

    const lista = empleados.map((emp) => ({
      empleadoId: emp._id,
      userId: emp.usuario?._id || null,
      nombre: emp.nombre,
      puesto: emp.puesto,
      role: emp.usuario?.role || null,
    }));

    for (const u of usuarios) {
      if (!u.employee && !usuarioIdsEnEmpleados.has(String(u._id))) {
        lista.push({
          empleadoId: null,
          userId: u._id,
          nombre: u.name,
          puesto: null,
          role: u.role,
        });
      }
    }

    lista.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
    res.json(lista);
  } catch (error) {
    console.error('Error listando personal:', error);
    res.status(500).json({ mensaje: 'Error al obtener el personal', error: error.message });
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
      const { nombre, puesto, telefono, correo, fechaAlta, notas, activo, usuario } =
        req.body;

      const update = {
        nombre,
        puesto,
        telefono,
        correo,
        fechaAlta,
        notas,
        ...(typeof activo === 'boolean' ? { activo } : {}),
        ...(usuario !== undefined ? { usuario: usuario || null } : {})
      };

      const actualizado = await Empleado.findByIdAndUpdate(
        req.params.id,
        update,
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
