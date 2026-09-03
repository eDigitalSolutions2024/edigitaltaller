// verRegistroAcciones.js  (en la carpeta backend)
//
// Herramienta SOLO de desarrollador para leer el log interno de acciones
// (RegistroAccion, retención 15 días) y la bitácora por orden
// (Vehiculo.historialEstados, permanente pero select:false). No hay endpoint
// HTTP: se corre a mano con acceso al servidor / a la base.
//
// Uso:
//   node verRegistroAcciones.js                       # últimas 100 acciones
//   node verRegistroAcciones.js --os OS-20250110-...  # de una orden (folio)
//   node verRegistroAcciones.js --accion ORDEN_RESTABLECER
//   node verRegistroAcciones.js --usuario "Ana"       # regex sobre el nombre
//   node verRegistroAcciones.js --bloqueados          # solo intentos rechazados
//   node verRegistroAcciones.js --dias 3              # ventana de tiempo
//   node verRegistroAcciones.js --historial --os OS-...  # bitácora de esa orden
//   node verRegistroAcciones.js --limit 500

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const RegistroAccion = require('./models/RegistroAccion');
const Vehiculo = require('./models/Vehiculo');

function arg(nombre, def = undefined) {
  const i = process.argv.indexOf(`--${nombre}`);
  if (i === -1) return def;
  const val = process.argv[i + 1];
  return val && !val.startsWith('--') ? val : true;
}

const run = async () => {
  try {
    await connectDB();
    console.log('✅ Conectado a MongoDB\n');

    const os = arg('os');
    const soloHistorial = arg('historial') === true;

    // Resolver folio -> _id si hace falta
    let entidadId = null;
    if (os && os !== true) {
      const v = await Vehiculo.findOne({ ordenServicio: os }).select('_id ordenServicio').lean();
      if (!v) {
        console.log(`No hay ninguna orden con folio "${os}".`);
        await mongoose.disconnect();
        process.exit(0);
      }
      entidadId = v._id;
    }

    // --- Bitácora permanente de una orden -----------------------------------
    if (soloHistorial) {
      if (!entidadId) {
        console.log('Usa --historial junto con --os <folio>.');
        await mongoose.disconnect();
        process.exit(1);
      }
      const doc = await Vehiculo.findById(entidadId)
        .select('ordenServicio estadoOrden +historialEstados')
        .lean();
      const hist = doc.historialEstados || [];
      console.log(`📒 historialEstados de ${doc.ordenServicio} (estado actual: ${doc.estadoOrden}) — ${hist.length} evento(s):\n`);
      hist
        .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
        .forEach((h) => {
          console.log(
            `  ${h.fecha ? new Date(h.fecha).toISOString() : '-'} | ${h.de} → ${h.a} | ${h.accion} | ` +
              `por: ${h.por || '-'} | ruta: ${h.ruta || '-'}${h.motivo ? ` | motivo: ${h.motivo}` : ''}`
          );
        });
      await mongoose.disconnect();
      process.exit(0);
    }

    // --- Log rodante (RegistroAccion) --------------------------------------
    const q = {};
    if (entidadId) q.entidadId = entidadId;
    if (arg('accion')) q.accion = String(arg('accion')).trim();
    if (arg('usuario')) q.usuario = new RegExp(String(arg('usuario')).trim(), 'i');
    if (arg('bloqueados') === true) q.ok = false;
    const dias = parseInt(arg('dias'), 10);
    if (!Number.isNaN(dias)) q.createdAt = { $gte: new Date(Date.now() - dias * 86400000) };

    const limit = Math.min(2000, parseInt(arg('limit'), 10) || 100);

    const filas = await RegistroAccion.find(q).sort({ createdAt: -1 }).limit(limit).lean();

    console.log(`🔎 ${filas.length} fila(s) (retención ${RegistroAccion.RETENCION_DIAS} días)` +
      `${Object.keys(q).length ? ` — filtro: ${JSON.stringify(q)}` : ''}\n`);

    for (const f of filas) {
      const marca = f.ok === false ? '⛔' : '  ';
      console.log(
        `${marca} ${new Date(f.createdAt).toISOString()} | ${f.accion} | ${f.referencia || f.entidadId || '-'} | ` +
          `${f.usuario || '-'} (${f.rol || '-'}) | ${f.ip || '-'} | ${f.metodo} ${f.ruta} | ` +
          `${f.detalle ? JSON.stringify(f.detalle) : ''}`
      );
    }

    await mongoose.disconnect();
    console.log('\n🔌 Conexión a Mongo cerrada.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error en verRegistroAcciones:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
};

run();
