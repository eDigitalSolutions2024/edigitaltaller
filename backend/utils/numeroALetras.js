// Cantidad con letra para comprobantes de Caja, en el formato del papel
// preimpreso: 11124.00 -> "(Once mil ciento veinticuatro pesos 00/100 MN)".

const UNIDADES = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
const DIEZ_A_DIECINUEVE = [
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince',
  'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
];
const VEINTES = [
  'veinte', 'veintiún', 'veintidós', 'veintitrés', 'veinticuatro',
  'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
];
const DECENAS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = [
  '', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos',
  'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos',
];

function letrasDecenas(n) {
  if (n < 10) return UNIDADES[n];
  if (n < 20) return DIEZ_A_DIECINUEVE[n - 10];
  if (n < 30) return VEINTES[n - 20];
  const u = n % 10;
  return u ? `${DECENAS[Math.floor(n / 10)]} y ${UNIDADES[u]}` : DECENAS[Math.floor(n / 10)];
}

function letrasCentenas(n) {
  if (n === 100) return 'cien';
  const resto = n % 100;
  return [CENTENAS[Math.floor(n / 100)], letrasDecenas(resto)].filter(Boolean).join(' ');
}

function letrasMiles(n) {
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;
  const milesTxt = miles === 0 ? '' : miles === 1 ? 'mil' : `${letrasCentenas(miles)} mil`;
  return [milesTxt, letrasCentenas(resto)].filter(Boolean).join(' ');
}

function letrasMillones(n) {
  const millones = Math.floor(n / 1e6);
  const resto = n % 1e6;
  if (millones === 0) return letrasMiles(resto);
  const millonesTxt = millones === 1 ? 'un millón' : `${letrasMiles(millones)} millones`;
  return resto === 0 ? `${millonesTxt} de` : `${millonesTxt} ${letrasMiles(resto)}`;
}

function cantidadConLetra(monto) {
  const totalCentavos = Math.round((Number(monto) || 0) * 100);
  const entero = Math.floor(totalCentavos / 100);
  const centavos = String(totalCentavos % 100).padStart(2, '0');

  let letras = entero === 0 ? 'cero' : letrasMillones(entero);
  letras = letras.charAt(0).toUpperCase() + letras.slice(1);
  const moneda = entero === 1 ? 'peso' : 'pesos';

  return `(${letras} ${moneda} ${centavos}/100 MN)`;
}

module.exports = { cantidadConLetra };
