const mongoose = require('mongoose');
const CuentaBancaria = require('../models/CuentaBancaria');
const { aplicarAbreviaturas, registrarBancoPersonalizado } = require('./bancos');

// Al arrancar: registra los bancos agregados desde Configuración y carga las abreviaturas de banco personalizadas (Configuración >
// Cuentas bancarias) para los reportes. Nunca tumba el arranque.
async function cargarAbreviaturasBancos() {
  try {
    if (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => mongoose.connection.once('open', resolve));
    }
    const guardadas = await CuentaBancaria.find().lean();
    guardadas.filter((c) => c.personalizado).forEach(registrarBancoPersonalizado);
    aplicarAbreviaturas(Object.fromEntries(guardadas.map((c) => [c.banco, c.abrev])));
  } catch (err) {
    console.error('No se pudieron cargar las abreviaturas de bancos:', err.message);
  }
}

module.exports = { cargarAbreviaturasBancos };
