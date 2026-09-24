// Una garantía resuelta como "No aplica" deja de ser una orden de garantía: la
// orden se trata (y se imprime) como una orden normal. Mismo criterio que
// esOrdenGarantia en backend/utils/pdfWatermark.js.
export const esGarantiaActiva = (orden) =>
  !!orden?.garantia && orden.garantia.estado !== "NO_APLICA";
