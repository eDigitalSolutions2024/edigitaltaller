// backend/routes/facturacion.js
// Vista previa en PDF de los 3 tipos de comprobante:
//  - factura          (CFDI de Ingreso)
//  - notaCredito      (CFDI de Egreso)
//  - complementoPago  (CFDI de Pago / Recibo electrónico de pago)
const express = require("express");
const mongoose = require("mongoose");
const PDFDocument = require("pdfkit");
const path = require("path");
const FiscalConfig = require("../models/FiscalConfig");
const FacturaCfdi = require("../models/FacturaCfdi");
const Vehiculo = require("../models/Vehiculo");

const router = express.Router();

/* =========================
   HELPERS
========================= */
function money(n) {
  const x = Number(n || 0);
  return x.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}
function safe(s) {
  return String(s || "").trim();
}
/* Domicilio fiscal del receptor en 2 líneas: calle/número/colonia y ciudad/estado/CP/país */
function formatDireccion(direccion, pais) {
  const d = direccion || {};
  const linea1 = [
    safe(d.calle),
    safe(d.numeroExterior) && `# ${safe(d.numeroExterior)}`,
    safe(d.numeroInterior) && `Int. ${safe(d.numeroInterior)}`,
    safe(d.colonia) && `${safe(d.colonia)}`,
  ]
    .filter(Boolean)
    .join(", ");
  const linea2 = [
    safe(d.ciudad),
    safe(d.estado),
    safe(d.codigoPostal) && `C.P. ${safe(d.codigoPostal)}`,
    safe(pais),
  ]
    .filter(Boolean)
    .join(", ");
  return { linea1: linea1 || "—", linea2: linea2 || "—" };
}
// Domicilio impreso del emisor: no vive en FiscalConfig (que solo guarda el CP
// de expedición), así que se usa el mismo domicilio fijo que ya imprimen las
// demás plantillas del sistema (orden de compra, vales de salida, reportes).
const EMISOR_DIRECCION_LINEA1 = "PASEO TRIUNFO DE LA REPÚBLICA #322-B";
const EMISOR_DIRECCION_LINEA2 = "COL. SAN LORENZO, C.P. 32320, CD. JUÁREZ, CHIH.";

