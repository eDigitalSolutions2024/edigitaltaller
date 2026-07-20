/**
 * Los campos capturados con <input type="date"> (p. ej. fechaRecepcion) llegan
 * del backend como medianoche UTC ("2026-07-13T00:00:00.000Z"). Formatearlos en
 * hora local de México (UTC-6/-7) los retrocede un día, así que las fechas
 * "solo día" se formatean con timeZone UTC; los timestamps reales
 * (fechaSolicitud, fechaCierre, updatedAt…) se muestran en hora local.
 */
export function esFechaSoloDia(value) {
  return (
    typeof value === "string" &&
    (/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      /T00:00:00(\.000)?Z$/.test(value) ||
      /T23:59:59\.999Z$/.test(value))
  );
}

/** Formatea una fecha en es-MX. Devuelve "" si viene vacía o inválida. */
export function formatFecha(value, opciones = {}) {
  if (!value) return "";
  const fecha = new Date(value);
  if (Number.isNaN(fecha.getTime())) return "";
  return fecha.toLocaleDateString("es-MX", {
    ...(esFechaSoloDia(value) ? { timeZone: "UTC" } : {}),
    ...opciones,
  });
}
