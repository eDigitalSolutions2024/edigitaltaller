const express = require('express');
const router = express.Router();

const TipoCambio = require('../models/TipoCambio');
const UnidadMedida = require('../models/UnidadMedida');
const Mecanico = require('../models/Mecanico');

const { proteger, requiereRol } = require('../middleware/auth');

// ===============================
// TIPO DE CAMBIO
// ===============================

// GET /api/configuracion/tipo-cambio
router.get('/tipo-cambio', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const tipos = await TipoCambio.find().sort({ fecha: -1, createdAt: -1 });
    res.json(tipos);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener tipos de cambio', error: error.message });
  }
});

// GET /api/configuracion/tipo-cambio/ultimo
router.get('/tipo-cambio/ultimo', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const ultimo = await TipoCambio.findOne().sort({ fecha: -1, createdAt: -1 });
    res.json(ultimo);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener último tipo de cambio', error: error.message });
  }
});

// POST /api/configuracion/tipo-cambio
router.post('/tipo-cambio', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { valor, fecha } = req.body;

    if (!valor || !fecha) {
      return res.status(400).json({ message: 'El tipo de cambio y la fecha son obligatorios' });
    }

    if (Number(valor) <= 0) {
      return res.status(400).json({ message: 'El tipo de cambio debe ser mayor a 0' });
    }

    const nuevo = await TipoCambio.create({
      valor: Number(valor),
      fecha
    });

    res.status(201).json(nuevo);
  } catch (error) {
    res.status(500).json({ message: 'Error al guardar tipo de cambio', error: error.message });
  }
});

// ===============================
// UNIDADES DE MEDIDA
// ===============================

// GET /api/configuracion/unidades-medida
router.get('/unidades-medida', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const unidades = await UnidadMedida.find().sort({ nombre: 1 });
    res.json(unidades);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener unidades de medida', error: error.message });
  }
});

// POST /api/configuracion/unidades-medida
router.post('/unidades-medida', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { nombre } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ message: 'La unidad de medida es obligatoria' });
    }

    const exists = await UnidadMedida.findOne({
      nombre: nombre.trim()
    });

    if (exists) {
      return res.status(400).json({ message: 'Ya existe esa unidad de medida' });
    }

    const unidad = await UnidadMedida.create({
      nombre: nombre.trim()
    });

    res.status(201).json(unidad);
  } catch (error) {
    res.status(500).json({ message: 'Error al guardar unidad de medida', error: error.message });
  }
});

// PATCH /api/configuracion/unidades-medida/:id/status
router.patch('/unidades-medida/:id/status', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { activo } = req.body;

    const unidad = await UnidadMedida.findById(req.params.id);

    if (!unidad) {
      return res.status(404).json({ message: 'Unidad de medida no encontrada' });
    }

    unidad.activo = Boolean(activo);
    await unidad.save();

    res.json(unidad);
  } catch (error) {
    res.status(500).json({ message: 'Error al cambiar estatus de unidad', error: error.message });
  }
});

// ===============================
// MECÁNICOS
// ===============================

// GET /api/configuracion/mecanicos
router.get('/mecanicos', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const mecanicos = await Mecanico.find().sort({ nombre: 1 });
    res.json(mecanicos);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener mecánicos', error: error.message });
  }
});

// POST /api/configuracion/mecanicos
router.post('/mecanicos', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { nombre, telefono } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ message: 'El nombre del mecánico es obligatorio' });
    }

    const mecanico = await Mecanico.create({
      nombre: nombre.trim(),
      telefono: telefono || ''
    });

    res.status(201).json(mecanico);
  } catch (error) {
    res.status(500).json({ message: 'Error al guardar mecánico', error: error.message });
  }
});

// PATCH /api/configuracion/mecanicos/:id/status
router.patch('/mecanicos/:id/status', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { activo } = req.body;

    const mecanico = await Mecanico.findById(req.params.id);

    if (!mecanico) {
      return res.status(404).json({ message: 'Mecánico no encontrado' });
    }

    mecanico.activo = Boolean(activo);
    await mecanico.save();

    res.json(mecanico);
  } catch (error) {
    res.status(500).json({ message: 'Error al cambiar estatus del mecánico', error: error.message });
  }
});

module.exports = router;