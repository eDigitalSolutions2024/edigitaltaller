// backend/routes/vehiculos.js
const express = require('express');
const router = express.Router();

const Vehiculo = require('../models/Vehiculo');
const OrdenCompra = require('../models/OrdenCompra');              // 👈 NUEVO
const { proteger, requiereRol } = require('../middleware/auth');   // 👈 NUEVO

const { streamVehiculoOperativoPdf } = require('../service/VehiculoOperativoPdf');
const { streamVehiculoOrdenPdf } = require('../service/vehiculoOrdenPdf');

const { generarPresupuestoPDF } = require('../service/vehiculoPresupuestoPDF');
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

    // 👇 Si no viene ordenServicio desde el frontend, la generamos aquí
    if (!payload.ordenServicio) {
      payload.ordenServicio = await generarOrdenServicio();
    }

    const vehiculo = new Vehiculo(payload);

    await vehiculo.save();

    return res.status(201).json({ ok: true, vehiculo });
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
      estado = 'PENDIENTE_CAPTURA',
      searchOs = '',
      search = '',
      page = 1,
      limit = 10,
    } = req.query;

    const q = {};

    if (estado) {
      q.estadoOrden = estado;
    }

    // Buscar por número de orden exacto o parcial
    if (searchOs) {
      q.ordenServicio = { $regex: searchOs, $options: 'i' };
    }

    // Búsqueda general (cliente, placas, marca/modelo, etc.)
    if (search) {
      q.$or = [
        { nombreGobierno: { $regex: search, $options: 'i' } }, // cliente (para gobierno)
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
        .populate('cliente', 'nombre'), // si quieres traer nombre del cliente
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
      }
    }


    await vehiculo.save();

    return res.json({ ok: true, vehiculo });
  } catch (err) {
    console.error('Error guardando requisicion/diagnostico:', err);
    return res.status(500).json({ ok: false, msg: 'Error en el servidor' });
  }
});

// PUT /api/vehiculos/:id/presupuesto-venta
router.put('/:id/presupuesto-venta', async (req, res) => {
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

    if (estadoOrden) {
      vehiculo.estadoOrden = estadoOrden;
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

    return res.json({ ok: true, vehiculo });
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
        return (
          String(r.refaccion || '') === String(refaccion.refaccion || '') &&
          String(r.codigo || '') === String(refaccion.codigo || '') &&
          Number(r.cant || 0) === Number(refaccion.cant || 0) &&
          Number(r.precioUnitario || 0) ===
            Number(refaccion.precioUnitario || 0)
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

      // Crear OrdenCompra
      const oc = await OrdenCompra.create({
        numero: numeroOC,
        orden: vehiculo._id,
        proveedor: linea.proveedor || refaccion.proveedor || '',
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
            importeTotal: linea.importeTotal,
            moneda: linea.moneda || 'MN',
            observaciones: linea.observaciones,
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

// GET /api/vehiculos/:id  -> detalle de una orden
router.get('/:id', async (req, res) => {
  try {
    const vehiculo = await Vehiculo.findById(req.params.id);
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
    const vehiculo = await Vehiculo.findById(id);

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
    const vehiculo = await Vehiculo.findById(req.params.id);
    if (!vehiculo) {
      return res.status(404).json({ success: false, message: 'Orden no encontrada' });
    }
    await streamVehiculoOrdenPdf(res, vehiculo);
  } catch (err) {
    console.error('Error generando PDF orden', err);
    res.status(500).json({ success: false, message: 'Error al generar PDF orden' });
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

    // marcar como cerrada
    vehiculo.estadoOrden = 'CERRADA';

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
    const vehiculo = await Vehiculo.findById(id);

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

// GET /api/vehiculos/:id/venta-cliente-pdf
router.get('/:id/venta-cliente-pdf', async (req, res) => {
  try {
    const { id } = req.params;
    const vehiculo = await Vehiculo.findById(id);

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