function fechaHora(d = new Date()) {
  return d.toLocaleString("es-MX", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const FORMA_PAGO_LABELS = {
  "01": "Efectivo",
  "02": "Cheque nominativo",
  "03": "Transferencia electrónica de fondos",
  "04": "Tarjeta de crédito",
  "05": "Monedero electrónico",
  "06": "Dinero electrónico",
  "08": "Vales de despensa",
  "12": "Dación en pago",
  "13": "Pago por subrogación",
  "14": "Pago por consignación",
  "15": "Condonación",
  "17": "Compensación",
  "23": "Novación",
  "24": "Confusión",
  "25": "Remisión de deuda",
  "26": "Prescripción o caducidad",
  "27": "A satisfacción del acreedor",
  "28": "Tarjeta de débito",
  "29": "Tarjeta de servicios",
  "30": "Aplicación de anticipos",
  "31": "Intermediario pagos",
  "99": "Por definir",
};

function formaPagoLabel(code) {
  const c = safe(code);
  return c ? `${c} - ${FORMA_PAGO_LABELS[c] || ""}`.trim() : "—";
}

/* Textos variables del comprobante: por defecto los de la vista previa
   (sin folio ni sellos); el PDF de una factura ya guardada los sobreescribe. */
function buildMeta(overrides = {}) {
  return {
    folio: "(se asigna al generar)",
    fechaEmision: fechaHora(),
    fechaCertificacion: "— (sin timbrar)",
    uuid: "— (se asigna al timbrar)",
    sello: "— disponible al generar/timbrar el XML —",
    selloSat: "— disponible al timbrar —",
    cadena: "— disponible al timbrar —",
    pieSufijo: " — VISTA PREVIA SIN TIMBRADO",
    ...overrides,
  };
}

/* Cantidad con letra: "DOS MIL SETECIENTOS CINCUENTA PESOS 00/100 M.N." */
const UNIDADES = ["", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
const DIECES = ["DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISEIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"];
const DECENAS = ["", "DIEZ", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

function tresDigitosALetras(n) {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  let out = "";
  const c = Math.floor(n / 100);
  const du = n % 100;
  const d = Math.floor(du / 10);
  const u = du % 10;
  if (c) out += CENTENAS[c] + " ";
  if (du >= 10 && du <= 19) out += DIECES[du - 10];
  else if (du === 20) out += "VEINTE";
  else if (du > 20 && du < 30) out += "VEINTI" + UNIDADES[u];
  else {
    if (d) out += DECENAS[d] + (u ? " Y " : "");
    if (u) out += UNIDADES[u];
  }
  return out.trim();
}

function numeroALetras(monto) {
  const abs = Math.abs(Number(monto || 0));
  const entero = Math.floor(abs);
  const cents = Math.round((abs - entero) * 100);

  const millones = Math.floor(entero / 1000000);
  const miles = Math.floor((entero % 1000000) / 1000);
  const resto = entero % 1000;

  let letras = "";
  if (millones) letras += (millones === 1 ? "UN MILLON" : `${tresDigitosALetras(millones)} MILLONES`) + " ";
  if (miles) letras += (miles === 1 ? "MIL" : `${tresDigitosALetras(miles)} MIL`) + " ";
  if (resto) letras += tresDigitosALetras(resto);
  if (!letras.trim()) letras = "CERO";

  return `${letras.trim().replace(/\s+/g, " ")} PESOS ${String(cents).padStart(2, "0")}/100 M.N.`;
}

/* =========================
   PRIMITIVAS DE DIBUJO
========================= */
const PAGE_W = 612;
const PAGE_H = 792;
const M = 24;
const W = PAGE_W - M * 2; // 564

const DARK = "#3b3b3b";
const GRAY = "#e8e8e8";
const LINE = "#000000";

function makeUi(doc) {
  const ui = {};

  ui.box = (x, y, w, h) => {
    doc.rect(x, y, w, h).strokeColor(LINE).lineWidth(0.7).stroke();
  };

  ui.fillRect = (x, y, w, h, color) => {
    doc.save();
    doc.fillColor(color).rect(x, y, w, h).fill();
    doc.restore();
  };

  // Barra oscura con texto blanco centrado
  ui.darkBar = (x, y, w, h, text, fontSize = 9) => {
    ui.fillRect(x, y, w, h, DARK);
    doc.fillColor("white").font("Helvetica-Bold").fontSize(fontSize);
    doc.text(text, x + 4, y + (h - fontSize) / 2 - 1, { width: w - 8, align: "center" });
    doc.fillColor("black").font("Helvetica");
  };

  // Caja con etiqueta centrada arriba y valor centrado abajo (columna derecha de las fotos)
  ui.labelValueBox = (x, y, w, labelText, valueText, hLabel = 12, hValue = 13) => {
    ui.fillRect(x, y, w, hLabel, GRAY);
    ui.box(x, y, w, hLabel);
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#222");
    doc.text(labelText, x + 2, y + 3, { width: w - 4, align: "center" });
    ui.box(x, y + hLabel, w, hValue);
    doc.font("Helvetica").fontSize(7).fillColor("black");
    doc.text(valueText, x + 2, y + hLabel + 3.5, { width: w - 4, align: "center" });
    return y + hLabel + hValue;
  };

  // "Etiqueta: valor" en una línea
  ui.kv = (x, y, label, value, labelW, totalW, fontSize = 8) => {
    doc.font("Helvetica-Bold").fontSize(fontSize).text(label, x, y, { width: labelW });
    doc.font("Helvetica").fontSize(fontSize).text(safe(value) || "—", x + labelW, y, {
      width: totalW - labelW,
    });
  };

  // Texto en un solo renglón: recorta con "…" lo que no quepa en el ancho dado
  // (sellos y cadena original son cadenas muy largas).
  ui.oneLine = (text, x, y, w, fontSize = 6.5) => {
    doc.fontSize(fontSize);
    let t = safe(text);
    if (doc.widthOfString(t) > w) {
      while (t.length > 1 && doc.widthOfString(`${t}…`) > w) t = t.slice(0, -1);
      t += "…";
    }
    doc.text(t, x, y, { width: w, lineBreak: false });
  };

  ui.logo = (x, y, w) => {
    const logoPath = path.join(__dirname, "..", "assets", "pdf", "logo_servicompactos.png");
    try {
      const img = doc.openImage(logoPath);
      const h = (w * img.height) / img.width;
      doc.image(img, x, y, { width: w });
      return h;
    } catch (e) {
      return 0;
    }
  };

  ui.qrPlaceholder = (x, y, size) => {
    ui.box(x, y, size, size);
    doc.font("Helvetica").fontSize(6).fillColor("#555");
    doc.text("QR\n(al timbrar)", x, y + size / 2 - 7, { width: size, align: "center" });
    doc.fillColor("black");
  };

  return ui;
}

/* Encabezado común de factura / nota de crédito */
function drawHeaderComprobante(doc, ui, { emisor, tipoLabel, meta }) {
  const m = meta || buildMeta();
  const rightX = M + 340;
  const rightW = W - 340;

  // Logo + datos del emisor (izquierda): el logo abarca el mismo ancho que
  // la caja de datos del emisor que se dibuja justo debajo.
  const emisorBoxW = 320;
  const logoY = M + 4;
  const logoH = ui.logo(M, logoY, emisorBoxW) || 0;

  const emisorBoxH = 94;
  const emisorBoxY = Math.max(M + 52, logoY + logoH + 6);
  ui.box(M, emisorBoxY, emisorBoxW, emisorBoxH);
  doc.font("Helvetica-Bold").fontSize(9);
  doc.text(safe(emisor.nombre) || "EMISOR (configura la Configuración Fiscal)", M + 8, emisorBoxY + 8, {
    width: 304,
    align: "center",
  });
  doc.font("Helvetica").fontSize(7.5);
  doc.text(EMISOR_DIRECCION_LINEA1, M + 8, emisorBoxY + 20, { width: 304, align: "center" });
  doc.text(EMISOR_DIRECCION_LINEA2, M + 8, emisorBoxY + 30, { width: 304, align: "center" });
  doc.text(`Tel: ${safe(emisor.telefono) || "—"}`, M + 8, emisorBoxY + 42, {
    width: 304,
    align: "center",
  });
  doc.font("Helvetica-Bold").fontSize(8);
  doc.text(`RFC Emisor: ${safe(emisor.rfc) || "—"}`, M + 8, emisorBoxY + 54, {
    width: 304,
    align: "center",
  });
  doc.font("Helvetica").fontSize(7.5);
  doc.text(`Régimen Fiscal: ${safe(emisor.regimenFiscal) || "—"}`, M + 8, emisorBoxY + 66, {
    width: 304,
    align: "center",
  });
  doc.text(`Expedido en C.P. ${safe(emisor.lugarExpedicion) || "—"}`, M + 8, emisorBoxY + 77, {
    width: 304,
    align: "center",
  });

  // Barra superior derecha
  ui.darkBar(rightX, M, rightW, 16, (safe(emisor.nombre) || "COMPROBANTE FISCAL").toUpperCase(), 8);

  // Version / Folio
  doc.font("Helvetica-Bold").fontSize(8).text("Version 4.0", rightX + 4, M + 21);
  ui.box(rightX + 90, M + 18, rightW - 90, 14);
  doc.font("Helvetica-Bold").fontSize(8).text("Folio:", rightX + 94, M + 21);
  doc.font("Helvetica").text(m.folio, rightX + 124, M + 21, { width: rightW - 128 });

  // Columna derecha de cajas
  let y = M + 36;
  y = ui.labelValueBox(rightX, y, rightW, "Fecha de emisión", m.fechaEmision);
  y = ui.labelValueBox(rightX, y, rightW, "Fecha de certificación", m.fechaCertificacion);
  y = ui.labelValueBox(rightX, y, rightW, "UUID", m.uuid);
  y = ui.labelValueBox(rightX, y, rightW, "Certificado digital", safe(emisor.noCertificado) || "—");

  return Math.max(y, emisorBoxY + emisorBoxH) + 8;
}

/* Bloque receptor + vehículo + tipo de factura */
function drawReceptorComprobante(doc, ui, y0, { cliente, orden, ordenes, cfdi, tipoLabel, relacionadas }) {
  // Una factura puede agrupar varias órdenes y una nota de crédito aplicar a
  // varias facturas; `orden` (singular) se sigue aceptando por compatibilidad.
  const listaOrdenes = (Array.isArray(ordenes) && ordenes.length ? ordenes : orden ? [orden] : [])
    .filter((o) => safe(o?.ordenServicio));
  const ordenUnica = listaOrdenes.length === 1 ? listaOrdenes[0] : null;
  const listaRelacionadas = Array.isArray(relacionadas) ? relacionadas : [];

  const h = 118;
  ui.box(M, y0, W, h);

  // --- Receptor (izquierda) ---
  const rx = M + 8;
  let ry = y0 + 8;
  ui.kv(rx, ry, "RFC Receptor:", safe(cliente?.rfc), 78, 260);
  ry += 13;
  doc.font("Helvetica-Bold").fontSize(8).text(safe(cliente?.nombre) || "—", rx, ry, { width: 255 });
  ry += 13;
  const dirReceptor = formatDireccion(cliente?.direccion, cliente?.pais);
  ui.oneLine(dirReceptor.linea1, rx, ry, 255, 7);
  ry += 10;
  ui.oneLine(dirReceptor.linea2, rx, ry, 255, 7);
  ry += 13;
  ui.kv(rx, ry, "Régimen Fiscal:", safe(cliente?.regimenFiscal), 78, 260);
  ry += 13;
  ui.kv(rx, ry, "C.P. Fiscal:", safe(cliente?.codigoPostalFiscal), 78, 260);
  ry += 13;
  ui.kv(rx, ry, "Uso CFDI:", safe(cfdi?.usoCfdi), 78, 260);

  // --- Vehículo (centro) o factura relacionada (nota de crédito) ---
  const vx = M + 280;
  doc.moveTo(vx - 8, y0).lineTo(vx - 8, y0 + h).strokeColor(LINE).lineWidth(0.7).stroke();
  let vy = y0 + 8;

  if (ordenUnica) {
    if (!ordenUnica.sinVehiculo) {
      // Numero de orden no necesaria
      // ui.kv(vx, vy, "Orden:", ordenUnica.ordenServicio, 42, 150);
      // vy += 13;
      ui.kv(vx, vy, "Marca:", ordenUnica.marca, 42, 150);
      vy += 13;
      ui.kv(vx, vy, "Modelo:", `${safe(ordenUnica.modelo)} ${safe(ordenUnica.anio)}`.trim(), 42, 150);
      vy += 13;
      ui.kv(vx, vy, "Serie:", ordenUnica.serie, 42, 150);
      vy += 13;
      ui.kv(vx, vy, "Placas:", ordenUnica.placas, 42, 150);
      vy += 13;
      ui.kv(vx, vy, "Kms:", ordenUnica.kmsMillas, 42, 150);
    }
  } else if (listaOrdenes.length) {
    // Varias órdenes: no cabe el detalle de cada vehículo, así que se listan
    // los folios y, junto a cada uno, el vehículo en una sola línea.
    doc.font("Helvetica-Bold").fontSize(8).text(`Órdenes de servicio (${listaOrdenes.length})`, vx, vy, { width: 150 });
    vy += 12;
    doc.font("Helvetica").fontSize(6.5);
    listaOrdenes.slice(0, 6).forEach((o) => {
      const vehiculo = o.sinVehiculo
        ? ""
        : [safe(o.marca), safe(o.modelo), safe(o.placas) && `(${safe(o.placas)})`]
            .filter(Boolean)
            .join(" ");
      doc.text(`${safe(o.ordenServicio)}${vehiculo ? ` · ${vehiculo}` : ""}`, vx, vy, { width: 150 });
      vy += 10;
    });
    if (listaOrdenes.length > 6) {
      doc.text(`+ ${listaOrdenes.length - 6} más`, vx, vy, { width: 150 });
    }
    doc.fontSize(8);
  } else if (listaRelacionadas.length) {
    doc.font("Helvetica-Bold").fontSize(8).text("CFDI Relacionado", vx, vy, { width: 150 });
    vy += 13;
    ui.kv(vx, vy, "Relación:", "01 - Nota de crédito", 48, 150);
    vy += 13;

    if (listaRelacionadas.length === 1) {
      const rel = listaRelacionadas[0];
      ui.kv(vx, vy, "Factura:", `${safe(rel.serie)}${safe(rel.folio)}`, 48, 150);
      vy += 13;
      ui.kv(vx, vy, "UUID:", safe(rel.uuid) || "— (sin timbrar)", 48, 150);
      vy += 13;
      ui.kv(vx, vy, "Total:", money(rel.total), 48, 150);
    } else {
      // Varias facturas acreditadas: no cabe el detalle de cada una, así que se
      // listan folio e importe en renglones cortos y al final el acumulado.
      const totalRel = listaRelacionadas.reduce((s, r) => s + Number(r.total || 0), 0);
      doc.font("Helvetica").fontSize(6.5);
      listaRelacionadas.slice(0, 4).forEach((r) => {
        doc.text(`${safe(r.serie)}${safe(r.folio)} · ${money(r.total)}`, vx, vy, { width: 150 });
        vy += 10;
      });
      if (listaRelacionadas.length > 4) {
        doc.text(`+ ${listaRelacionadas.length - 4} más`, vx, vy, { width: 150 });
        vy += 10;
      }
      doc.fontSize(8);
      ui.kv(vx, vy, "Total:", money(totalRel), 48, 150);
    }
  }

  // --- Derecha: OC, condiciones, tipo de factura ---
  const tx = M + 438;
  doc.moveTo(tx - 8, y0).lineTo(tx - 8, y0 + h).strokeColor(LINE).lineWidth(0.7).stroke();
  let ty = y0 + 8;
  ui.kv(tx, ty, "Orden de Compra:", safe(cfdi?.oc), 88, W + M - tx - 6, 7);
  ty += 14;
  ui.kv(tx, ty, "Condiciones:", safe(cfdi?.metodoPago) === "PPD" ? "Crédito" : "Contado", 88, W + M - tx - 6, 7);
  ty += 18;

  // Tipo de Factura resaltado (como el círculo de las fotos)
  doc.font("Helvetica-Bold").fontSize(8).text("Tipo de Factura:", tx, ty);
  const tipoW = 70;
  doc.roundedRect(tx + 8, ty + 12, tipoW, 18, 8).strokeColor("#1f4fbf").lineWidth(1.2).stroke();
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#1f4fbf");
  doc.text(tipoLabel, tx + 8, ty + 17, { width: tipoW, align: "center" });
  doc.fillColor("black");

  return y0 + h + 6;
}

/* Fila con datos generales del CFDI */
function drawFilaCfdi(doc, ui, y0, { cfdi }) {
  const h = 30;
  ui.box(M, y0, W, h);
  let y = y0 + 5;

  ui.kv(M + 8, y, "Moneda:", safe(cfdi?.moneda) || "MXN", 44, 130, 7);
  ui.kv(M + 150, y, "Forma de pago:", formaPagoLabel(cfdi?.formaPago), 72, 260, 7);
  ui.kv(M + 400, y, "Tipo de cambio:", cfdi?.moneda === "USD" ? String(cfdi?.tipoCambio || "—") : "—", 76, 160, 7);

  y += 13;
  ui.kv(
    M + 8,
    y,
    "Método de Pago:",
    safe(cfdi?.metodoPago) === "PPD"
      ? "PPD - Pago en parcialidades o diferido"
      : "PUE - Pago en una sola exhibición",
    80,
    300,
    7
  );
  ui.kv(M + 400, y, "IVA:", `${Math.round(Number(cfdi?.ivaRate || 0) * 100)}%`, 76, 160, 7);

  return y0 + h + 8;
}

/* Tabla de conceptos estilo Servicompactos (renglón + sub-renglón de impuesto) */
function drawTablaConceptos(doc, ui, y0, { conceptos, ivaRate }) {
  const cols = [
    { label: "Cant.", w: 34, align: "center" },
    { label: "Unidad/M", w: 50, align: "center" },
    { label: "Descripción del Servicio", w: 190, align: "left" },
    { label: "Precio Unit", w: 68, align: "right" },
    { label: "Importe", w: 68, align: "right" },
    { label: "Descuento", w: 50, align: "right" },
    { label: "I.V.A.", w: 48, align: "right" },
    { label: "Importe", w: 56, align: "right" },
  ];

  let y = y0;

  // Header oscuro
  ui.fillRect(M, y, W, 16, DARK);
  doc.fillColor("white").font("Helvetica-Bold").fontSize(7);
  let x = M;
  cols.forEach((c) => {
    doc.text(c.label, x + 3, y + 4.5, { width: c.w - 6, align: c.align === "left" ? "left" : "center" });
    x += c.w;
  });
  doc.fillColor("black").font("Helvetica");
  y += 16;

  const pct = Math.round(Number(ivaRate || 0) * 100);

  conceptos.forEach((c) => {
    const qty = Number(c.cantidad || 0);
    const vu = Number(c.valorUnitario || 0);
    const imp = qty * vu;
    const ivaImp = imp * Number(ivaRate || 0);
    const impFinal = imp + ivaImp;

    doc.fontSize(7.5);
    const descH = doc.heightOfString(safe(c.descripcion) || "—", { width: cols[2].w - 8 });
    const rowH = Math.max(14, descH + 5);
    const subH = 13;

    if (y + rowH + subH > PAGE_H - 240) {
      doc.addPage();
      y = M;
    }

    // Renglón principal
    let cx = M;
    const vals = [
      String(qty),
      safe(c.cUnidad),
      safe(c.descripcion),
      money(vu),
      money(imp),
      money(0),
      money(ivaImp),
      money(impFinal),
    ];
    cols.forEach((col, i) => {
      doc.font(i === 2 ? "Helvetica" : "Helvetica").fontSize(7.5);
      doc.text(vals[i], cx + 4, y + 3, {
        width: col.w - 8,
        align: col.align,
      });
      cx += col.w;
    });

    y += rowH;

    // Sub-renglón de impuesto (como en el formato: Base / Impuesto 002 IVA / Tasa)
    doc.font("Helvetica").fontSize(6.5).fillColor("#333");
    doc.text(
      `${safe(c.cProdServ) || "—"}    Base: ${money(imp)}    Impuesto: 002 IVA;  Tipo de Factor: Tasa;  Tasa o Cuota: ${pct}%;  Importe: ${money(ivaImp)}`,
      M + 40,
      y + 2,
      { width: W - 60 }
    );
    doc.fillColor("black");
    y += subH;

    doc.moveTo(M, y).lineTo(M + W, y).strokeColor("#888").lineWidth(0.5).stroke();
    y += 2;
  });

  ui.box(M, y0, W, y - y0);
  return y + 6;
}

/* Pie de factura / nota de crédito: leyenda, garantía, QR, totales, sellos */
function drawPieComprobante(doc, ui, y0, { totales, cfdi, leyendaTipo, meta }) {
  const m = meta || buildMeta();
  let y = y0;

  // Observaciones
  ui.box(M, y, W, 34);
  doc.font("Helvetica-Bold").fontSize(8).text("Observaciones:", M + 6, y + 4);
  doc.font("Helvetica").fontSize(7.5).text(safe(cfdi?.comentarios) || "", M + 90, y + 4, { width: W - 100 });
  doc.font("Helvetica-Bold").fontSize(8).text("Comentarios:", M + 6, y + 18);
  y += 40;

  if (y > PAGE_H - 210) {
    doc.addPage();
    y = M;
  }

  // Leyenda central
  doc.font("Helvetica-Bold").fontSize(10);
  doc.text("ESTE SERVICIO INCLUYE MANO DE OBRA Y REFACCIONES", M, y, { width: W, align: "center" });
  y += 16;

  // Izquierda: QR + garantía. Derecha: totales
  const qrSize = 66;
  ui.qrPlaceholder(M, y + 4, qrSize);

  doc.font("Helvetica-Oblique").fontSize(6.5).fillColor("#333");
  doc.text(
    "Garantía: Nuestras reparaciones están garantizadas por noventa (90) días o mil quinientos kms., en condiciones de uso normal y que no hayan sido intervenidas por terceros. Excepto en partes eléctricas, usadas y/o surtidas por el cliente. Recibí vehículo, en conformidad con los servicios mencionados en la presente factura.",
    M + qrSize + 10,
    y + 4,
    { width: 250 }
  );
  doc.fillColor("black");

  // Totales (derecha)
  const tX = M + 360;
  const tLabelW = 110;
  const tValW = W - 360 - tLabelW;
  let ty = y;

  const fila = (label, value, bold = false) => {
    ui.box(tX, ty, tLabelW, 15);
    ui.box(tX + tLabelW, ty, tValW, 15);
    doc.font("Helvetica-Bold").fontSize(7.5).text(label, tX + 4, ty + 4, { width: tLabelW - 8, align: "right" });
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 8.5 : 7.5);
    doc.text(value, tX + tLabelW + 4, ty + 4, { width: tValW - 8, align: "right" });
    ty += 15;
  };

  fila("SubTotal:", money(totales.subtotal));
  fila("Descuento:", money(0));
  fila(`${Math.round(Number(cfdi?.ivaRate || 0) * 100)} % I.V.A.:`, money(totales.iva));
  if (Number(totales.isr || 0) > 0) fila("Retención ISR:", `- ${money(totales.isr)}`);
  fila("IVA Retenido:", money(0));
  fila("Total:", money(totales.total), true);

  y = Math.max(y + qrSize + 12, ty + 6);

  // Cantidad con letra
  ui.box(M, y, W, 16);
  doc.font("Helvetica-Bold").fontSize(7.5);
  doc.text(numeroALetras(totales.total), M + 6, y + 4.5, { width: W - 12, align: "center" });
  y += 22;

  // Sellos (placeholders hasta timbrar)
  doc.font("Helvetica-Bold").fontSize(7).text("Sello digital del CFDI:", M, y);
  doc.font("Helvetica").fillColor("#555");
  ui.oneLine(m.sello, M + 100, y, W - 100);
  y += 10;
  doc.font("Helvetica-Bold").fontSize(7).fillColor("black").text("Sello digital del SAT:", M, y);
  doc.font("Helvetica").fillColor("#555");
  ui.oneLine(m.selloSat, M + 100, y, W - 100);
  y += 10;
  doc.font("Helvetica-Bold").fontSize(7).fillColor("black").text("Cadena S.A.T.:", M, y);
  doc.font("Helvetica").fillColor("#555");
  ui.oneLine(m.cadena, M + 100, y, W - 100);
  doc.fillColor("black");

  // Pie de página
  doc.font("Helvetica-Bold").fontSize(7.5);
  doc.text(
    `ESTE DOCUMENTO ES UNA REPRESENTACIÓN IMPRESA DE UN CFDI (${leyendaTipo})${m.pieSufijo}`,
    M,
    PAGE_H - 40,
    { width: W, align: "center" }
  );
}

/* =========================
   FORMATO 1 y 2: FACTURA (INGRESO) / NOTA DE CRÉDITO (EGRESO)
========================= */
function drawComprobanteIngresoEgreso(doc, data) {
  const ui = makeUi(doc);
  const { tipoLabel } = data;

  let y = drawHeaderComprobante(doc, ui, data);
  y = drawReceptorComprobante(doc, ui, y, data);
  y = drawFilaCfdi(doc, ui, y, data);
  y = drawTablaConceptos(doc, ui, y, { conceptos: data.conceptos, ivaRate: data.cfdi?.ivaRate });
  drawPieComprobante(doc, ui, y, {
    totales: data.totales,
    cfdi: data.cfdi,
    meta: data.meta,
    leyendaTipo: tipoLabel === "Egreso" ? "EGRESO / NOTA DE CRÉDITO" : "INGRESO",
  });
}

/* =========================
   FORMATO 3: COMPLEMENTO DE PAGO (RECIBO ELECTRÓNICO DE PAGO)
========================= */
function drawReciboElectronicoPago(doc, data) {
  const ui = makeUi(doc);
  const { emisor, cliente, pago, relacionadas, cfdi } = data;
  const m = data.meta || buildMeta();

  const monto = relacionadas.reduce((s, r) => s + Number(r.importePagado || 0), 0);

  // ===== Encabezado =====
  // El logo abarca el mismo ancho que la caja de Receptor de abajo; los datos
  // del emisor van centrados justo debajo, igual que en factura/nota de crédito.
  const emisorBoxW = 320;
  const logoY = M + 4;
  const logoH = ui.logo(M, logoY, emisorBoxW) || 0;
  const emisorY = logoY + logoH + 6;

  doc.font("Helvetica-Bold").fontSize(9);
  doc.text((safe(emisor.nombre) || "EMISOR").toUpperCase(), M, emisorY, { width: emisorBoxW, align: "center" });
  doc.font("Helvetica").fontSize(8);
  doc.text(`R.F.C.: ${safe(emisor.rfc) || "—"}`, M, emisorY + 13, { width: emisorBoxW, align: "center" });
  doc.text(`Régimen fiscal: ${safe(emisor.regimenFiscal) || "—"}`, M, emisorY + 25, { width: emisorBoxW, align: "center" });
  doc.text(`Expedido en C.P. ${safe(emisor.lugarExpedicion) || "—"}`, M, emisorY + 37, { width: emisorBoxW, align: "center" });
  doc.fontSize(7.5).text(`Tel: ${safe(emisor.telefono) || "—"}`, M, emisorY + 49, { width: emisorBoxW, align: "center" });
  const emisorBlockBottom = emisorY + 61;

  // Barra derecha
  const rightX = M + 352;
  const rightW = W - 352;
  ui.darkBar(rightX, M, rightW, 18, "RECIBO ELECTRONICO DE PAGO", 8.5);

  doc.font("Helvetica-Bold").fontSize(8).text("Serie y Folio:", rightX + 4, M + 24);
  ui.box(rightX + 70, M + 21, rightW - 70, 14);
  doc.font("Helvetica").fontSize(7.5).text(m.folio, rightX + 74, M + 24, { width: rightW - 78 });

  let ry = M + 40;
  ry = ui.labelValueBox(rightX, ry, rightW, "Fecha de emisión", m.fechaEmision);
  ry = ui.labelValueBox(rightX, ry, rightW, "Tipo de Comprobante", "P - Pago");
  ry = ui.labelValueBox(
    rightX,
    ry,
    rightW,
    "Fecha de Pago",
    safe(pago?.fechaPago) ? `${safe(pago.fechaPago)} 12:00:00` : "—"
  );
  ry = ui.labelValueBox(rightX, ry, rightW, "Folio Fiscal (Uuid)", m.uuid);
  ry = ui.labelValueBox(rightX, ry, rightW, "Certificado digital", safe(emisor.noCertificado) || "—");

  // ===== Receptor =====
  const recH = 100;
  const recY = Math.max(M + 96, emisorBlockBottom + 8);
  ui.box(M, recY, 320, recH);
  doc.font("Helvetica-Bold").fontSize(8).text("Receptor:", M + 8, recY + 6);
  doc.font("Helvetica-Bold").fontSize(8).text(`RFC ${safe(cliente?.rfc) || "—"}`, M + 70, recY + 6);
  doc.font("Helvetica-Bold").fontSize(9).text(safe(cliente?.nombre) || "—", M + 8, recY + 20, { width: 304 });
  doc.font("Helvetica").fontSize(7.5);
  doc.text(`Régimen Fiscal: ${safe(cliente?.regimenFiscal) || "—"}`, M + 8, recY + 36);
  doc.text(`C.P. Fiscal: ${safe(cliente?.codigoPostalFiscal) || "—"}`, M + 8, recY + 48);
  doc.text(`Uso de CFDI: CP01 - Pagos`, M + 8, recY + 60);
  const dirReceptorPago = formatDireccion(cliente?.direccion, cliente?.pais);
  doc.font("Helvetica-Bold").fontSize(7).text("Domicilio:", M + 8, recY + 72);
  ui.oneLine(dirReceptorPago.linea1, M + 8, recY + 81, 304, 7);
  ui.oneLine(dirReceptorPago.linea2, M + 8, recY + 91, 304, 7);

  let y = Math.max(recY + recH, ry) + 10;

  // ===== Forma de pago / importe =====
  ui.box(M, y, W, 28);
  doc.font("Helvetica-Bold").fontSize(8).text("Forma de Pago:", M + 8, y + 4);
  doc.font("Helvetica").fontSize(8).text(formaPagoLabel(pago?.formaPago), M + 8, y + 15);
  doc.font("Helvetica-Bold").fontSize(8).text("Mon:", M + 330, y + 9);
  doc.font("Helvetica").fontSize(8).text("MXN", M + 356, y + 9);
  doc.font("Helvetica-Bold").fontSize(8).text("Importe Pago:", M + 400, y + 9);
  ui.box(M + 466, y + 5, 90, 17);
  doc.font("Helvetica-Bold").fontSize(9).text(money(monto), M + 470, y + 10, { width: 82, align: "right" });
  y += 34;

  // ===== Concepto fijo del CFDI de pago =====
  ui.fillRect(M, y, W, 14, GRAY);
  ui.box(M, y, W, 28);
  doc.font("Helvetica-Bold").fontSize(7);
  doc.text("Concepto", M + 10, y + 4);
  doc.text("Unidad", M + 160, y + 4);
  doc.text("Cantidad", M + 250, y + 4);
  doc.text("Precio Unitario", M + 340, y + 4);
  doc.text("Importe", M + 460, y + 4);
  doc.font("Helvetica").fontSize(7.5);
  doc.text("84111506 - Pago", M + 10, y + 17);
  doc.text("ACT", M + 160, y + 17);
  doc.text("1", M + 250, y + 17);
  doc.text("0.00", M + 340, y + 17);
  doc.text("0.00", M + 460, y + 17);
  y += 34;

  // ===== DETALLE DEL PAGO =====
  ui.darkBar(M, y, W, 16, "DETALLE DEL PAGO", 9);
  y += 16;

  const cols = [
    { label: "SERIE", w: 40, align: "center" },
    { label: "FOLIO", w: 48, align: "center" },
    { label: "UUID / FACTURA", w: 158, align: "left" },
    { label: "Parc", w: 30, align: "center" },
    { label: "Metodo P", w: 48, align: "center" },
    { label: "Mon", w: 32, align: "center" },
    { label: "Saldo Ant", w: 70, align: "right" },
    { label: "Importe Pagado", w: 72, align: "right" },
    { label: "Saldo Insoluto", w: 66, align: "right" },
  ];

  ui.fillRect(M, y, W, 14, GRAY);
  doc.font("Helvetica-Bold").fontSize(6.5);
  let x = M;
  cols.forEach((c) => {
    doc.text(c.label, x + 2, y + 4, { width: c.w - 4, align: "center" });
    x += c.w;
  });
  y += 14;

  const tableTop = y;
  doc.font("Helvetica").fontSize(7);

  relacionadas.forEach((r) => {
    const saldoAnt = Number(r.saldoAnterior ?? r.total ?? 0);
    const pagado = Number(r.importePagado || 0);
    const insoluto = Math.max(saldoAnt - pagado, 0);

    if (y > PAGE_H - 200) {
      doc.addPage();
      y = M;
    }

    const vals = [
      safe(r.serie) || "—",
      safe(r.folio) || "—",
      safe(r.uuid) || `Factura ${safe(r.serie)}${safe(r.folio)} (sin timbrar)`,
      String(r.numParcialidad || 1),
      "PPD",
      "MXN",
      money(saldoAnt),
      money(pagado),
      money(insoluto),
    ];

    let cx = M;
    cols.forEach((c, i) => {
      doc.text(vals[i], cx + 3, y + 3.5, { width: c.w - 6, align: c.align });
      cx += c.w;
    });

    doc.moveTo(M, y + 14).lineTo(M + W, y + 14).strokeColor("#999").lineWidth(0.5).stroke();
    y += 14;
  });

  ui.box(M, tableTop - 14, W, y - tableTop + 14);

  // Total del pago
  y += 6;
  doc.font("Helvetica-Bold").fontSize(8);
  doc.text("Monto total del pago:", M + 330, y, { width: 130, align: "right" });
  ui.box(M + 466, y - 3, 90, 16);
  doc.text(money(monto), M + 470, y + 1, { width: 82, align: "right" });
  y += 24;

  // Cantidad con letra
  ui.box(M, y, W, 16);
  doc.font("Helvetica-Bold").fontSize(7.5);
  doc.text(numeroALetras(monto), M + 6, y + 4.5, { width: W - 12, align: "center" });
  y += 24;

  // Comentarios
  if (safe(cfdi?.comentarios)) {
    doc.font("Helvetica-Bold").fontSize(7.5).text("Comentarios:", M, y);
    doc.font("Helvetica").fontSize(7.5).text(safe(cfdi.comentarios), M + 70, y, { width: W - 80 });
    y += 18;
  }

  // QR + sellos
  ui.qrPlaceholder(M, y, 66);
  doc.font("Helvetica-Bold").fontSize(7).text("Sello digital del CFDI:", M + 80, y + 4);
  doc.font("Helvetica").fillColor("#555");
  ui.oneLine(m.sello, M + 180, y + 4, W - 180);
  doc.font("Helvetica-Bold").fontSize(7).fillColor("black").text("Sello digital del SAT:", M + 80, y + 16);
  doc.font("Helvetica").fillColor("#555");
  ui.oneLine(m.selloSat, M + 180, y + 16, W - 180);
  doc.font("Helvetica-Bold").fontSize(7).fillColor("black").text("Cadena original:", M + 80, y + 28);
  doc.font("Helvetica").fillColor("#555");
  ui.oneLine(m.cadena, M + 180, y + 28, W - 180);
  doc.fillColor("black");

  doc.font("Helvetica-Bold").fontSize(7.5);
  doc.text(
    `ESTE DOCUMENTO ES UNA REPRESENTACION IMPRESA DE UN CFDi (COMPLEMENTO DE PAGO)${m.pieSufijo}`,
    M,
    PAGE_H - 40,
    { width: W, align: "center" }
  );
}

/* =========================
   ENDPOINT
   POST /api/facturacion/preview
========================= */
router.post("/preview", async (req, res) => {
  try {
    const {
      tipoFactura = "factura",
      cliente,
      conceptos = [],
      cfdi = {},
      relacionadas = [],
      pago = null,
      orden = null,
      ordenes = [],
    } = req.body;

    const esComplementoPago = tipoFactura === "complementoPago";
    const esNotaCredito = tipoFactura === "notaCredito";

    if (!cliente) {
      return res.status(400).json({ ok: false, error: "Faltan datos del receptor." });
    }

    if (!esComplementoPago && (!Array.isArray(conceptos) || !conceptos.length)) {
      return res.status(400).json({ ok: false, error: "Faltan conceptos para el PDF." });
    }

    if (esComplementoPago && (!Array.isArray(relacionadas) || !relacionadas.length || !pago)) {
      return res.status(400).json({ ok: false, error: "Faltan facturas o datos del pago." });
    }

    // Emisor real desde la configuración fiscal (si existe)
    const cfg = await FiscalConfig.findOne().sort({ updatedAt: -1 }).lean().catch(() => null);
    const emisor = {
      nombre: cfg?.nombre || "",
      rfc: cfg?.rfc || "",
      regimenFiscal: cfg?.regimenFiscal || "",
      lugarExpedicion: cfg?.lugarExpedicion || "",
      telefono: cfg?.telefono || "",
      noCertificado: cfg?.noCertificado || "",
    };

    // Totales (factura / nota de crédito)
    const subtotal = conceptos.reduce(
      (sum, c) => sum + Number(c.cantidad || 0) * Number(c.valorUnitario || 0),
      0
    );
    const ivaRate = Number(cfdi?.ivaRate || 0);
    const iva = subtotal * ivaRate;
    const isrRate = Number(cfdi?.isrRate || 0.0125);
    const isr = cfdi?.aplicarRetencionIsr ? subtotal * isrRate : 0;
    const total = subtotal + iva - isr;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=preview.pdf");

    const doc = new PDFDocument({ size: "LETTER", margin: M });
    doc.pipe(res);

    if (esComplementoPago) {
      drawReciboElectronicoPago(doc, { emisor, cliente, pago, relacionadas, cfdi });
    } else {
      drawComprobanteIngresoEgreso(doc, {
        emisor,
        cliente,
        orden,
        ordenes,
        conceptos,
        cfdi,
        relacionadas,
        tipoLabel: esNotaCredito ? "Egreso" : "Ingreso",
        totales: { subtotal, iva, isr, total },
      });
    }

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* =========================
   ENDPOINT
   GET /api/facturacion/factura/:id/pdf
   Representación impresa de una factura ya guardada en el historial.
========================= */
router.get("/factura/:id/pdf", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ ok: false, error: "ID inválido" });
    }

    const f = await FacturaCfdi.findById(req.params.id).lean();
    if (!f) return res.status(404).json({ ok: false, error: "Factura no encontrada" });

    const esComplementoPago = f.tipoFactura === "complementoPago";
    const esNotaCredito = f.tipoFactura === "notaCredito";

    // Emisor: el guardado en la factura; si el snapshot viene vacío, la config actual
    let emisor = f.emisor || {};
    if (!safe(emisor.rfc)) {
      const cfg = await FiscalConfig.findOne().sort({ updatedAt: -1 }).lean().catch(() => null);
      emisor = {
        nombre: cfg?.nombre || "",
        rfc: cfg?.rfc || "",
        regimenFiscal: cfg?.regimenFiscal || "",
        lugarExpedicion: cfg?.lugarExpedicion || "",
        telefono: cfg?.telefono || "",
        noCertificado: cfg?.noCertificado || "",
      };
    }

    // La factura solo guarda la referencia de cada orden: se completan los datos
    // del vehículo. `ordenes` puede traer varias; las facturas viejas solo
    // guardaron `orden` (singular), que aquí se trata como lista de una.
    const refsOrdenes = (f.ordenes?.length ? f.ordenes : f.orden ? [f.orden] : []).filter(
      (o) => safe(o?.ordenServicio) || o?.vehiculoId
    );

    const ordenes = await Promise.all(
      refsOrdenes.map(async (ref) => {
        const base = { ordenServicio: safe(ref?.ordenServicio) };
        if (!ref?.vehiculoId) return base;

        const v = await Vehiculo.findById(ref.vehiculoId)
          .select("ordenServicio marca modelo anio serie placas kmsMillas sinVehiculo")
          .lean()
          .catch(() => null);
        if (!v) return base;

        return {
          ordenServicio: base.ordenServicio || safe(v.ordenServicio),
          marca: v.marca || "",
          modelo: v.modelo || "",
          anio: v.anio || "",
          serie: v.serie || "",
          placas: v.placas || "",
          kmsMillas: v.kmsMillas || "",
          sinVehiculo: !!v.sinVehiculo,
        };
      })
    );

    const folioTxt = [safe(f.serie), safe(f.folio)].filter(Boolean).join("-") || "—";
    const cancelada = f.estatus === "cancelada";

    const meta = buildMeta({
      folio: folioTxt,
      fechaEmision: fechaHora(new Date(f.fecha || f.createdAt || Date.now())),
      sello: safe(f.sello) || "— sin sello —",
      cadena: safe(f.cadenaOriginal) || "— sin cadena original —",
      pieSufijo: cancelada ? " — CANCELADA" : " — SIN TIMBRAR",
    });

    // Totales guardados; si el snapshot no los trae, se recalculan de los conceptos
    const conceptos = f.conceptos || [];
    let totales = f.totales;
    if (!totales || typeof totales.total !== "number") {
      const subtotal = conceptos.reduce(
        (sum, c) => sum + Number(c.cantidad || 0) * Number(c.valorUnitario || 0),
        0
      );
      const iva = subtotal * Number(f.cfdi?.ivaRate || 0);
      const isr = f.cfdi?.aplicarRetencionIsr ? subtotal * Number(f.cfdi?.isrRate || 0.0125) : 0;
      totales = { subtotal, iva, isr, total: subtotal + iva - isr };
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename=factura_${folioTxt.replace(/[^\w-]/g, "") || "cfdi"}.pdf`
    );

    const doc = new PDFDocument({ size: "LETTER", margin: M });
    doc.pipe(res);

    if (esComplementoPago) {
      drawReciboElectronicoPago(doc, {
        emisor,
        cliente: f.cliente,
        pago: {
          ...f.pago,
          // La fecha se guardó como YYYY-MM-DD (medianoche UTC): se formatea en UTC
          // para que no se recorra un día según la zona horaria del servidor.
          fechaPago: f.pago?.fechaPago
            ? new Date(f.pago.fechaPago).toLocaleDateString("es-MX", {
                timeZone: "UTC",
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })
            : "",
        },
        relacionadas: f.relacionadas || [],
        cfdi: f.cfdi,
        meta,
      });
    } else {
      drawComprobanteIngresoEgreso(doc, {
        emisor,
        cliente: f.cliente,
        ordenes,
        conceptos,
        cfdi: f.cfdi,
        relacionadas: f.relacionadas || [],
        tipoLabel: esNotaCredito ? "Egreso" : "Ingreso",
        totales,
        meta,
      });
    }

    doc.end();
  } catch (err) {
    console.error("GET /facturacion/factura/:id/pdf ERROR:", err);
    if (res.headersSent) return res.end();
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
