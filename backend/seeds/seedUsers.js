require('dotenv').config({ path: '../.env' });

const mongoose = require('mongoose');
const User = require('../models/User');

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    await User.deleteMany({
      email: {
        $in: [
          'admin@test.com',
          'recepcion@test.com',
          'mecanico@test.com'
        ]
      }
    });

    await User.create([
      {
        name: 'Admin Taller',
        email: 'admin@test.com',
        password: '123456',
        role: 'admin',
        isActive: true
      },
      {
        name: 'Recepción Taller',
        email: 'recepcion@test.com',
        password: '123456',
        role: 'recepcion',
        isActive: true
      },
      {
        name: 'Mecánico Taller',
        email: 'mecanico@test.com',
        password: '123456',
        role: 'mecanico',
        isActive: true
      }
    ]);

    console.log('✅ Usuarios creados correctamente');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error creando usuarios:', err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

run();