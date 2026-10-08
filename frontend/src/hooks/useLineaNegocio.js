import { useLocation } from "react-router-dom";

/**
 * Línea de negocio "en la que estás parado", según la ruta: todo lo que cuelga
 * de /chirey/* trabaja con la línea Chirey (órdenes, inventario y reportes
 * propios); el resto del sistema es la operación normal de Servicompacto.
 *
 * Devuelve 'CHIREY' dentro de /chirey y '' fuera. El '' NO se manda al backend
 * (no se agrega `lineaNegocio`), así que las pantallas normales siguen
 * comportándose igual que antes: los reportes muestran todas las líneas y el
 * inventario el de Servicompacto (ver backend/utils/lineaNegocio.js).
 */
export function esRutaChirey(pathname) {
  return /^\/chirey(\/|$)/.test(pathname || "");
}

export default function useLineaNegocio() {
  const { pathname } = useLocation();
  return esRutaChirey(pathname) ? "CHIREY" : "";
}

/** `{ lineaNegocio: 'CHIREY' }` en rutas de Chirey, `{}` fuera: para esparcir en params/bodies. */
export function paramsLinea(linea) {
  return linea ? { lineaNegocio: linea } : {};
}

/** Ruta base de las pantallas de inventario/entradas según la línea (Chirey tiene las suyas bajo /chirey). */
export function baseInventario(linea) {
  return linea ? "/chirey/inventario" : "/refaccionaria";
}

/** Ruta base de Solicitudes de Taller (la lista y su detalle) según la línea. */
export function baseSolicitudes(linea) {
  return linea ? "/chirey/solicitudes-taller" : "/refaccionaria/solicitudes-taller";
}
