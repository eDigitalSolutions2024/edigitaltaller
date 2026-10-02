// Reglas del SAT (c_FormaPago) para la cuenta ORDENANTE de un Complemento de pago.
// Solo aplican a formas bancarizadas; con otra forma (efectivo, etc.) no se incluyen.
// Si se capturan y no cumplen la longitud, el PAC rechaza el timbrado (CRP213).
const REGLAS = {
  "02": { nombre: "Cheque", largos: [11, 18], ejemplo: "11 o 18 dígitos" },
  "03": { nombre: "Transferencia", largos: [10, 16, 18], ejemplo: "10, 16 o 18 dígitos" },
  "04": { nombre: "Tarjeta de crédito", largos: [16], ejemplo: "16 dígitos" },
  "28": { nombre: "Tarjeta de débito", largos: [16], ejemplo: "16 dígitos" },
};

const FORMAS_CON_ORDENANTE = Object.keys(REGLAS);
const limpiaCuenta = (v) => String(v ?? "").replace(/[\s-]/g, "").toUpperCase();

// Devuelve "" si es válida, o el mensaje de error.
function errorCuentaOrdenante(formaPago, cuenta) {
  const r = REGLAS[formaPago];
  if (!r) return "";
  const c = limpiaCuenta(cuenta);
  if (!c) return "";
  if (!/^\d+$/.test(c) || !r.largos.includes(c.length)) {
    return `Para ${r.nombre} la cuenta ordenante debe tener ${r.ejemplo} (solo números).`;
  }
  return "";
}

// CtaBeneficiario (cuenta del taller): transferencia 10 o 18 dígitos, cheque 11 o 18.
// En tarjetas no se manda al XML (solo se imprime en el PDF).
function cuentaBeneficiarioValida(formaPago, cuenta) {
  const c = limpiaCuenta(cuenta);
  const largos = formaPago === "03" ? [10, 18] : formaPago === "02" ? [11, 18] : [];
  return /^\d+$/.test(c) && largos.includes(c.length);
}

// Banco del TALLER que recibió el pago (emisor/beneficiario), según la forma SAT y la
// entrada de "Cobro en Cajas". Cheque no captura banco → "".
function bancoReceptorDePago(formaPago, e) {
  if (!e || !FORMAS_CON_ORDENANTE.includes(formaPago)) return "";
  if (formaPago === "03") {
    return e.formaPago === "TRANSFERENCIA"
      ? e.bancoTransferencia || ""
      : e.formaPago === "COMBINADO" ? e.combinado?.transferenciaBanco || "" : "";
  }
  if (formaPago === "04" || formaPago === "28") {
    const c = e.combinado || {};
    if (["CREDITO", "DEBITO"].includes(e.formaPago)) return e.tarjetas?.[0]?.terminal || e.terminal || "";
    if (e.formaPago === "COMBINADO") {
      const lista = formaPago === "04" ? c.tarjetasCredito : c.tarjetasDebito;
      return lista?.[0]?.terminal || c.banco || "";
    }
  }
  return "";
}

module.exports = { bancoReceptorDePago, REGLAS, FORMAS_CON_ORDENANTE, limpiaCuenta, errorCuentaOrdenante, cuentaBeneficiarioValida };
