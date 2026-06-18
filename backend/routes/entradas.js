const router = require('express').Router();
const mongoose = require('mongoose');
const EntradaInventario = require('../models/EntradaInventario');
const CodigoRefaccion  = require('../models/CodigoRefaccion');
const uploadFactura = require('./middleware/uploadFactura');
const { proteger, requiereRol } = require('../middleware/auth');

// 0) Migración retroactiva: rellena proveedor en BDCodigos a partir de entradas finalizadas
router.post('/migrate-codigos-proveedor', async (req, res) => {
  try {
    const entradas = await EntradaInventario
      .find({ estado: 'finalizada' })
      .populate('proveedorId', 'nombreProveedor nombre aliasProveedor')
      .lean();

    let actualizados = 0;

    for (const entrada of entradas) {
      const nombreProveedor =
        entrada.proveedorId?.nombreProveedor ||
        entrada.proveedorId?.nombre         ||
        entrada.proveedorId?.aliasProveedor  || '';

      if (!nombreProveedor) continue;

      const ids = [...new Set(
        (entrada.captura || [])
          .map(c => c.codigoInterno)
          .filter(id => id && mongoose.isValidObjectId(id))
      )];

      if (!ids.length) continue;

      const result = await CodigoRefaccion.updateMany(
        { _id: { $in: ids }, $or: [{ proveedor: '' }, { proveedor: { $exists: false } }] },
        { $set: { proveedor: nombreProveedor } }
      );

      actualizados += result.modifiedCount || 0;
    }

    res.json({ success: true, actualizados });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// 1) Crear encabezado de entrada
router.post('/', uploadFactura.single('fotoFactura'), async (req, res) => {
  try {
    const { tipoComprobante, numero, moneda, formaPago, proveedorId, fechaFactura } = req.body;

    let fotoFactura = null;
    if (req.file) {
      fotoFactura = {
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        size: req.file.size,
        url: `/uploads/facturas/${req.file.filename}`
      };
    }

    console.log("Archivo recibido:", req.file);

    const entrada = await EntradaInventario.create({
      tipoComprobante, numero, moneda, formaPago, proveedorId, fechaFactura, fotoFactura
    });

    res.status(201).json({ success: true, entradaId: entrada._id });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// 2) Obtener una entrada por _id (para continuar captura de borradores)
router.get('/:entradaId', async (req, res) => {
  try {
    const entrada = await EntradaInventario
      .findById(req.params.entradaId)
      .populate('proveedorId', 'nombreProveedor nombre aliasProveedor rfc')
      .lean();

    if (!entrada) return res.status(404).json({ success: false, message: 'Entrada no encontrada' });

    // Rellenar descripcion vacía desde BDCodigos usando codigoInterno
    const sinDesc = (entrada.captura || []).filter(
      c => c.codigoInterno && !c.descripcion && mongoose.isValidObjectId(c.codigoInterno)
    );

    if (sinDesc.length > 0) {
      const ids = [...new Set(sinDesc.map(c => c.codigoInterno))];
      const codigos = await CodigoRefaccion.find({ _id: { $in: ids } }).lean();
      const mapa = Object.fromEntries(codigos.map(c => [c._id.toString(), c]));

      entrada.captura = entrada.captura.map(c => {
        if (c.codigoInterno && !c.descripcion && mapa[c.codigoInterno]) {
          return { ...c, descripcion: mapa[c.codigoInterno].descripcion || '' };
        }
        return c;
      });
    }

    res.json({ success: true, data: entrada });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// 3) Agregar renglón a captura
router.post('/:entradaId/captura', async (req, res) => {
  try {
    const entrada = await EntradaInventario.findById(req.params.entradaId);
    if (!entrada) return res.status(404).json({ success: false, message: 'Entrada no encontrada' });

    entrada.captura.push(req.body);
    await entrada.save();

    res.status(201).json({ success: true, captura: entrada.captura });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// 4) Finalizar entrada
router.patch('/:entradaId/finalizar', async (req, res) => {
  try {
    const entrada = await EntradaInventario
      .findById(req.params.entradaId)
      .populate('proveedorId', 'nombreProveedor nombre aliasProveedor');

    if (!entrada) return res.status(404).json({ success: false, message: 'Entrada no encontrada' });

    entrada.estado = 'finalizada';
    await entrada.save();

    // Auto-asignar proveedor en BDCodigos usando el proveedor de esta entrada
    const nombreProveedor =
      entrada.proveedorId?.nombreProveedor ||
      entrada.proveedorId?.nombre ||
      entrada.proveedorId?.aliasProveedor || '';

    if (nombreProveedor) {
      const ids = [...new Set(
        (entrada.captura || [])
          .map(c => c.codigoInterno)
          .filter(id => id && mongoose.isValidObjectId(id))
      )];

      if (ids.length > 0) {
        // Solo actualiza los que aún no tienen proveedor asignado
        await CodigoRefaccion.updateMany(
          { _id: { $in: ids }, $or: [{ proveedor: '' }, { proveedor: { $exists: false } }] },
          { $set: { proveedor: nombreProveedor } }
        );
      }
    }

    res.json({ success: true, message: 'Entrada finalizada' });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// ✅ 5) Subir o reemplazar foto de factura en una entrada existente
router.patch('/:entradaId/foto', uploadFactura.single('fotoFactura'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No se recibió archivo' });

    const entrada = await EntradaInventario.findById(req.params.entradaId);
    if (!entrada) return res.status(404).json({ success: false, message: 'Entrada no encontrada' });

    entrada.fotoFactura = {
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size,
      url: `/uploads/facturas/${req.file.filename}`
    };

    await entrada.save();

    res.json({ success: true, fotoFactura: entrada.fotoFactura });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// 6b) Editar entrada completa — solo admin
router.put('/:entradaId', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const entrada = await EntradaInventario.findById(req.params.entradaId);
    if (!entrada) return res.status(404).json({ success: false, message: 'Entrada no encontrada' });

    const { tipoComprobante, numero, fechaFactura, proveedorId, moneda, formaPago, captura } = req.body;

    if (tipoComprobante !== undefined) entrada.tipoComprobante = tipoComprobante;
    if (numero       !== undefined) entrada.numero       = numero;
    if (fechaFactura !== undefined) entrada.fechaFactura = fechaFactura;
    if (proveedorId  !== undefined) entrada.proveedorId  = proveedorId || null;
    if (moneda       !== undefined) entrada.moneda       = moneda;
    if (formaPago    !== undefined) entrada.formaPago    = formaPago;
    if (Array.isArray(captura))     entrada.captura      = captura;

    await entrada.save();

    const updated = await EntradaInventario.findById(entrada._id)
      .populate('proveedorId', 'nombreProveedor nombre aliasProveedor')
      .lean();

    res.json({ success: true, data: updated });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// 6) Eliminar borrador
router.delete('/:entradaId', async (req, res) => {
  try {
    const entrada = await EntradaInventario.findById(req.params.entradaId);
    if (!entrada) return res.status(404).json({ success: false, message: 'Entrada no encontrada' });
    if (entrada.estado !== 'borrador') {
      return res.status(400).json({ success: false, message: 'Solo se pueden eliminar borradores' });
    }
    await entrada.deleteOne();
    res.json({ success: true, message: 'Borrador eliminado correctamente' });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

module.exports = router;