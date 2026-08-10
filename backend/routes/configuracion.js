const express = require('express');
const router = express.Router();

const TipoCambio = require('../models/TipoCambio');
const TipoCambioSie = require('../models/TipoCambioSie');
const UnidadMedida = require('../models/UnidadMedida');
const Mecanico = require('../models/Mecanico');
const Contador = require('../models/Contador');
const banxicoService = require('../service/banxicoService');

const { proteger, requiereRol } = require('../middleware/auth');

// Normaliza a medianoche UTC. TipoCambio.fecha viene de un <input type="date">
// (string "yyyy-MM-dd", que JS parsea como UTC) y TipoCambioSie.fecha viene
// de banxicoService ya normalizado a UTC — usar getters/setters UTC aquí es
// obligatorio para que ambas fechas se comparen igual sin importar la zona
// horaria del servidor.
function medianoche(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// ===============================
// TIPO DE CAMBIO
// ===============================

// GET /api/configuracion/tipo-cambio
// (sin restricción de rol: cualquier usuario autenticado puede consultar el
// historial, por ejemplo la pantalla de Configuración al cargar)
router.get('/tipo-cambio', proteger, async (req, res) => {
  try {
    const tipos = await TipoCambio.find().sort({ fecha: -1, createdAt: -1 });
    res.json(tipos);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener tipos de cambio', error: error.message });
  }
});

// GET /api/configuracion/tipo-cambio/ultimo
// (sin restricción de rol: lo consultan formularios de Caja, Facturación y
// Refaccionaria para tomar el tipo de cambio vigente sin poder editarlo ahí)
router.get('/tipo-cambio/ultimo', proteger, async (req, res) => {
  try {
    const ultimo = await TipoCambio.findOne().sort({ fecha: -1, createdAt: -1 });
    res.json(ultimo);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener último tipo de cambio', error: error.message });
  }
});

// POST /api/configuracion/tipo-cambio
router.post('/tipo-cambio', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { valor, fecha } = req.body;

    if (!valor || !fecha) {
      return res.status(400).json({ message: 'El tipo de cambio y la fecha son obligatorios' });
    }

    if (Number(valor) <= 0) {
      return res.status(400).json({ message: 'El tipo de cambio debe ser mayor a 0' });
    }

    const nuevo = await TipoCambio.create({
      valor: Number(valor),
      fecha
    });

    res.status(201).json(nuevo);
  } catch (error) {
    res.status(500).json({ message: 'Error al guardar tipo de cambio', error: error.message });
  }
});

// GET /api/configuracion/tipo-cambio/sie
// Valor de referencia publicado por el SIE de Banxico (serie FIX). Es solo
// informativo: nunca se usa en cálculos, esos siguen tomando /tipo-cambio/ultimo.
// Guarda un snapshot por día en TipoCambioSie para no golpear la API de Banxico
// más de una vez al día; si Banxico falla, se degrada al último snapshot en BD.
router.get('/tipo-cambio/sie', proteger, async (req, res) => {
  try {
    const hoy = medianoche(new Date());
    let snapshot = await TipoCambioSie.findOne({ fecha: hoy });

    if (!snapshot) {
      try {
        const dato = await banxicoService.obtenerDatoOportuno();
        if (dato) {
          snapshot = await TipoCambioSie.findOneAndUpdate(
            { fecha: medianoche(dato.fecha) },
            { $set: { valor: dato.valor, serie: banxicoService.SERIE_FIX } },
            { new: true, upsert: true }
          );
        }
      } catch (errorBanxico) {
        // Sin conexión/token inválido: se sigue con el fallback de abajo
      }
    }

    if (!snapshot) {
      snapshot = await TipoCambioSie.findOne().sort({ fecha: -1 });
    }

    res.json(snapshot || null);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el tipo de cambio de referencia (SIE)', error: error.message });
  }
});

