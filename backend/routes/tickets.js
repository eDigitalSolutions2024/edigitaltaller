// backend/routes/tickets.js
const express = require('express');
const router = express.Router();

const Ticket = require('../models/Ticket');
const Contador = require('../models/Contador');
const { proteger, requiereRol } = require('../middleware/auth');

const { TIPOS_PROBLEMA, ESTADOS_TICKET } = Ticket;
const CONTADOR_TICKET = 'ticket';

// POST /api/tickets — cualquier usuario autenticado puede reportar un ticket
router.post('/', proteger, async (req, res) => {
  try {
    const { tipoProblema, detalle, ordenServicio, folioOrdenServicio } = req.body;

    if (!TIPOS_PROBLEMA.includes(tipoProblema)) {
      return res.status(400).json({ ok: false, msg: 'Tipo de problema inválido.' });
    }
    if (!String(detalle || '').trim()) {
      return res.status(400).json({ ok: false, msg: 'Captura el motivo/detalle del ticket.' });
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
      Ticket.find(q).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
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

module.exports = router;
