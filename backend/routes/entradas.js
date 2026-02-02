const router = require('express').Router();
const EntradaInventario = require('../models/EntradaInventario');

// 1) Crear SOLO el encabezado (con los campos del formulario)
router.post('/', async (req, res) => {
  try {
    const {
      tipoComprobante, numero, moneda, formaPago,
      proveedorId, fechaFactura, fotoFactura // si lo mandas en JSON
    } = req.body;

    const entrada = await EntradaInventario.create({
      tipoComprobante, numero, moneda, formaPago,
      proveedorId, fechaFactura, fotoFactura
    });

    // Devuelves el _id para usarlo como entradaId en la tabla
    res.status(201).json({ success: true, entradaId: entrada._id });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// 2) Agregar renglón a `captura` (la tabla) usando el id de la entrada
router.post('/:entradaId/captura', async (req, res) => {
  try {
    const { entradaId } = req.params;
    const renglon = req.body; // {codigoInterno, descripcion, tipo, unidad, cantidad, costoUnitario, ...}

    const entrada = await EntradaInventario.findById(entradaId);
    if (!entrada) return res.status(404).json({ success:false, message:'Entrada no encontrada' });

    entrada.captura.push(renglon);
    await entrada.save();

    res.status(201).json({ success:true, captura: entrada.captura });
  } catch (e) {
    res.status(400).json({ success:false, message: e.message });
  }
});

module.exports = router;