// GET /api/configuracion/tipo-cambio/historial-comparado
// Compara, fecha por fecha, el tipo de cambio usado en el sistema (TipoCambio)
// contra el que publicó Banxico ese mismo día (TipoCambioSie). Hace backfill
// contra el histórico de Banxico para fechas que aún no tengan snapshot en BD.
router.get('/tipo-cambio/historial-comparado', proteger, async (req, res) => {
  try {
    const historialManual = await TipoCambio.find().sort({ fecha: -1, createdAt: -1 });

    if (historialManual.length === 0) {
      return res.json([]);
    }

    const fechas = historialManual.map((t) => medianoche(new Date(t.fecha)));
    const fechaMin = new Date(Math.min(...fechas));
    const fechaMax = medianoche(new Date());

    let snapshotsSie = await TipoCambioSie.find({ fecha: { $gte: fechaMin, $lte: fechaMax } });
    const fechasConSnapshot = new Set(snapshotsSie.map((s) => s.fecha.getTime()));
    const faltanSnapshots = fechas.some((f) => !fechasConSnapshot.has(f.getTime()));

    if (faltanSnapshots) {
      try {
        const toISO = (d) => d.toISOString().slice(0, 10);
        const datosHistoricos = await banxicoService.obtenerRangoHistorico(toISO(fechaMin), toISO(fechaMax));

        if (datosHistoricos.length > 0) {
          await TipoCambioSie.bulkWrite(
            datosHistoricos.map(({ fecha, valor }) => ({
              updateOne: {
                filter: { fecha: medianoche(fecha) },
                update: { $set: { valor, serie: banxicoService.SERIE_FIX } },
                upsert: true,
              },
            }))
          );
          snapshotsSie = await TipoCambioSie.find({ fecha: { $gte: fechaMin, $lte: fechaMax } });
        }
      } catch (errorBanxico) {
        // Sin conexión/token inválido: se muestra el historial con lo que ya haya en BD
      }
    }

    const sieByFecha = new Map(snapshotsSie.map((s) => [s.fecha.getTime(), s.valor]));

    const historial = historialManual.map((t) => {
      const key = medianoche(new Date(t.fecha)).getTime();
      return {
        fecha: t.fecha,
        valorSistema: t.valor,
        valorSie: sieByFecha.has(key) ? sieByFecha.get(key) : null,
      };
    });

    res.json(historial);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el historial comparado de tipo de cambio', error: error.message });
  }
});

// ===============================
// UNIDADES DE MEDIDA
// ===============================

// GET /api/configuracion/unidades-medida
router.get('/unidades-medida', proteger, async (req, res) => {
  try {
    const unidades = await UnidadMedida.find().sort({ nombre: 1 }).lean();
    // Normalizar docs viejos que no tienen el campo activo (undefined → true)
    const normalizadas = unidades.map(u => ({
      ...u,
      activo: u.activo !== false,
    }));
    res.json(normalizadas);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener unidades de medida', error: error.message });
  }
});

// POST /api/configuracion/unidades-medida
router.post('/unidades-medida', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { nombre } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ message: 'La unidad de medida es obligatoria' });
    }

    const exists = await UnidadMedida.findOne({
      nombre: nombre.trim()
    });

    if (exists) {
      return res.status(400).json({ message: 'Ya existe esa unidad de medida' });
    }

    const unidad = await UnidadMedida.create({
      nombre: nombre.trim(),
      activo: true,
    });

    res.status(201).json(unidad);
  } catch (error) {
    res.status(500).json({ message: 'Error al guardar unidad de medida', error: error.message });
  }
});

// PATCH /api/configuracion/unidades-medida/:id/status
router.patch('/unidades-medida/:id/status', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { activo } = req.body;

    const unidad = await UnidadMedida.findById(req.params.id);

    if (!unidad) {
      return res.status(404).json({ message: 'Unidad de medida no encontrada' });
    }

    unidad.activo = Boolean(activo);
    await unidad.save();

    res.json(unidad);
  } catch (error) {
    res.status(500).json({ message: 'Error al cambiar estatus de unidad', error: error.message });
  }
});

