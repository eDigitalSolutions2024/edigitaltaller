// backend/routes/generar_xml.js
const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { Xslt, XmlParser } = require("xslt-processor");

const FiscalConfig = require("../models/FiscalConfig");
const FacturaCfdi = require("../models/FacturaCfdi");

const router = express.Router();

/* =========================
   HELPERS
========================= */
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

function calcularTotales({ conceptos, ivaRate = 0.16, aplicarRetencionIsr = false, isrRate = 0.0125 }) {
  const subtotalNum = conceptos.reduce((sum, c) => {
    return sum + Number(c.cantidad || 0) * Number(c.valorUnitario || 0);
  }, 0);

  const ivaNum = subtotalNum * Number(ivaRate || 0);
  const isrNum = aplicarRetencionIsr ? subtotalNum * Number(isrRate || 0) : 0;

  const totalNum = subtotalNum + ivaNum - isrNum;

  return {
    subtotal: fmt2(subtotalNum),
    iva: fmt2(ivaNum),
    isr: fmt2(isrNum),
    total: fmt2(totalNum),
  };
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
  } = cfdi;

  const fechaOk = fecha || cfdiFechaNow();
  const ivaRate = Number(cfdi.ivaRate ?? 0.16);

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

  const conceptosXml = conceptos
    .map((c) => {
      const cantidad = Number(c.cantidad || 0);
      const valorUnitario = Number(c.valorUnitario || 0);
      const importe = cantidad * valorUnitario;
      baseTotal += importe;

      const ivaImporte = importe * ivaRate;
      const isrImporte = aplicarRetencionIsr ? importe * Number(isrRate || 0) : 0;

      // Si NO hay impuestos (IVA 0 y sin retenciones), ObjetoImp="01" y sin nodo Impuestos
      const noImpuestos = ivaRate === 0 && !aplicarRetencionIsr;

      if (noImpuestos) {
        return `
<cfdi:Concepto
  ClaveProdServ="${escapeXml(c.cProdServ)}"
  Cantidad="${escapeXml(String(cantidad))}"
  ClaveUnidad="${escapeXml(c.cUnidad)}"
  Unidad="${escapeXml(c.unidad)}"
  Descripcion="${escapeXml(c.descripcion)}"
  ValorUnitario="${fmt2(valorUnitario)}"
  Importe="${fmt2(importe)}"
  ObjetoImp="01">
</cfdi:Concepto>`;
      }

      // Si hay IVA o ISR, ObjetoImp="02"
      const trasladosXml =
        ivaRate > 0
          ? `
    <cfdi:Traslados>
      <cfdi:Traslado Base="${fmt2(importe)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="${tasaIva}" Importe="${fmt2(ivaImporte)}"/>
    </cfdi:Traslados>`
          : "";

      const retencionesXml =
        aplicarRetencionIsr
          ? `
    <cfdi:Retenciones>
      <cfdi:Retencion Base="${fmt2(importe)}" Impuesto="001" TipoFactor="Tasa" TasaOCuota="${tasaIsr}" Importe="${fmt2(isrImporte)}"/>
    </cfdi:Retenciones>`
          : "";

      return `
<cfdi:Concepto
  ClaveProdServ="${escapeXml(c.cProdServ)}"
  Cantidad="${escapeXml(String(cantidad))}"
  ClaveUnidad="${escapeXml(c.cUnidad)}"
  Unidad="${escapeXml(c.unidad)}"
  Descripcion="${escapeXml(c.descripcion)}"
  ValorUnitario="${fmt2(valorUnitario)}"
  Importe="${fmt2(importe)}"
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

    // Traslados IVA (Impuesto 002)
    if (Number(totales.iva || 0) > 0) {
      parts.push(`
  <cfdi:Traslados>
    <cfdi:Traslado Base="${fmt2(baseTotal)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="${tasaIva}" Importe="${totales.iva}"/>
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
  SubTotal="${totales.subtotal}"
  Moneda="${escapeXml(moneda)}"${tipoCambioAttr}
  Total="${totales.total}"
  TipoDeComprobante="${escapeXml(tipoComprobante)}"
  Exportacion="${escapeXml(exportacion)}"
  MetodoPago="${escapeXml(metodoPago)}"
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
      const idDoc = r.uuid || `${r.serie || ""}${r.folio || ""}`;

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
    } = req.body;

    const esNotaCredito = tipoFactura === "notaCredito";
    const esComplementoPago = tipoFactura === "complementoPago";

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

    if ((esNotaCredito || esComplementoPago) && (!Array.isArray(relacionadas) || relacionadas.length === 0)) {
      return res.status(400).json({
        ok: false,
        error: esNotaCredito
          ? "La nota de crédito requiere la factura relacionada."
          : "El complemento de pago requiere al menos una factura.",
      });
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

    // valida cliente mínimo
    if (!cliente.rfc || !cliente.regimenFiscal || !cliente.codigoPostalFiscal || !cliente.nombre) {
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

    const receptor = {
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
      usoCfdi: esComplementoPago ? "CP01" : cfdi.usoCfdi || "G03",

      tipoComprobante: esComplementoPago ? "P" : esNotaCredito ? "E" : cfdi.tipoComprobante || "I",
      exportacion: cfdi.exportacion || "01",

      // Nota de crédito: CFDI relacionado con TipoRelacion 01 (nota de crédito de los documentos relacionados)
      relacion: esNotaCredito
        ? {
            tipoRelacion: "01",
            uuids: relacionadas.map((r) => r.uuid || `${r.serie || ""}${r.folio || ""}`),
          }
        : cfdi.relacion || null,

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
      });

      xmlUnsigned = buildCfdiXmlUnsigned({
        emisor,
        receptor,
        cfdi: cfdiFinal,
        conceptos,
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

      const facturaDoc = await FacturaCfdi.create({
        tipoFactura,
        tipoComprobante: cfdiFinal.tipoComprobante,
        serie: cfdiFinal.serie,
        folio: cfdiFinal.folio,
        fecha: new Date(),
        relacionadas,
        pago: esComplementoPago
          ? {
              fechaPago: new Date(pago.fechaPago),
              formaPago: pago.formaPago || "",
              monto: Number(totales.total),
            }
          : undefined,
        cliente: {
          clienteId: cliente._id || null,
          nombre: receptor.nombre,
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
