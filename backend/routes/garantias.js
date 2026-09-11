// backend/routes/garantias.js
// Solicitudes de garantía: viven embebidas en la orden (Vehiculo.garantia).
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const Vehiculo = require('../models/Vehiculo');
const Ticket = require('../models/Ticket');
const { proteger, requiereRol } = require('../middleware/auth');
const { regexBusquedaOS } = require('../utils/ordenServicio');

// Al pulsar "Enviar a Venta" en una orden de garantía todavía PENDIENTE se
// abre un ticket GARANTIA_AUTORIZACION y la orden queda bloqueada
// (garantia.ticketPendiente + garantia.autorizacionSolicitada). Cuando el
// admin resuelve la garantía aquí, ese ticket se cierra automáticamente.
async function cerrarTicketAutorizacion(ticketId, resultado, actualizadoPor) {
  if (!ticketId) return;
  const ticket = await Ticket.findById(ticketId);
  if (!ticket || ticket.tipoProblema !== 'GARANTIA_AUTORIZACION') return;
  if (ticket.estado === 'FINALIZADO') return;
  ticket.estado = 'FINALIZADO';
  ticket.resultado = resultado;
  ticket.fechaCambioEstado = new Date();
  ticket.actualizadoPor = actualizadoPor || '';
  await ticket.save();
}

const POPULATE_CLIENTE =
  'nombre apellidoPaterno apellidoMaterno tipoCliente empresa gobierno telefonos celulares emails rfc direccion asesorResponsable esEmpleado';

const POPULATE_ORDEN_ANTERIOR =
  'ordenServicio estadoOrden fechaRecepcion fechaCierre marca modelo anio color serie placas kmsMillas creadoPor ventaCliente ivaVenta manoObra diagnosticoTecnico';

const POPULATE_GRUPO = { path: 'grupoId', select: 'nombre miembros', populate: { path: 'miembros', select: 'name' } };

const ESTADOS_GARANTIA = ['PENDIENTE', 'APROBADA', 'NEGADA', 'NO_APLICA'];
// Estados "cerrados" para la sección de historial de Solicitudes de Garantía
// (todo lo que ya no está pendiente de autorizar).
const ESTADOS_RESUELTOS = ['APROBADA', 'NEGADA', 'NO_APLICA'];

