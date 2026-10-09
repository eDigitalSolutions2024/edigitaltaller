const express = require('express');
const router = express.Router();
const GarageVehiculo = require('../models/GarageVehiculo');
const Vehiculo = require('../models/Vehiculo');
const Cliente = require('../models/Cliente');
const { normalizaLineaNegocio } = require('../utils/lineaNegocio');

const POPULATE_CLIENTES = 'nombre apellidoPaterno tipoCliente empresa gobierno esEmpleado';

// Filtro por línea de negocio sobre el garaje (la serie es única, así que no
// lleva campo propio): una serie pertenece a la línea de las órdenes que se le
// han abierto; si aún no tiene órdenes, a la de sus clientes. Una serie usada
// en ambas líneas aparece en las dos.
async function filtroGarajePorLinea(lineaRaw) {
  const linea = normalizaLineaNegocio(lineaRaw);
  const [serieChirey, serieNormal, clientesChirey] = await Promise.all([
    Vehiculo.find({ lineaNegocio: 'CHIREY' }).distinct('serie'),
    Vehiculo.find({ lineaNegocio: { $ne: 'CHIREY' } }).distinct('serie'),
    Cliente.find({ lineaNegocio: 'CHIREY' }).distinct('_id'),
  ]);
  if (linea === 'CHIREY') {
    return {
      $or: [
        { serie: { $in: serieChirey } },
        { serie: { $nin: serieNormal }, clientes: { $in: clientesChirey } },
      ],
    };
  }
  return {
    $or: [
      { serie: { $in: serieNormal } },
      { serie: { $nin: serieChirey }, clientes: { $nin: clientesChirey } },
    ],
  };
}