// ===============================
// CONTADOR DE ORDEN DE SERVICIO (auto-increment estilo MySQL)
// ===============================

const ORDEN_SERVICIO_CONTADOR = 'ordenServicio';

// GET /api/configuracion/orden-servicio-contador
// (sin restricción de rol: cualquier usuario autenticado puede consultarlo,
// por ejemplo para mostrar la vista previa del próximo folio al crear una orden)
router.get('/orden-servicio-contador', proteger, async (req, res) => {
  try {
    const contador = await Contador.findOne({ nombre: ORDEN_SERVICIO_CONTADOR });
    res.json({ valor: contador?.valor || 0 });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el contador de órdenes de servicio', error: error.message });
  }
});

// PUT /api/configuracion/orden-servicio-contador
router.put('/orden-servicio-contador', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { valor } = req.body;
    const valorNum = Number(valor);

    if (valor === undefined || valor === null || Number.isNaN(valorNum) || valorNum < 0) {
      return res.status(400).json({ message: 'El valor debe ser un número mayor o igual a 0' });
    }

    const contador = await Contador.findOneAndUpdate(
      { nombre: ORDEN_SERVICIO_CONTADOR },
      { $set: { valor: valorNum } },
      { new: true, upsert: true }
    );

    res.json({ valor: contador.valor });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar el contador de órdenes de servicio', error: error.message });
  }
});

// ===============================
// CONTADOR DE VALE DE SALIDA (auto-increment estilo MySQL)
// ===============================

const VALE_SALIDA_CONTADOR = 'valeSalida';

// GET /api/configuracion/vale-contador
// (sin restricción de rol: cualquier usuario autenticado puede consultarlo,
// por ejemplo para mostrar la vista previa del próximo folio al emitir un vale)
router.get('/vale-contador', proteger, async (req, res) => {
  try {
    const contador = await Contador.findOne({ nombre: VALE_SALIDA_CONTADOR });
    res.json({ valor: contador?.valor || 0 });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el contador de vales de salida', error: error.message });
  }
});

// PUT /api/configuracion/vale-contador
router.put('/vale-contador', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { valor } = req.body;
    const valorNum = Number(valor);

    if (valor === undefined || valor === null || Number.isNaN(valorNum) || valorNum < 0) {
      return res.status(400).json({ message: 'El valor debe ser un número mayor o igual a 0' });
    }

    const contador = await Contador.findOneAndUpdate(
      { nombre: VALE_SALIDA_CONTADOR },
      { $set: { valor: valorNum } },
      { new: true, upsert: true }
    );

    res.json({ valor: contador.valor });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar el contador de vales de salida', error: error.message });
  }
});

// ===============================
// CONTADOR DE VALE DE CAJA (folio automático de los vales capturados en
// Cierre de Caja — distinto del Vale de Salida de arriba)
// ===============================

// Debe coincidir con VALE_CAJA_CONTADOR en routes/cierreCaja.js
const VALE_CAJA_CONTADOR = 'valeCaja';

// GET /api/configuracion/vale-caja-contador
router.get('/vale-caja-contador', proteger, async (req, res) => {
  try {
    const contador = await Contador.findOne({ nombre: VALE_CAJA_CONTADOR });
    res.json({ valor: contador?.valor || 0 });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el contador de vales de caja', error: error.message });
  }
});

// PUT /api/configuracion/vale-caja-contador
router.put('/vale-caja-contador', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { valor } = req.body;
    const valorNum = Number(valor);

    if (valor === undefined || valor === null || Number.isNaN(valorNum) || valorNum < 0) {
      return res.status(400).json({ message: 'El valor debe ser un número mayor o igual a 0' });
    }

    const contador = await Contador.findOneAndUpdate(
      { nombre: VALE_CAJA_CONTADOR },
      { $set: { valor: valorNum } },
      { new: true, upsert: true }
    );

    res.json({ valor: contador.valor });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar el contador de vales de caja', error: error.message });
  }
});

