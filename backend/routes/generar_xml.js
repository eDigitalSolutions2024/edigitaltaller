// backend/routes/generar_xml.js
const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { Xslt, XmlParser } = require("xslt-processor");

const FiscalConfig = require("../models/FiscalConfig");
const FacturaCfdi = require("../models/FacturaCfdi");
const Vehiculo = require("../models/Vehiculo");
const Contador = require("../models/Contador");
const { proteger } = require("../middleware/auth");
const { registrarMovimientosTarjetas } = require("../utils/movimientosTerminalPago");
const {
  filtroAnticipoFacturaGlobal,
  ordenesDeNotasVenta,
  conflictosAnticiposAntesDeTimbrar,
  cancelarAnticiposYRemisionesPorFactura,
} = require("../utils/anticiposAlFacturar");
const { dayjsFecha } = require("../utils/fechas");
const { limpiarYValidarTarjetas } = require("../utils/tarjetasCaja");
const { registrarAccion } = require("../utils/registrarAccion");
const { ordenesEnFacturaGlobal } = require("../utils/ordenesEnFacturaGlobal");
const { exigirUuidActivo } = require("../utils/configuracionUuid");
const { TERMINALES_TARJETA, RFC_POR_BANCO } = require("../utils/bancos");
const CuentaBancaria = require("../models/CuentaBancaria");
const { bancoReceptorDePago, FORMAS_CON_ORDENANTE, limpiaCuenta, errorCuentaOrdenante, cuentaBeneficiarioValida } = require("../utils/cuentaOrdenante");
const { resolverNotasLiberadas, liberarNotasDeGlobal } = require("../utils/notaCreditoGlobal");
const {
  folioDe,
  vehiculoIdsDeFactura,
  facturasPreviasDeOrdenes,
  vehiculoIdsConCobroHeredable,
  registrarCancelacionFactura,
  reasignarPagosDeFacturas,
} = require("../utils/refacturacion");

const router = express.Router();

// Mismo contador que backend/routes/cajas.js usa para numerar el Recibo de
// Dólares (folio compartido, sin importar si el pago se dio de alta desde
// Cajas o desde el menú Factura).
const CONTADOR_RECIBO_DOLARES = "reciboDolares";
// Folio del Recibo Provisional que genera un Complemento de pago sin comprobante
// en Cajas (ver crearPagosSinComprobante, modo "ABONO") — debe coincidir con
// CONTADOR_RECIBO_PROVISIONAL en routes/cajas.js.
const CONTADOR_RECIBO_PROVISIONAL = "reciboProvisional";

// Mismos catálogos que backend/routes/cajas.js usa para validar un pago
// SIN_COMPROBANTE ("Liquidar") dado de alta desde Cajas.
const FORMAS_PAGO_CAJA = ["EFECTIVO", "CREDITO", "DEBITO", "CHEQUE", "TRANSFERENCIA", "COMBINADO"];
const TIPOS_TRANSFERENCIA = ["SPEI", "TEF", "TERCERO"];

// Valida una entrada de `pagosSinComprobante` (una orden de la factura que no
// tiene ningún anticipo/remisión vigente): mismas reglas que cajas.js aplica
// al dar de alta un pago SIN_COMPROBANTE. Devuelve un mensaje de error, o
// null si es válida.
function errorPagoSinComprobante(p) {
  if (!p || !p.vehiculoId) return "Falta la orden del pago sin comprobante.";
  if (!FORMAS_PAGO_CAJA.includes(p.formaPago)) {
    return "Selecciona la forma de pago de la orden sin comprobante en Cajas.";
  }
  // Mismo cálculo que crearPagosSinComprobante: el monto en pesos es el total
  // de la orden menos la parte en dólares (si la hay), para validar contra
  // eso la suma de tarjetas capturadas.
  const montoDolaresP =
    p.formaPago === "COMBINADO"
      ? Number(p.combinado?.efectivoDolares) || 0
      : p.formaPago === "EFECTIVO"
      ? Number(p.montoDolares) || 0
      : 0;
  const tipoCambioP = montoDolaresP > 0 ? Number(p.tipoCambio) || 0 : 0;
  const montoPesosP = Math.round(((Number(p.monto) || 0) - montoDolaresP * tipoCambioP) * 100) / 100;

  if (["CREDITO", "DEBITO"].includes(p.formaPago)) {
    if (Array.isArray(p.tarjetas) && p.tarjetas.length) {
      const r = limpiarYValidarTarjetas(p.tarjetas, montoPesosP, "tarjeta");
      if (r.error) return r.error;
    } else if (!TERMINALES_TARJETA.includes(p.terminal)) {
      return "Selecciona la terminal donde se cobró la tarjeta de la orden sin comprobante en Cajas.";
    }
  }
  if (
    p.formaPago === "TRANSFERENCIA" &&
    (!TIPOS_TRANSFERENCIA.includes(p.tipoTransferencia) || !TERMINALES_TARJETA.includes(p.bancoTransferencia))
  ) {
    return "Selecciona el tipo de transferencia (SPEI, TEF o Pago cuenta tercero) y el banco de la orden sin comprobante en Cajas.";
  }
  if (p.formaPago === "COMBINADO") {
    const c = p.combinado || {};
    const totalCredito = Number(c.credito) || 0;
    const totalDebito = Number(c.debito) || 0;
    const totalTarjeta = totalCredito + totalDebito;
    const hayDesglose =
      (Array.isArray(c.tarjetasCredito) && c.tarjetasCredito.length) ||
      (Array.isArray(c.tarjetasDebito) && c.tarjetasDebito.length);
    if (totalTarjeta > 0) {
      if (hayDesglose) {
        if (totalCredito > 0) {
          const r = limpiarYValidarTarjetas(c.tarjetasCredito, totalCredito, "tarjeta");
          if (r.error) return r.error;
        }
        if (totalDebito > 0) {
          const r = limpiarYValidarTarjetas(c.tarjetasDebito, totalDebito, "tarjeta");
          if (r.error) return r.error;
        }
      } else if (!TERMINALES_TARJETA.includes(c.banco)) {
        return "Selecciona la terminal de la parte con tarjeta del pago combinado (orden sin comprobante en Cajas).";
      }
    }
    if (
      (Number(c.transferencia) || 0) > 0 &&
      (!TIPOS_TRANSFERENCIA.includes(c.transferenciaTipo) || !TERMINALES_TARJETA.includes(c.transferenciaBanco))
    ) {
      return "Selecciona el tipo de transferencia (SPEI, TEF o Pago cuenta tercero) y el banco de la parte por transferencia del pago combinado (orden sin comprobante en Cajas).";
    }
  }
  return null;
}

/* =========================
   HELPERS
========================= */
// Formato estándar de un UUID de CFDI (Folio Fiscal): 8-4-4-4-12 hex. Se usa
// para validar cfdi:CfdiRelacionados y pago20:DoctoRelacionado — el SAT
// rechaza el XML si UUID/IdDocumento no tiene esta forma.
const UUID_RE = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;
// UUID que lleva el XML donde falta el real. Solo ocurre con "Exigir UUID" desactivado en
// Configuración (pruebas mientras no se timbra): con la exigencia activa se valida antes.
const UUID_SIN_TIMBRAR = "00000000-0000-0000-0000-000000000000";
const uuidParaXml = (u) => String(u || "").trim().toUpperCase() || UUID_SIN_TIMBRAR;

// Folio propio de la Nota de crédito (serie fija "NC"), editable en Configuración — debe
// coincidir con el nombre usado en routes/configuracion.js.
const NOTA_CREDITO_CFDI_CONTADOR = "notaCreditoCfdi";

// Catálogo SAT c_TipoRelacion (mismo en CFDI 3.3 y 4.0).
const TIPO_RELACION_VALIDOS = ["01", "02", "03", "04", "05", "06", "07"];

function escapeXml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmt2(n) {
  const x = Number(n || 0);
  return x.toFixed(2);
}

function fmt6(n) {
  const x = Number(n || 0);
  return x.toFixed(6);
}

function cfdiFechaNow() {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, "0");
  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    "T" +
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes()) +
    ":" +
    pad(d.getSeconds())
  );
}

function tasaIva6(ivaRate) {
  const r = Number(ivaRate || 0);
  if (r === 0) return "0.000000";
  if (r === 0.08) return "0.080000";
  return "0.160000";
}

// ISR 1.25% => 0.012500 (6 decimales)
function tasaIsr6(isrRate) {
  return fmt6(Number(isrRate || 0));
}

function calcularTotales({
  conceptos,
  ivaRate = 0.16,
  aplicarRetencionIsr = false,
  isrRate = 0.0125,
  descuento = 0,
}) {
  const subtotalNum = conceptos.reduce((sum, c) => {
    return sum + Number(c.cantidad || 0) * Number(c.valorUnitario || 0);
  }, 0);

  // El descuento (monto en pesos) se resta del subtotal antes de calcular
  // IVA/ISR. Se acota a [0, subtotal] para no dejar base negativa.
  const descuentoNum = Math.min(Math.max(Number(descuento || 0), 0), subtotalNum);
  const baseNum = subtotalNum - descuentoNum;

  const ivaNum = baseNum * Number(ivaRate || 0);
  const isrNum = aplicarRetencionIsr ? baseNum * Number(isrRate || 0) : 0;

  const totalNum = baseNum + ivaNum - isrNum;

  return {
    subtotal: fmt2(subtotalNum),
    descuento: fmt2(descuentoNum),
    iva: fmt2(ivaNum),
    isr: fmt2(isrNum),
    total: fmt2(totalNum),
  };
}

/* Reparte un descuento global (monto en pesos) entre los conceptos, en
   proporción a su importe; el último absorbe el redondeo. Devuelve copias con
   el campo `descuento` que el generador de XML necesita por concepto. */
function repartirDescuentoEnConceptos(conceptos, descuentoTotal) {
  const lista = Array.isArray(conceptos) ? conceptos : [];
  const desc = Number(descuentoTotal || 0);
  if (!(desc > 0) || !lista.length) {
    return lista.map((c) => ({ ...c, descuento: Number(c.descuento || 0) }));
  }
  const importes = lista.map((c) => Number(c.cantidad || 0) * Number(c.valorUnitario || 0));
  const suma = importes.reduce((s, n) => s + n, 0) || 1;
  let acumulado = 0;
  return lista.map((c, i) => {
    const share =
      i === lista.length - 1
        ? Math.max(desc - acumulado, 0)
        : Math.round(((desc * importes[i]) / suma) * 100) / 100;
    acumulado += share;
    return { ...c, descuento: share };
  });
}

