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

module.exports = { BANCOS, TERMINALES_TARJETA, RFC_POR_BANCO, ABREV_POR_BANCO, LABEL_POR_BANCO };
