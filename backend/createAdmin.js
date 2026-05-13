// createAdmin.js  (en la carpeta backend)

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const User = require('./models/User');

const run = async () => {
  try {
    console.log('✅ Iniciando script de creación de admin...');

    await connectDB();
    console.log('✅ Conectado a MongoDB desde createAdmin.js');

    const adminData = {
      name: 'Admin Taller',
      username: 'admin',
      email: 'admin@taller.com',
      password: 'admin123',
      role: 'admin',

      // opcionales del nuevo modelo
      telefono: '',
      celular: '',
      serie: '',
      serieLlantera: 'L',
      razonSocial: null,
      legacyLevel: '1',
      isActive: true,
      employee: null
    };

    const existing = await User.findOne({
      $or: [
        { email: adminData.email.toLowerCase() },
        { username: adminData.username.toLowerCase() }
      ]
    });

    if (existing) {
      console.log('⚠️ Ya existe un usuario con ese email o username:');
      console.log(`   Email: ${adminData.email}`);
      console.log(`   Username: ${adminData.username}`);
      await mongoose.disconnect();
      process.exit(0);
    }

    const admin = await User.create(adminData);

    console.log('🎉 Admin creado correctamente:');
    console.log(`   Nombre:   ${admin.name}`);
    console.log(`   Usuario:  ${admin.username}`);
    console.log(`   Email:    ${admin.email}`);
    console.log(`   Password: ${adminData.password}  (recuerda cambiarla luego)`);

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