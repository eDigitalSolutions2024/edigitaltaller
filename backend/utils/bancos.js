'use strict';

// Catálogo ÚNICO de bancos/terminales para capturar un pago en Cajas (tarjeta,
// transferencia) y para el RFC Banco Emisor de un Complemento de pago. `value` es
// el mismo string que ya vive guardado en miles de documentos de Vehiculo.pagos[]
// (enum de Mongoose) — NUNCA renombrar uno existente, solo agregar nuevos al final.
//
// `rfc`: solo se captura el de bancos que el usuario confirmó (lista SAT de RFCs
// de bancos mexicanos); se deja '' para no inventar un RFC fiscal incorrecto en un
// documento que sale a nombre del cliente — Configuración › Cuentas bancarias
// permite completarlo a mano si hace falta más adelante.
const BANCOS = [
  { value: 'BANREGIO', label: 'Banregio', abrev: 'BR', rfc: '' },
  { value: 'AMERICAN EXPRESS', label: 'American Express', abrev: 'AE', rfc: '' },
  { value: 'BANAMEX', label: 'Banamex (Citibanamex)', abrev: 'BX', rfc: 'BNM840515VB1' },
  { value: 'BANORTE', label: 'Banorte', abrev: 'BN', rfc: 'BMN930209927' },
  { value: 'BBVA BANCOMER', label: 'BBVA', abrev: 'BB', rfc: 'BBA830831LJ2' },
  { value: 'SANTANDER', label: 'Santander', abrev: 'ST', rfc: 'BSM970519DU8' },
  { value: 'HSBC', label: 'HSBC', abrev: 'HS', rfc: 'HMI950125KG8' },
  { value: 'SCOTIABANK', label: 'Scotiabank', abrev: 'SC', rfc: 'SIN9412025I4' },
  { value: 'AZTECA', label: 'Banco Azteca', abrev: 'AZ', rfc: 'BAI0205236Y8' },
  { value: 'BANCOPPEL', label: 'BanCoppel', abrev: 'CP', rfc: 'BSI061110963' },
  { value: 'AFIRME', label: 'Banca Afirme', abrev: 'AF', rfc: 'BAF950102JP5' },
  { value: 'INBURSA', label: 'Inbursa', abrev: 'IB', rfc: 'BII931004P61' },
];

const TERMINALES_TARJETA = BANCOS.map((b) => b.value);
const RFC_POR_BANCO = Object.fromEntries(BANCOS.map((b) => [b.value, b.rfc]));
const ABREV_POR_BANCO = Object.fromEntries(BANCOS.map((b) => [b.value, b.abrev]));
const LABEL_POR_BANCO = Object.fromEntries(BANCOS.map((b) => [b.value, b.label]));

// Aplica abreviaturas personalizadas (Configuración › Cuentas bancarias) sobre el
// MISMO objeto ABREV_POR_BANCO, para que quien ya lo importó (abreviaturaFormaPago)
// las vea sin reiniciar. { 'BANREGIO': 'BR', ... }; un valor vacío vuelve al default.
function aplicarAbreviaturas(overrides = {}) {
  for (const b of BANCOS) {
    const v = String(overrides[b.value] || '').trim().toUpperCase();
    ABREV_POR_BANCO[b.value] = v || b.abrev;
  }
}

// Valor guardado (en pagos) de un banco nuevo a partir de su nombre: MAYÚSCULAS sin
// acentos ni espacios dobles. Una vez creado NUNCA se renombra (vive en pagos[]).
function valorDeBanco(nombre) {
  return String(nombre || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

// Agrega al catálogo un banco creado desde Configuración › Cuentas bancarias.
// Muta los mismos arreglos/objetos que ya importaron los demás módulos, así que
// funciona sin reiniciar. No hace nada si el banco ya existe.
function registrarBancoPersonalizado({ banco, label, abrev, rfc }) {
  if (!banco || TERMINALES_TARJETA.includes(banco)) return;
  const entrada = {
    value: banco,
    label: label || banco,
    abrev: String(abrev || '').trim().toUpperCase() || banco.slice(0, 2),
    rfc: rfc || '',
    personalizado: true,
  };
  BANCOS.push(entrada);
  TERMINALES_TARJETA.push(banco);
  RFC_POR_BANCO[banco] = entrada.rfc;
  ABREV_POR_BANCO[banco] = entrada.abrev;
  LABEL_POR_BANCO[banco] = entrada.label;
}

// Validador de Mongoose para campos de banco/terminal: reemplaza al `enum` fijo
// (que se copia al cargar el modelo y no vería los bancos nuevos). '' siempre vale.
const validarBancoCaja = {
  validator: (v) => v === '' || v == null || TERMINALES_TARJETA.includes(v),
  message: (props) => `\`${props.value}\` no es un banco válido`,
};

module.exports = { registrarBancoPersonalizado, valorDeBanco, validarBancoCaja, aplicarAbreviaturas, BANCOS, TERMINALES_TARJETA, RFC_POR_BANCO, ABREV_POR_BANCO, LABEL_POR_BANCO };
