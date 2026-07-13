// Espejo de frontend/src/utils/manoObra.js: el importe de mano de obra nunca
// se guarda en la orden, siempre se recalcula a partir de las horas capturadas.
const TARIFA_HORA = 25;

function calcImporteHoras(horas) {
  return Number(horas || 0) * TARIFA_HORA;
}

module.exports = { TARIFA_HORA, calcImporteHoras };
