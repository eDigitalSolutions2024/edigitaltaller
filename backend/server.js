require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
console.log('JWT_SECRET cargado:', !!process.env.JWT_SECRET);

const app = express();
connectDB();

app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));


const empleadosRoutes = require('./routes/empleados');
const ordenesCompraRoutes = require('./routes/ordenesCompra');

const usersRoutes = require('./routes/users');


app.get('/', (_req, res) => res.send('API Taller OK'));
app.use('/api/auth', require('./routes/authRoutes'));

//ruta de administración de usuarios
app.use('/api/users', require('./routes/users'));

app.use("/api/clientes", require("./routes/clientes"));


app.use('/api/proveedores', require('./routes/proveedores'));

app.use('/api/vehiculos', require('./routes/vehiculos')); // 👈 NUEVA

app.use('/api/entradas', require('./routes/entradas'));

app.use('/api/inventario', require('./routes/inventario'));

// MONTA LAS RUTAS
app.use('/api/codigos', require('./routes/codigos'));  // <— IMPORTANTE

app.use('/api/salidas', require('./routes/salidas'));

app.use('/api/empleados', empleadosRoutes);

app.use('/api/devoluciones', require('./routes/devoluciones')); 

//Rutas de configuracion
app.use('/api/configuracion', require('./routes/configuracion'));


app.use('/api/ordenes-compra', ordenesCompraRoutes);

// index.js / app.js del backend
app.use('/api', require('./routes/facturas')); // ahora existe GET /api/facturas-proveedor

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server en http://localhost:${PORT}`));
