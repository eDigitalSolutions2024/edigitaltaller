const express = require('express');
const router = express.Router();

const ValeSalida = require('../models/ValeSalida');
const Vehiculo = require('../models/Vehiculo');
const Contador = require('../models/Contador');
const { streamValeSalidaPdf } = require('../service/valeSalidaPdf');

const CONTADOR_VALE = 'valeSalida';
const POPULATE_CLIENTE = 'nombre apellidoPaterno apellidoMaterno tipoCliente empresa gobierno';

function nombreCliente(c) {
  if (!c) return '';
  if (c.tipoCliente === 'Empresa') return c.empresa || '';
  if (c.tipoCliente === 'Gobierno') return c.gobierno?.nombreGobierno || '';
  return [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(' ');
}

function snapshotFromVehiculo(v) {
  if (!v) return {};
  return {
    vehiculo: v._id,
    asesor: v.creadoPor || '',
    nombreCliente: nombreCliente(v.cliente),
    marca: v.marca || '',
    tipo: v.modelo || '',
    modelo: v.anio || '',
    color: v.color || '',
    serie: v.serie || '',
    placas: v.placas || '',
    kms: v.kmsMillas || '',
  };
}

// GET /api/vales/siguiente-numero -> sólo consulta (no consume) cuál sería el próximo No. de Vale.
// El contador real se reclama hasta que el vale se guarda (POST /), para no perder/saltar
// números cuando el usuario hace doble click pero nunca guarda el vale.
router.get('/siguiente-numero', async (_req, res) => {
  try {
    const contador = await Contador.findOne({ nombre: CONTADOR_VALE });
    return res.json({ ok: true, numero: (contador?.valor || 0) + 1 });
  } catch (err) {
    console.error('Error obteniendo siguiente numero de vale:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/vales/siguiente-dig?noVale=65606 -> próximo "Dig" para ese número (0 si es nuevo)
router.get('/siguiente-dig', async (req, res) => {
  try {
    const noVale = Number(req.query.noVale);
    if (!noVale && noVale !== 0) {
      return res.status(400).json({ ok: false, msg: 'noVale requerido' });
    }
    const count = await ValeSalida.countDocuments({ noVale });
    return res.json({ ok: true, dig: count });
  } catch (err) {
    console.error('Error obteniendo siguiente dig:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/vales/buscar-orden/:noOrden -> datos del cliente/vehículo para autollenar el vale
router.get('/buscar-orden/:noOrden', async (req, res) => {
  try {
    const { noOrden } = req.params;
    const vehiculo = await Vehiculo.findOne({ ordenServicio: noOrden })
      .populate('cliente', POPULATE_CLIENTE)
      .sort({ createdAt: -1 })
      .lean();

    if (!vehiculo) {
      return res.json({ ok: true, encontrado: false });
    }

    return res.json({ ok: true, encontrado: true, data: snapshotFromVehiculo(vehiculo) });
  } catch (err) {
    console.error('Error buscando orden para vale:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/vales?desde=&hasta=&estatus=&noOrden=&noVale=&limit=
router.get('/', async (req, res) => {
  try {
    const { desde, hasta, estatus, noOrden, noVale, limit } = req.query;
    const q = {};

    if (desde && hasta) {
      q.fecha = { $gte: new Date(desde), $lte: new Date(hasta) };
    }
    if (estatus) q.estatus = estatus;
    if (noOrden) q.noOrden = { $regex: noOrden, $options: 'i' };
    if (noVale) q.noVale = Number(noVale);

    const data = await ValeSalida.find(q)
      .sort({ fecha: -1 })
      .limit(Number(limit) || 100)
      .lean();
    return res.json({ ok: true, data, total: data.length });
  } catch (err) {
    console.error('Error listando vales:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/vales/:id
router.get('/:id', async (req, res) => {
  try {
    const vale = await ValeSalida.findById(req.params.id).lean();
    if (!vale) return res.status(404).json({ ok: false, msg: 'Vale no encontrado' });
    return res.json({ ok: true, data: vale });
  } catch (err) {
    console.error('Error obteniendo vale:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// POST /api/vales -> crea un nuevo vale de salida
router.post('/', async (req, res) => {
  try {
    const body = req.body || {};

    if (!body.noOrden) {
      return res.status(400).json({ ok: false, msg: 'noOrden es obligatorio' });
    }
    const noValeSolicitado = Number(body.noVale);
    if (!noValeSolicitado) {
      return res.status(400).json({ ok: false, msg: 'noVale es obligatorio' });
    }

    // ¿El número venía del contador automático (doble click) o se escribió a mano?
    const autoNumero = !!body.autoNumero;

    let noVale = noValeSolicitado;
    let dig = 0;
    const yaExiste = await ValeSalida.countDocuments({ noVale: noValeSolicitado });

    if (yaExiste > 0) {
      if (autoNumero) {
        // Alguien más ya guardó ese número entre el "peek" y este guardado
        // (carrera entre dos cajeros) — se reclama el siguiente número real,
        // en vez de generar un Dig duplicado que el usuario no pidió.
        const contador = await Contador.findOneAndUpdate(
          { nombre: CONTADOR_VALE },
          { $inc: { valor: 1 } },
          { new: true, upsert: true }
        );
        noVale = contador.valor;
      } else {
        // Número capturado manualmente y reutilizado a propósito -> Dig consecutivo.
        dig = yaExiste;
      }
    } else {
      // Número libre: sincroniza el contador para que el próximo "peek"
      // no vuelva a sugerir uno ya usado (aplica tanto si vino del contador
      // como si se escribió manualmente por encima del valor actual).
      await Contador.findOneAndUpdate(
        { nombre: CONTADOR_VALE },
        { $max: { valor: noVale } },
        { upsert: true }
      );
    }

    // Resuelve la orden ligada al vale: si el frontend ya la encontró manda su
    // _id; si no, se busca por noOrden como respaldo, para que el vale quede
    // siempre asignado a la orden cuando ésta exista.
    let vehiculoDoc = null;
    if (body.vehiculo) {
      vehiculoDoc = await Vehiculo.findById(body.vehiculo).populate('cliente', POPULATE_CLIENTE).lean();
    } else {
      vehiculoDoc = await Vehiculo.findOne({ ordenServicio: body.noOrden })
        .populate('cliente', POPULATE_CLIENTE)
        .sort({ createdAt: -1 })
        .lean();
    }
    const snapshot = snapshotFromVehiculo(vehiculoDoc);

    const vale = await ValeSalida.create({
      noOrden: body.noOrden,
      noVale,
      dig,
      quienEntrega: body.quienEntrega || '',
      cajero: body.cajero || '',
      estatus: body.estatus || 'Contado',
      observaciones: body.observaciones || '',
      ...snapshot,
      // permite forzar/corregir manualmente cualquier campo del snapshot
      ...(body.nombreCliente ? { nombreCliente: body.nombreCliente } : {}),
      ...(body.asesor ? { asesor: body.asesor } : {}),
      ...(body.marca ? { marca: body.marca } : {}),
      ...(body.tipo ? { tipo: body.tipo } : {}),
      ...(body.modelo ? { modelo: body.modelo } : {}),
      ...(body.color ? { color: body.color } : {}),
      ...(body.serie ? { serie: body.serie } : {}),
      ...(body.placas ? { placas: body.placas } : {}),
      ...(body.kms ? { kms: body.kms } : {}),
    });

    // La orden siempre refleja el último vale emitido (se sobreescribe cada vez).
    if (vehiculoDoc) {
      await Vehiculo.findByIdAndUpdate(vehiculoDoc._id, {
        ultimoVale: { noVale: vale.noVale, dig: vale.dig, fecha: vale.fecha },
      });
    }

    return res.status(201).json({ ok: true, data: vale });
  } catch (err) {
    console.error('Error creando vale:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// PUT /api/vales/:id -> actualizar (ej. cambiar estatus)
router.put('/:id', async (req, res) => {
  try {
    const { estatus, quienEntrega, observaciones } = req.body || {};
    const update = {};
    if (estatus) update.estatus = estatus;
    if (quienEntrega !== undefined) update.quienEntrega = quienEntrega;
    if (observaciones !== undefined) update.observaciones = observaciones;

    const vale = await ValeSalida.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!vale) return res.status(404).json({ ok: false, msg: 'Vale no encontrado' });
    return res.json({ ok: true, data: vale });
  } catch (err) {
    console.error('Error actualizando vale:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/vales/:id/pdf
router.get('/:id/pdf', async (req, res) => {
  try {
    const vale = await ValeSalida.findById(req.params.id).lean();
    if (!vale) return res.status(404).json({ ok: false, msg: 'Vale no encontrado' });
    await streamValeSalidaPdf(res, vale);
  } catch (err) {
    console.error('Error generando PDF de vale:', err);
    if (!res.headersSent) res.status(500).json({ ok: false, msg: 'Error generando PDF' });
  }
});

module.exports = router;
