// backfillContratoOrdenServicio.js  (en la carpeta backend)
//
// Migración de un solo uso: fija Vehiculo.contratoOrdenServicio en las
// órdenes que se crearon ANTES de que existiera ese campo (todas, la primera
// vez que se corre), apuntando a la versión de ContratoOrdenServicio vigente
// en este momento. Así esas órdenes quedan ligadas al contrato con el que
// realmente se crearon, y ediciones futuras del contrato desde Configuración
// solo afectarán a las órdenes que se creen después de correr esto.
//
// Uso: node backfillContratoOrdenServicio.js

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const Vehiculo = require('./models/Vehiculo');
const ContratoOrdenServicio = require('./models/ContratoOrdenServicio');

const run = async () => {
  try {
    console.log('✅ Iniciando backfill de contratoOrdenServicio...');

    await connectDB();
    console.log('✅ Conectado a MongoDB');

    const contratoVigente = await ContratoOrdenServicio.getOrCreate();
    console.log(`ℹ️  Usando versión de contrato: ${contratoVigente._id} (creada ${contratoVigente.createdAt.toISOString()})`);

    const resultado = await Vehiculo.updateMany(
      { contratoOrdenServicio: { $exists: false } },
      { $set: { contratoOrdenServicio: contratoVigente._id } }
    );

    console.log(`🎉 Órdenes actualizadas: ${resultado.modifiedCount}`);

    await mongoose.disconnect();
    console.log('🔌 Conexión a Mongo cerrada.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error en el script backfillContratoOrdenServicio:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
};

run();
