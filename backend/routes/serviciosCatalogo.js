// routes/serviciosCatalogo.js
// Catálogo de "Servicios" (paquetes de refacciones necesarias por servicio).
// Separado por completo de routes/codigos.js (catálogo SAT/facturación).
const router = require('express').Router();
const mongoose = require('mongoose');
const ServicioCatalogo = require('../models/ServicioCatalogo');
const { proteger, requiereRol } = require('../middleware/auth');

function sanitizeRefacciones(input) {
  return (Array.isArray(input) ? input : [])
    .map((r) => ({
      nombre: String(r?.nombre || '').trim(),
      obligatoria: !!r?.obligatoria,
    }))
    .filter((r) => r.nombre);
}

// Listado completo (usado por la página admin y por el selector en la orden)
router.get('/', proteger, async (req, res) => {
  try {
    const data = await ServicioCatalogo.find().sort({ nombre: 1 }).lean();
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Listado ligero para el selector de la pestaña "Servicio o Reparación"
router.get('/options', proteger, async (req, res) => {
  try {
    const data = await ServicioCatalogo.find({}, { nombre: 1, refacciones: 1 })
      .sort({ nombre: 1 })
      .lean();
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/:id', proteger, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: 'ID inválido' });
  }
  const doc = await ServicioCatalogo.findById(req.params.id).lean();
  if (!doc) return res.status(404).json({ success: false, message: 'No encontrado' });
  res.json({ success: true, data: doc });
});

router.post('/', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const nombre = String(req.body.nombre || '').trim();
    if (!nombre) throw new Error('Nombre del servicio es obligatorio');

    const refacciones = sanitizeRefacciones(req.body.refacciones);
    const created = await ServicioCatalogo.create({ nombre, refacciones });
    res.status(201).json({ success: true, data: created });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.put('/:id', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const payload = {};
    if (req.body.nombre !== undefined) {
      const nombre = String(req.body.nombre || '').trim();
      if (!nombre) throw new Error('Nombre del servicio es obligatorio');
      payload.nombre = nombre;
    }
    if (req.body.refacciones !== undefined) {
      payload.refacciones = sanitizeRefacciones(req.body.refacciones);
    }

    const updated = await ServicioCatalogo.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });
    if (!updated) return res.status(404).json({ success: false, message: 'No encontrado' });
    res.json({ success: true, data: updated });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.delete('/:id', proteger, requiereRol('admin'), async (req, res) => {
  const del = await ServicioCatalogo.findByIdAndDelete(req.params.id);
  if (!del) return res.status(404).json({ success: false, message: 'No encontrado' });
  res.json({ success: true });
});

module.exports = router;
