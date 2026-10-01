// Muestra en el título de la pestaña el total de avisos pendientes: "(3) ServiCompactos".
// Cada fuente (tickets, solicitudes de taller, por surtir...) reporta su cantidad
// con setAvisos(clave, n) y aquí se suman.
const BASE = document.title || 'ServiCompactos';
const fuentes = {};

function pintar() {
  const total = Object.values(fuentes).reduce((a, n) => a + n, 0);
  document.title = total > 0 ? `(${total}) ${BASE}` : BASE;
}

export function setAvisos(clave, cantidad) {
  const n = Number(cantidad) || 0;
  if (fuentes[clave] === n) return;
  fuentes[clave] = n;
  pintar();
}

export function limpiarAvisos(clave) {
  if (!(clave in fuentes)) return;
  delete fuentes[clave];
  pintar();
}
