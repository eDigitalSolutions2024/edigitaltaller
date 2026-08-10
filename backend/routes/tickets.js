// backend/routes/tickets.js
const express = require('express');
const router = express.Router();

const Ticket = require('../models/Ticket');
const Contador = require('../models/Contador');
const User = require('../models/User');
const { proteger, requiereRol } = require('../middleware/auth');
const { reasignarAsesorOrden } = require('../utils/reasignarAsesor');
const { restablecerCierreCajaDia } = require('../utils/restablecerCierreCajaDia');

const { TIPOS_PROBLEMA, ESTADOS_TICKET } = Ticket;
const CONTADOR_TICKET = 'ticket';

// Mismo día "solo fecha" (medianoche UTC) que CierreCaja.fecha — ver
// normalizarFecha en routes/cierreCaja.js.
function normalizarFechaSoloDia(fecha) {
  if (!fecha) return null;
  const soloFecha = String(fecha).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(soloFecha)) return null;
  return new Date(`${soloFecha}T00:00:00.000Z`);
}

// POST /api/tickets — cualquier usuario autenticado puede reportar un ticket
router.post('/', proteger, async (req, res) => {
  try {
    const { tipoProblema, detalle, ordenServicio, folioOrdenServicio, asesorSolicitadoId, fechaCierreCaja } = req.body;

    if (!TIPOS_PROBLEMA.includes(tipoProblema)) {
      return res.status(400).json({ ok: false, msg: 'Tipo de problema inválido.' });
    }
    if (!String(detalle || '').trim()) {
      return res.status(400).json({ ok: false, msg: 'Captura el motivo/detalle del ticket.' });
    }

    let asesorSolicitadoNombre = '';
    if (tipoProblema === 'CAMBIO_ASESOR') {
      if (!ordenServicio) {
        return res.status(400).json({ ok: false, msg: 'Selecciona la orden de servicio a reasignar.' });
      }
      if (!asesorSolicitadoId) {
        return res.status(400).json({ ok: false, msg: 'Selecciona el asesor al que quieres cambiar la orden.' });
      }
      const asesor = await User.findOne({ _id: asesorSolicitadoId, role: 'asesor_servicio', isActive: true });
      if (!asesor) {
        return res.status(404).json({ ok: false, msg: 'Asesor no encontrado o inactivo.' });
      }
      asesorSolicitadoNombre = asesor.name;
    }

    // Restablecer un abono/anticipo/remisión/nota de venta requiere saber
    // exactamente qué orden trae el cobro a cancelar; el admin escoge el pago
    // puntual ya dentro de Cajas (ver POST /cajas/:id/pagos/:pagoId/cancelar).
    if (tipoProblema === 'RESTABLECER_COBRO' && !ordenServicio) {
      return res.status(400).json({ ok: false, msg: 'Selecciona la orden de servicio con el cobro a restablecer.' });
    }

    // Restablecer una caja ya cerrada: el rol cajas no puede reabrirla directo
    // (POST /reportes/cierre-caja/restablecer es solo admin), así que pide el
    // día puntual y el admin aprueba o niega desde Soporte.
    let fechaCierreCajaNormalizada = null;
    if (tipoProblema === 'RESTABLECER_CAJA') {
      fechaCierreCajaNormalizada = normalizarFechaSoloDia(fechaCierreCaja);
      if (!fechaCierreCajaNormalizada) {
        return res.status(400).json({ ok: false, msg: 'Selecciona el día de caja a restablecer.' });
      }
    }

    const contador = await Contador.findOneAndUpdate(
      { nombre: CONTADOR_TICKET },
      { $inc: { valor: 1 } },
      { new: true, upsert: true }
    );
    const folio = `TK-${String(contador.valor).padStart(5, '0')}`;

    const ticket = await Ticket.create({
      folio,
      usuarioReporta: req.user._id,
      nombreUsuarioReporta: req.user.name || req.user.username || req.user.email || '',
      tipoProblema,
      detalle: detalle.trim(),
      ordenServicio: ordenServicio || null,
      folioOrdenServicio: folioOrdenServicio || '',
      asesorSolicitadoId: tipoProblema === 'CAMBIO_ASESOR' ? asesorSolicitadoId : null,
      asesorSolicitadoNombre,
      fechaCierreCaja: fechaCierreCajaNormalizada,
    });

    return res.status(201).json({ ok: true, data: ticket });
  } catch (err) {
    console.error('Error creando ticket:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/tickets/mis-tickets — historial propio del usuario autenticado
router.get('/mis-tickets', proteger, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;

    const data = await Ticket.find({ usuarioReporta: req.user._id })
      .sort({ createdAt: -1 })
      .limit(limit);

    return res.json({ ok: true, data });
  } catch (err) {
    console.error('Error listando mis-tickets:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/tickets?estado=PENDIENTE,EN_PROCESO&tipoProblema=&page=1&limit=10 — solo admin
router.get('/', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { estado = '', tipoProblema = '', page = 1, limit = 10 } = req.query;

    const q = {};

    const estados = String(estado)
      .split(',')
      .map((s) => s.trim())
      .filter((s) => ESTADOS_TICKET.includes(s));
    if (estados.length) q.estado = { $in: estados };

    if (TIPOS_PROBLEMA.includes(tipoProblema)) {
      q.tipoProblema = tipoProblema;
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    const [data, total] = await Promise.all([
      Ticket.find(q)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('ordenServicio', 'ordenServicio estadoOrden'),
      Ticket.countDocuments(q),
    ]);

    return res.json({ ok: true, data, total, page: pageNum, limit: limitNum });
  } catch (err) {
    console.error('Error listando tickets:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// PUT /api/tickets/:id/estado — marcar en proceso / finalizado (solo admin)
router.put('/:id/estado', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { estado } = req.body;

    if (!['EN_PROCESO', 'FINALIZADO'].includes(estado)) {
      return res.status(400).json({ ok: false, msg: 'Estado inválido. Usa EN_PROCESO o FINALIZADO.' });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ ok: false, msg: 'Ticket no encontrado' });
    }

    if (ticket.estado === 'FINALIZADO') {
      return res.status(400).json({ ok: false, msg: 'El ticket ya fue finalizado.' });
    }

    // PENDIENTE puede pasar directo a FINALIZADO (resolución rápida) o a
    // EN_PROCESO; no es obligatorio pasar por el estado intermedio.
    ticket.estado = estado;
    ticket.fechaCambioEstado = new Date();
    ticket.actualizadoPor = req.user.name || req.user.username || req.user.email || '';
    await ticket.save();

    return res.json({ ok: true, data: ticket });
  } catch (err) {
    console.error('Error actualizando estado del ticket:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// PUT /api/tickets/:id/resolver-cambio-asesor — aprobar o negar una solicitud
// de cambio de asesor (solo admin). Al aprobar, aplica el cambio real sobre
// la orden vinculada (mismo efecto que PUT /vehiculos/:id/cambiar-asesor).
router.put('/:id/resolver-cambio-asesor', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { accion } = req.body;

    if (!['APROBAR', 'NEGAR'].includes(accion)) {
      return res.status(400).json({ ok: false, msg: 'Acción inválida. Usa APROBAR o NEGAR.' });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ ok: false, msg: 'Ticket no encontrado' });
    }

    if (ticket.tipoProblema !== 'CAMBIO_ASESOR') {
      return res.status(400).json({ ok: false, msg: 'Este ticket no es una solicitud de cambio de asesor.' });
    }
    if (ticket.estado === 'FINALIZADO') {
      return res.status(400).json({ ok: false, msg: 'El ticket ya fue finalizado.' });
    }

    if (accion === 'APROBAR') {
      await reasignarAsesorOrden(ticket.ordenServicio, ticket.asesorSolicitadoId);
    }

    ticket.estado = 'FINALIZADO';
    ticket.resultado = accion === 'APROBAR' ? 'APROBADO' : 'RECHAZADO';
    ticket.fechaCambioEstado = new Date();
    ticket.actualizadoPor = req.user.name || req.user.username || req.user.email || '';
    await ticket.save();

    return res.json({ ok: true, data: ticket });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ ok: false, msg: err.message });
    }
    console.error('Error resolviendo ticket de cambio de asesor:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// PUT /api/tickets/:id/resolver-restablecer-caja — aprobar o negar una
// solicitud de reapertura de caja (solo admin). Al aprobar, reabre de verdad
// el día (mismo efecto que POST /reportes/cierre-caja/restablecer).
router.put('/:id/resolver-restablecer-caja', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { accion } = req.body;

    if (!['APROBAR', 'NEGAR'].includes(accion)) {
      return res.status(400).json({ ok: false, msg: 'Acción inválida. Usa APROBAR o NEGAR.' });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ ok: false, msg: 'Ticket no encontrado' });
    }

    if (ticket.tipoProblema !== 'RESTABLECER_CAJA') {
      return res.status(400).json({ ok: false, msg: 'Este ticket no es una solicitud de restablecer caja.' });
    }
    if (ticket.estado === 'FINALIZADO') {
      return res.status(400).json({ ok: false, msg: 'El ticket ya fue finalizado.' });
    }

    if (accion === 'APROBAR') {
      await restablecerCierreCajaDia(ticket.fechaCierreCaja, req.user.name || req.user.username || '');
    }

    ticket.estado = 'FINALIZADO';
    ticket.resultado = accion === 'APROBAR' ? 'APROBADO' : 'RECHAZADO';
    ticket.fechaCambioEstado = new Date();
    ticket.actualizadoPor = req.user.name || req.user.username || req.user.email || '';
    await ticket.save();

    return res.json({ ok: true, data: ticket });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ ok: false, msg: err.message });
    }
    console.error('Error resolviendo ticket de restablecer caja:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

module.exports = router;
