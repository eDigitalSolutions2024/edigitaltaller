const router = require('express').Router();
const EntradaInventario = require('../models/EntradaInventario');
const uploadFactura = require('./middleware/uploadFactura');

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
    const entrada = await EntradaInventario.findById(req.params.entradaId);
    if (!entrada) return res.status(404).json({ success: false, message: 'Entrada no encontrada' });

    entrada.estado = 'finalizada';
    await entrada.save();

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

module.exports = router;