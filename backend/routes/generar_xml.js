// backend/routes/generar_xml.js
const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { Xslt, XmlParser } = require("xslt-processor");

const FiscalConfig = require("../models/FiscalConfig");

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
    const { cliente, conceptos, cfdi } = req.body;

    if (!cliente || !Array.isArray(conceptos) || conceptos.length === 0 || !cfdi) {
      return res.status(400).json({ ok: false, error: "Faltan datos para generar XML." });
    }

    // valida cliente mínimo
    if (!cliente.rfc || !cliente.regimenFiscal || !cliente.codigoPostalFiscal || !cliente.nombre) {
      return res.status(400).json({
        ok: false,
        error: "Cliente incompleto: requiere RFC, Régimen Fiscal, CP fiscal y Nombre.",
      });
    }

    // valida conceptos mínimo
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

    // Defaults
    const cfdiFinal = {
      ...cfdi,
      lugarExpedicion: cfdi.lugarExpedicion || cfg.lugarExpedicion,
      serie: cfdi.serie ?? cfg.serie ?? "",
      folio: cfdi.folio ?? "",

      moneda: cfdi.moneda || "MXN",
      ivaRate: cfdi.ivaRate ?? 0.16,

      formaPago: cfdi.formaPago || "99",
      metodoPago: cfdi.metodoPago || "PUE",
      usoCfdi: cfdi.usoCfdi || "G03",

      tipoComprobante: cfdi.tipoComprobante || "I",
      exportacion: cfdi.exportacion || "01",

      aplicarRetencionIsr: !!cfdi.aplicarRetencionIsr,
      isrRate: Number(cfdi.isrRate ?? 0.0125),
    };

    if (cfdiFinal.moneda === "USD" && !Number(cfdiFinal.tipoCambio || 0)) {
      return res.status(400).json({
        ok: false,
        error: "Moneda USD requiere TipoCambio.",
      });
    }

    const totales = calcularTotales({
      conceptos,
      ivaRate: Number(cfdiFinal.ivaRate ?? 0.16),
      aplicarRetencionIsr: !!cfdiFinal.aplicarRetencionIsr,
      isrRate: Number(cfdiFinal.isrRate ?? 0.0125),
    });

    const xmlUnsigned = buildCfdiXmlUnsigned({
      emisor,
      receptor,
      cfdi: cfdiFinal,
      conceptos,
      totales,
    });

    const cadenaOriginal = await generarCadenaOriginal(xmlUnsigned);

    const privateKeyPem = fs.readFileSync(pemPath, "utf8");
    const sello = firmarCadenaOriginal(cadenaOriginal, privateKeyPem);
    const xmlSigned = injectSello(xmlUnsigned, sello);

    return res.json({
      ok: true,
      data: {
        pemPathUsed: pemPath, // 👈 para debug
        emisor: {
          rfc: cfg.rfc,
          nombre: cfg.nombre,
          regimenFiscal: cfg.regimenFiscal,
          lugarExpedicion: cfg.lugarExpedicion,
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
