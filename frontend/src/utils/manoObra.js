/**
 * Tarifa por hora de mano de obra.
 * El importe no se guarda en la orden: siempre se recalcula a partir de las
 * horas capturadas, para que un cambio de tarifa no deje órdenes con totales
 * viejos.
 */
export const TARIFA_HORA = 25;

/** Importe de un renglón de mano de obra = horas * tarifa. */
export function calcImporteHoras(horas) {
  return Number(horas || 0) * TARIFA_HORA;
}
