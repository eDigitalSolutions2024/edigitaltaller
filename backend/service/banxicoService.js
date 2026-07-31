const axios = require('axios');

const BASE_URL = 'https://www.banxico.org.mx/SieAPIRest/service/v1';
const SERIE_FIX = 'SF43718'; // Tipo de cambio FIX peso/dólar

function parseFechaBanxico(fechaStr) {
  // Banxico devuelve fechas como "dd/MM/yyyy". Se normaliza a medianoche UTC
  // (igual que TipoCambio.fecha, que sale de un <input type="date"> y por
  // spec de JS se parsea como UTC) para que la comparación de fechas no
  // dependa de la zona horaria del servidor.
  const [dia, mes, anio] = fechaStr.split('/').map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia));
}

function parseDato(dato) {
  if (!dato || dato.dato === 'N/E') return null;
  const valor = Number(dato.dato);
  if (Number.isNaN(valor)) return null;
  return { fecha: parseFechaBanxico(dato.fecha), valor };
}

async function consultarSerie(path) {
  if (!process.env.BANXICO_TOKEN) {
    throw new Error('BANXICO_TOKEN no está configurado');
  }
  const { data } = await axios.get(`${BASE_URL}${path}`, {
    headers: { 'Bmx-Token': process.env.BANXICO_TOKEN },
  });
  return data?.bmx?.series?.[0]?.datos || [];
}

async function obtenerDatoOportuno(serie = SERIE_FIX) {
  const datos = await consultarSerie(`/series/${serie}/datos/oportuno`);
  return parseDato(datos[0]);
}

async function obtenerRangoHistorico(fechaInicioISO, fechaFinISO, serie = SERIE_FIX) {
  const datos = await consultarSerie(`/series/${serie}/datos/${fechaInicioISO}/${fechaFinISO}`);
  return datos.map(parseDato).filter(Boolean);
}

module.exports = { obtenerDatoOportuno, obtenerRangoHistorico, SERIE_FIX };