/* =========================
   ENCONTRAR PEM CORRECTO
   - Si existe emisor.key.pem úsalo
   - Si no, busca el más reciente *.key.pem en /keys
========================= */
function pickPemPathFromKeysFolder() {
  const keysDir = path.join(__dirname, "..", "keys");

  // 1) el clásico
  const fixed = path.join(keysDir, "emisor.key.pem");
  if (fs.existsSync(fixed)) return fixed;

  // 2) el más reciente *.key.pem
  if (!fs.existsSync(keysDir)) return null;
  const files = fs
    .readdirSync(keysDir)
    .filter((f) => f.toLowerCase().endsWith(".key.pem"))
    .map((f) => ({
      f,
      full: path.join(keysDir, f),
      mtime: fs.statSync(path.join(keysDir, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  return files.length ? files[0].full : null;
}

/* =========================
   XML BUILDER (SIN SELLO)
   - IVA 0 => omite impuestos
   - Retención ISR => agrega retenciones
========================= */
function buildCfdiXmlUnsigned({ emisor, receptor, cfdi, conceptos, totales }) {
  const {
    folio,
    serie,
    moneda = "MXN",
    tipoCambio,
    formaPago = "99",
    metodoPago = "PUE",
    usoCfdi = "G03",
    lugarExpedicion,
    tipoComprobante = "I",
    exportacion = "01",
    relacion = null,
    fecha,
    // retención
    aplicarRetencionIsr = false,
    isrRate = 0.0125,
    // factura global (CFDI al público en general)
    informacionGlobal = null,
  } = cfdi;

  const fechaOk = fecha || cfdiFechaNow();
  const ivaRate = Number(cfdi.ivaRate ?? 0.16);

  // Nodo cfdi:InformacionGlobal (va antes de CfdiRelacionados / Emisor).
  const informacionGlobalXml =
    informacionGlobal && informacionGlobal.periodicidad
      ? `<cfdi:InformacionGlobal Periodicidad="${escapeXml(informacionGlobal.periodicidad)}" Meses="${escapeXml(
          informacionGlobal.meses
        )}" Año="${escapeXml(String(informacionGlobal.anio))}"/>`
      : "";

  // Descuento global del comprobante (suma de descuentos por concepto).
  const descuentoTotal = Number(totales.descuento || 0);
  const descuentoAttr = descuentoTotal > 0 ? `\n  Descuento="${fmt2(descuentoTotal)}"` : "";

  const tipoCambioAttr =
    moneda === "USD" && tipoCambio ? ` TipoCambio="${escapeXml(String(tipoCambio))}"` : "";

  const serieAttr = serie ? ` Serie="${escapeXml(String(serie))}"` : "";
  const folioAttr = folio ? ` Folio="${escapeXml(String(folio))}"` : "";

  // `relacion` acepta un solo grupo { tipoRelacion, uuids } (factura/complemento: el
  // grupo opcional de "Facturas relacionadas") o varios (nota de crédito: el grupo 01
  // obligatorio de la factura que acredita, más el opcional si se capturó otro) — el
  // SAT permite varios <cfdi:CfdiRelacionados>, uno por cada TipoRelacion distinto; si
  // dos grupos comparten tipo se combinan en uno solo (no debería pasar en la práctica).
  const gruposRelacion = Array.isArray(relacion) ? relacion : relacion ? [relacion] : [];
  const uuidsPorTipo = new Map();
  for (const g of gruposRelacion) {
    if (!g?.tipoRelacion) continue;
    const uuids = ((g.uuids || []).length ? g.uuids : [""]).map((u) => uuidParaXml(u));
    uuidsPorTipo.set(g.tipoRelacion, [...(uuidsPorTipo.get(g.tipoRelacion) || []), ...uuids]);
  }
  const relacionadosXml = [...uuidsPorTipo.entries()]
    .map(
      ([tipo, uuids]) =>
        `<cfdi:CfdiRelacionados TipoRelacion="${escapeXml(tipo)}">${uuids
          .map((u) => `<cfdi:CfdiRelacionado UUID="${escapeXml(u)}"/>`)
          .join("")}</cfdi:CfdiRelacionados>`
    )
    .join("");

  const tasaIva = tasaIva6(ivaRate);
  const tasaIsr = tasaIsr6(isrRate);

  let baseTotal = 0;

  let descuentoBaseTotal = 0;

  const conceptosXml = conceptos
    .map((c) => {
      const cantidad = Number(c.cantidad || 0);
      const valorUnitario = Number(c.valorUnitario || 0);
      const importe = cantidad * valorUnitario;
      baseTotal += importe;

      // Descuento por concepto (monto en pesos). La base gravable del concepto
      // es Importe - Descuento.
      const descuento = Math.min(Math.max(Number(c.descuento || 0), 0), importe);
      descuentoBaseTotal += descuento;
      const baseGravable = importe - descuento;
      const descuentoConceptoAttr = descuento > 0 ? `\n  Descuento="${fmt2(descuento)}"` : "";

      // Código propio del cliente para este servicio (ver Cliente.codigosServicio).
      // Atributo opcional del CFDI 4.0; se omite si no viene.
      const noIdentAttr = c.noIdentificacion
        ? `\n  NoIdentificacion="${escapeXml(String(c.noIdentificacion))}"`
        : "";

      const ivaImporte = baseGravable * ivaRate;
      const isrImporte = aplicarRetencionIsr ? baseGravable * Number(isrRate || 0) : 0;

      // Si NO hay impuestos (IVA 0 y sin retenciones), ObjetoImp="01" y sin nodo Impuestos
      const noImpuestos = ivaRate === 0 && !aplicarRetencionIsr;

      if (noImpuestos) {
        return `
<cfdi:Concepto
  ClaveProdServ="${escapeXml(c.cProdServ)}"${noIdentAttr}
  Cantidad="${escapeXml(String(cantidad))}"
  ClaveUnidad="${escapeXml(c.cUnidad)}"
  Unidad="${escapeXml(c.unidad)}"
  Descripcion="${escapeXml(c.descripcion)}"
  ValorUnitario="${fmt2(valorUnitario)}"
  Importe="${fmt2(importe)}"${descuentoConceptoAttr}
  ObjetoImp="01">
</cfdi:Concepto>`;
      }

      // Si hay IVA o ISR, ObjetoImp="02"
      const trasladosXml =
        ivaRate > 0
          ? `
    <cfdi:Traslados>
      <cfdi:Traslado Base="${fmt2(baseGravable)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="${tasaIva}" Importe="${fmt2(ivaImporte)}"/>
    </cfdi:Traslados>`
          : "";

      const retencionesXml =
        aplicarRetencionIsr
          ? `
    <cfdi:Retenciones>
      <cfdi:Retencion Base="${fmt2(baseGravable)}" Impuesto="001" TipoFactor="Tasa" TasaOCuota="${tasaIsr}" Importe="${fmt2(isrImporte)}"/>
    </cfdi:Retenciones>`
          : "";

      return `
<cfdi:Concepto
  ClaveProdServ="${escapeXml(c.cProdServ)}"${noIdentAttr}
  Cantidad="${escapeXml(String(cantidad))}"
  ClaveUnidad="${escapeXml(c.cUnidad)}"
  Unidad="${escapeXml(c.unidad)}"
  Descripcion="${escapeXml(c.descripcion)}"
  ValorUnitario="${fmt2(valorUnitario)}"
  Importe="${fmt2(importe)}"${descuentoConceptoAttr}
  ObjetoImp="02">
  <cfdi:Impuestos>${retencionesXml}${trasladosXml}
  </cfdi:Impuestos>
</cfdi:Concepto>`;
    })
    .join("");

  // Impuestos globales (solo si aplica)
  const noImpuestosGlobal = Number(totales.iva || 0) === 0 && Number(totales.isr || 0) === 0;

  let impuestosXml = "";
  if (!noImpuestosGlobal) {
    const parts = [];

    // Retenciones ISR (Impuesto 001)
    if (Number(totales.isr || 0) > 0) {
      parts.push(`
  <cfdi:Retenciones>
    <cfdi:Retencion Impuesto="001" Importe="${totales.isr}"/>
  </cfdi:Retenciones>`);
    }

    // Traslados IVA (Impuesto 002). La base global es la suma de importes menos
    // el descuento repartido en los conceptos.
    if (Number(totales.iva || 0) > 0) {
      parts.push(`
  <cfdi:Traslados>
    <cfdi:Traslado Base="${fmt2(baseTotal - descuentoBaseTotal)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="${tasaIva}" Importe="${totales.iva}"/>
  </cfdi:Traslados>`);
    }

    const totalTras = Number(totales.iva || 0) > 0 ? ` TotalImpuestosTrasladados="${totales.iva}"` : "";
    const totalRet = Number(totales.isr || 0) > 0 ? ` TotalImpuestosRetenidos="${totales.isr}"` : "";

    impuestosXml = `
<cfdi:Impuestos${totalRet}${totalTras}>${parts.join("")}
</cfdi:Impuestos>`;
  }

  const noCertAttr = emisor.noCertificado ? ` NoCertificado="${escapeXml(emisor.noCertificado)}"` : "";
  const certAttr = emisor.certificadoBase64 ? ` Certificado="${escapeXml(emisor.certificadoBase64)}"` : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante
  xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd"
  Version="4.0"${serieAttr}${folioAttr}${noCertAttr}${certAttr}
  Fecha="${fechaOk}"
  FormaPago="${escapeXml(formaPago)}"
  SubTotal="${totales.subtotal}"${descuentoAttr}
  Moneda="${escapeXml(moneda)}"${tipoCambioAttr}
  Total="${totales.total}"
  TipoDeComprobante="${escapeXml(tipoComprobante)}"
  Exportacion="${escapeXml(exportacion)}"
  MetodoPago="${escapeXml(metodoPago)}"
  LugarExpedicion="${escapeXml(lugarExpedicion)}"
  Sello="">

  ${informacionGlobalXml}

  ${relacionadosXml}

  <cfdi:Emisor
    Rfc="${escapeXml(emisor.rfc)}"
    Nombre="${escapeXml(emisor.nombre)}"
    RegimenFiscal="${escapeXml(emisor.regimenFiscal)}"
  />

  <cfdi:Receptor
    Rfc="${escapeXml(receptor.rfc)}"
    Nombre="${escapeXml(receptor.nombre)}"
    DomicilioFiscalReceptor="${escapeXml(receptor.cp)}"
    RegimenFiscalReceptor="${escapeXml(receptor.regimenFiscal)}"
    UsoCFDI="${escapeXml(usoCfdi)}"
  />

  <cfdi:Conceptos>
    ${conceptosXml}
  </cfdi:Conceptos>

  ${impuestosXml}

</cfdi:Comprobante>`;
}

/* =========================
   XML BUILDER PAGO (TIPO P, SIN SELLO)
   Complemento de pago 2.0 (pago20)
========================= */
// Banco/cuenta ordenante capturados en el complemento (pago.bancoOrdenante /
// pago.cuentaOrdenante). Solo aplica a transferencia (03). El RFC sale de Configuración >
// Cuentas bancarias o del catálogo. null si falta banco o cuenta.
async function resolverOrdenante(pago) {
  if (!FORMAS_CON_ORDENANTE.includes(pago?.formaPago)) return null;
  const banco = String(pago.bancoOrdenante || "").trim();
  const cuenta = limpiaCuenta(pago.cuentaOrdenante);
  if (!banco || !cuenta) return null;
  const errCuenta = errorCuentaOrdenante(pago.formaPago, cuenta);
  if (errCuenta) {
    const e = new Error(errCuenta);
    e.status = 400;
    throw e;
  }
  const doc = await CuentaBancaria.findOne({ banco }).lean().catch(() => null);
  return { banco, cuenta, rfc: doc?.rfc || RFC_POR_BANCO[banco] || "" };
}

function buildPagoXmlUnsigned({ emisor, receptor, cfdi, pago, relacionadas, ordenante = null, beneficiario = null }) {
  const { serie, folio, lugarExpedicion, fecha, relacion = null } = cfdi;

  const fechaOk = fecha || cfdiFechaNow();
  const serieAttr = serie ? ` Serie="${escapeXml(String(serie))}"` : "";
  const folioAttr = folio ? ` Folio="${escapeXml(String(folio))}"` : "";
  const noCertAttr = emisor.noCertificado ? ` NoCertificado="${escapeXml(emisor.noCertificado)}"` : "";
  const certAttr = emisor.certificadoBase64 ? ` Certificado="${escapeXml(emisor.certificadoBase64)}"` : "";

  // cfdi:CfdiRelacionados opcional (ver NuevaFactura "Facturas relacionadas"): la relación
  // del complemento con las facturas que paga va aparte, en pago20:DoctoRelacionado (más
  // abajo); esto es solo para el caso, poco común, de que el complemento en sí también se
  // relacione con OTRO CFDI (sustitución, devolución, etc.).
  const relacionadosXml = relacion?.tipoRelacion
    ? `<cfdi:CfdiRelacionados TipoRelacion="${escapeXml(relacion.tipoRelacion)}">${(
        (relacion.uuids || []).length ? relacion.uuids : [""]
      )
        .map((u) => `<cfdi:CfdiRelacionado UUID="${escapeXml(uuidParaXml(u))}"/>`)
        .join("")}</cfdi:CfdiRelacionados>`
    : "";

  const monto = relacionadas.reduce((s, r) => s + Number(r.importePagado || 0), 0);

  // Si solo llega la fecha (YYYY-MM-DD) se completa con hora fija
  const fpRaw = String(pago.fechaPago || "");
  const fechaPago = fpRaw.length === 10 ? `${fpRaw}T12:00:00` : fpRaw;

  // Banco/cuenta ordenante (del cliente): solo transferencia (03) y con RFC del banco.
  const ordenanteAttrs =
    ordenante?.rfc && ordenante?.cuenta
      ? ` RfcEmisorCtaOrd="${escapeXml(ordenante.rfc)}" CtaOrdenante="${escapeXml(ordenante.cuenta)}"`
      : "";
  // Beneficiario (cuenta del taller): solo transferencia con RFC de banco y cuenta válida.
  const beneficiarioAttrs =
    beneficiario?.rfc && cuentaBeneficiarioValida(pago.formaPago, beneficiario.cuenta)
      ? ` RfcEmisorCtaBen="${escapeXml(beneficiario.rfc)}" CtaBeneficiario="${escapeXml(limpiaCuenta(beneficiario.cuenta))}"`
      : "";

  const doctosXml = relacionadas
    .map((r) => {
      const saldoAnt = Number(r.saldoAnterior ?? r.total ?? 0);
      const pagado = Number(r.importePagado || 0);
      const insoluto = Number(r.saldoInsoluto ?? Math.max(saldoAnt - pagado, 0));
      // IdDocumento SIEMPRE es el UUID real de la factura pagada (Pagos 2.0 lo
      // exige); se valida en POST /xml antes de llegar aquí, nunca se cae a
      // serie+folio, que no es un UUID válido.
      const idDoc = uuidParaXml(r.uuid);

      const serieDrAttr = r.serie ? ` Serie="${escapeXml(r.serie)}"` : "";
      const folioDrAttr = r.folio ? ` Folio="${escapeXml(r.folio)}"` : "";

      return `
      <pago20:DoctoRelacionado IdDocumento="${escapeXml(idDoc)}"${serieDrAttr}${folioDrAttr} MonedaDR="MXN" EquivalenciaDR="1" NumParcialidad="${escapeXml(String(r.numParcialidad || 1))}" ImpSaldoAnt="${fmt2(saldoAnt)}" ImpPagado="${fmt2(pagado)}" ImpSaldoInsoluto="${fmt2(insoluto)}" ObjetoImpDR="01"/>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante
  xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:pago20="http://www.sat.gob.mx/Pagos20"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd http://www.sat.gob.mx/Pagos20 http://www.sat.gob.mx/sitio_internet/cfd/Pagos/Pagos20.xsd"
  Version="4.0"${serieAttr}${folioAttr}${noCertAttr}${certAttr}
  Fecha="${fechaOk}"
  SubTotal="0"
  Moneda="XXX"
  Total="0"
  TipoDeComprobante="P"
  Exportacion="01"
  LugarExpedicion="${escapeXml(lugarExpedicion)}"
  Sello="">

  ${relacionadosXml}

  <cfdi:Emisor
    Rfc="${escapeXml(emisor.rfc)}"
    Nombre="${escapeXml(emisor.nombre)}"
    RegimenFiscal="${escapeXml(emisor.regimenFiscal)}"
  />

  <cfdi:Receptor
    Rfc="${escapeXml(receptor.rfc)}"
    Nombre="${escapeXml(receptor.nombre)}"
    DomicilioFiscalReceptor="${escapeXml(receptor.cp)}"
    RegimenFiscalReceptor="${escapeXml(receptor.regimenFiscal)}"
    UsoCFDI="CP01"
  />

  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="84111506" Cantidad="1" ClaveUnidad="ACT" Descripcion="Pago" ValorUnitario="0" Importe="0" ObjetoImp="01"/>
  </cfdi:Conceptos>

  <cfdi:Complemento>
    <pago20:Pagos Version="2.0">
      <pago20:Totales MontoTotalPagos="${fmt2(monto)}"/>
      <pago20:Pago FechaPago="${escapeXml(fechaPago)}" FormaDePagoP="${escapeXml(pago.formaPago || "03")}" MonedaP="MXN" TipoCambioP="1" Monto="${fmt2(monto)}"${ordenanteAttrs}${beneficiarioAttrs}>${doctosXml}
      </pago20:Pago>
    </pago20:Pagos>
  </cfdi:Complemento>

</cfdi:Comprobante>`;
}

/* =========================
   CADENA ORIGINAL (XSLT SAT)
   (cache simple en memoria)
========================= */
let CACHED_XSLT = null;

async function getXsltSat40() {
  if (CACHED_XSLT) return CACHED_XSLT;

  const xsltUrl =
    "https://www.sat.gob.mx/sitio_internet/cfd/4/cadenaoriginal_4_0/cadenaoriginal_4_0.xslt";

  const { data } = await axios.get(xsltUrl, { responseType: "text" });
  CACHED_XSLT = String(data || "");
  return CACHED_XSLT;
}

async function generarCadenaOriginal(xmlString) {
  const xsltText = await getXsltSat40();

  const parser = new XmlParser();
  const xslt = new Xslt();

  const parse = (s) =>
    typeof parser.parseFromString === "function"
      ? parser.parseFromString(s)
      : parser.xmlParse(s);

  const xmlDom = parse(xmlString);
  const xslDom = parse(xsltText);

  const cadena = xslt.xsltProcess(xmlDom, xslDom);
  return String(cadena || "").trim();
}

/* =========================
   SELLO (RSA SHA256)
========================= */
function firmarCadenaOriginal(cadenaOriginal, privateKeyPem) {
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(cadenaOriginal, "utf8");
  signer.end();
  return signer.sign(privateKeyPem, "base64");
}

function injectSello(xmlUnsigned, selloB64) {
  return xmlUnsigned.replace(/Sello=""/, `Sello="${selloB64}"`);
}

// Crea, para cada orden de `pagosSinComprobante` (una orden de esta factura
// sin ningún anticipo/remisión vigente que pase a ella), un pago "Liquidar
// (sin comprobante)" en Cajas ligado a la factura recién generada — mismos
// campos y misma mecánica de terminal que backend/routes/cajas.js usa al dar
// de alta un pago SIN_COMPROBANTE a mano, para que el Cierre de Caja cuadre
// igual. A diferencia de cancelarAnticiposYRemisionesPorFactura, este pago NO
// se marca cancelado: es dinero real que debe seguir contando como abonado
// (ver backend/utils/cajaTotales.js totalAbonado).
// Devuelve un arreglo con los Recibos de Dólares que se generaron (uno por
// cada pago que incluyó dólares), para que el asistente de Nueva Factura
// pueda ofrecer abrirlos/imprimirlos igual que ya hace con la factura misma.
// Terminal "legacy" (campo `banco`) de un cobro con tarjeta dividido en 1+
// tarjetas: la única terminal si hubo una sola, o '' si hubo más de una.
// Mismo criterio que backend/routes/cajas.js.
function terminalLegacyDeTarjetas(tarjetas) {
  return tarjetas.length === 1 ? tarjetas[0].terminal : "";
}

// `opciones.modo`:
//  - "LIQUIDAR" (default, Factura de ingreso): cubre el saldo completo de la orden,
//    comprobante SIN_COMPROBANTE ("Liquidar" de Cajas), sin folio propio.
//  - "ABONO" (Complemento de pago): cubre solo lo que ese complemento abona de esa
//    factura (`entrada.monto` = importePagado, no el saldo completo), comprobante
//    RECIBO_PROVISIONAL con folio propio — mismo documento que genera un abono
//    dado de alta a mano en Cajas.
async function crearPagosSinComprobante(pagosSinComprobante, facturaDoc, user = null, opciones = {}) {
  const modo = opciones.modo === "ABONO" ? "ABONO" : "LIQUIDAR";
  const folioFactura = `${facturaDoc.serie || ""}${facturaDoc.folio || ""}`;
  const recibosDolares = [];
  for (const entrada of Array.isArray(pagosSinComprobante) ? pagosSinComprobante : []) {
    if (!entrada?.vehiculoId) continue;
    const vehiculo = await Vehiculo.findById(entrada.vehiculoId);
    if (!vehiculo) continue;

    const formaPago = entrada.formaPago;
    const terminal = entrada.terminal || "";
    const combinado = entrada.combinado || null;
    const monto = Number(entrada.monto) || 0;
    // Dólares en efectivo: vienen del desglose Combinado (efectivoDolares), o
    // directo en `entrada.montoDolares` cuando la forma de pago es EFECTIVO
    // simple (ver NuevaFactura.jsx). montoPesos es lo que resta después de
    // convertirlos, igual que arma el pago un "Liquidar" de Cajas.
    const montoDolares =
      formaPago === "COMBINADO"
        ? Number(combinado?.efectivoDolares) || 0
        : formaPago === "EFECTIVO"
          ? Number(entrada.montoDolares) || 0
          : 0;
    const tipoCambio = montoDolares > 0 ? Number(entrada.tipoCambio) || 0 : 0;
    const montoPesos = Math.round((monto - montoDolares * tipoCambio) * 100) / 100;
    const fecha = new Date();

    // Desglose por tarjeta, ya validado por errorPagoSinComprobante: se
    // vuelve a limpiar aquí (montos redondeados, filas vacías fuera) para
    // guardarlo tal cual en el pago. Sin desglose, cae a la terminal única
    // (compatibilidad con la captura simple de siempre).
    const tarjetasSimple = Array.isArray(entrada.tarjetas) ? entrada.tarjetas : [];
    const tarjetasSimpleLimpias = ["CREDITO", "DEBITO"].includes(formaPago)
      ? tarjetasSimple.length
        ? limpiarYValidarTarjetas(tarjetasSimple, montoPesos).tarjetas || []
        : terminal
        ? [{ monto: montoPesos, terminal }]
        : []
      : [];

    const totalCredito = Number(combinado?.credito) || 0;
    const totalDebito = Number(combinado?.debito) || 0;
    const hayDesgloseCombinado =
      (Array.isArray(combinado?.tarjetasCredito) && combinado.tarjetasCredito.length) ||
      (Array.isArray(combinado?.tarjetasDebito) && combinado.tarjetasDebito.length);
    const tarjetasCreditoLimpias =
      formaPago === "COMBINADO" && totalCredito > 0
        ? hayDesgloseCombinado
          ? limpiarYValidarTarjetas(combinado.tarjetasCredito, totalCredito).tarjetas || []
          : combinado?.banco
          ? [{ monto: totalCredito, terminal: combinado.banco }]
          : []
        : [];
    const tarjetasDebitoLimpias =
      formaPago === "COMBINADO" && totalDebito > 0
        ? hayDesgloseCombinado
          ? limpiarYValidarTarjetas(combinado.tarjetasDebito, totalDebito).tarjetas || []
          : combinado?.banco
          ? [{ monto: totalDebito, terminal: combinado.banco }]
          : []
        : [];
    const combinadoLimpio =
      formaPago === "COMBINADO"
        ? {
            ...combinado,
            banco: terminalLegacyDeTarjetas([...tarjetasCreditoLimpias, ...tarjetasDebitoLimpias]) || combinado?.banco || "",
            tarjetasCredito: tarjetasCreditoLimpias,
            tarjetasDebito: tarjetasDebitoLimpias,
          }
        : null;

    // Folio propio (Recibo Provisional) solo en modo ABONO — Liquidar no genera folio.
    let numeroReciboProvisional = null;
    if (modo === "ABONO") {
      const contadorProvisional = await Contador.findOneAndUpdate(
        { nombre: CONTADOR_RECIBO_PROVISIONAL },
        { $inc: { valor: 1 } },
        { new: true, upsert: true }
      );
      numeroReciboProvisional = contadorProvisional.valor;
    }

    const subObjetoPago = {
      formaPago,
      chequeNumero: formaPago === "CHEQUE" ? entrada.chequeNumero || "" : "",
      banco: ["CREDITO", "DEBITO"].includes(formaPago) ? terminalLegacyDeTarjetas(tarjetasSimpleLimpias) || terminal : "",
      tipoTransferencia: formaPago === "TRANSFERENCIA" ? entrada.tipoTransferencia || "" : "",
      bancoTransferencia: formaPago === "TRANSFERENCIA" ? entrada.bancoTransferencia || "" : "",
      tarjetas: tarjetasSimpleLimpias,
      ...(combinadoLimpio ? { combinado: combinadoLimpio } : {}),
      ...(modo === "ABONO"
        ? { numero: numeroReciboProvisional, concepto: `Complemento de pago ${folioFactura}`, recibio: "" }
        : {}),
    };

    const pago = {
      fecha,
      tipoPago: "ABONO", // misma convención que "Liquidar"/"Abono" desde Cajas
      comprobante: modo === "ABONO" ? "RECIBO_PROVISIONAL" : "SIN_COMPROBANTE",
      montoPesos,
      montoDolares,
      tipoCambio,
      monto,
      registradoPor: user?.name || user?.username || "",
      ...(modo === "ABONO" ? { reciboProvisional: subObjetoPago } : { liquidacion: subObjetoPago }),
      facturaId: facturaDoc._id,
    };

    // Recibo de Dólares: automático siempre que el pago incluya dólares,
    // igual que backend/routes/cajas.js al dar de alta un pago a mano.
    if (montoDolares > 0) {
      const contadorDolares = await Contador.findOneAndUpdate(
        { nombre: CONTADOR_RECIBO_DOLARES },
        { $inc: { valor: 1 } },
        { new: true, upsert: true }
      );
      pago.reciboDolares = { numero: contadorDolares.valor };
    }

    vehiculo.pagos.push(pago);
    const pagoSub = vehiculo.pagos[vehiculo.pagos.length - 1];
    await vehiculo.save();

    if (montoDolares > 0) {
      recibosDolares.push({
        vehiculoId: String(vehiculo._id),
        pagoId: String(pagoSub._id),
        numero: pago.reciboDolares.numero,
        ordenServicio: vehiculo.ordenServicio || "",
      });
    }

    // Igual que cajas.js: solo los cobros con tarjeta física pasan por el
    // Cierre de Caja (efectivo/cheque/transferencia se concilian a mano en
    // Gestión de Caja), una llamada por cada tarjeta usada. Best-effort
    // (registrarMovimientosTarjetas ya captura sus propios errores): nunca
    // debe tumbar la generación de la factura si falla.
    try {
      if (formaPago === "COMBINADO") {
        await registrarMovimientosTarjetas([...tarjetasCreditoLimpias, ...tarjetasDebitoLimpias], fecha);
      } else if (["CREDITO", "DEBITO"].includes(formaPago)) {
        await registrarMovimientosTarjetas(tarjetasSimpleLimpias, fecha);
      }
    } catch (errTerminal) {
      console.error("Error actualizando terminal del cierre de caja (factura sin comprobante):", errTerminal);
    }
  }
  return recibosDolares;
}

// Al generar la factura global, cada Nota de Venta que quedó agrupada se marca
// con `pago.facturaGlobalId` para que no pueda entrar en otra factura global.
// El pago NO se cancela: sigue contando como cobro de la orden. Se limpiaría al
// cancelar ese CFDI (cuando exista esa función).
async function marcarNotasVentaFacturadas(notasVenta, facturaId) {
  const porVehiculo = new Map();
  for (const n of Array.isArray(notasVenta) ? notasVenta : []) {
    if (!n?.vehiculoId || !n?.pagoId) continue;
    if (!porVehiculo.has(String(n.vehiculoId))) porVehiculo.set(String(n.vehiculoId), new Set());
    porVehiculo.get(String(n.vehiculoId)).add(String(n.pagoId));
  }

  for (const [vehiculoId, pagoIds] of porVehiculo) {
    const vehiculo = await Vehiculo.findById(vehiculoId);
    if (!vehiculo) continue;

    let cambio = false;
    for (const pago of vehiculo.pagos || []) {
      if (!pagoIds.has(String(pago._id))) continue;
      if (pago.comprobante !== "NOTA_VENTA" || pago.cancelado) continue;
      if (pago.facturaGlobalId) continue;
      pago.facturaGlobalId = facturaId;
      cambio = true;
    }
    if (cambio) await vehiculo.save();
  }
}

/* =========================
   ENDPOINT
   POST /api/generar-xml/xml
========================= */
// `proteger` faltaba en esta ruta: sin ella req.user siempre venía undefined
// (aunque el resto del handler ya lo usaba, p. ej. crearPagosSinComprobante y
// cancelarAnticiposYRemisionesPorFactura), así que "Registrado por"/"Canceló"
// quedaban en blanco para todo lo que se genera al facturar. El frontend ya
// manda el Bearer token en cada request (ver frontend/src/api/http.js), así
// que esto no requiere ningún cambio del lado del cliente.
router.post("/xml", proteger, async (req, res) => {
  try {
    const {
      cliente,
      conceptos,
      cfdi,
      orden,
      ordenes: ordenesBody,
      tipoFactura = "factura",
      relacionadas = [],
      pago = null,
      notasVenta = [],
      informacionGlobal = null,
      // Decisión por comprobante de Cajas vigente de las órdenes:
      // [{ vehiculoId, pagoId, accion: 'INCLUIR' | 'OTRA_FACTURA' | 'VIGENTE' }].
      // Sin entrada para un pago = 'INCLUIR' (se cancela y pasa a esta factura).
      comprobantesCajas = [],
      // Órdenes de esta factura SIN ningún anticipo/remisión vigente: la forma
      // de pago (Caja) capturada en el wizard para cada una. Al generar la
      // factura se crea con esto un pago "Liquidar (sin comprobante)" ligado a
      // ella, para que Cajas y el Cierre de Caja queden al día (ver más abajo).
      // [{ vehiculoId, monto, formaPago, chequeNumero, terminal, combinado }]
      pagosSinComprobante = [],
      // Solo nota de crédito CONTRA UNA FACTURA GLOBAL: notas de venta de esa Global que se
      // acreditan y liberan para facturarlas a su cliente: [{ vehiculoId, numero }].
      notasLiberadas = [],
    } = req.body;

    const esNotaCredito = tipoFactura === "notaCredito";
    const esComplementoPago = tipoFactura === "complementoPago";
    const esFacturaGlobal = tipoFactura === "facturaGlobal";

    // Una factura puede agrupar varias órdenes de servicio del mismo cliente.
    // `orden` (singular) se sigue aceptando por compatibilidad con cualquier
    // caller viejo y es siempre la primera de la lista.
    const ordenes = Array.isArray(ordenesBody) && ordenesBody.length
      ? ordenesBody
      : orden
      ? [orden]
      : [];
    const ordenPrincipal = ordenes[0] || null;

    if (!cliente || !cfdi) {
      return res.status(400).json({ ok: false, error: "Faltan datos para generar XML." });
    }

    if (!esComplementoPago && (!Array.isArray(conceptos) || conceptos.length === 0)) {
      return res.status(400).json({ ok: false, error: "Faltan conceptos para generar XML." });
    }

    // La orden de servicio solo aplica para la factura de ingreso
    if (
      tipoFactura === "factura" &&
      (!ordenes.length || ordenes.some((o) => !o?._id || !o?.ordenServicio))
    ) {
      return res.status(400).json({ ok: false, error: "Falta la orden de servicio." });
    }

    // Una orden con factura de ingreso VIGENTE solo se puede volver a facturar como
    // REFACTURACIÓN (SAT: sustitución, TipoRelacion 04): la factura nueva relaciona a
    // la anterior con 04, la anterior queda registrada como cancelada y la nueva hereda
    // el cobro ya registrado en Cajas (ver más abajo, tras crear la factura). Nueva
    // Factura ya guía este flujo; esto es el respaldo en el servidor. Una orden cuya
    // Nota de Venta ya está en una Factura Global vigente sigue bloqueada.
    let vehiculoIdsFactura = [];
    let facturasPorSustituir = []; // facturas vigentes que esta factura sustituye
    let facturasPreviasCobro = []; // vigentes + canceladas: la nueva hereda su cobro
    if (tipoFactura === "factura" && ordenes.length) {
      const vehiculoIds = ordenes.map((o) => o._id).filter(Boolean);
      vehiculoIdsFactura = vehiculoIds;
      const vehiculoIdsStr = new Set(vehiculoIds.map(String));
      const { vigentes, canceladas } = await facturasPreviasDeOrdenes(vehiculoIds);

      if (vigentes.length) {
        const nombreOrden = (f, vid) =>
          [f.orden, ...(f.ordenes || [])].find((o) => String(o?.vehiculoId) === vid)?.ordenServicio || vid;
        const conflictos = [];
        for (const f of vigentes) {
          for (const vid of vehiculoIdsDeFactura(f)) {
            if (vehiculoIdsStr.has(vid)) conflictos.push(`${nombreOrden(f, vid)} (factura ${folioDe(f)})`);
          }
        }
        const listado = [...new Set(conflictos)].join(", ");

        if (cfdi?.relacion?.tipoRelacion !== "04") {
          return res.status(400).json({
            ok: false,
            error: `Ya existe una factura para: ${listado}. Para refacturar, relaciona la factura original con el tipo de relación 04 (Sustitución de los CFDI previos).`,
          });
        }
        if (!["admin", "coordinador"].includes(req.user?.role)) {
          return res.status(403).json({
            ok: false,
            error: `Solo un administrador puede refacturar una orden que ya tiene factura (implica cancelar la original): ${listado}.`,
          });
        }

        // La factura nueva debe cubrir COMPLETA a cada factura que sustituye.
        const incompletas = [];
        for (const f of vigentes) {
          const fuera = [...vehiculoIdsDeFactura(f)].filter((vid) => !vehiculoIdsStr.has(vid));
          if (fuera.length) {
            incompletas.push(`${folioDe(f)} también incluye ${fuera.map((vid) => nombreOrden(f, vid)).join(", ")}`);
          }
        }
        if (incompletas.length) {
          return res.status(400).json({
            ok: false,
            error: `Para sustituir una factura hay que refacturar todas sus órdenes: ${incompletas.join("; ")}. Agrégalas a esta factura.`,
          });
        }
        facturasPorSustituir = vigentes;
      }
      facturasPreviasCobro = [...vigentes, ...canceladas];

      const enGlobal = await ordenesEnFacturaGlobal(vehiculoIds);
      if (enGlobal.size) {
        const conflictos = [...enGlobal].map(([vid, folioGlobal]) => {
          const orden = ordenes.find((o) => String(o._id) === vid);
          return `${orden?.ordenServicio || vid} (factura global ${folioGlobal})`;
        });
        return res.status(400).json({
          ok: false,
          error: `Ya está en una factura global: ${conflictos.join(", ")}. No se puede generar otra factura para esa orden.`,
        });
      }
    }

    if (
      ["factura", "complementoPago"].includes(tipoFactura) &&
      Array.isArray(pagosSinComprobante) &&
      pagosSinComprobante.length
    ) {
      for (const p of pagosSinComprobante) {
        const err = errorPagoSinComprobante(p);
        if (err) return res.status(400).json({ ok: false, error: err });
      }
    }

    // La factura global agrupa notas de venta de Caja, no órdenes.
    if (esFacturaGlobal && (!Array.isArray(notasVenta) || notasVenta.length === 0)) {
      return res.status(400).json({
        ok: false,
        error: "La factura global requiere al menos una nota de venta.",
      });
    }

    // Una factura global no puede mezclar notas de venta de distintos días:
    // el CFDI se timbra con la fecha/hora real de este momento, así que si
    // agrupara notas de ayer y de hoy, el Reporte de Facturas la reportaría
    // completa bajo el día del timbrado aunque parte del dinero se haya
    // cobrado otro día. Se valida contra la fecha real del pago en Cajas
    // (nunca la que mande el cliente) para que no se pueda saltar desde el
    // navegador. La pantalla de Nueva Factura ya agrupa por día para evitar
    // esto; esto es el respaldo en el servidor.
    if (esFacturaGlobal) {
      const vehiculoIdsNotas = [
        ...new Set(notasVenta.map((n) => String(n.vehiculoId || "")).filter(Boolean)),
      ];
      const vehiculosDeNotas = await Vehiculo.find({ _id: { $in: vehiculoIdsNotas } })
        .select("pagos")
        .lean();
      const pagoPorId = new Map();
      for (const v of vehiculosDeNotas) {
        for (const p of v.pagos || []) pagoPorId.set(String(p._id), p);
      }
      const diasDistintos = new Set();
      for (const n of notasVenta) {
        const pago = pagoPorId.get(String(n.pagoId || ""));
        if (!pago) {
          return res.status(400).json({
            ok: false,
            error: `La nota de venta P${n.numero ?? ""} ya no existe o cambió; vuelve a cargar la lista de pendientes.`,
          });
        }
        diasDistintos.add(dayjsFecha(pago.fecha).format("YYYY-MM-DD"));
      }
      if (diasDistintos.size > 1) {
        return res.status(400).json({
          ok: false,
          error:
            `Las notas de venta seleccionadas son de días distintos (${[...diasDistintos]
              .sort()
              .join(", ")}). Genera una factura global por cada día para que el Reporte de Facturas quede correcto.`,
        });
      }
    }

    // En la factura global el método de pago (PUE/PPD) se elige a mano; no se
    // cae a "PUE". La forma de pago sí la fija sola la regla SAT.
    if (esFacturaGlobal && !String(cfdi?.metodoPago || "").trim()) {
      return res.status(400).json({
        ok: false,
        error: "Selecciona el método de pago de la factura global.",
      });
    }

    // Una Nota de crédito nunca es PPD (no es viable emitirla a crédito/diferido) — el
    // frontend ya la mantiene siempre en PUE, esto es el respaldo del lado del servidor.
    if (esNotaCredito && cfdi?.metodoPago === "PPD") {
      return res.status(400).json({
        ok: false,
        error: "Una Nota de crédito no puede llevar método de pago PPD.",
      });
    }

    if ((esNotaCredito || esComplementoPago) && (!Array.isArray(relacionadas) || relacionadas.length === 0)) {
      return res.status(400).json({
        ok: false,
        error: esNotaCredito
          ? "La nota de crédito requiere la factura relacionada."
          : "El complemento de pago requiere al menos una factura.",
      });
    }

    // El UUID (folio fiscal) es obligatorio y debe tener el formato real del
    // SAT: ni la nota de crédito (cfdi:CfdiRelacionados) ni el complemento de
    // pago (pago20:DoctoRelacionado) son válidos con un folio interno en su
    // lugar. Un administrador puede desactivar la exigencia en Configuración (solo
    // pruebas mientras no se timbra): entonces el XML lleva un UUID en ceros.
    const exigirUuid = await exigirUuidActivo();
    if (
      exigirUuid &&
      (esNotaCredito || esComplementoPago) &&
      relacionadas.some((r) => !UUID_RE.test(String(r.uuid || "").trim()))
    ) {
      return res.status(400).json({
        ok: false,
        error: esNotaCredito
          ? "Captura el UUID (folio fiscal) real de cada factura acreditada."
          : "Captura el UUID (folio fiscal) real de cada factura del complemento de pago.",
      });
    }

    // Factura de ingreso con "facturas relacionadas" opcionales
    // (cfdi:CfdiRelacionados): mismo formato de UUID, más el catálogo SAT
    // c_TipoRelacion.
    if (cfdi?.relacion) {
      const { tipoRelacion: tipoRelacionBody, uuids: uuidsBody } = cfdi.relacion;
      if (!TIPO_RELACION_VALIDOS.includes(tipoRelacionBody)) {
        return res.status(400).json({ ok: false, error: "Tipo de relación inválido." });
      }
      if (
        exigirUuid &&
        (!Array.isArray(uuidsBody) ||
          uuidsBody.length === 0 ||
          uuidsBody.some((u) => !UUID_RE.test(String(u || "").trim())))
      ) {
        return res.status(400).json({
          ok: false,
          error: "Captura el UUID (folio fiscal) de cada factura relacionada.",
        });
      }
    }

    if (esComplementoPago) {
      if (!pago || !pago.fechaPago) {
        return res.status(400).json({ ok: false, error: "Falta la fecha de pago del complemento." });
      }
      if (relacionadas.some((r) => Number(r.importePagado || 0) <= 0)) {
        return res.status(400).json({
          ok: false,
          error: "Cada factura del complemento requiere un importe pagado mayor a 0.",
        });
      }
    }

    // valida cliente mínimo (la factura global usa el receptor genérico
    // XAXX010101000, que se arma más abajo con el CP del emisor).
    if (
      !esFacturaGlobal &&
      (!cliente.rfc || !cliente.regimenFiscal || !cliente.codigoPostalFiscal || !cliente.nombre)
    ) {
      return res.status(400).json({
        ok: false,
        error: "Cliente incompleto: requiere RFC, Régimen Fiscal, CP fiscal y Nombre.",
      });
    }

    // valida conceptos mínimo (no aplica al complemento de pago: usa concepto fijo)
    if (!esComplementoPago) {
      for (const c of conceptos) {
        if (!c.cProdServ || !c.cUnidad || !c.unidad || !c.descripcion) {
          return res.status(400).json({
            ok: false,
            error: "Cada concepto requiere: cProdServ, cUnidad, unidad, descripcion.",
          });
        }
        if (Number(c.cantidad || 0) <= 0 || Number(c.valorUnitario || 0) < 0) {
          return res.status(400).json({
            ok: false,
            error: "Cada concepto requiere cantidad > 0 y valorUnitario >= 0.",
          });
        }
      }
    }

    // Nota de crédito contra una Factura Global (SAT, Opción A de refacturación): las notas que
    // acredita salen de la BD, deben ser de esa Global, no estar ya liberadas y sumar el total.
    let notasLiberadasResueltas = [];
    if (esNotaCredito && Array.isArray(notasLiberadas) && notasLiberadas.length) {
      const totalNcEsperado = Number(
        calcularTotales({
          conceptos,
          ivaRate: Number(cfdi.ivaRate ?? 0.16),
          aplicarRetencionIsr: !!cfdi.aplicarRetencionIsr,
          isrRate: Number(cfdi.isrRate ?? 0.0125),
          descuento: Number(cfdi?.descuento || 0),
        }).total
      );
      const resuelto = await resolverNotasLiberadas({
        relacionadas,
        notasLiberadas,
        totalNc: totalNcEsperado,
      });
      if (resuelto.error) return res.status(400).json({ ok: false, error: resuelto.error });
      notasLiberadasResueltas = resuelto.notas;
    }

    // Nota de crédito / Complemento de pago: la pantalla NO manda órdenes propias (solo busca
    // facturas ya emitidas para relacionar, ver `relacionadas`), así que el documento se quedaba
    // sin `orden`/`ordenes` y el Reporte de Facturas mostraba "—" en No. Orden. Se toman de las
    // facturas que relaciona (salvo la NC contra Global, que ya trae las suyas propias arriba).
    let ordenesDeRelacionadas = [];
    if ((esNotaCredito || esComplementoPago) && !notasLiberadasResueltas.length && Array.isArray(relacionadas)) {
      const idsValidos = relacionadas
        .map((r) => String(r?.facturaId || ""))
        .filter((id) => /^[0-9a-fA-F]{24}$/.test(id));
      if (idsValidos.length) {
        const facturasRelacionadas = await FacturaCfdi.find({ _id: { $in: idsValidos } })
          .select("orden ordenes")
          .lean();
        const vistos = new Set();
        for (const f of facturasRelacionadas) {
          for (const o of [f.orden, ...(f.ordenes || [])]) {
            if (!o?.vehiculoId || !o?.ordenServicio) continue;
            const clave = String(o.vehiculoId);
            if (vistos.has(clave)) continue;
            vistos.add(clave);
            ordenesDeRelacionadas.push({ _id: o.vehiculoId, ordenServicio: o.ordenServicio });
          }
        }
      }
    }

    // Lee config fiscal
    const cfg = await FiscalConfig.findOne().sort({ updatedAt: -1 }).lean();
    if (!cfg) {
      return res.status(400).json({
        ok: false,
        error: "No hay Configuración Fiscal. Guarda RFC/Nombre/Régimen/CP y sube el .cer y .key.",
      });
    }

    if (!cfg.rfc || !cfg.nombre || !cfg.regimenFiscal || !cfg.lugarExpedicion) {
      return res.status(400).json({
        ok: false,
        error: "Config Fiscal incompleta: rfc, nombre, regimenFiscal, lugarExpedicion.",
      });
    }

    if (!cfg.noCertificado || !cfg.certificadoBase64) {
      return res.status(400).json({
        ok: false,
        error: "Falta certificado del emisor (.cer).",
      });
    }

    // ✅ IMPORTANTÍSIMO: ya NO exigimos keyBase64.
    // Solo buscamos el PEM real en /keys
    const pemPath = pickPemPathFromKeysFolder();
    if (!pemPath) {
      return res.status(400).json({
        ok: false,
        error:
          "No se encontró ningún .key.pem en backend/keys. Sube el .key y guarda para generar el PEM.",
      });
    }

    const emisor = {
      rfc: cfg.rfc,
      nombre: cfg.nombre,
      regimenFiscal: cfg.regimenFiscal,
      noCertificado: cfg.noCertificado,
      certificadoBase64: cfg.certificadoBase64,
      lugarExpedicion: cfg.lugarExpedicion,
    };

    // Factura global: receptor genérico "público en general". El SAT exige
    // Nombre exacto "PUBLICO EN GENERAL", RFC XAXX010101000, régimen 616 y el
    // domicilio fiscal = CP de expedición del emisor.
    const receptor = esFacturaGlobal
      ? {
          rfc: "XAXX010101000",
          nombre: "PUBLICO EN GENERAL",
          cp: cfg.lugarExpedicion,
          regimenFiscal: "616",
        }
      : {
          rfc: cliente.rfc,
          nombre: cliente.nombre,
          cp: cliente.codigoPostalFiscal,
          regimenFiscal: cliente.regimenFiscal,
        };

    // Folio: se asigna automáticamente a partir del folio interno de la configuración fiscal.
    // Nota de crédito: folio PROPIO (serie fija "NC", Configuración › Folio de Nota de Crédito),
    // independiente del folio compartido por Factura/Complemento/Global — así NC1, NC2… no se
    // mezclan con la numeración de las demás facturas (ver también reportes.js / PDF, que ya
    // arman el folio mostrado como serie+folio sin separador).
    const folioActualNum = esNotaCredito
      ? (await Contador.findOne({ nombre: NOTA_CREDITO_CFDI_CONTADOR }).lean())?.valor || 0
      : parseInt(cfg.folioInterno, 10) || 0;
    const folioAsignado = folioActualNum + 1;

    // Defaults
    const cfdiFinal = {
      ...cfdi,
      lugarExpedicion: cfdi.lugarExpedicion || cfg.lugarExpedicion,
      serie: esNotaCredito ? "NC" : cfdi.serie ?? cfg.serie ?? "",
      folio: String(folioAsignado),

      moneda: cfdi.moneda || "MXN",
      ivaRate: cfdi.ivaRate ?? 0.16,

      formaPago: cfdi.formaPago || "99",
      metodoPago: cfdi.metodoPago || "PUE",
      usoCfdi: esComplementoPago ? "CP01" : esFacturaGlobal ? "S01" : cfdi.usoCfdi || "G03",

      tipoComprobante: esComplementoPago
        ? "P"
        : esNotaCredito
        ? "E"
        : esFacturaGlobal
        ? "I"
        : cfdi.tipoComprobante || "I",
      exportacion: cfdi.exportacion || "01",

      // Factura global: nodo cfdi:InformacionGlobal (01 = diario por defecto).
      informacionGlobal: esFacturaGlobal
        ? {
            periodicidad: informacionGlobal?.periodicidad || "01",
            meses: String(informacionGlobal?.meses || ""),
            anio: String(informacionGlobal?.anio || ""),
          }
        : null,

      // Grupo OPCIONAL de "Facturas relacionadas" (cfdi.relacion, pantalla del paso
      // Comprobante): disponible para factura, nota de crédito y complemento de pago. Es
      // aparte de la relación OBLIGATORIA que ya trae toda nota de crédito (TipoRelacion 01
      // con la factura acreditada, armada directo de `relacionadas` al construir el XML más
      // abajo — nunca se guarda aquí, para no duplicarla) y de la que trae todo complemento
      // (pago20:DoctoRelacionado, también de `relacionadas`, sin relación con este campo).
      relacion: cfdi.relacion
        ? {
            tipoRelacion: cfdi.relacion.tipoRelacion,
            uuids: (cfdi.relacion.uuids || []).map((u) => String(u || "").trim().toUpperCase()),
          }
        : null,

      aplicarRetencionIsr: !!cfdi.aplicarRetencionIsr,
      isrRate: Number(cfdi.isrRate ?? 0.0125),
    };

    if (cfdiFinal.moneda === "USD" && !Number(cfdiFinal.tipoCambio || 0)) {
      return res.status(400).json({
        ok: false,
        error: "Moneda USD requiere TipoCambio.",
      });
    }

    let totales;
    let xmlUnsigned;

    let ordenanteComplemento = null;
    if (esComplementoPago) {
      ordenanteComplemento = await resolverOrdenante(pago);
      // Beneficiario = banco/cuenta del taller que recibió la transferencia (Cobro en Cajas
      // + Configuración > Cuentas bancarias). Solo transferencia (03).
      let beneficiarioComplemento = null;
      const entradaBen = Array.isArray(pagosSinComprobante) ? pagosSinComprobante[0] : null;
      const bancoBen = bancoReceptorDePago(pago?.formaPago, entradaBen);
      if (bancoBen) {
        const cb = await CuentaBancaria.findOne({ banco: bancoBen }).lean().catch(() => null);
        beneficiarioComplemento = { rfc: cb?.rfc || RFC_POR_BANCO[bancoBen] || "", cuenta: cb?.numeroCuenta || "" };
      }
      const montoPago = relacionadas.reduce((s, r) => s + Number(r.importePagado || 0), 0);
      // En el CFDI tipo P el SubTotal/Total van en 0; el monto vive en el complemento.
      totales = { subtotal: "0.00", iva: "0.00", isr: "0.00", total: fmt2(montoPago) };

      xmlUnsigned = buildPagoXmlUnsigned({
        emisor,
        receptor,
        cfdi: cfdiFinal,
        pago,
        relacionadas,
        ordenante: ordenanteComplemento,
        beneficiario: beneficiarioComplemento,
      });
    } else {
      totales = calcularTotales({
        conceptos,
        ivaRate: Number(cfdiFinal.ivaRate ?? 0.16),
        aplicarRetencionIsr: !!cfdiFinal.aplicarRetencionIsr,
        isrRate: Number(cfdiFinal.isrRate ?? 0.0125),
        descuento: Number(cfdi?.descuento || 0),
      });

      // El descuento global se reparte entre los conceptos para el XML (atributo
      // Descuento por concepto y base gravable = Importe - Descuento).
      const conceptosXml = repartirDescuentoEnConceptos(conceptos, Number(totales.descuento || 0));

      // Nota de crédito: el XML SIEMPRE lleva el grupo obligatorio TipoRelacion 01 (la
      // factura que acredita, UUID real validado arriba) — armado aquí directo de
      // `relacionadas`, nunca desde cfdiFinal.relacion — más el grupo opcional de
      // "Facturas relacionadas" si además se capturó uno (mismo UUID o de cualquier otro
      // CFDI, por otro motivo). El SAT permite varios <cfdi:CfdiRelacionados>, uno por
      // TipoRelacion (ver relacionadosXml en buildCfdiXmlUnsigned).
      const relacionParaXml = esNotaCredito
        ? [
            { tipoRelacion: "01", uuids: relacionadas.map((r) => String(r.uuid || "").trim().toUpperCase()) },
            ...(cfdiFinal.relacion ? [cfdiFinal.relacion] : []),
          ]
        : cfdiFinal.relacion;

      xmlUnsigned = buildCfdiXmlUnsigned({
        emisor,
        receptor,
        cfdi: { ...cfdiFinal, relacion: relacionParaXml },
        conceptos: conceptosXml,
        totales,
      });
    }

    // Último chequeo ANTES de timbrar: si esta factura va a cancelar un
    // anticipo cuyo saldo a favor el cliente ya usó en otra orden, se aborta
    // aquí (con el CFDI ya timbrado no habría vuelta atrás). El asistente de
    // Nueva Factura muestra estos conflictos para resolverlos primero.
    if (tipoFactura === "factura" && ordenes.length) {
      const decisionesPre = {};
      for (const c of Array.isArray(comprobantesCajas) ? comprobantesCajas : []) {
        if (c?.pagoId) decisionesPre[String(c.pagoId)] = c.accion;
      }
      const conflictos = await conflictosAnticiposAntesDeTimbrar(ordenes, decisionesPre);
      if (conflictos.length) {
        return res.status(409).json({
          ok: false,
          error:
            "Hay anticipos que no se pueden cancelar hacia esta factura porque el cliente ya usó ese saldo a favor. Resuélvelos antes de generar la factura.",
          conflictosAnticipos: conflictos,
        });
      }
    }

    // Igual para la Factura Global: el anticipo con Recibo Provisional que
    // quedó ligado (notaVentaLigadaId) a alguna de sus notas de venta pasa a
    // ella (se cancela al generarla) — no cualquier anticipo vigente de la
    // orden, ver filtroAnticipoFacturaGlobal.
    if (esFacturaGlobal) {
      const notaPagoIdsGlobal = (Array.isArray(notasVenta) ? notasVenta : []).map((n) => n?.pagoId).filter(Boolean);
      const conflictos = await conflictosAnticiposAntesDeTimbrar(
        ordenesDeNotasVenta(notasVenta),
        {},
        filtroAnticipoFacturaGlobal(notaPagoIdsGlobal)
      );
      if (conflictos.length) {
        return res.status(409).json({
          ok: false,
          error:
            "Hay anticipos que no se pueden cancelar hacia esta factura global porque el cliente ya usó ese saldo a favor. Resuélvelos antes de generarla.",
          conflictosAnticipos: conflictos,
        });
      }
    }

    const cadenaOriginal = await generarCadenaOriginal(xmlUnsigned);

    const privateKeyPem = fs.readFileSync(pemPath, "utf8");
    const sello = firmarCadenaOriginal(cadenaOriginal, privateKeyPem);
    const xmlSigned = injectSello(xmlUnsigned, sello);

    // A partir de aquí el XML ya está firmado: si falla el guardado en el
    // historial, no debe perderse el XML que el usuario ya tiene derecho a descargar.
    let facturaId = null;
    let persistWarning = "";
    let recibosDolares = [];
    try {
      // Persiste el folio usado SOLO tras el éxito (mismo criterio que el folio compartido de
      // abajo): si algo falla después, el folio no avanzó y el siguiente intento reintenta el
      // mismo número, sin dejar huecos en la numeración fiscal.
      if (esNotaCredito) {
        await Contador.findOneAndUpdate(
          { nombre: NOTA_CREDITO_CFDI_CONTADOR },
          { $set: { valor: folioAsignado } },
          { upsert: true }
        );
      } else {
        await FiscalConfig.findByIdAndUpdate(cfg._id, { folioInterno: String(folioAsignado) });
      }

      // Nombre de facturación editado (F3): si el CFDI se emitió con un nombre
      // distinto a la razón social fiscal del cliente, se deja constancia en el
      // historial.
      const razonSocialOriginal = String(cliente.razonSocialOriginal || "").trim();
      const nombreEmitido = String(receptor.nombre || "").trim();
      const notaFacturacion =
        !esFacturaGlobal && razonSocialOriginal && razonSocialOriginal !== nombreEmitido
          ? `Facturado como "${nombreEmitido}" (razón social: "${razonSocialOriginal}")`
          : "";

      // Una NC contra Global guarda las órdenes de las notas que libera (para encontrarla por
      // orden y para el Reporte de Facturas); NC/Complemento normales, las de las facturas que
      // relacionan (ver ordenesDeRelacionadas arriba); el resto de los tipos, las que mandó la
      // pantalla.
      const ordenesDoc = notasLiberadasResueltas.length
        ? notasLiberadasResueltas
            .filter((n, i, a) => a.findIndex((x) => String(x.vehiculoId) === String(n.vehiculoId)) === i)
            .map((n) => ({ _id: n.vehiculoId, ordenServicio: n.ordenServicio }))
        : esNotaCredito || esComplementoPago
        ? ordenesDeRelacionadas
        : ordenes;
      const ordenPrincipalDoc = ordenesDoc[0] || null;

      // Banco usado en el "Cobro en Cajas" de este complemento (ver pagosSinComprobante
      // arriba): solo se resuelve cuando la forma de pago es transferencia (03) — es lo
      // único que el PDF necesita para el "RFC Banco Emisor"/"Num Cuenta" (ver utils/bancos.js
      // y Configuración > Cuentas bancarias). Todas las entradas de pagosSinComprobante
      // comparten el mismo banco (el reparto entre órdenes solo divide montos), así que basta
      // la primera. Queda '' si no se capturó nada ahora (la orden ya traía su propio pago en
      // Cajas) o si no fue transferencia.
      const primeraEntradaPago = Array.isArray(pagosSinComprobante) ? pagosSinComprobante[0] : null;
      const bancoPago = esComplementoPago ? bancoReceptorDePago(pago?.formaPago, primeraEntradaPago) : "";
      // Número de cheque, mismo criterio que bancoPago arriba — solo cuando la forma de
      // pago es cheque nominativo (02); el desglose Combinado no captura un número de
      // cheque propio, así que solo aplica a la captura simple.
      const chequeNumeroPago =
        esComplementoPago && pago?.formaPago === "02" && primeraEntradaPago?.formaPago === "CHEQUE"
          ? primeraEntradaPago.chequeNumero || ""
          : "";

      const facturaDoc = await FacturaCfdi.create({
        tipoFactura,
        notasLiberadas: notasLiberadasResueltas,
        tipoComprobante: cfdiFinal.tipoComprobante,
        serie: cfdiFinal.serie,
        folio: cfdiFinal.folio,
        fecha: new Date(),
        relacionadas,
        informacionGlobal: esFacturaGlobal ? cfdiFinal.informacionGlobal : undefined,
        descuento: Number(totales.descuento || 0),
        notasVenta: esFacturaGlobal
          ? (Array.isArray(notasVenta) ? notasVenta : []).map((n) => ({
              vehiculoId: n.vehiculoId || null,
              ordenServicio: n.ordenServicio || "",
              numero: typeof n.numero === "number" ? n.numero : null,
              monto: Number(n.monto || 0),
            }))
          : [],
        pago: esComplementoPago
          ? {
              fechaPago: new Date(pago.fechaPago),
              formaPago: pago.formaPago || "",
              monto: Number(totales.total),
              banco: bancoPago,
              chequeNumero: chequeNumeroPago,
              bancoOrdenante: ordenanteComplemento?.banco || "",
              cuentaOrdenante: ordenanteComplemento?.cuenta || "",
            }
          : undefined,
        notaFacturacion,
        cliente: {
          clienteId: cliente._id || null,
          nombre: receptor.nombre,
          razonSocialOriginal: razonSocialOriginal || receptor.nombre || "",
          rfc: receptor.rfc,
          regimenFiscal: receptor.regimenFiscal,
          codigoPostalFiscal: receptor.cp,
          direccion: {
            calle: cliente.direccion?.calle || "",
            numeroExterior: cliente.direccion?.numeroExterior || "",
            numeroInterior: cliente.direccion?.numeroInterior || "",
            colonia: cliente.direccion?.colonia || "",
            codigoPostal: cliente.direccion?.codigoPostal || "",
            ciudad: cliente.direccion?.ciudad || "",
            estado: cliente.direccion?.estado || "",
          },
          pais: cliente.pais || "",
        },
        orden: {
          vehiculoId: ordenPrincipalDoc?._id || null,
          ordenServicio: ordenPrincipalDoc?.ordenServicio || "",
        },
        ordenes: ordenesDoc.map((o) => ({
          vehiculoId: o?._id || null,
          ordenServicio: o?.ordenServicio || "",
        })),
        conceptos: esComplementoPago ? [] : conceptos,
        cfdi: {
          usoCfdi: cfdiFinal.usoCfdi,
          moneda: cfdiFinal.moneda,
          tipoCambio: cfdiFinal.tipoCambio,
          ivaRate: cfdiFinal.ivaRate,
          metodoPago: cfdiFinal.metodoPago,
          formaPago: cfdiFinal.formaPago,
          lugarExpedicion: cfdiFinal.lugarExpedicion,
          oc: cfdiFinal.oc,
          comentarios: cfdiFinal.comentarios,
          aplicarRetencionIsr: cfdiFinal.aplicarRetencionIsr,
          isrRate: cfdiFinal.isrRate,
          relacion: cfdiFinal.relacion
            ? { tipoRelacion: cfdiFinal.relacion.tipoRelacion, uuids: cfdiFinal.relacion.uuids }
            : undefined,
        },
        emisor: {
          rfc: cfg.rfc,
          nombre: cfg.nombre,
          regimenFiscal: cfg.regimenFiscal,
          lugarExpedicion: cfg.lugarExpedicion,
          telefono: cfg.telefono || "",
          noCertificado: cfg.noCertificado,
        },
        totales: {
          subtotal: Number(totales.subtotal),
          descuento: Number(totales.descuento || 0),
          iva: Number(totales.iva),
          isr: Number(totales.isr),
          total: Number(totales.total),
        },
        xml: xmlSigned,
        cadenaOriginal,
        sello,
        estatus: "generada",
      });

      facturaId = facturaDoc._id;

      // Deja rastro en el Registro de Actividad con el folio real de la
      // factura (serie-folio), la del middleware global no lo conoce: el
      // folio se asigna aquí adentro, no viene en la URL ni en el body de la
      // petición. Así se puede buscar la factura por folio en el log.
      registrarAccion(req, {
        accion:
          tipoFactura === "notaCredito"
            ? "FACTURA_NOTA_CREDITO_GENERAR"
            : tipoFactura === "complementoPago"
            ? "FACTURA_COMPLEMENTO_GENERAR"
            : tipoFactura === "facturaGlobal"
            ? "FACTURA_GLOBAL_GENERAR"
            : "FACTURA_GENERAR",
        entidad: "generar-xml",
        entidadId: facturaDoc._id,
        referencia: [cfdiFinal.serie, cfdiFinal.folio].filter(Boolean).join("") || String(facturaDoc._id),
        detalle: {
          tipoFactura,
          tipoComprobante: cfdiFinal.tipoComprobante,
          cliente: receptor?.nombre || "",
          rfc: receptor?.rfc || "",
          total: Number(totales?.total || 0),
          ordenes: ordenesDoc.map((o) => o?.ordenServicio).filter(Boolean),
          // Forma/método de pago declarados en el propio CFDI (catálogo SAT
          // c_FormaPago, ej. "01" Efectivo, "03" Transferencia...).
          formaPago: cfdiFinal.formaPago || "",
          metodoPago: cfdiFinal.metodoPago || "",
          // Solo complemento de pago: el abono que documenta este CFDI.
          ...(esComplementoPago
            ? {
                pagoFecha: pago?.fechaPago || null,
                pagoFormaPago: pago?.formaPago || "",
                pagoMonto: Number(pago?.monto || totales?.total || 0),
              }
            : {}),
          // Órdenes sin comprobante de Caja vigente: la forma de pago y el
          // monto que se capturaron aquí mismo al generar la factura.
          ...(Array.isArray(pagosSinComprobante) && pagosSinComprobante.length
            ? { pagos: pagosSinComprobante.map((p) => ({ formaPago: p.formaPago || "", monto: Number(p.monto || 0) })) }
            : {}),
        },
      });

      if (tipoFactura === "factura" && ordenes.length) {
        // Refacturación: la factura nueva hereda el cobro ya registrado en Cajas (los pagos
        // ligados a las anteriores pasan a apuntarle) y las vigentes que sustituye
        // quedan registradas como canceladas (motivo 01, sustituidas por esta).
        let ordenesConCobroHeredado = new Set();
        if (facturasPreviasCobro.length) {
          const idsPrevias = facturasPreviasCobro.map((f) => f._id);
          ordenesConCobroHeredado = await vehiculoIdsConCobroHeredable(vehiculoIdsFactura, idsPrevias);
          await reasignarPagosDeFacturas(vehiculoIdsFactura, idsPrevias, facturaDoc._id);
          await FacturaCfdi.updateOne(
            { _id: facturaDoc._id },
            {
              $set: {
                sustituye: facturasPreviasCobro.map((f) => ({
                  facturaId: f._id,
                  serie: f.serie || "",
                  folio: f.folio || "",
                })),
              },
            }
          );
          for (const f of facturasPorSustituir) {
            await registrarCancelacionFactura(f._id, {
              motivo: "01",
              sustituta: facturaDoc,
              nota: "Sustituida al refacturar (relación 04).",
              user: req.user,
            });
          }
          // Al final (tras cancelar las vigentes, que reescribe `cancelacion`): las facturas
          // anteriores apuntan a la que heredó su cobro.
          await FacturaCfdi.updateMany(
            { _id: { $in: idsPrevias } },
            { $set: { "cancelacion.cobroHeredadoPorId": facturaDoc._id } }
          );
          if (facturasPorSustituir.length) {
            persistWarning =
              (persistWarning ? persistWarning + " " : "") +
              `Recuerda cancelar en el SAT/PAC la factura ${facturasPorSustituir.map(folioDe).join(", ")} ` +
              `(motivo 01, sustituida por el UUID de la nueva).`;
          }
        }

        const decisiones = {};
        for (const c of Array.isArray(comprobantesCajas) ? comprobantesCajas : []) {
          if (c?.pagoId) decisiones[String(c.pagoId)] = c.accion;
        }
        const avisos = await cancelarAnticiposYRemisionesPorFactura(
          ordenes,
          facturaDoc,
          decisiones,
          req.user
        );
        if (avisos.length) {
          persistWarning = (persistWarning ? persistWarning + " " : "") + avisos.join(" ");
        }

        // Una orden que hereda el cobro de la factura anterior no captura otro Liquidar.
        const pagosLiquidar = ordenesConCobroHeredado.size
          ? (Array.isArray(pagosSinComprobante) ? pagosSinComprobante : []).filter(
              (p) => !ordenesConCobroHeredado.has(String(p?.vehiculoId))
            )
          : pagosSinComprobante;
        recibosDolares = await crearPagosSinComprobante(pagosLiquidar, facturaDoc, req.user);
      }

      // Complemento de pago: cada factura relacionada sin forma de pago capturable en Cajas
      // (ver ordenesDeRelacionadas arriba) registra, con lo que se capturó en el paso
      // Comprobante, un Abono (Recibo Provisional) ligado a la orden de esa factura — mismo
      // documento que un abono dado de alta a mano en Cajas, para que el Cierre de Caja y el
      // saldo de la orden queden al día. NO exige cubrir el saldo completo (a diferencia del
      // "Liquidar" de una Factura de ingreso): un complemento es justo un abono parcial.
      if (tipoFactura === "complementoPago") {
        recibosDolares = await crearPagosSinComprobante(pagosSinComprobante, facturaDoc, req.user, {
          modo: "ABONO",
        });
      }

      if (esFacturaGlobal) {
        await marcarNotasVentaFacturadas(notasVenta, facturaDoc._id);

        // El anticipo (Recibo Provisional) que quedó ligado a alguna de estas
        // notas de venta (notaVentaLigadaId, ver POST /api/cajas/:id/pagos)
        // también es parte de esta venta: se cancela y queda enlazado a la
        // Global (pago.facturaId) para que el Reporte de Facturas lo muestre
        // como anticipo cancelado y lo sume al renglón.
        const notaPagoIdsGlobal = (Array.isArray(notasVenta) ? notasVenta : []).map((n) => n?.pagoId).filter(Boolean);
        const avisosGlobal = await cancelarAnticiposYRemisionesPorFactura(
          ordenesDeNotasVenta(notasVenta),
          facturaDoc,
          {},
          req.user,
          { filtro: filtroAnticipoFacturaGlobal(notaPagoIdsGlobal), limpiarPendiente: false }
        );
        if (avisosGlobal.length) {
          persistWarning = (persistWarning ? persistWarning + " " : "") + avisosGlobal.join(" ");
        }
      }

      // NC contra Global: las notas acreditadas quedan liberadas (su orden ya se puede facturar).
      if (esNotaCredito && notasLiberadasResueltas.length) {
        await liberarNotasDeGlobal(notasLiberadasResueltas, facturaDoc._id, req.user);
      }
    } catch (persistErr) {
      console.error("No se pudo guardar FacturaCfdi:", persistErr);
      persistWarning =
        "El XML se generó, pero no se pudo guardar en el historial: " + persistErr.message;
    }

    return res.json({
      ok: true,
      data: {
        pemPathUsed: pemPath, // 👈 para debug
        facturaId,
        persistWarning,
        recibosDolares,
        cfdi: {
          folio: cfdiFinal.folio,
          serie: cfdiFinal.serie,
        },
        emisor: {
          rfc: cfg.rfc,
          nombre: cfg.nombre,
          regimenFiscal: cfg.regimenFiscal,
          lugarExpedicion: cfg.lugarExpedicion,
          telefono: cfg.telefono || "",
          noCertificado: cfg.noCertificado,
        },
        receptor: {
          rfc: receptor.rfc,
          nombre: receptor.nombre,
          cp: receptor.cp,
          regimenFiscal: receptor.regimenFiscal,
        },
        totales,
        cadenaOriginal,
        sello,
        xmlUnsigned,
        xmlSigned,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
