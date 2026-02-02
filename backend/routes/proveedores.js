// routes/proveedores.js
const router = require('express').Router();
const Proveedor = require('../models/Proveedor');

// Helper de validación simple (puedes migrar a Joi/Yup cuando gustes)
function validateProveedor(body) {
  const errors = [];

  if (!body.nombreProveedor || !body.nombreProveedor.trim()) {
    errors.push('El nombre del proveedor es obligatorio.');
  }
  if (body.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.correo)) {
    errors.push('Correo inválido.');
  }
  if (body.diasCredito != null && Number(body.diasCredito) < 0) {
    errors.push('Días de crédito inválidos.');
  }

  return errors;
}

/**
 * POST /api/proveedores
 * Crea un proveedor
 */
router.post('/', async (req, res) => {
  try {
    const errors = validateProveedor(req.body);
    if (errors.length) return res.status(400).json({ success: false, errors });

    // Normalizaciones ligeras
    const payload = {
      ...req.body,
      rfc: req.body.rfc ? String(req.body.rfc).toUpperCase().trim() : undefined,
      correo: req.body.correo ? String(req.body.correo).toLowerCase().trim() : undefined,
    };

    const proveedor = await Proveedor.create(payload);
    res.status(201).json({ success: true, data: proveedor });
  } catch (err) {
    console.error('POST /proveedores error:', err);
    // Manejo simple de índices únicos (si los activas)
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Duplicado: ya existe un proveedor con ese valor único.', keyValue: err.keyValue });
    }
    res.status(500).json({ success: false, message: 'Error al crear proveedor.' });
  }
});

/**
 * GET /api/proveedores
 * Lista proveedores con búsqueda y paginación
 * Query:
 *   q (texto), page (1..), limit (1..200), soloActivos=true|false
 */
router.get('/', async (req, res) => {
  try {
    const {
      q = '',
      page = 1,
      limit = 10,
      soloActivos = 'true',
    } = req.query;

    const $and = [];
    if (soloActivos === 'true') {
      $and.push({ activo: true });
    }

    if (q && q.trim()) {
      const s = q.trim();
      // Busca por regex en varios campos
      const regex = new RegExp(s, 'i');
      $and.push({
        $or: [
          { nombreProveedor: regex },
          { aliasProveedor: regex },
          { rfc: regex },
          { correo: regex },
          { ciudad: regex },
        ],
      });
    }

    const criteria = $and.length ? { $and } : {};

    const skip = (Math.max(parseInt(page) || 1, 1) - 1) * Math.min(parseInt(limit) || 10, 200);
    const rows = await Proveedor.find(criteria)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Math.min(parseInt(limit) || 10, 200));

    const total = await Proveedor.countDocuments(criteria);

    res.json({
      success: true,
      data: rows,
      page: Number(page),
      limit: Number(limit),
      total,
    });
  } catch (err) {
    console.error('GET /proveedores error:', err);
    res.status(500).json({ success: false, message: 'Error al listar proveedores.' });
  }
});

/**
 * GET /api/proveedores/:id
 * Obtiene un proveedor por id
 */
router.get('/:id', async (req, res) => {
  try {
    const row = await Proveedor.findById(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Proveedor no encontrado' });
    res.json({ success: true, data: row });
  } catch (err) {
    console.error('GET /proveedores/:id error:', err);
    res.status(500).json({ success: false, message: 'Error al consultar proveedor.' });
  }
});

/**
 * PUT /api/proveedores/:id
 * Actualiza un proveedor
 */
router.put('/:id', async (req, res) => {
  try {
    const errors = validateProveedor({ ...req.body, nombreProveedor: req.body.nombreProveedor ?? 'x' }); // fuerza validación mínima si actualizas parcial
    if (errors.length) return res.status(400).json({ success: false, errors });

    const payload = {
      ...req.body,
    };
    if (payload.rfc) payload.rfc = String(payload.rfc).toUpperCase().trim();
    if (payload.correo) payload.correo = String(payload.correo).toLowerCase().trim();

    const updated = await Proveedor.findByIdAndUpdate(req.params.id, payload, { new: true });
    if (!updated) return res.status(404).json({ success: false, message: 'Proveedor no encontrado' });

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('PUT /proveedores/:id error:', err);
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Duplicado: valor único ya existe.', keyValue: err.keyValue });
    }
    res.status(500).json({ success: false, message: 'Error al actualizar proveedor.' });
  }
});

/**
 * DELETE /api/proveedores/:id
 * (opcional) Elimina/Desactiva proveedor
 */
router.delete('/:id', async (req, res) => {
  try {
    // Soft delete: marcar inactivo. Cambia a deleteOne si quieres borrado real.
    const updated = await Proveedor.findByIdAndUpdate(req.params.id, { activo: false }, { new: true });
    if (!updated) return res.status(404).json({ success: false, message: 'Proveedor no encontrado' });
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('DELETE /proveedores/:id error:', err);
    res.status(500).json({ success: false, message: 'Error al eliminar proveedor.' });
  }
});

module.exports = router;
