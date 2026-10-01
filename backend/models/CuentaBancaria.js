// backend/models/CuentaBancaria.js
// Número de cuenta del TALLER (el que recibe el dinero) en cada banco del catálogo
// (utils/bancos.js) — Configuración > Cuentas bancarias. El RFC de cada banco NO vive
// aquí (es fijo, ver utils/bancos.js); solo la cuenta, que sí puede cambiar. Se usa
// para el "RFC Banco Emisor" / "Num Cuenta" del PDF de un Complemento de pago pagado
// por transferencia (ver backend/routes/facturacion.js drawReciboElectronicoPago).
const mongoose = require('mongoose');

const cuentaBancariaSchema = new mongoose.Schema(
  {
    banco: { type: String, required: true, unique: true },
    // Solo para bancos agregados desde Configuración (los del catálogo fijo no lo usan).
    personalizado: { type: Boolean, default: false },
    label: { type: String, default: '', trim: true },
    rfc: { type: String, default: '', trim: true, uppercase: true },
    abrev: { type: String, default: '', trim: true, uppercase: true },
    numeroCuenta: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CuentaBancaria', cuentaBancariaSchema);
