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
const { sincronizarFechaPagadaRemisiones } = require("../utils/cajaTotales");
const { registrarMovimientoTerminal } = require("../utils/cierreCajaTerminales");

const router = express.Router();

/* =========================
   HELPERS
========================= */
// Formato estándar de un UUID de CFDI (Folio Fiscal): 8-4-4-4-12 hex. Se usa
// para validar cfdi:CfdiRelacionados y pago20:DoctoRelacionado — el SAT
// rechaza el XML si UUID/IdDocumento no tiene esta forma.
const UUID_RE = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;
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

  const relacionadosXml = relacion
    ? `<cfdi:CfdiRelacionados TipoRelacion="${escapeXml(relacion.tipoRelacion)}">${(relacion.uuids || [])
        .map((u) => `<cfdi:CfdiRelacionado UUID="${escapeXml(u)}"/>`)
        .join("")}</cfdi:CfdiRelacionados>`
    : "";

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
function buildPagoXmlUnsigned({ emisor, receptor, cfdi, pago, relacionadas }) {
  const { serie, folio, lugarExpedicion, fecha } = cfdi;

  const fechaOk = fecha || cfdiFechaNow();
  const serieAttr = serie ? ` Serie="${escapeXml(String(serie))}"` : "";
  const folioAttr = folio ? ` Folio="${escapeXml(String(folio))}"` : "";
  const noCertAttr = emisor.noCertificado ? ` NoCertificado="${escapeXml(emisor.noCertificado)}"` : "";
  const certAttr = emisor.certificadoBase64 ? ` Certificado="${escapeXml(emisor.certificadoBase64)}"` : "";

  const monto = relacionadas.reduce((s, r) => s + Number(r.importePagado || 0), 0);

  // Si solo llega la fecha (YYYY-MM-DD) se completa con hora fija
  const fpRaw = String(pago.fechaPago || "");
  const fechaPago = fpRaw.length === 10 ? `${fpRaw}T12:00:00` : fpRaw;

  const doctosXml = relacionadas
    .map((r) => {
      const saldoAnt = Number(r.saldoAnterior ?? r.total ?? 0);
      const pagado = Number(r.importePagado || 0);
      const insoluto = Number(r.saldoInsoluto ?? Math.max(saldoAnt - pagado, 0));
      // IdDocumento SIEMPRE es el UUID real de la factura pagada (Pagos 2.0 lo
      // exige); se valida en POST /xml antes de llegar aquí, nunca se cae a
      // serie+folio, que no es un UUID válido.
      const idDoc = String(r.uuid || "").trim().toUpperCase();

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
      <pago20:Pago FechaPago="${escapeXml(fechaPago)}" FormaDePagoP="${escapeXml(pago.formaPago || "03")}" MonedaP="MXN" TipoCambioP="1" Monto="${fmt2(monto)}">${doctosXml}
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

// Al generar una factura de ingreso, cualquier anticipo o remisión vigente de
// las órdenes facturadas deja de tener sentido como comprobante de cobro
// aparte: se cancela automáticamente y se enlaza a la factura recién creada
// (pago.facturaId), en vez de dejar que un admin lo cancele a mano sin dejar
// registrado a qué factura pasó (eso queda solo para corregir errores de
// captura, ver POST /api/cajas/:id/pagos/:pagoId/cancelar).
async function cancelarAnticiposYRemisionesPorFactura(ordenes, facturaDoc, decisiones = {}) {
  const folioFactura = `${facturaDoc.serie || ""}${facturaDoc.folio || ""}`;
  // Sin decisión para un pago = 'INCLUIR' (comportamiento histórico).
  const decision = (pagoId) => decisiones[String(pagoId)] || "INCLUIR";
  const esAnticipoORemision = (p) =>
    (p.comprobante === "NOTA_VENTA" && p.tipoPago === "ANTICIPO") || p.comprobante === "REMISION";

  for (const o of ordenes) {
    if (!o?._id) continue;
    const vehiculo = await Vehiculo.findById(o._id);
    if (!vehiculo) continue;

    // Vigentes que el usuario dejó (o dejó por defecto) para ESTA factura.
    // 'OTRA_FACTURA' (ya se canceló aparte, hacia otra factura) y 'VIGENTE' se saltan.
    const pagosPorCancelar = (vehiculo.pagos || []).filter(
      (p) => !p.cancelado && esAnticipoORemision(p) && decision(p._id) === "INCLUIR"
    );

    // Al facturar de verdad la orden deja de estar "pendiente de facturar".
    const debeLimpiarPendiente = !!vehiculo.pendienteFactura;
    if (!pagosPorCancelar.length && !debeLimpiarPendiente) continue;

    if (debeLimpiarPendiente) {
      vehiculo.pendienteFactura = false;
      vehiculo.pendienteFacturaEn = null;
      vehiculo.pendienteFacturaPor = "";
    }

    for (const pago of pagosPorCancelar) {
      const esRemision = pago.comprobante === "REMISION";
      pago.cancelado = true;
      pago.canceladoEn = new Date();
      pago.canceladoPor = "Sistema (factura)";
      pago.motivoCancelacion = `Se cancela ${esRemision ? "remisión" : "anticipo"} y pasa a factura ${folioFactura}`;
      pago.motivoCancelacionTipo = "PASA_A_FACTURA";
      if (!pago.notasAntesCancelar) pago.notasAntesCancelar = pago.notas || "";
      // NO se pisa pago.notas: conserva la referencia original del cobro, que el
      // Reporte de Facturas muestra junto a "SE CANCELÓ ... Y PASA A FACTURA".
      pago.facturaId = facturaDoc._id;
      if (esRemision) {
        if (!pago.remisionTipoAntesCancelar) pago.remisionTipoAntesCancelar = pago.remision?.tipo || "Contado";
        pago.remision.tipo = "Cancelada";
      }
    }

    await vehiculo.save();
    // Al dejar de contar como abonado puede reaparecer saldo: las remisiones
    // vigentes de la orden vuelven a quedar sin Fecha de Pagada.
    await sincronizarFechaPagadaRemisiones(vehiculo);

    for (const pago of pagosPorCancelar) {
      if (pago.comprobante !== "NOTA_VENTA") continue;
      try {
        await registrarMovimientoTerminal(pago.notaVenta?.banco, -pago.monto, pago.fecha);
      } catch (errTerminal) {
        console.error("Error revirtiendo terminal del cierre de caja:", errTerminal);
      }
    }
  }
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
router.post("/xml", async (req, res) => {
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

    // La factura global agrupa notas de venta de Caja, no órdenes.
    if (esFacturaGlobal && (!Array.isArray(notasVenta) || notasVenta.length === 0)) {
      return res.status(400).json({
        ok: false,
        error: "La factura global requiere al menos una nota de venta.",
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
    // lugar.
    if (
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
        !Array.isArray(uuidsBody) ||
        uuidsBody.length === 0 ||
        uuidsBody.some((u) => !UUID_RE.test(String(u || "").trim()))
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

    // Folio: se asigna automáticamente a partir del folio interno de la configuración fiscal
    const folioActualNum = parseInt(cfg.folioInterno, 10) || 0;
    const folioAsignado = folioActualNum + 1;

    // Defaults
    const cfdiFinal = {
      ...cfdi,
      lugarExpedicion: cfdi.lugarExpedicion || cfg.lugarExpedicion,
      serie: cfdi.serie ?? cfg.serie ?? "",
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

      // Nota de crédito: CFDI relacionado con TipoRelacion 01 (nota de crédito de
      // los documentos relacionados). El UUID es el real de cada factura
      // acreditada (validado arriba); NUNCA se cae a serie+folio, que no es un
      // UUID válido y dejaría el XML inválido para el SAT.
      // Cualquier otro tipo (solo factura de ingreso): grupo opcional que
      // captura la pantalla de "Facturas relacionadas" (ver cfdi.relacion).
      relacion: esNotaCredito
        ? {
            tipoRelacion: "01",
            uuids: relacionadas.map((r) => String(r.uuid || "").trim().toUpperCase()),
          }
        : cfdi.relacion
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

    if (esComplementoPago) {
      const montoPago = relacionadas.reduce((s, r) => s + Number(r.importePagado || 0), 0);
      // En el CFDI tipo P el SubTotal/Total van en 0; el monto vive en el complemento.
      totales = { subtotal: "0.00", iva: "0.00", isr: "0.00", total: fmt2(montoPago) };

      xmlUnsigned = buildPagoXmlUnsigned({
        emisor,
        receptor,
        cfdi: cfdiFinal,
        pago,
        relacionadas,
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

      xmlUnsigned = buildCfdiXmlUnsigned({
        emisor,
        receptor,
        cfdi: cfdiFinal,
        conceptos: conceptosXml,
        totales,
      });
    }

    const cadenaOriginal = await generarCadenaOriginal(xmlUnsigned);

    const privateKeyPem = fs.readFileSync(pemPath, "utf8");
    const sello = firmarCadenaOriginal(cadenaOriginal, privateKeyPem);
    const xmlSigned = injectSello(xmlUnsigned, sello);

    // A partir de aquí el XML ya está firmado: si falla el guardado en el
    // historial, no debe perderse el XML que el usuario ya tiene derecho a descargar.
    let facturaId = null;
    let persistWarning = "";
    try {
      await FiscalConfig.findByIdAndUpdate(cfg._id, { folioInterno: String(folioAsignado) });

      // Nombre de facturación editado (F3): si el CFDI se emitió con un nombre
      // distinto a la razón social fiscal del cliente, se deja constancia en el
      // historial.
      const razonSocialOriginal = String(cliente.razonSocialOriginal || "").trim();
      const nombreEmitido = String(receptor.nombre || "").trim();
      const notaFacturacion =
        !esFacturaGlobal && razonSocialOriginal && razonSocialOriginal !== nombreEmitido
          ? `Facturado como "${nombreEmitido}" (razón social: "${razonSocialOriginal}")`
          : "";

      const facturaDoc = await FacturaCfdi.create({
        tipoFactura,
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
          vehiculoId: ordenPrincipal?._id || null,
          ordenServicio: ordenPrincipal?.ordenServicio || "",
        },
        ordenes: ordenes.map((o) => ({
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

      if (tipoFactura === "factura" && ordenes.length) {
        const decisiones = {};
        for (const c of Array.isArray(comprobantesCajas) ? comprobantesCajas : []) {
          if (c?.pagoId) decisiones[String(c.pagoId)] = c.accion;
        }
        await cancelarAnticiposYRemisionesPorFactura(ordenes, facturaDoc, decisiones);
      }

      if (esFacturaGlobal) {
        await marcarNotasVentaFacturadas(notasVenta, facturaDoc._id);
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
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
