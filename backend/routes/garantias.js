// backend/routes/garantias.js
// Solicitudes de garantía: viven embebidas en la orden (Vehiculo.garantia).
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const Vehiculo = require('../models/Vehiculo');
const { proteger, requiereRol } = require('../middleware/auth');
const { regexBusquedaOS } = require('../utils/ordenServicio');

const POPULATE_CLIENTE =
  'nombre apellidoPaterno apellidoMaterno tipoCliente empresa gobierno telefonos celulares emails rfc direccion asesorResponsable';

const POPULATE_ORDEN_ANTERIOR =
  'ordenServicio estadoOrden fechaRecepcion fechaCierre marca modelo anio color serie placas kmsMillas creadoPor ventaCliente ivaVenta manoObra diagnosticoTecnico';

const ESTADOS_GARANTIA = ['PENDIENTE', 'APROBADA', 'NEGADA'];

// GET /api/garantias?estado=&searchOs=&page=1&limit=10
router.get('/', proteger, async (req, res) => {
  try {
    const { estado = '', searchOs = '', page = 1, limit = 10 } = req.query;

    const q = {
      'garantia.estado': ESTADOS_GARANTIA.includes(estado)
        ? estado
        : { $in: ESTADOS_GARANTIA },
      // Las solicitudes solo son visibles cuando la nueva orden ya está en
      // proceso de venta al cliente (tiene partidas enviadas a Venta al Cliente).
      'ventaCliente.0': { $exists: true },
    };

    // Búsqueda con o sin guion: "OS023" encuentra "OS-023"
    if (searchOs) {
      const rx = regexBusquedaOS(searchOs);
      if (rx) q.$or = [{ ordenServicio: rx }, { 'garantia.ordenAnteriorFolio': rx }];
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    const [data, total] = await Promise.all([
      Vehiculo.find(q)
        .sort({ 'garantia.fechaSolicitud': -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('cliente', POPULATE_CLIENTE)
        .populate('garantia.ordenAnterior', POPULATE_ORDEN_ANTERIOR),
      Vehiculo.countDocuments(q),
    ]);

    return res.json({ ok: true, data, total, page: pageNum, limit: limitNum });
  } catch (err) {
    console.error('Error listando garantías:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/garantias/usadas?ordenIds=a,b,c
// Devuelve cuáles de esas órdenes ya son origen de una garantía (pendiente o
// autorizada): no pueden volver a usarse en una nueva solicitud.
router.get('/usadas', proteger, async (req, res) => {
  try {
    const ids = String(req.query.ordenIds || '')
      .split(',')
      .map((s) => s.trim())
      .filter((id) => mongoose.Types.ObjectId.isValid(id));

    if (!ids.length) return res.json({ ok: true, usadas: [] });

    const docs = await Vehiculo.find({
      'garantia.ordenAnterior': { $in: ids },
      'garantia.estado': { $in: ['PENDIENTE', 'APROBADA'] },
    })
      .select('ordenServicio garantia.ordenAnterior')
      .lean();

    const usadas = docs.map((d) => ({
      ordenAnterior: String(d.garantia.ordenAnterior),
      ordenServicio: d.ordenServicio || '',
    }));

    return res.json({ ok: true, usadas });
  } catch (err) {
    console.error('Error consultando garantías usadas:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// PUT /api/garantias/:id — editar motivo / checkbox mientras está PENDIENTE
router.put('/:id', proteger, async (req, res) => {
  try {
    const { motivo, autorizaCarreon } = req.body;

    const vehiculo = await Vehiculo.findById(req.params.id);
    if (!vehiculo || !vehiculo.garantia) {
      return res.status(404).json({ ok: false, msg: 'Solicitud de garantía no encontrada' });
    }
    if (vehiculo.garantia.estado !== 'PENDIENTE') {
      return res.status(400).json({
        ok: false,
        msg: 'Solo se pueden editar solicitudes de garantía pendientes.',
      });
    }

    if (typeof motivo === 'string') vehiculo.garantia.motivo = motivo.trim();
    if (typeof autorizaCarreon === 'boolean') {
      vehiculo.garantia.autorizaCarreon = autorizaCarreon;
    }

    await vehiculo.save();
    return res.json({ ok: true, garantia: vehiculo.garantia });
  } catch (err) {
    console.error('Error actualizando garantía:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// PUT /api/garantias/:id/resolver — aprobar o negar (solo admin / jefe)
router.put('/:id/resolver', proteger, requiereRol('admin', 'jefe'), async (req, res) => {
  try {
    const { accion, motivo, autorizaCarreon } = req.body;

    if (!['APROBAR', 'NEGAR'].includes(accion)) {
      return res.status(400).json({ ok: false, msg: 'Acción inválida. Usa APROBAR o NEGAR.' });
    }

    const vehiculo = await Vehiculo.findById(req.params.id);
    if (!vehiculo || !vehiculo.garantia) {
      return res.status(404).json({ ok: false, msg: 'Solicitud de garantía no encontrada' });
    }
    if (vehiculo.garantia.estado !== 'PENDIENTE') {
      return res.status(400).json({
        ok: false,
        msg: 'La solicitud de garantía ya fue resuelta.',
      });
    }

    const resueltoPor = req.user.name || req.user.username || req.user.email || '';

    if (accion === 'NEGAR') {
      // Al negar no es obligatorio llenar los datos
      vehiculo.garantia.estado = 'NEGADA';
      vehiculo.garantia.fechaResolucion = new Date();
      vehiculo.garantia.resueltoPor = resueltoPor;
      if (typeof motivo === 'string' && motivo.trim()) {
        vehiculo.garantia.motivo = motivo.trim();
      }
      // Defensivo: nunca debe existir fila garantía sin aprobación
      vehiculo.ventaCliente = (vehiculo.ventaCliente || []).filter((r) => !r.esGarantia);
    } else {
      // APROBAR: checkbox + motivo son obligatorios
      const motivoFinal = String(motivo ?? vehiculo.garantia.motivo ?? '').trim();

      if (autorizaCarreon !== true) {
        return res.status(400).json({
          ok: false,
          msg: 'Para autorizar es obligatorio marcar la casilla Autorizar.',
        });
      }
      if (!motivoFinal) {
        return res.status(400).json({
          ok: false,
          msg: 'Para autorizar es obligatorio capturar el motivo de la garantía.',
        });
      }

      vehiculo.garantia.estado = 'APROBADA';
      vehiculo.garantia.motivo = motivoFinal;
      vehiculo.garantia.autorizaCarreon = true;
      vehiculo.garantia.fechaResolucion = new Date();
      vehiculo.garantia.resueltoPor = resueltoPor;

      // La garantía ya no agrega un concepto GARANTÍA en Venta al Cliente;
      // se limpian filas heredadas de la lógica anterior.
      vehiculo.ventaCliente = (vehiculo.ventaCliente || []).filter((r) => !r.esGarantia);
    }

    await vehiculo.save();

    const actualizado = await Vehiculo.findById(vehiculo._id)
      .populate('cliente', POPULATE_CLIENTE)
      .populate('garantia.ordenAnterior', POPULATE_ORDEN_ANTERIOR);

    return res.json({ ok: true, vehiculo: actualizado });
  } catch (err) {
    console.error('Error resolviendo garantía:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

module.exports = router;
