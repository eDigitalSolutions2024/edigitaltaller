// backend/utils/logoOrden.js
//
// Logo a usar en los PDFs ligados a una orden, según su línea de negocio
// (ver lineaNegocio.js). Las órdenes de Chirey usan su propio logo en vez
// del de Servicompacto; el resto del formato no cambia.

const fs = require('fs');
const path = require('path');
const { normalizaLineaNegocio } = require('./lineaNegocio');

function cargarDataUrl(rutaAbsoluta, mime) {
  try {
    const data = fs.readFileSync(rutaAbsoluta).toString('base64');
    return `data:${mime};base64,${data}`;
  } catch (e) {
    console.warn(`[logoOrden] No se pudo cargar ${rutaAbsoluta}:`, e.message);
    return '';
  }
}

const LOGO_SERVICOMPACTO = cargarDataUrl(
  path.join(__dirname, '../assets/pdf/logo_servicompactos.png'),
  'image/png'
);

const LOGO_CHIREY = cargarDataUrl(
  path.join(__dirname, '../assets/Servicompacto-Chirey.svg'),
  'image/svg+xml'
);

// Devuelve el data URL del logo correspondiente a la línea de negocio dada.
function logoParaLinea(lineaNegocio) {
  return normalizaLineaNegocio(lineaNegocio) === 'CHIREY'
    ? (LOGO_CHIREY || LOGO_SERVICOMPACTO)
    : LOGO_SERVICOMPACTO;
}

module.exports = { LOGO_SERVICOMPACTO, LOGO_CHIREY, logoParaLinea };