// GET /api/garantias?estado=&searchOs=&page=1&limit=10
// estado admite además 'RESUELTAS' (= APROBADA + NEGADA + NO_APLICA).
router.get('/', proteger, async (req, res) => {
  try {
    const { estado = '', searchOs = '', page = 1, limit = 10 } = req.query;

    let estadoFiltro;
    if (estado === 'RESUELTAS') {
      estadoFiltro = { $in: ESTADOS_RESUELTOS };
    } else if (ESTADOS_GARANTIA.includes(estado)) {
      estadoFiltro = estado;
    } else {
      estadoFiltro = { $in: ESTADOS_GARANTIA };
    }

    const q = { 'garantia.estado': estadoFiltro };
    // El historial (RESUELTAS o un estado ya cerrado) se ordena por cuándo se
    // resolvió; pendientes y la vista "todas" por cuándo se solicitó.
    const esHistorial = estado === 'RESUELTAS' || ESTADOS_RESUELTOS.includes(estado);
    const sort = esHistorial
      ? { 'garantia.fechaResolucion': -1, 'garantia.fechaSolicitud': -1 }
      : { 'garantia.fechaSolicitud': -1 };

    // Las solicitudes solo son visibles cuando la nueva orden ya llegó al
    // menos a Presupuesto (tiene partidas cotizadas) o a Venta al Cliente
    // (ya enviadas al cliente); antes de eso, todavía no hay nada que
    // autorizar/revisar como garantía.
    const andConds = [
      { $or: [{ 'presupuesto.0': { $exists: true } }, { 'ventaCliente.0': { $exists: true } }] },
    ];

    // Búsqueda con o sin guion: "OS023" encuentra "OS-023"
    if (searchOs) {
      const rx = regexBusquedaOS(searchOs);
      if (rx) andConds.push({ $or: [{ ordenServicio: rx }, { 'garantia.ordenAnteriorFolio': rx }] });
    }

    q.$and = andConds;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    const [data, total] = await Promise.all([
      Vehiculo.find(q)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .populate('cliente', POPULATE_CLIENTE)
        .populate('garantia.ordenAnterior', POPULATE_ORDEN_ANTERIOR)
        .populate(POPULATE_GRUPO),
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

// GET /api/garantias/pendientes-count — cuántas órdenes de garantía están
// bloqueadas esperando que un admin autorice/niegue la garantía (el asesor ya
// pulsó "Enviar a Venta"). Alimenta el badge del menú "Solicitudes de Garantías".
router.get('/pendientes-count', proteger, requiereRol('admin'), async (_req, res) => {
  try {
    const count = await Vehiculo.countDocuments({
      'garantia.estado': 'PENDIENTE',
      'garantia.autorizacionSolicitada': true,
    });
    return res.json({ ok: true, count });
  } catch (err) {
    console.error('Error contando garantías pendientes:', err);
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

    if (!['APROBAR', 'NEGAR', 'NO_APLICA'].includes(accion)) {
      return res.status(400).json({ ok: false, msg: 'Acción inválida. Usa APROBAR, NEGAR o NO_APLICA.' });
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

    // Si el bloqueo viene de un ticket GARANTIA_NO_APLICA (asesor pidió
    // cancelar la orden), ese ticket se resuelve desde Soporte, no aquí.
    if (vehiculo.garantia.ticketPendiente) {
      const ticketBloqueo = await Ticket.findById(vehiculo.garantia.ticketPendiente).select('tipoProblema estado folio');
      if (
        ticketBloqueo &&
        ticketBloqueo.tipoProblema === 'GARANTIA_NO_APLICA' &&
        ticketBloqueo.estado !== 'FINALIZADO'
      ) {
        return res.status(409).json({
          ok: false,
          msg: `Hay un ticket de Soporte pendiente (${ticketBloqueo.folio}) sobre esta orden; resuélvelo desde Soporte antes de autorizar o negar la garantía.`,
        });
      }
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
      // Garantía negada => la orden nueva no procede: se cancela (mismo efecto
      // que el flujo "No aplica" + PUT /:id/cancelar, sin crear reemplazo).
      if (vehiculo.estadoOrden !== 'CANCELADA') {
        vehiculo.estadoAnterior = vehiculo.estadoOrden;
        vehiculo.estadoOrden = 'CANCELADA';
        vehiculo.motivoCancelacion =
          (typeof motivo === 'string' && motivo.trim()) || vehiculo.garantia.motivo || 'Garantía negada';
        vehiculo.canceladoPor = resueltoPor;
        vehiculo.fechaCancelacion = new Date();
      }
    } else if (accion === 'NO_APLICA') {
      // "No aplica": la orden nueva no correspondía a una garantía. Requiere
      // motivo (queda documentado) y habilita el botón Cancelar en el menú
      // de solicitudes (ver PUT /:id/cancelar) para dar de baja esa orden.
      const motivoFinal = String(motivo ?? vehiculo.garantia.motivo ?? '').trim();
      if (!motivoFinal) {
        return res.status(400).json({
          ok: false,
          msg: 'Para marcar "No aplica" es obligatorio capturar el motivo.',
        });
      }

      vehiculo.garantia.estado = 'NO_APLICA';
      vehiculo.garantia.motivo = motivoFinal;
      vehiculo.garantia.fechaResolucion = new Date();
      vehiculo.garantia.resueltoPor = resueltoPor;
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

    // Resuelta la garantía, se levanta el bloqueo por autorización.
    const ticketAutorizacionId = vehiculo.garantia.autorizacionSolicitada
      ? vehiculo.garantia.ticketPendiente
      : null;
    vehiculo.garantia.ticketPendiente = null;
    vehiculo.garantia.autorizacionSolicitada = false;
    vehiculo.garantia.fechaSolicitudAutorizacion = null;

    await vehiculo.save();

    await cerrarTicketAutorizacion(
      ticketAutorizacionId,
      accion === 'APROBAR' ? 'APROBADO' : 'RECHAZADO',
      resueltoPor
    );

    const actualizado = await Vehiculo.findById(vehiculo._id)
      .populate('cliente', POPULATE_CLIENTE)
      .populate('garantia.ordenAnterior', POPULATE_ORDEN_ANTERIOR);

    return res.json({ ok: true, vehiculo: actualizado });
  } catch (err) {
    console.error('Error resolviendo garantía:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// PUT /api/garantias/:id/cancelar — cancela la orden nueva de una solicitud
// marcada como "No aplica" (solo admin, mismo rol que puede reasignar el
// asesor de la orden de reemplazo en /vehiculos/:id/cambiar-asesor).
router.put('/:id/cancelar', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const vehiculo = await Vehiculo.findById(req.params.id);
    if (!vehiculo || !vehiculo.garantia) {
      return res.status(404).json({ ok: false, msg: 'Solicitud de garantía no encontrada' });
    }
    if (vehiculo.garantia.estado !== 'NO_APLICA') {
      return res.status(400).json({
        ok: false,
        msg: 'Solo se puede cancelar la orden cuando la garantía fue marcada como "No aplica".',
      });
    }
    if (vehiculo.estadoOrden === 'CANCELADA') {
      return res.status(400).json({ ok: false, msg: 'Esta orden ya está cancelada.' });
    }

    vehiculo.estadoAnterior = vehiculo.estadoOrden;
    vehiculo.estadoOrden = 'CANCELADA';
    await vehiculo.save();

    const actualizado = await Vehiculo.findById(vehiculo._id)
      .populate('cliente', POPULATE_CLIENTE)
      .populate('garantia.ordenAnterior', POPULATE_ORDEN_ANTERIOR);

    return res.json({ ok: true, vehiculo: actualizado });
  } catch (err) {
    console.error('Error cancelando orden de garantía:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

module.exports = router;