// GET /api/garage — listar todos los vehículos del garaje
// Siempre calcula el conteo real de órdenes cerradas por serie.
// ?detalle=1 además incluye el listado completo de órdenes (vista admin)
// ?lineaNegocio=CHIREY|SERVICOMPACTO limita a los vehículos de esa línea (sin el parámetro, todos)
// ?search=xxx busca por coincidencia parcial de serie (autocompletado) y limita a 8 resultados
router.get('/', async (req, res) => {
  try {
    const { search = '' } = req.query;
    const q = {};
    if (search.trim()) {
      q.serie = { $regex: search.trim(), $options: 'i' };
    }
    if (req.query.lineaNegocio) {
      const f = await filtroGarajePorLinea(req.query.lineaNegocio);
      q.$and = [f];
    }

    let query = GarageVehiculo.find(q)
      .populate('clientes', POPULATE_CLIENTES)
      .sort({ updatedAt: -1 });
    if (search.trim()) {
      query = query.limit(8);
    }
    const garageVehiculos = await query;

    const esDetalle = req.query.detalle === '1';
    // Con línea, las órdenes y el conteo del vehículo se limitan a esa línea
    const filtroOrdenes = req.query.lineaNegocio
      ? (normalizaLineaNegocio(req.query.lineaNegocio) === 'CHIREY'
          ? { lineaNegocio: 'CHIREY' }
          : { lineaNegocio: { $ne: 'CHIREY' } })
      : {};

    const data = await Promise.all(
      garageVehiculos.map(async (g) => {
        const obj = g.toObject();

        if (esDetalle) {
          const ordenesCerradas = await Vehiculo.find({
            serie: g.serie,
            estadoOrden: 'CERRADA',
            ...filtroOrdenes,
          })
            .select('ordenServicio fechaRecepcion fechaCierre')
            .populate('cliente', POPULATE_CLIENTES)
            .sort({ fechaCierre: -1 });

          obj.ordenesCerradas = ordenesCerradas;
          obj.vecesUsado = ordenesCerradas.length;
        } else {
          // Solo el conteo real para el modal de selección
          obj.vecesUsado = await Vehiculo.countDocuments({
            serie: g.serie,
            estadoOrden: 'CERRADA',
            ...filtroOrdenes,
          });
        }

        return obj;
      })
    );

    return res.json({ ok: true, data });
  } catch (err) {
    console.error('Error listando garage:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/garage/serie/:serie — buscar vehículo por número de serie
router.get('/serie/:serie', async (req, res) => {
  try {
    const { serie } = req.params;
    const vehiculo = await GarageVehiculo.findOne({
      serie: { $regex: new RegExp(`^${serie.trim()}$`, 'i') },
    }).populate('clientes', POPULATE_CLIENTES);

    if (!vehiculo) {
      return res.status(404).json({ ok: false, msg: 'Vehículo no encontrado en el garaje' });
    }

    return res.json({ ok: true, data: vehiculo });
  } catch (err) {
    console.error('Error buscando en garage por serie:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// POST /api/garage — crear o actualizar vehículo en el garaje (upsert por serie)
// Agrega el cliente al historial sin duplicar usando $addToSet
router.post('/', async (req, res) => {
  try {
    const {
      serie,
      marca,
      modelo,
      anio,
      color,
      placas,
      kmsMillas,
      nacionalidad,
      motor,
      numeroEconomico,
      traccion,
      clienteId,
    } = req.body;

    if (!serie || !serie.trim()) {
      return res.status(400).json({ ok: false, msg: 'El número de serie es obligatorio' });
    }

    const updateOp = {
      $set: {
        marca:           marca || '',
        modelo:          modelo || '',
        anio:            anio || '',
        color:           color || '',
        placas:          placas || '',
        kmsMillas:       kmsMillas || '',
        nacionalidad:    nacionalidad || '',
        motor:           motor || '',
        numeroEconomico: numeroEconomico || '',
        traccion:        traccion || '',
      },
    };

    if (clienteId) {
      updateOp.$addToSet = { clientes: clienteId };
    }

    const vehiculo = await GarageVehiculo.findOneAndUpdate(
      { serie: serie.trim() },
      updateOp,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).populate('clientes', POPULATE_CLIENTES);

    return res.json({ ok: true, data: vehiculo });
  } catch (err) {
    console.error('Error guardando en garage:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// POST /api/garage/importar-cerradas — migración: registra en el garaje todos los
// vehículos de órdenes cerradas que tengan serie, con sus datos completos y clientes
router.post('/importar-cerradas', async (req, res) => {
  try {
    const ordenesCerradas = await Vehiculo.find({
      estadoOrden: 'CERRADA',
      serie:       { $exists: true, $ne: '' },
    }).select(
      'serie marca modelo anio color placas kmsMillas nacionalidad motor numeroEconomico traccion cliente'
    );

    // Agrupar por serie para procesar un upsert por vehículo
    const porSerie = {};
    for (const orden of ordenesCerradas) {
      const s = orden.serie?.trim();
      if (!s) continue;
      if (!porSerie[s]) porSerie[s] = [];
      porSerie[s].push(orden);
    }

    let creados = 0;
    let actualizados = 0;
    const omitidos = ordenesCerradas.length - Object.values(porSerie).flat().length;

    for (const [serie, ordenes] of Object.entries(porSerie)) {
      const existia = await GarageVehiculo.findOne({ serie });

      // Usar los datos de la orden más reciente para los campos del vehículo
      const ultima = ordenes[ordenes.length - 1];

      // Recopilar todos los clientes únicos del grupo
      const clienteIds = [...new Set(
        ordenes.map((o) => o.cliente?.toString()).filter(Boolean)
      )];

      const updateOp = {
        $set: {
          marca:           ultima.marca           || '',
          modelo:          ultima.modelo          || '',
          anio:            ultima.anio            || '',
          color:           ultima.color           || '',
          placas:          ultima.placas          || '',
          kmsMillas:       ultima.kmsMillas       || '',
          nacionalidad:    ultima.nacionalidad    || '',
          motor:           ultima.motor           || '',
          numeroEconomico: ultima.numeroEconomico || '',
          traccion:        ultima.traccion        || '',
          vecesUsado:      ordenes.length,
        },
      };

      if (clienteIds.length > 0) {
        updateOp.$addToSet = { clientes: { $each: clienteIds } };
      }

      await GarageVehiculo.findOneAndUpdate(
        { serie },
        updateOp,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      existia ? actualizados++ : creados++;
    }

    const totalSeries = Object.keys(porSerie).length;

    return res.json({
      ok: true,
      msg: `Importación completada: ${creados} nuevos, ${actualizados} actualizados, ${omitidos} sin serie omitidos.`,
      creados,
      actualizados,
      omitidos,
      total: ordenesCerradas.length,
      totalSeries,
    });
  } catch (err) {
    console.error('Error en importación de cerradas:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

module.exports = router;
