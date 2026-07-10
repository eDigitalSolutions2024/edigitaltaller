// backend/utils/ordenServicio.js
// Utilidades para el folio de Orden de Servicio.
// Formato de captura manual: LETRAS-NÚMERO (ej. OS-023, P-152).

/**
 * Normaliza un folio capturado a mano al formato LETRAS-NÚMERO.
 * "os023", "OS 023" y "os-023" → "OS-023".
 * Devuelve null si el valor no cumple el formato Letra-Número.
 */
function normalizarOrdenServicio(valor) {
  const limpio = String(valor || '').toUpperCase().replace(/\s+/g, '');
  const m = limpio.match(/^([A-Z]+)-?(\d+)$/);
  return m ? `${m[1]}-${m[2]}` : null;
}

/**
 * Regex de búsqueda por folio que ignora guiones y espacios:
 * "OS023" encuentra "OS-023" y viceversa.
 * Con exacto=true el folio debe coincidir completo (ignorando guiones).
 */
function regexBusquedaOS(termino, { exacto = false } = {}) {
  const limpio = String(termino || '').replace(/[-\s]/g, '');
  if (!limpio) return null;
  const cuerpo = limpio
    .split('')
    .map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[-\\s]*');
  return new RegExp(exacto ? `^${cuerpo}$` : cuerpo, 'i');
}

module.exports = { normalizarOrdenServicio, regexBusquedaOS };
