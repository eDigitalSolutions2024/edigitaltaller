// Espejo de backend/utils/cuentaOrdenante.js (reglas SAT c_FormaPago).
export const REGLAS_ORDENANTE = {
  "02": { nombre: "Cheque", largos: [11, 18], ejemplo: "11 o 18 dígitos" },
  "03": { nombre: "Transferencia", largos: [10, 16, 18], ejemplo: "10, 16 o 18 dígitos" },
  "04": { nombre: "Tarjeta de crédito", largos: [16], ejemplo: "16 dígitos" },
  "28": { nombre: "Tarjeta de débito", largos: [16], ejemplo: "16 dígitos" },
};

export const aplicaOrdenante = (formaPago) => !!REGLAS_ORDENANTE[formaPago];
export const limpiaCuenta = (v) => String(v ?? "").replace(/[\s-]/g, "").toUpperCase();

export function errorCuentaOrdenante(formaPago, cuenta) {
  const r = REGLAS_ORDENANTE[formaPago];
  const c = limpiaCuenta(cuenta);
  if (!r || !c) return "";
  if (!/^\d+$/.test(c) || !r.largos.includes(c.length)) {
    return `Para ${r.nombre} debe tener ${r.ejemplo} (solo números).`;
  }
  return "";
}
