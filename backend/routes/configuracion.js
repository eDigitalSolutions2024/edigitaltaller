const express = require('express');
const router = express.Router();

const TipoCambio = require('../models/TipoCambio');
const UnidadMedida = require('../models/UnidadMedida');
const Mecanico = require('../models/Mecanico');
const Contador = require('../models/Contador');

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
router.get('/unidades-medida', proteger, async (req, res) => {
  try {
    const unidades = await UnidadMedida.find().sort({ nombre: 1 }).lean();
    // Normalizar docs viejos que no tienen el campo activo (undefined → true)
    const normalizadas = unidades.map(u => ({
      ...u,
      activo: u.activo !== false,
    }));
    res.json(normalizadas);
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
      nombre: nombre.trim(),
      activo: true,
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
// CONTADOR DE ORDEN DE SERVICIO (auto-increment estilo MySQL)
// ===============================

const ORDEN_SERVICIO_CONTADOR = 'ordenServicio';

// GET /api/configuracion/orden-servicio-contador
// (sin restricción de rol: cualquier usuario autenticado puede consultarlo,
// por ejemplo para mostrar la vista previa del próximo folio al crear una orden)
router.get('/orden-servicio-contador', proteger, async (req, res) => {
  try {
    const contador = await Contador.findOne({ nombre: ORDEN_SERVICIO_CONTADOR });
    res.json({ valor: contador?.valor || 0 });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el contador de órdenes de servicio', error: error.message });
  }
});

// PUT /api/configuracion/orden-servicio-contador
router.put('/orden-servicio-contador', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { valor } = req.body;
    const valorNum = Number(valor);

    if (valor === undefined || valor === null || Number.isNaN(valorNum) || valorNum < 0) {
      return res.status(400).json({ message: 'El valor debe ser un número mayor o igual a 0' });
    }

    const contador = await Contador.findOneAndUpdate(
      { nombre: ORDEN_SERVICIO_CONTADOR },
      { $set: { valor: valorNum } },
      { new: true, upsert: true }
    );

    res.json({ valor: contador.valor });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar el contador de órdenes de servicio', error: error.message });
  }
});

// ===============================
// CONTADOR DE VALE DE SALIDA (auto-increment estilo MySQL)
// ===============================

const VALE_SALIDA_CONTADOR = 'valeSalida';

// GET /api/configuracion/vale-contador
// (sin restricción de rol: cualquier usuario autenticado puede consultarlo,
// por ejemplo para mostrar la vista previa del próximo folio al emitir un vale)
router.get('/vale-contador', proteger, async (req, res) => {
  try {
    const contador = await Contador.findOne({ nombre: VALE_SALIDA_CONTADOR });
    res.json({ valor: contador?.valor || 0 });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el contador de vales de salida', error: error.message });
  }
});

// PUT /api/configuracion/vale-contador
router.put('/vale-contador', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { valor } = req.body;
    const valorNum = Number(valor);

    if (valor === undefined || valor === null || Number.isNaN(valorNum) || valorNum < 0) {
      return res.status(400).json({ message: 'El valor debe ser un número mayor o igual a 0' });
    }

    const contador = await Contador.findOneAndUpdate(
      { nombre: VALE_SALIDA_CONTADOR },
      { $set: { valor: valorNum } },
      { new: true, upsert: true }
    );

    res.json({ valor: contador.valor });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar el contador de vales de salida', error: error.message });
  }
});

// ===============================
// CONTADOR DE DEVOLUCIÓN DE REFACCIÓN (número consecutivo del formato impreso)
// ===============================

const DEVOLUCION_REFACCION_CONTADOR = 'devolucionRefaccion';

// GET /api/configuracion/devolucion-refaccion-contador
router.get('/devolucion-refaccion-contador', proteger, async (req, res) => {
  try {
    const contador = await Contador.findOne({ nombre: DEVOLUCION_REFACCION_CONTADOR });
    res.json({ valor: contador?.valor || 0 });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el contador de devoluciones de refacción', error: error.message });
  }
});

// PUT /api/configuracion/devolucion-refaccion-contador
router.put('/devolucion-refaccion-contador', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { valor } = req.body;
    const valorNum = Number(valor);

    if (valor === undefined || valor === null || Number.isNaN(valorNum) || valorNum < 0) {
      return res.status(400).json({ message: 'El valor debe ser un número mayor o igual a 0' });
    }

    const contador = await Contador.findOneAndUpdate(
      { nombre: DEVOLUCION_REFACCION_CONTADOR },
      { $set: { valor: valorNum } },
      { new: true, upsert: true }
    );

    res.json({ valor: contador.valor });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar el contador de devoluciones de refacción', error: error.message });
  }
});

// ===============================
// MECÁNICOS
// ===============================

// GET /api/configuracion/mecanicos
router.get('/mecanicos', proteger, async (req, res) => {
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