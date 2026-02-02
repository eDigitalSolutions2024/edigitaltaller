// createAdmin.js  (en la carpeta backend)

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');   // usa tu misma función de conexión
const User = require('./models/User');      // ajusta si tu modelo se llama distinto

const run = async () => {
  try {
    console.log('✅ Iniciando script de creación de admin...');

    // 1. Conectar a Mongo
    await connectDB();
    console.log('✅ Conectado a MongoDB desde createAdmin.js');

    // 2. Datos del admin (CÁMBIALOS si quieres)
    const adminData = {
      name: 'Admin Taller',
      workshopName: 'Taller Principal',
      email: 'admin@taller.com',
      password: 'admin123', // se encripta por el pre('save') del schema
      role: 'admin',
    };

    // 3. Verificar si ya existe
    const existing = await User.findOne({ email: adminData.email });

    if (existing) {
      console.log('⚠️ Ya existe un usuario con ese email:', adminData.email);
      console.log('   No se creó un nuevo admin.');
      await mongoose.disconnect();
      process.exit(0);
    }

    // 4. Crear el admin
    const admin = new User(adminData);
    await admin.save();

    console.log('🎉 Admin creado correctamente:');
    console.log(`   Email:    ${admin.email}`);
    console.log(`   Password: ${adminData.password}  (recuerda cambiarla luego)`);

    // 5. Cerrar conexión
    await mongoose.disconnect();
    console.log('🔌 Conexión a Mongo cerrada.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error en el script createAdmin:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
};

run();
