// routes/ubicacionesInventario.js  (montado en /api/inventario/ubicaciones)
const router = require('express').Router();
const UbicacionInventario = require('../models/UbicacionInventario');
const { proteger, requiereRol } = require('../middleware/auth');

const escribe = [proteger, requiereRol('admin', 'refaccionario')];
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function nombreRepetido(nombre, excluirId) {
  const q = { nombre: new RegExp(`^${escapeRe(nombre)}$`, 'i') };
  if (excluirId) q._id = { $ne: excluirId };
  return !!(await UbicacionInventario.exists(q));
}

// GET /api/inventario/ubicaciones
router.get('/', async (_req, res) => {
  try {
    const data = await UbicacionInventario.find().sort({ nombre: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/inventario/ubicaciones { nombre }
router.post('/', ...escribe, async (req, res) => {
  try {
    const nombre = String(req.body.nombre || '').trim();
    if (!nombre) return res.status(400).json({ success: false, message: 'El nombre es obligatorio' });
    if (await nombreRepetido(nombre)) {
      return res.status(409).json({ success: false, message: `Ya existe una ubicación llamada "${nombre}"` });
    }
    const data = await UbicacionInventario.create({ nombre });
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/inventario/ubicaciones/:id { nombre }  (renombrar)
router.put('/:id', ...escribe, async (req, res) => {
  try {
    const ub = await UbicacionInventario.findById(req.params.id);
    if (!ub) return res.status(404).json({ success: false, message: 'Ubicación no encontrada' });

    if (req.body.nombre !== undefined) {
      const nombre = String(req.body.nombre || '').trim();
      if (!nombre) return res.status(400).json({ success: false, message: 'El nombre es obligatorio' });
      if (await nombreRepetido(nombre, ub._id)) {
        return res.status(409).json({ success: false, message: `Ya existe una ubicación llamada "${nombre}"` });
      }
      ub.nombre = nombre;
    }
    await ub.save();
    res.json({ success: true, data: ub });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/inventario/ubicaciones/:id  (sus refacciones vuelven a "sin asignar")
router.delete('/:id', ...escribe, async (req, res) => {
  try {
    const ub = await UbicacionInventario.findByIdAndDelete(req.params.id);
    if (!ub) return res.status(404).json({ success: false, message: 'Ubicación no encontrada' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/inventario/ubicaciones/:id/items
// { codigoInterno, cantidad }  -> fija la cantidad (0 la quita de la ubicación)
// { codigoInterno, sumar }     -> suma/resta sobre lo que ya hay
router.put('/:id/items', ...escribe, async (req, res) => {
  try {
    const codigo = String(req.body.codigoInterno || '').trim();
    if (!codigo) return res.status(400).json({ success: false, message: 'codigoInterno requerido' });

    const ub = await UbicacionInventario.findById(req.params.id);
    if (!ub) return res.status(404).json({ success: false, message: 'Ubicación no encontrada' });

    const idx = ub.items.findIndex((i) => i.codigoInterno === codigo);
    const actual = idx >= 0 ? ub.items[idx].cantidad : 0;

    let nueva;
    if (req.body.sumar !== undefined) nueva = actual + Number(req.body.sumar);
    else nueva = Number(req.body.cantidad);
    if (!Number.isFinite(nueva) || nueva < 0) {
      return res.status(400).json({ success: false, message: 'Cantidad inválida' });
    }

    if (nueva === 0) {
      if (idx >= 0) ub.items.splice(idx, 1);
    } else if (idx >= 0) {
      ub.items[idx].cantidad = nueva;
    } else {
      ub.items.push({ codigoInterno: codigo, cantidad: nueva });
    }
    await ub.save();
    res.json({ success: true, data: ub });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