// ===============================
// CONTADOR DE DEVOLUCIÓN DE REFACCIÓN (número consecutivo del formato impreso)
// ===============================

const DEVOLUCION_REFACCION_CONTADOR = 'devolucionRefaccion';

// GET /api/configuracion/devolucion-refaccion-contador
router.get('/devolucion-refaccion-contador', proteger, async (req, res) => {
  try {
    const contador = await Contador.findOne({ nombre: DEVOLUCION_REFACCION_CONTADOR });
    res.json({ valor: contador?.valor || 0 });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el contador de devoluciones de refacción', error: error.message });
  }
});

// PUT /api/configuracion/devolucion-refaccion-contador
router.put('/devolucion-refaccion-contador', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { valor } = req.body;
    const valorNum = Number(valor);

    if (valor === undefined || valor === null || Number.isNaN(valorNum) || valorNum < 0) {
      return res.status(400).json({ message: 'El valor debe ser un número mayor o igual a 0' });
    }

    const contador = await Contador.findOneAndUpdate(
      { nombre: DEVOLUCION_REFACCION_CONTADOR },
      { $set: { valor: valorNum } },
      { new: true, upsert: true }
    );

    res.json({ valor: contador.valor });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar el contador de devoluciones de refacción', error: error.message });
  }
});

// ===============================
// CONTADOR DE NOTA DE VENTA (folio consecutivo de comprobantes de Caja)
// ===============================

// Debe coincidir con CONTADOR_NOTA_VENTA / CONTADOR_REMISION en routes/cajas.js
const NOTA_VENTA_CONTADOR = 'notaVenta';

// GET /api/configuracion/nota-venta-contador
router.get('/nota-venta-contador', proteger, async (req, res) => {
  try {
    const contador = await Contador.findOne({ nombre: NOTA_VENTA_CONTADOR });
    res.json({ valor: contador?.valor || 0 });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el contador de notas de venta', error: error.message });
  }
});

// PUT /api/configuracion/nota-venta-contador
router.put('/nota-venta-contador', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { valor } = req.body;
    const valorNum = Number(valor);

    if (valor === undefined || valor === null || Number.isNaN(valorNum) || valorNum < 0) {
      return res.status(400).json({ message: 'El valor debe ser un número mayor o igual a 0' });
    }

    const contador = await Contador.findOneAndUpdate(
      { nombre: NOTA_VENTA_CONTADOR },
      { $set: { valor: valorNum } },
      { new: true, upsert: true }
    );

    res.json({ valor: contador.valor });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar el contador de notas de venta', error: error.message });
  }
});

// ===============================
// CONTADOR DE REMISIÓN (folio consecutivo de comprobantes de Caja)
// ===============================

const REMISION_CONTADOR = 'remision';

// GET /api/configuracion/remision-contador
router.get('/remision-contador', proteger, async (req, res) => {
  try {
    const contador = await Contador.findOne({ nombre: REMISION_CONTADOR });
    res.json({ valor: contador?.valor || 0 });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el contador de remisiones', error: error.message });
  }
});

// PUT /api/configuracion/remision-contador
router.put('/remision-contador', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { valor } = req.body;
    const valorNum = Number(valor);

    if (valor === undefined || valor === null || Number.isNaN(valorNum) || valorNum < 0) {
      return res.status(400).json({ message: 'El valor debe ser un número mayor o igual a 0' });
    }

    const contador = await Contador.findOneAndUpdate(
      { nombre: REMISION_CONTADOR },
      { $set: { valor: valorNum } },
      { new: true, upsert: true }
    );

    res.json({ valor: contador.valor });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar el contador de remisiones', error: error.message });
  }
});

// ===============================
// CONTADOR DE ORDEN DE COMPRA
// ===============================

