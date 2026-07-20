const express = require('express');
const router = express.Router();

const Vehiculo = require('../models/Vehiculo');
const Contador = require('../models/Contador');
const { proteger } = require('../middleware/auth');
const { calcularTotalesOrden } = require('../utils/cajaTotales');
const { generarComprobanteCajaPDF } = require('../service/cajaComprobantePdf');

const POPULATE_CLIENTE = 'nombre apellidoPaterno apellidoMaterno tipoCliente empresa gobierno telefonos celulares emails rfc direccion asesorResponsable';
const POPULATE_GRUPO = { path: 'grupoId', select: 'nombre miembros', populate: { path: 'miembros', select: 'name' } };
const CONTADOR_NOTA_VENTA = 'notaVenta';
const CONTADOR_REMISION = 'remision';

// GET /api/cajas/:id -> detalle de la orden + totales ya calculados
router.get('/:id', proteger, async (req, res) => {
  try {
    const vehiculo = await Vehiculo.findById(req.params.id)
      .populate('cliente', POPULATE_CLIENTE)
      .populate(POPULATE_GRUPO);
    if (!vehiculo) return res.status(404).json({ ok: false, msg: 'Orden no encontrada' });
    return res.json({ ok: true, vehiculo, totales: calcularTotalesOrden(vehiculo) });
  } catch (err) {
    console.error('Error obteniendo orden (cajas):', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// POST /api/cajas/:id/pagos -> registra un pago/abono/anticipo. Cada pago trae
// su propio comprobante (Nota de Venta o Remisión), al cual se le asigna un
// folio nuevo en el momento (escritura atómica $push).
router.post('/:id/pagos', proteger, async (req, res) => {
  try {
    const {
      tipoPago = 'ABONO',
      comprobante,
      montoPesos = 0,
      montoDolares = 0,
      tipoCambio = 0,
      referencia = '',
      observaciones = '',
      banco = '',
      tipoNota = 'Contado',
      tipoRemision = 'Contado',
      fechaPagada,
    } = req.body || {};

    if (!['COMPLETO', 'ABONO', 'ANTICIPO'].includes(tipoPago)) {
      return res.status(400).json({ ok: false, msg: 'Tipo de pago inválido.' });
    }
    if (!['NOTA_VENTA', 'REMISION'].includes(comprobante)) {
      return res.status(400).json({ ok: false, msg: 'Debes elegir Nota de Venta o Remisión.' });
    }

    const monto = Number(montoPesos || 0) + Number(montoDolares || 0) * Number(tipoCambio || 0);
    if (monto <= 0) {
      return res.status(400).json({ ok: false, msg: 'El monto del pago debe ser mayor a 0.' });
    }

    const pago = {
      fecha: new Date(),
      tipoPago,
      comprobante,
      montoPesos: Number(montoPesos) || 0,
      montoDolares: Number(montoDolares) || 0,
      tipoCambio: Number(tipoCambio) || 0,
      monto,
      referencia,
      observaciones,
      registradoPor: req.user?.name || req.user?.username || '',
    };

    if (comprobante === 'NOTA_VENTA') {
      const contador = await Contador.findOneAndUpdate(
        { nombre: CONTADOR_NOTA_VENTA },
        { $inc: { valor: 1 } },
        { new: true, upsert: true }
      );
      pago.notaVenta = { numero: contador.valor, banco, tipo: tipoNota };
    } else {
      const contador = await Contador.findOneAndUpdate(
        { nombre: CONTADOR_REMISION },
        { $inc: { valor: 1 } },
        { new: true, upsert: true }
      );
      pago.remision = {
        numero: contador.valor,
        tipo: tipoRemision,
        fechaPagada: fechaPagada ? new Date(fechaPagada) : null,
      };
    }

    const vehiculo = await Vehiculo.findByIdAndUpdate(
      req.params.id,
      { $push: { pagos: pago } },
      { new: true }
    ).populate('cliente', POPULATE_CLIENTE);
    if (!vehiculo) return res.status(404).json({ ok: false, msg: 'Orden no encontrada' });

    return res.status(201).json({ ok: true, vehiculo, totales: calcularTotalesOrden(vehiculo) });
  } catch (err) {
    console.error('Error registrando pago:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// POST /api/cajas/:id/descuentos -> agrega un descuento (global o sobre una
// pieza/servicio de ventaCliente vía lineaId); queda activo por defecto.
router.post('/:id/descuentos', proteger, async (req, res) => {
  try {
    const { tipo, valor = 0, motivo = '', lineaId = null } = req.body || {};
    if (!['PORCENTAJE', 'MONTO'].includes(tipo)) {
      return res.status(400).json({ ok: false, msg: 'Tipo de descuento inválido.' });
    }

    const descuento = {
      tipo,
      valor: Number(valor) || 0,
      motivo,
      activo: true,
      lineaId: lineaId || null,
      aplicadoPor: req.user?.name || req.user?.username || '',
      fecha: new Date(),
    };

    const vehiculo = await Vehiculo.findByIdAndUpdate(
      req.params.id,
      { $push: { descuentos: descuento } },
      { new: true }
    ).populate('cliente', POPULATE_CLIENTE);
    if (!vehiculo) return res.status(404).json({ ok: false, msg: 'Orden no encontrada' });

    return res.status(201).json({ ok: true, vehiculo, totales: calcularTotalesOrden(vehiculo) });
  } catch (err) {
    console.error('Error agregando descuento:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// PUT /api/cajas/:id/descuentos/:descuentoId -> edita o activa/desactiva un descuento existente
router.put('/:id/descuentos/:descuentoId', proteger, async (req, res) => {
  try {
    const { tipo, valor, motivo, activo, lineaId } = req.body || {};
    if (tipo !== undefined && !['PORCENTAJE', 'MONTO'].includes(tipo)) {
      return res.status(400).json({ ok: false, msg: 'Tipo de descuento inválido.' });
    }

    const sets = {};
    if (tipo !== undefined) sets['descuentos.$.tipo'] = tipo;
    if (valor !== undefined) sets['descuentos.$.valor'] = Number(valor) || 0;
    if (motivo !== undefined) sets['descuentos.$.motivo'] = motivo;
    if (activo !== undefined) sets['descuentos.$.activo'] = !!activo;
    if (lineaId !== undefined) sets['descuentos.$.lineaId'] = lineaId || null;

    const vehiculo = await Vehiculo.findOneAndUpdate(
      { _id: req.params.id, 'descuentos._id': req.params.descuentoId },
      { $set: sets },
      { new: true }
    ).populate('cliente', POPULATE_CLIENTE);
    if (!vehiculo) return res.status(404).json({ ok: false, msg: 'Orden o descuento no encontrado' });

    return res.json({ ok: true, vehiculo, totales: calcularTotalesOrden(vehiculo) });
  } catch (err) {
    console.error('Error actualizando descuento:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// DELETE /api/cajas/:id/descuentos/:descuentoId -> elimina un descuento
router.delete('/:id/descuentos/:descuentoId', proteger, async (req, res) => {
  try {
    const vehiculo = await Vehiculo.findByIdAndUpdate(
      req.params.id,
      { $pull: { descuentos: { _id: req.params.descuentoId } } },
      { new: true }
    ).populate('cliente', POPULATE_CLIENTE);
    if (!vehiculo) return res.status(404).json({ ok: false, msg: 'Orden no encontrada' });

    return res.json({ ok: true, vehiculo, totales: calcularTotalesOrden(vehiculo) });
  } catch (err) {
    console.error('Error eliminando descuento:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// ===== PDFs =====
// Sin `proteger`: se abren vía window.open() y ese request no puede llevar el header Authorization,
// igual que operativo-pdf/presupuesto-pdf/venta-cliente-pdf en routes/vehiculos.js.
// ?pagoId= identifica cuál pago (con su comprobante) se debe imprimir; sin él se
// imprime el pago más reciente con ese tipo de comprobante.
function pagoParaImprimir(vehiculo, pagoId, comprobante) {
  const pagos = vehiculo.pagos || [];
  if (pagoId) {
    const pago = pagos.id(pagoId);
    return pago && pago.comprobante === comprobante ? pago : null;
  }
  return (
    [...pagos]
      .filter((p) => p.comprobante === comprobante)
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0] || null
  );
}

async function imprimirComprobante(req, res, comprobante) {
  const etiqueta = comprobante === 'NOTA_VENTA' ? 'Nota de Venta' : 'Remisión';
  try {
    const vehiculo = await Vehiculo.findById(req.params.id).populate('cliente', POPULATE_CLIENTE);
    if (!vehiculo) return res.status(404).json({ ok: false, msg: 'Orden no encontrada' });

    const pago = pagoParaImprimir(vehiculo, req.query.pagoId, comprobante);
    if (!pago) {
      return res.status(404).json({ ok: false, msg: `La orden no tiene un pago con ${etiqueta}.` });
    }

    await generarComprobanteCajaPDF(res, vehiculo, pago, comprobante);
  } catch (err) {
    console.error(`Error generando PDF de ${etiqueta}:`, err);
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, msg: `Error al generar el PDF de ${etiqueta}` });
    }
  }
}

router.get('/:id/nota-venta-pdf', (req, res) => imprimirComprobante(req, res, 'NOTA_VENTA'));

router.get('/:id/remision-pdf', (req, res) => imprimirComprobante(req, res, 'REMISION'));

module.exports = router;
