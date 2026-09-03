// auditarOrdenesReabiertas.js  (en la carpeta backend)
//
// Audita órdenes que fueron REABIERTAS sin pasar por la vía oficial
// (PUT /api/vehiculos/:id/restablecer, solo admin) ni por un ticket
// RESTABLECER_OS aprobado.
//
// Firma en BD de una reapertura "por la puerta de atrás": la orden tiene
// fechaCierre con fecha real (llegó a estar CERRADA) pero su estadoOrden
// actual NO es CERRADA/CANCELADA. El restablecer oficial limpia fechaCierre;
// las rutas de edición que la reabrían nunca la tocaban.
//
// Solo lee. No modifica nada. Uso:
//   node auditarOrdenesReabiertas.js

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const Vehiculo = require('./models/Vehiculo');

const ESTADOS_TERMINALES = ['CERRADA', 'CANCELADA'];

const run = async () => {
  try {
    await connectDB();
    console.log('✅ Conectado a MongoDB\n');

    const sospechosas = await Vehiculo.find({
      fechaCierre: { $ne: null },
      estadoOrden: { $nin: ESTADOS_TERMINALES },
    })
      .select('ordenServicio estadoOrden fechaCierre creadoPor updatedAt +historialEstados')
      .sort({ fechaCierre: 1 })
      .lean();

    if (sospechosas.length === 0) {
      console.log('🎉 No se encontraron órdenes con fechaCierre pero fuera de un estado terminal.');
    } else {
      console.log(`⚠️  ${sospechosas.length} orden(es) estuvieron CERRADAS y hoy están abiertas:\n`);
      for (const o of sospechosas) {
        const reabiertaOficial = (o.historialEstados || []).some((h) => h.accion === 'RESTABLECER');
        console.log(
          [
            `  OS ${o.ordenServicio || o._id}`,
            `estado actual: ${o.estadoOrden}`,
            `fechaCierre: ${o.fechaCierre ? new Date(o.fechaCierre).toISOString().slice(0, 10) : '-'}`,
            `asesor: ${o.creadoPor || '-'}`,
            `últ. modificación: ${o.updatedAt ? new Date(o.updatedAt).toISOString().slice(0, 10) : '-'}`,
            reabiertaOficial ? 'bitácora: RESTABLECER registrado' : 'bitácora: SIN registro de restablecimiento',
          ].join(' | ')
        );
      }
      console.log(
        '\nℹ️  Las que dicen "SIN registro de restablecimiento" se reabrieron antes de este parche ' +
          'o por una ruta que no dejaba rastro. Revísalas con el asesor y, si corresponde, ' +
          'ciérralas de nuevo o pásalas por PUT /:id/restablecer para dejar constancia.'
      );
    }

    // Además: cambios de estado registrados que sacaron una orden de un estado terminal
    const conReapertura = await Vehiculo.find({
      'historialEstados.de': { $in: ESTADOS_TERMINALES },
    })
      .select('ordenServicio estadoOrden +historialEstados')
      .lean();

    const eventos = [];
    for (const o of conReapertura) {
      for (const h of o.historialEstados || []) {
        if (ESTADOS_TERMINALES.includes(h.de) && !ESTADOS_TERMINALES.includes(h.a)) {
          eventos.push({ os: o.ordenServicio || o._id, ...h });
        }
      }
    }

    if (eventos.length) {
      console.log(`\n📒 Reaperturas registradas en la bitácora (historialEstados): ${eventos.length}\n`);
      eventos
        .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
        .forEach((e) => {
          console.log(
            `  OS ${e.os} | ${e.de} → ${e.a} | acción: ${e.accion} | por: ${e.por || '-'} | ` +
              `ruta: ${e.ruta || '-'} | ${e.fecha ? new Date(e.fecha).toISOString() : '-'}`
          );
        });
    } else {
      console.log('\n📒 Sin reaperturas registradas en la bitácora todavía (campo nuevo).');
    }

    await mongoose.disconnect();
    console.log('\n🔌 Conexión a Mongo cerrada.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error en auditarOrdenesReabiertas:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
};

run();
