const SitioConfig = require('../models/SitioConfig');

// Datos del sitio (nombre, dirección, teléfono, si es matriz) que imprimen
// los reportes y documentos PDF. Un solo helper para que todos los
// generadores de PDF lean de la misma fuente en vez de tener el texto fijo
// repetido en cada archivo.
async function getSitioConfig() {
  const doc = await SitioConfig.getOrCreate();
  return doc.toObject();
}

module.exports = { getSitioConfig };
