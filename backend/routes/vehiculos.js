// backend/routes/vehiculos.js
const express = require('express');
const router = express.Router();

const Vehiculo = require('../models/Vehiculo');
const Cliente = require('../models/Cliente');
const OrdenCompra = require('../models/OrdenCompra');
const { proteger, requiereRol } = require('../middleware/auth');
const EntradaInventario = require('../models/EntradaInventario');
const SalidaInventario  = require('../models/SalidaInventario');
const AjusteInventario  = require('../models/AjusteInventario');
const CodigoRefaccion   = require('../models/CodigoRefaccion');

const POPULATE_CLIENTE = 'nombre apellidoPaterno apellidoMaterno tipoCliente empresa gobierno telefonos celulares emails rfc direccion asesorResponsable';

const { streamVehiculoOperativoPdf } = require('../service/VehiculoOperativoPdf');
const { streamVehiculoOrdenPdf } = require('../service/vehiculoOrdenPdf');

const { generarPresupuestoPDF } = require('../service/VehiculoPresupuestoPDF');
const { generarVentaClientePDF } = require('../service/VehiculoVentaClientePDF');



// 👇 Helper para generar folio de OC
function generarNumeroOC() {
  const ahora = new Date();
  const yyyy = ahora.getFullYear();
  const mm = String(ahora.getMonth() + 1).padStart(2, '0');
  const dd = String(ahora.getDate()).padStart(2, '0');
  const hh = String(ahora.getHours()).padStart(2, '0');
  const mi = String(ahora.getMinutes() + 1).padStart(2, '0');
  const ss = String(ahora.getSeconds()).padStart(2, '0');
  // Ejemplo: OC-20241208-143015
  return `OC-${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

/**
 * Calcula stock actual keyed by numeroParte.
 * EntradaInventario guarda codigoInterno como ObjectId del CodigoRefaccion,
 * así que primero resolvemos numeroParte → ObjectId y luego consultamos por ObjectId.
 * SalidaInventario creada desde el flujo de venta/surtir puede guardar tanto
 * el ObjectId como el numeroParte, por eso buscamos por ambos.
 */
async function getStockMapLocal(numerosParteLista) {
  const strList = [...new Set(numerosParteLista.map(String))];

  // 1) Resolver numeroParte → CodigoRefaccion._id (ObjectId)
  const codigoDocs = await CodigoRefaccion.find(
    { $or: [{ numeroParte: { $in: strList } }, { codigo: { $in: strList } }] },
    { _id: 1, numeroParte: 1, codigo: 1 }
  ).lean();

  // oidStr → numeroParte para mapear de vuelta al final
  const oidToNP = new Map();
  const objIds  = [];
  for (const c of codigoDocs) {
    const np = c.numeroParte || c.codigo || '';
    oidToNP.set(String(c._id), np);
    objIds.push(c._id);
  }

  // Ids para buscar en EntradaInventario/SalidaInventario: ObjectIds + strings originales
  const allMatchIds = [...objIds, ...strList];

  const [entradas, salidas, ajustes] = await Promise.all([
    EntradaInventario.aggregate([
      { $unwind: '$captura' },
      { $match: { 'captura.codigoInterno': { $in: allMatchIds } } },
      { $group: { _id: '$captura.codigoInterno', cant: { $sum: { $ifNull: ['$captura.cantidad', 0] } } } },
    ]),
    SalidaInventario.aggregate([
      { $unwind: '$partidas' },
      { $match: { 'partidas.codigoInterno': { $in: allMatchIds } } },
      { $group: { _id: '$partidas.codigoInterno', cant: { $sum: { $ifNull: ['$partidas.cantidad', 0] } } } },
    ]),
    AjusteInventario.aggregate([
      { $match: { codigoInterno: { $in: strList } } },
      { $group: { _id: '$codigoInterno', cant: { $sum: { $ifNull: ['$cantidad', 0] } } } },
    ]),
  ]);

  // 2) Acumular stock por rawId
  const rawMap = new Map();
  for (const d of entradas) rawMap.set(String(d._id), (rawMap.get(String(d._id)) || 0) + d.cant);
  for (const d of salidas)  rawMap.set(String(d._id), (rawMap.get(String(d._id)) || 0) - d.cant);
  for (const d of ajustes)  rawMap.set(String(d._id), (rawMap.get(String(d._id)) || 0) + d.cant);

  // 3) Mapear rawId → numeroParte para que el caller pueda hacer stockMap.get(p.codigo)
  const result = new Map(); // numeroParte → stock
  for (const [rawId, stock] of rawMap) {
    const np = oidToNP.get(rawId) || rawId; // si es ObjectId, resuelve a NP; si ya es string, lo usa
    result.set(np, (result.get(np) || 0) + stock);
  }
  return result;
}

/**
 * Dado un array de numeroParte, devuelve un mapa: numeroParte → ObjectId del CodigoRefaccion.
 * Útil para guardar codigoInterno correcto en SalidaInventario.
 */
async function resolveNPtoOid(numerosParteLista) {
  const docs = await CodigoRefaccion.find(
    { $or: [{ numeroParte: { $in: numerosParteLista } }, { codigo: { $in: numerosParteLista } }] },
    { _id: 1, numeroParte: 1, codigo: 1 }
  ).lean();
  const map = new Map();
  for (const c of docs) {
    const np = c.numeroParte || c.codigo || '';
    map.set(np, String(c._id)); // String para que coincida con codigoInterno de EntradaInventario
  }
  return map;
}

// 👇 Helper para generar número de Orden de Servicio
async function generarOrdenServicio() {
  // Buscamos el último vehículo creado (por fecha de creación)
  const ultimo = await Vehiculo.findOne()
    .sort({ createdAt: -1 })
    .lean();

  let nextNum = 1;

  if (ultimo?.ordenServicio) {
    // Tomamos la parte numérica al final (ej: OS-00012 -> 12)
    const match = String(ultimo.ordenServicio).match(/(\d+)$/);
    if (match) {
      nextNum = Number(match[1]) + 1;
    }
  }

  // Formato: OS-00001, OS-00002, etc.
  return `OS-${String(nextNum).padStart(5, '0')}`;
}

// POST /api/vehiculos  -> registrar nuevo vehículo para un cliente
router.post('/', async (req, res) => {
  try {
    const { clienteId, ...data } = req.body;

    if (!clienteId) {
      return res
        .status(400)
        .json({ ok: false, msg: 'clienteId es obligatorio' });
    }

    // armamos el payload base
    const payload = {
      cliente: clienteId,
      ...data,
    };

    // 👇 Si no viene ordenServicio, la generamos aquí
    {/*if (!payload.ordenServicio) {
      payload.ordenServicio = await generarOrdenServicio();
    }*/}

    // 👇 Verificar que el número de orden no esté duplicado
    const duplicado = await Vehiculo.findOne({ ordenServicio: payload.ordenServicio });
    if (duplicado) {
      return res.status(400).json({
        ok: false,
        msg: `Ya existe una orden con el número "${payload.ordenServicio}". Usa un número diferente.`
      });
    }

    const vehiculo = new Vehiculo(payload);
    await vehiculo.save();

    // Actualizar datos del cliente con la información capturada en el formulario
    const b = req.body;
    const clienteDoc = await Cliente.findById(clienteId);
    if (clienteDoc) {
      const clienteUpdate = {};
      const esParticular = clienteDoc.tipoCliente === 'Particular';

      if (esParticular) {
        if (b.nombreCliente)    clienteUpdate.nombre           = b.nombreCliente;
        if (b.apellidoPaterno)  clienteUpdate.apellidoPaterno  = b.apellidoPaterno;
        if (b.apellidoMaterno)  clienteUpdate.apellidoMaterno  = b.apellidoMaterno;
      } else {
        if (b.nombreGobierno)             clienteUpdate['gobierno.nombreGobierno']              = b.nombreGobierno;
        if (b.nombreContactoGobierno)     clienteUpdate['gobierno.contactoGobierno.nombre']     = b.nombreContactoGobierno;
        if (b.nombreDependencia)          clienteUpdate['gobierno.dependencia.nombre']           = b.nombreDependencia;
        if (b.nombreContactoDependencia)  clienteUpdate['gobierno.dependencia.contacto.nombre'] = b.nombreContactoDependencia;
      }

      if (b.rfc) clienteUpdate.rfc = b.rfc;

      if (b.telefonoFijo || b.telefonoFijoLada) {
        clienteUpdate.telefonos = [{ lada: b.telefonoFijoLada || '', numero: b.telefonoFijo || '' }];
      }
      if (b.celular || b.celularLada) {
        clienteUpdate.celulares = [{ lada: b.celularLada || '', numero: b.celular || '' }];
      }
      if (Array.isArray(b.correos) && b.correos.length) {
        clienteUpdate.emails = b.correos;
      }
      if (b.direccion || b.ciudad) {
        clienteUpdate.direccion = {
          calle: b.direccion || '',
          numeroExterior: b.numeroExt || '',
          numeroInterior: b.numeroInt || '',
          colonia: b.colonia || '',
          codigoPostal: b.codigoPostal || '',
          ciudad: b.ciudad || '',
          estado: b.estado || '',
        };
      }

      if (Object.keys(clienteUpdate).length > 0) {
        await Cliente.findByIdAndUpdate(clienteId, { $set: clienteUpdate });
      }
    }

    const vehiculoConCliente = await Vehiculo.findById(vehiculo._id).populate('cliente', POPULATE_CLIENTE);
    return res.status(201).json({ ok: true, vehiculo: vehiculoConCliente });
  } catch (err) {
    console.error('Error creando vehiculo:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// (Opcional) GET /api/vehiculos/cliente/:clienteId -> listar vehículos del cliente
router.get('/cliente/:clienteId', async (req, res) => {
  try {
    const { clienteId } = req.params;
    const vehiculos = await Vehiculo.find({ cliente: clienteId }).sort({
      createdAt: -1,
    });
    return res.json({ ok: true, data: vehiculos });
  } catch (err) {
    console.error('Error listando vehiculos:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/vehiculos/ordenes?estado=PENDIENTE_CAPTURA&searchOs=&search=&page=1&limit=10
router.get('/ordenes', async (req, res) => {
  try {
    const {
      estado = '',
      pendienteCierre,
      searchOs = '',
      search = '',
      page = 1,
      limit = 10,
    } = req.query;

    const q = {};

    if (pendienteCierre === 'true') {
      q.pendienteCierre = true;
    } else if (estado) {
      q.estadoOrden = estado;
    }

    // Buscar por número de orden exacto o parcial
    if (searchOs) {
      q.ordenServicio = { $regex: searchOs, $options: 'i' };
    }

    // Búsqueda general (placas, marca/modelo)
    if (search) {
      q.$or = [
        { placas: { $regex: search, $options: 'i' } },
        { marca: { $regex: search, $options: 'i' } },
        { modelo: { $regex: search, $options: 'i' } },
      ];
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    const [data, total] = await Promise.all([
      Vehiculo.find(q)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('cliente', POPULATE_CLIENTE),
      Vehiculo.countDocuments(q),
    ]);

    return res.json({
      ok: true,
      data,
      total,
      page: pageNum,
      limit: limitNum,
    });
  } catch (err) {
    console.error('Error listando ordenes:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/vehiculos/mis-ordenes — OS activas del asesor logueado (excluye CERRADA)
router.get('/mis-ordenes', proteger, requiereRol('asesor_servicio', 'admin'), async (req, res) => {
  try {
    const nombreUsuario = req.user.name || req.user.username;
    const ordenes = await Vehiculo.find({
      creadoPor: nombreUsuario,
      estadoOrden: { $ne: 'CERRADA' },
    })
      .select('ordenServicio estadoOrden marca modelo anio color createdAt cliente')
      .populate('cliente', POPULATE_CLIENTE)
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ ok: true, data: ordenes });
  } catch (err) {
    console.error('Error listando mis-ordenes:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// PUT /api/vehiculos/:id/servicio  -> guarda servicio/reparación e inicia la orden
router.put('/:id/servicio', async (req, res) => {
  try {
    const { servicioReparacion } = req.body;

    const vehiculo = await Vehiculo.findByIdAndUpdate(
      req.params.id,
      {
        servicioReparacion,
        ordenIniciada: true,
        estadoOrden: 'PENDIENTE_REFACCIONARIA',  // 👈 mover de CAPTURA a REFACCIONARIA
      },
      { new: true }
    );

    if (!vehiculo) {
      return res.status(404).json({ ok: false, msg: 'Orden no encontrada' });
    }

    return res.json({ ok: true, vehiculo });
  } catch (err) {
    console.error('Error actualizando servicio/reparación:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// PUT /api/vehiculos/:id/requisicion-diagnostico
router.put('/:id/requisicion-diagnostico', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      diagnosticoTecnico,
      refacciones,      // viene del frontend
      cargosEnOrden,    // opcional, para después
      manoObra,         // opcional, para después
      estadoOrden,      // opcional, si quieres avanzar el flujo
      devueltoPor,
    } = req.body;

    const vehiculo = await Vehiculo.findById(id);
    if (!vehiculo) {
      return res.status(404).json({ ok: false, msg: 'Orden no encontrada' });
    }

    // Diagnóstico
    if (diagnosticoTecnico !== undefined) {
      vehiculo.diagnosticoTecnico = diagnosticoTecnico;
    }

    // Refacciones solicitadas (las que ves en la tabla)
    if (Array.isArray(refacciones)) {
      // Aquí ya pueden venir requiereOC, ocGenerada, numeroOC, etc.
      vehiculo.refaccionesSolicitadas = refacciones;
    }

    // Cargos en orden (para después, si los mandas)
    if (Array.isArray(cargosEnOrden)) {
      vehiculo.cargosEnOrden = cargosEnOrden;
    }

    if (Array.isArray(manoObra)) {
      vehiculo.manoObra = manoObra;
    }


    // Si quieres ir moviendo la orden de estado
    if (estadoOrden) {
      vehiculo.estadoOrden = estadoOrden;

      if (estadoOrden === 'PENDIENTE_REFACCIONARIA') {
        vehiculo.fechaSolicitudRefacciones = new Date();
        vehiculo.fechaRespuestaRefaccionaria = null;
      }

      if (estadoOrden === 'PENDIENTE_AUTORIZACION_CLIENTE') {
        vehiculo.fechaRespuestaRefaccionaria = new Date();
        if (devueltoPor) vehiculo.devueltoPor = devueltoPor;
      }

      if (estadoOrden === 'PENDIENTE_CERRAR') {
        vehiculo.pendienteCierre = true;
      }
    }


    await vehiculo.save();

    const vehiculoConCliente = await Vehiculo.findById(vehiculo._id).populate('cliente', POPULATE_CLIENTE);
    return res.json({ ok: true, vehiculo: vehiculoConCliente });
  } catch (err) {
    console.error('Error guardando requisicion/diagnostico:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// PUT /api/vehiculos/:id/presupuesto-venta
router.put('/:id/presupuesto-venta', proteger, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      presupuesto,
      ventaCliente,
      manoObra,
      observacionesExternas,
      observacionesInternas,
      estadoOrden,
      dirigidoA,
      departamento,
      requiereFactura,
      observCotizacion,
      accionCotizacion,
      crearNuevaVersionCotizacion,
      accionVentaCliente,
      crearNuevaVersionVentaCliente,
    } = req.body;

    const vehiculo = await Vehiculo.findById(id);
    if (!vehiculo) {
      return res.status(404).json({ ok: false, msg: 'Orden no encontrada' });
    }

    if (Array.isArray(presupuesto)) {
      vehiculo.presupuesto = presupuesto;
    }

    if (Array.isArray(ventaCliente)) {
      vehiculo.ventaCliente = ventaCliente;
    }

    if (Array.isArray(manoObra)) {
      vehiculo.manoObra = manoObra;
    }

    if (typeof observacionesExternas === 'string') {
      vehiculo.observacionesExternas = observacionesExternas;
    }

    if (typeof observacionesInternas === 'string') {
      vehiculo.observacionesInternas = observacionesInternas;
    }

    if (typeof dirigidoA === 'string') {
      vehiculo.dirigidoA = dirigidoA;
    }

    if (typeof departamento === 'string') {
      vehiculo.departamento = departamento;
    }

    if (typeof observCotizacion === 'string') {
      vehiculo.observCotizacion = observCotizacion;
    }

    let inventarioResult = null;

    if (estadoOrden) {
      if (estadoOrden === 'PENDIENTE_SURTIR') {
        // Verificar inventario por cada partida autorizada que tenga código
        const autorizadas = (vehiculo.presupuesto || []).filter(p => p.autorizado && p.codigo);
        let autoSurtidas = 0;

        if (autorizadas.length > 0) {
          const codigos = [...new Set(autorizadas.map(p => String(p.codigo)))];
          const stockMap = await getStockMapLocal(codigos);
          const partidasSalida = [];

          for (const p of vehiculo.presupuesto) {
            if (!p.autorizado || !p.codigo) continue;
            const stock = stockMap.get(String(p.codigo)) || 0;
            const qty   = Number(p.cant) || 1;
            if (stock >= qty) {
              p.surtida = true;
              autoSurtidas++;
              partidasSalida.push({
                codigoInterno: String(p.codigo),
                descripcion:   (p.refaccion || p.concepto || '').trim(),
                marca:         (p.marca || '').trim(),
                unidad:        'Pieza',
                cantidad:      qty,
              });
            }
          }

          if (partidasSalida.length > 0) {
            const oidMap = await resolveNPtoOid(partidasSalida.map(p => String(p.codigoInterno)));
            // Solo incluir partidas que existen en BD Códigos (evita entradas negativas por códigos temporales)
            const partidasConOid = partidasSalida
              .map(p => ({ ...p, codigoInterno: oidMap.get(String(p.codigoInterno)) || null }))
              .filter(p => p.codigoInterno !== null);
            if (partidasConOid.length > 0) {
              await SalidaInventario.create({
                fechaSalida:   new Date(),
                ordenServicio: vehiculo.ordenServicio || '',
                surtidoPor:    req.user?.name || req.user?.username || '',
                partidas:      partidasConOid,
                estatus:       'cerrada',
              });
            }
          }
        }

        // Si TODAS las partidas autorizadas ya están surtidas → saltar a reparación
        const todasSurtidas = (vehiculo.presupuesto || [])
          .filter(p => p.autorizado)
          .every(p => p.surtida);

        if (todasSurtidas && autorizadas.length > 0) {
          vehiculo.estadoOrden = 'REPARACION_EN_CURSO';
        } else {
          vehiculo.estadoOrden     = 'PENDIENTE_SURTIR';
          vehiculo.fechaEnvioSurtir = new Date();
        }

        const pendientesSurtir = (vehiculo.presupuesto || [])
          .filter(p => p.autorizado && !p.surtida).length;

        inventarioResult = { autoSurtidas, pendientesSurtir };
      } else {
        vehiculo.estadoOrden = estadoOrden;
      }
    }

    if (
      accionCotizacion === 'ENVIAR_COTIZACION' &&
      Array.isArray(presupuesto) &&
      presupuesto.length > 0
    ) {
      const ultimaCotizacion =
        vehiculo.historialCotizaciones?.[vehiculo.historialCotizaciones.length - 1];

      const hayCotizacionActiva =
        ultimaCotizacion &&
        ['ENVIADA', 'PARCIALMENTE_AUTORIZADA'].includes(ultimaCotizacion.estado);

      if (hayCotizacionActiva && !crearNuevaVersionCotizacion) {
        return res.status(409).json({
          ok: false,
          code: 'COTIZACION_ACTIVA_EXISTENTE',
          msg: `Ya existe una cotización activa (${ultimaCotizacion.folio}).`,
          cotizacion: ultimaCotizacion,
        });
      }


      const siguienteNumero = (vehiculo.historialCotizaciones?.length || 0) + 1;

      const partidas = presupuesto.map((p, index) => ({
        ...p,
        estatusCotizacion: p.estatusCotizacion || 'PENDIENTE_CLIENTE',
        origenPresupuestoIndex: index,
      }));

      const todasAutorizadas = partidas.every(
        (p) => p.estatusCotizacion === 'AUTORIZADA'
      );

      const todasRechazadas = partidas.every(
        (p) => p.estatusCotizacion === 'RECHAZADA'
      );

      const algunaAutorizada = partidas.some(
        (p) => p.estatusCotizacion === 'AUTORIZADA'
      );

      const estadoCotizacion = todasAutorizadas
        ? 'AUTORIZADA'
        : todasRechazadas
          ? 'RECHAZADA'
          : algunaAutorizada
            ? 'PARCIALMENTE_AUTORIZADA'
            : 'ENVIADA';

      vehiculo.historialCotizaciones.push({
        folio: `COT-${String(siguienteNumero).padStart(4, '0')}`,
        fecha: new Date(),
        estado: estadoCotizacion,
        dirigidoA: dirigidoA || vehiculo.dirigidoA || '',
        departamento: departamento || vehiculo.departamento || '',
        observCotizacion: observCotizacion || vehiculo.observCotizacion || '',
        partidas,
      });

      if (
        accionVentaCliente === 'GUARDAR_HISTORIAL_VENTA' &&
        Array.isArray(presupuesto) &&
        presupuesto.length > 0
      ) {
        const ultimaVenta =
          vehiculo.historialVentaCliente?.[vehiculo.historialVentaCliente.length - 1];

        const hayVentaActiva =
          ultimaVenta &&
          ['ENVIADA', 'PARCIALMENTE_AUTORIZADA', 'PENDIENTE'].includes(ultimaVenta.estado);

        if (hayVentaActiva && !crearNuevaVersionVentaCliente) {
          return res.status(409).json({
            ok: false,
            code: 'VENTA_CLIENTE_ACTIVA_EXISTENTE',
            msg: `Ya existe un historial de venta activo (${ultimaVenta.folio}).`,
            ventaCliente: ultimaVenta,
          });
        }

        const siguienteNumero = (vehiculo.historialVentaCliente?.length || 0) + 1;

        const partidas = presupuesto.map((p, index) => ({
          ...p,
          estatusCliente: p.estatusCliente || 'COTIZADA',
          origenPresupuestoIndex: index,
        }));

        const todasVendidas = partidas.every(
          (p) => p.estatusCliente === 'VENDIDA'
        );

        const todasAutorizadas = partidas.every(
          (p) => ['AUTORIZADA', 'VENDIDA'].includes(p.estatusCliente)
        );

        const todasNoAutorizadas = partidas.every(
          (p) => p.estatusCliente === 'NO_AUTORIZADA'
        );

        const algunaAutorizada = partidas.some(
          (p) => ['AUTORIZADA', 'VENDIDA'].includes(p.estatusCliente)
        );

        const algunaPendiente = partidas.some(
          (p) => p.estatusCliente === 'PENDIENTE'
        );

        const estadoVenta = todasVendidas
          ? 'VENDIDA'
          : todasAutorizadas
            ? 'AUTORIZADA'
            : todasNoAutorizadas
              ? 'NO_AUTORIZADA'
              : algunaAutorizada
                ? 'PARCIALMENTE_AUTORIZADA'
                : algunaPendiente
                  ? 'PENDIENTE'
                  : 'ENVIADA';

        vehiculo.historialVentaCliente.push({
          folio: `VENTA-${String(siguienteNumero).padStart(4, '0')}`,
          fecha: new Date(),
          estado: estadoVenta,
          dirigidoA: dirigidoA || vehiculo.dirigidoA || '',
          departamento: departamento || vehiculo.departamento || '',
          observCotizacion: observCotizacion || vehiculo.observCotizacion || '',
          partidas,
        });
      }

    }
    await vehiculo.save();

    return res.json({ ok: true, vehiculo, inventario: inventarioResult });
  } catch (err) {
    console.error('Error guardando presupuesto/venta/manoObra:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// 💥 Generar Orden de Compra para una refacción
// POST /api/vehiculos/:id/orden-compra
router.post(
  '/:id/orden-compra',
  proteger,
  requiereRol('jefe', 'admin', 'contabilidad'),   // ajusta si quieres
  async (req, res) => {
    try {
      const { id } = req.params;
      const { refaccion } = req.body; // la fila que manda el front

      if (!refaccion) {
        return res
          .status(400)
          .json({ ok: false, mensaje: 'Falta la refacción en el body.' });
      }

      const vehiculo = await Vehiculo.findById(id);
      if (!vehiculo) {
        return res
          .status(404)
          .json({ ok: false, mensaje: 'Orden / vehículo no encontrado.' });
      }

      // Buscar una línea compatible dentro de refaccionesSolicitadas
      const idx = (vehiculo.refaccionesSolicitadas || []).findIndex((r) => {
        const rOp = r.opciones?.[r.opcionSeleccionada] || {};
        const refOp = refaccion.opciones?.[refaccion.opcionSeleccionada] || {};
        return (
          String(r.refaccion || '') === String(refaccion.refaccion || '') &&
          String(rOp.codigo || '') === String(refOp.codigo || refaccion.codigo || '') &&
          Number(r.cant || 0) === Number(refaccion.cant || 0) &&
          Number(rOp.precioUnitario || 0) === Number(refOp.precioUnitario || refaccion.precioUnitario || 0)
        );
      });

      if (idx === -1) {
        return res.status(404).json({
          ok: false,
          mensaje:
            'No se encontró la refacción en la orden. Revisa que coincidan cantidad/código.',
        });
      }

      const linea = vehiculo.refaccionesSolicitadas[idx];

      if (linea.ocGenerada) {
        return res.status(400).json({
          ok: false,
          mensaje: 'Esta refacción ya tiene una orden de compra.',
        });
      }

      if (linea.estatus !== 'APROBADA') {
        return res.status(400).json({
          ok: false,
          mensaje:
            'Solo se puede generar orden de compra para refacciones APROBADAS.',
        });
      }

      // Crear número de OC
      const numeroOC = generarNumeroOC();

      // Extraer datos de la opción seleccionada
      const op = linea.opciones?.[linea.opcionSeleccionada] || {};

      // Crear OrdenCompra
      const oc = await OrdenCompra.create({
        numero: numeroOC,
        orden: vehiculo._id,
        proveedor: op.proveedor || '',
        lineas: [
          {
            cant: linea.cant,
            unidad: op.unidad || '',
            refaccion: linea.refaccion,
            tipo: op.tipo || '',
            marca: op.marca || '',
            proveedor: op.proveedor || '',
            codigo: op.codigo || '',
            precioUnitario: op.precioUnitario || 0,
            importeTotal: op.importeTotal || (linea.cant * (op.precioUnitario || 0)),
            moneda: op.moneda || 'MN',
            observaciones: op.observaciones || '',
          },
        ],
        estatus: 'PENDIENTE',
        creadoPor: req.user?._id,
      });

      // Actualizar línea dentro de la orden de servicio
      linea.requiereOC = true;
      linea.ocGenerada = true;
      linea.numeroOC = numeroOC;
      linea.ordenCompra = oc._id;

      await vehiculo.save();

      return res.json({
        ok: true,
        numeroOC: oc.numero,
        ordenCompraId: oc._id,
      });
    } catch (err) {
      console.error('Error generando orden de compra:', err);
      return res.status(500).json({
        ok: false,
        mensaje: 'Error al generar la orden de compra',
      });
    }
  }
);

// GET /api/vehiculos/stats/dashboard
router.get('/stats/dashboard', async (req, res) => {
  try {
    const hoy = new Date();
    const inicioDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const finDia = new Date(inicioDia);
    finDia.setDate(finDia.getDate() + 1);

    const [ordenesHoy, enProceso, entregadas] = await Promise.all([
      // Órdenes creadas hoy
      Vehiculo.countDocuments({
        createdAt: { $gte: inicioDia, $lt: finDia },
      }),
      // En proceso: todos los estados activos excepto CERRADA
      Vehiculo.countDocuments({
        estadoOrden: {
          $in: [
            'PENDIENTE_CAPTURA',
            'PENDIENTE_REFACCIONARIA',
            'PENDIENTE_AUTORIZACION_CLIENTE',
            'PENDIENTE_SURTIR',
            'PENDIENTE_CIERRE',
            'REPARACION_EN_CURSO',
            'CALIDAD',
            'PENDIENTE_CERRAR',
          ],
        },
      }),
      // Entregadas: cerradas hoy
      Vehiculo.countDocuments({
        estadoOrden: 'CERRADA',
        updatedAt: { $gte: inicioDia, $lt: finDia },
      }),
    ]);

    res.json({ ok: true, data: { ordenesHoy, enProceso, entregadas } });
  } catch (err) {
    console.error('Error obteniendo stats:', err);
    res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/vehiculos/:id  -> detalle de una orden
router.get('/:id', async (req, res) => {
  try {
    const vehiculo = await Vehiculo.findById(req.params.id).populate('cliente', POPULATE_CLIENTE);
    if (!vehiculo) {
      return res.status(404).json({ ok: false, msg: 'Orden no encontrada' });
    }
    return res.json({ ok: true, vehiculo });
  } catch (err) {
    console.error('Error obteniendo vehiculo:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/vehiculos/:id/operativo-pdf
router.get('/:id/operativo-pdf', async (req, res) => {
  try {
    const { id } = req.params;
    const vehiculo = await Vehiculo.findById(id).populate('cliente', POPULATE_CLIENTE);

    if (!vehiculo) {
      return res
        .status(404)
        .json({ success: false, message: 'Orden no encontrada' });
    }

    await streamVehiculoOperativoPdf(res, vehiculo);
  } catch (err) {
    console.error('Error generando PDF operativo', err);
    res
      .status(500)
      .json({ success: false, message: 'Error al generar PDF operativo' });
  }
});

// PDF para "Imprimir" / contrato
router.get('/:id/orden-pdf', async (req, res) => {
  try {
    const vehiculo = await Vehiculo.findById(req.params.id).populate('cliente', POPULATE_CLIENTE);
    if (!vehiculo) {
      return res.status(404).json({ success: false, message: 'Orden no encontrada' });
    }
    await streamVehiculoOrdenPdf(res, vehiculo);
  } catch (err) {
    console.error('Error generando PDF orden', err);
    res.status(500).json({ success: false, message: 'Error al generar PDF orden' });
  }
});

// PUT /api/vehiculos/:id/datos  -> admin actualiza datos del cliente / vehículo
router.put('/:id/datos', async (req, res) => {
  try {
    const { id } = req.params;

    // Campos que viven en el documento Vehiculo
    const camposVehiculo = [
      'fechaRecepcion', 'horaRecepcion', 'ordenServicio',
      'nombreUsuarioDejaVehiculo', 'marca', 'modelo', 'anio', 'color',
      'serie', 'placas', 'kmsMillas', 'nacionalidad', 'motor', 'numeroEconomico', 'traccion',
    ];

    const updateVehiculo = {};
    camposVehiculo.forEach((campo) => {
      if (req.body[campo] !== undefined) updateVehiculo[campo] = req.body[campo];
    });

    if (req.body.inspeccionFisica !== undefined) {
      updateVehiculo.inspeccionFisica = req.body.inspeccionFisica;
    }

    const vehiculo = await Vehiculo.findByIdAndUpdate(id, updateVehiculo, { new: true })
      .populate('cliente', POPULATE_CLIENTE);
    if (!vehiculo) {
      return res.status(404).json({ ok: false, msg: 'Orden no encontrada' });
    }

    // Actualizar datos del cliente en su propio documento
    if (vehiculo.cliente?._id) {
      const b = req.body;
      const esParticular = vehiculo.cliente.tipoCliente === 'Particular';

      const clienteUpdate = {};

      if (esParticular) {
        if (b.nombreCliente !== undefined) clienteUpdate.nombre = b.nombreCliente;
        if (b.apellidoPaterno !== undefined) clienteUpdate.apellidoPaterno = b.apellidoPaterno;
        if (b.apellidoMaterno !== undefined) clienteUpdate.apellidoMaterno = b.apellidoMaterno;
      } else {
        if (b.nombreGobierno !== undefined) {
          clienteUpdate['gobierno.nombreGobierno'] = b.nombreGobierno;
        }
        if (b.nombreContactoGobierno !== undefined) {
          clienteUpdate['gobierno.contactoGobierno.nombre'] = b.nombreContactoGobierno;
        }
        if (b.nombreDependencia !== undefined) {
          clienteUpdate['gobierno.dependencia.nombre'] = b.nombreDependencia;
        }
        if (b.nombreContactoDependencia !== undefined) {
          clienteUpdate['gobierno.dependencia.contacto.nombre'] = b.nombreContactoDependencia;
        }
      }

      if (b.rfc !== undefined) clienteUpdate.rfc = b.rfc;

      if (b.telefonoFijo !== undefined || b.telefonoFijoLada !== undefined) {
        clienteUpdate['telefonos'] = [{ lada: b.telefonoFijoLada || '', numero: b.telefonoFijo || '' }];
      }
      if (b.celular !== undefined || b.celularLada !== undefined) {
        clienteUpdate['celulares'] = [{ lada: b.celularLada || '', numero: b.celular || '' }];
      }
      if (b.correos !== undefined) clienteUpdate.emails = b.correos;

      if (b.direccion !== undefined || b.ciudad !== undefined) {
        clienteUpdate['direccion'] = {
          calle: b.direccion || '',
          numeroExterior: b.numeroExt || '',
          numeroInterior: b.numeroInt || '',
          colonia: b.colonia || '',
          codigoPostal: b.codigoPostal || '',
          ciudad: b.ciudad || '',
          estado: b.estado || '',
        };
      }

      if (Object.keys(clienteUpdate).length > 0) {
        await Cliente.findByIdAndUpdate(vehiculo.cliente._id, { $set: clienteUpdate });
      }
    }

    // Re-fetch con cliente actualizado
    const vehiculoFinal = await Vehiculo.findById(id).populate('cliente', POPULATE_CLIENTE);
    return res.json({ ok: true, vehiculo: vehiculoFinal });
  } catch (err) {
    console.error('Error actualizando datos de orden:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// PUT /api/vehiculos/:id/cerrar  -> cerrar orden de servicio
router.put('/:id/cerrar', async (req, res) => {
  try {
    const { id } = req.params;

    const vehiculo = await Vehiculo.findById(id);
    if (!vehiculo) {
      return res.status(404).json({ ok: false, msg: 'Orden no encontrada' });
    }

    if (vehiculo.estadoOrden !== 'PENDIENTE_CERRAR') {
      return res.status(400).json({ ok: false, msg: 'La orden debe estar en estado PENDIENTE_CERRAR para poder cerrarse.' });
    }

    // marcar como cerrada
    vehiculo.estadoOrden = 'CERRADA';
    vehiculo.pendienteCierre = false;
    vehiculo.fechaCierre = new Date();

    // si quieres guardar fecha de cierre, puedes agregar el campo en el schema
    // y descomentar esto:
    // vehiculo.fechaCierre = new Date();

    await vehiculo.save();

    return res.json({ ok: true, vehiculo });
  } catch (err) {
    console.error('Error cerrando orden:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/vehiculos/:id/presupuesto-pdf
router.get('/:id/presupuesto-pdf', async (req, res) => {
  try {
    const { id } = req.params;
    const vehiculo = await Vehiculo.findById(id).populate('cliente', POPULATE_CLIENTE);

    if (!vehiculo) {
      return res.status(404).json({
        success: false,
        message: 'Orden no encontrada'
      });
    }

    await generarPresupuestoPDF(res, vehiculo);

  } catch (err) {
    console.error('Error generando PDF de presupuesto:', err);

    res.status(500).json({
      success: false,
      message: 'Error al generar PDF'
    });
  }
});

// PUT /api/vehiculos/:id/surtir
router.put('/:id/surtir', proteger, async (req, res) => {
  try {
    const { id } = req.params;
    const { presupuesto } = req.body;

    const vehiculo = await Vehiculo.findById(id);
    if (!vehiculo) {
      return res.status(404).json({ ok: false, msg: 'Orden no encontrada' });
    }

    // Detectar qué índices ya estaban surtidos ANTES de la actualización
    const prevSurtidasIds = new Set(
      (vehiculo.presupuesto || []).reduce((acc, p, i) => {
        if (p.surtida) acc.push(i);
        return acc;
      }, [])
    );

    if (Array.isArray(presupuesto)) {
      vehiculo.presupuesto = presupuesto;
    }

    // Líneas recién surtidas que tienen código → crear SalidaInventario
    const nuevamenteSurtidas = (vehiculo.presupuesto || []).filter(
      (p, i) => p.surtida && p.codigo && !prevSurtidasIds.has(i)
    );

    if (nuevamenteSurtidas.length > 0) {
      const nps = nuevamenteSurtidas.map(p => String(p.codigo));
      const oidMap = await resolveNPtoOid(nps);
      // Solo incluir partidas que existen en BD Códigos (evita entradas negativas por códigos temporales)
      const partidas = nuevamenteSurtidas
        .map(p => ({
          codigoInterno: oidMap.get(String(p.codigo)) || null,
          descripcion:   (p.refaccion || p.concepto || '').trim(),
          marca:         (p.marca || '').trim(),
          unidad:        'Pieza',
          cantidad:      Number(p.cant) || 1,
        }))
        .filter(p => p.codigoInterno !== null);
      if (partidas.length > 0) {
        await SalidaInventario.create({
          fechaSalida:   new Date(),
          ordenServicio: vehiculo.ordenServicio || '',
          surtidoPor:    req.user?.name || req.user?.username || '',
          partidas,
          estatus: 'cerrada',
        });
      }
    }

    // Si todas las partidas autorizadas ya están surtidas → Reparación en curso
    const autorizadas = vehiculo.presupuesto.filter(p => p.autorizado);
    const todasSurtidas = autorizadas.length > 0 && autorizadas.every(p => p.surtida);

    if (todasSurtidas) {
      vehiculo.estadoOrden = 'REPARACION_EN_CURSO';
    }

    await vehiculo.save();
    return res.json({ ok: true, vehiculo });
  } catch (err) {
    console.error('Error marcando surtidas:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// GET /api/vehiculos/:id/venta-cliente-pdf
router.get('/:id/venta-cliente-pdf', async (req, res) => {
  try {
    const { id } = req.params;
    const vehiculo = await Vehiculo.findById(id).populate('cliente', POPULATE_CLIENTE);

    if (!vehiculo) {
      return res.status(404).json({
        success: false,
        message: 'Orden no encontrada'
      });
    }

    await generarVentaClientePDF(res, vehiculo);
  } catch (err) {
    console.error('Error generando PDF de venta al cliente:', err);

    res.status(500).json({
      success: false,
      message: 'Error al generar PDF de venta al cliente'
    });
  }
});


module.exports = router;
