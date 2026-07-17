require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const connectDB  = require('./config/db');
console.log('JWT_SECRET cargado:', !!process.env.JWT_SECRET);

const app = express();
connectDB();

app.use(cors({
    origin: [
        'http://localhost:3000',
        process.env.CORS_ORIGIN
    ],
    credentials: true
}));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use( '/uploads', express.static(path.join(__dirname, 'uploads')));


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

app.use('/api/garage', require('./routes/garage'));

app.use('/api/entradas', require('./routes/entradas'));

app.use('/api/inventario', require('./routes/inventario'));

// MONTA LAS RUTAS
app.use('/api/codigos', require('./routes/codigos'));  // <— IMPORTANTE

app.use('/api/salidas', require('./routes/salidas'));

app.use('/api/empleados', empleadosRoutes);

app.use('/api/devoluciones', require('./routes/devoluciones'));

app.use('/api/garantias', require('./routes/garantias'));

//Rutas de configuracion
app.use('/api/configuracion', require('./routes/configuracion'));


app.use('/api/ordenes-compra', ordenesCompraRoutes);

// index.js / app.js del backend
app.use('/api', require('./routes/facturas')); // ahora existe GET /api/facturas-proveedor

// 👇 NUEVAS rutas de facturación
app.use('/api/facturacion', require('./routes/facturacion'));
app.use('/api/fiscal-config', require('./routes/fiscal_config'));
app.use('/api/generar-xml', require('./routes/generar_xml'));

app.use('/api/reportes', require('./routes/reportes'));

app.use('/api/vales', require('./routes/vales'));

app.use('/api/cajas', require('./routes/cajas'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server en http://localhost:${PORT}`));
