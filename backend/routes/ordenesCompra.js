// backend/routes/ordenesCompra.js
const express = require('express');
const router = express.Router();

const OrdenCompra = require('../models/OrdenCompra');
const Vehiculo = require('../models/Vehiculo');
const { proteger, requiereRol } = require('../middleware/auth');
const { streamOrdenCompraPdf } = require('../service/ordenCompraPdf');

// POST /api/ordenes-compra
// body: { vehiculoId, linea, index }
router.post(
  '/',
  proteger,
  requiereRol('jefe', 'admin', 'contabilidad'),
  async (req, res) => {
    try {
      const { vehiculoId, linea, index } = req.body;

      if (!vehiculoId || !linea) {
        return res
          .status(400)
          .json({ ok: false, msg: 'vehiculoId y linea son obligatorios' });
      }

      const vehiculo = await Vehiculo.findById(vehiculoId);
      if (!vehiculo) {
        return res
          .status(404)
          .json({ ok: false, msg: 'Orden de servicio no encontrada' });
      }

      // 1) generar número de OC
      const numero = await OrdenCompra.generarConsecutivo();

      // 2) crear la OC con una sola línea (la refacción marcada)
      const importe =
        linea.importeTotal ??
        (Number(linea.cant || 0) * Number(linea.precioUnitario || 0));

      const oc = new OrdenCompra({
        numero,
        orden: vehiculo._id,
        proveedor: linea.proveedor || '',
        lineas: [
          {
            cant: linea.cant,
            unidad: linea.unidad,
            refaccion: linea.refaccion,
            tipo: linea.tipo,
            marca: linea.marca,
            proveedor: linea.proveedor,
            codigo: linea.codigo,
            precioUnitario: linea.precioUnitario,
            importeTotal: importe,
            moneda: linea.moneda || 'MN',
            observaciones: linea.observaciones || '',
          },
        ],
        creadoPor: req.user?._id || null,
      });

      await oc.save();

      // 3) marcar la refacción como ligada a esta OC
      if (typeof index === 'number' && vehiculo.refaccionesSolicitadas[index]) {
        vehiculo.refaccionesSolicitadas[index].requiereOC = true;
        vehiculo.refaccionesSolicitadas[index].ocGenerada = true;
        vehiculo.refaccionesSolicitadas[index].numeroOC = numero;
        vehiculo.refaccionesSolicitadas[index].ordenCompra = oc._id;
        await vehiculo.save();
      }

      return res.status(201).json({ ok: true, ordenCompra: oc });
    } catch (err) {
      console.error('Error creando orden de compra:', err);
      return res
        .status(500)
        .json({ ok: false, msg: 'Error al crear la orden de compra' });
    }
  }
);

// GET /api/ordenes-compra  -> listado simple (opcional)
router.get(
  '/',
  proteger,
  requiereRol('jefe', 'admin', 'contabilidad'),
  async (req, res) => {
    try {
      const ocs = await OrdenCompra.find()
        .sort({ createdAt: -1 })
        .populate('orden', 'ordenServicio marca modelo placas numeroEconomico');

      res.json({ ok: true, data: ocs });
    } catch (err) {
      console.error('Error listando órdenes de compra:', err);
      res
        .status(500)
        .json({ ok: false, msg: 'Error al listar órdenes de compra' });
    }
  }
);

// GET /api/ordenes-compra/:id/pdf  -> PDF imprimible
router.get(
  '/:id/pdf',
  proteger,
  requiereRol('jefe', 'admin', 'contabilidad'),
  async (req, res) => {
    try {
      const oc = await OrdenCompra.findById(req.params.id).populate(
        'orden',
        'ordenServicio marca modelo anio placas numeroEconomico'
      );

      if (!oc) {
        return res
          .status(404)
          .json({ ok: false, msg: 'Orden de compra no encontrada' });
      }

      await streamOrdenCompraPdf(res, oc);
    } catch (err) {
      console.error('Error generando PDF de orden de compra:', err);
      res
        .status(500)
        .json({ ok: false, msg: 'Error al generar PDF de orden de compra' });
    }
  }
);

module.exports = router;