// Debe coincidir con ORDEN_COMPRA_CONTADOR en models/OrdenCompra.js
const ORDEN_COMPRA_CONTADOR = 'ordenCompra';

// GET /api/configuracion/orden-compra-contador
router.get('/orden-compra-contador', proteger, async (req, res) => {
  try {
    const contador = await Contador.findOne({ nombre: ORDEN_COMPRA_CONTADOR });
    res.json({ valor: contador?.valor || 0 });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el contador de órdenes de compra', error: error.message });
  }
});

// PUT /api/configuracion/orden-compra-contador
router.put('/orden-compra-contador', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { valor } = req.body;
    const valorNum = Number(valor);

    if (valor === undefined || valor === null || Number.isNaN(valorNum) || valorNum < 0) {
      return res.status(400).json({ message: 'El valor debe ser un número mayor o igual a 0' });
    }

    const contador = await Contador.findOneAndUpdate(
      { nombre: ORDEN_COMPRA_CONTADOR },
      { $set: { valor: valorNum } },
      { new: true, upsert: true }
    );

    res.json({ valor: contador.valor });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar el contador de órdenes de compra', error: error.message });
  }
});

// ===============================
// FONDO DE CAJA (monto fijo que se deja en caja, usado en Gestión de Caja)
// ===============================

// Debe coincidir con FONDO_CAJA_CONTADOR en routes/cierreCaja.js
const FONDO_CAJA_CONTADOR = 'fondoCaja';
const FONDO_CAJA_DEFAULT = 2000;

// GET /api/configuracion/fondo-caja
router.get('/fondo-caja', proteger, async (req, res) => {
  try {
    const contador = await Contador.findOne({ nombre: FONDO_CAJA_CONTADOR });
    res.json({ valor: contador?.valor ?? FONDO_CAJA_DEFAULT });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el fondo de caja', error: error.message });
  }
});

// PUT /api/configuracion/fondo-caja
router.put('/fondo-caja', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { valor } = req.body;
    const valorNum = Number(valor);

    if (valor === undefined || valor === null || Number.isNaN(valorNum) || valorNum < 0) {
      return res.status(400).json({ message: 'El valor debe ser un número mayor o igual a 0' });
    }

    const contador = await Contador.findOneAndUpdate(
      { nombre: FONDO_CAJA_CONTADOR },
      { $set: { valor: valorNum } },
      { new: true, upsert: true }
    );

    res.json({ valor: contador.valor });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar el fondo de caja', error: error.message });
  }
});

// ===============================
// MECÁNICOS
// ===============================

// GET /api/configuracion/mecanicos
router.get('/mecanicos', proteger, async (req, res) => {
  try {
    const mecanicos = await Mecanico.find().sort({ nombre: 1 });
    res.json(mecanicos);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener mecánicos', error: error.message });
  }
});

// POST /api/configuracion/mecanicos
router.post('/mecanicos', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { nombre, telefono } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ message: 'El nombre del mecánico es obligatorio' });
    }

    const mecanico = await Mecanico.create({
      nombre: nombre.trim(),
      telefono: telefono || ''
    });

    res.status(201).json(mecanico);
  } catch (error) {
    res.status(500).json({ message: 'Error al guardar mecánico', error: error.message });
  }
});

// PATCH /api/configuracion/mecanicos/:id/status
router.patch('/mecanicos/:id/status', proteger, requiereRol('admin'), async (req, res) => {
  try {
    const { activo } = req.body;

    const mecanico = await Mecanico.findById(req.params.id);

    if (!mecanico) {
      return res.status(404).json({ message: 'Mecánico no encontrado' });
    }

    mecanico.activo = Boolean(activo);
    await mecanico.save();

    res.json(mecanico);
  } catch (error) {
    res.status(500).json({ message: 'Error al cambiar estatus del mecánico', error: error.message });
  }
});

module.exports = router;