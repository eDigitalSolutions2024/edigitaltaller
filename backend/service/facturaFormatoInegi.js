// backend/service/facturaFormatoInegi.js
//
// Formato alterno de la representación impresa de una factura (CFDI de
// Ingreso), pensado para clientes que piden el layout "INEGI": 4 secciones
// (encabezado / conceptos / información de pago / datos SAT + sellos), con
// los datos fiscales de cada concepto (clave SAT e impuestos) dentro de la
// propia descripción. Se elige por cliente (Cliente.formatoFactura = "INEGI");
// el formato normal sigue en routes/facturacion.js.
//
// El dibujo es síncrono (QRCode.create no es async) para poder usarse igual
// en la vista previa y en el PDF de una factura guardada.

const path = require("path");
const QRCode = require("qrcode");

const PAGE_W = 612;
const PAGE_H = 792;
const M = 28;
const W = PAGE_W - M * 2;
const BOTTOM = PAGE_H - 58; // deja lugar al pie "Este documento es una representación…"
const BLACK = "#000000";
const LOGO_PATH = path.join(__dirname, "..", "assets", "pdf", "Auto_Master_C.png");

const REGIMEN_LABELS = {
  601: "General de Ley Personas Morales",
  603: "Personas Morales con Fines no Lucrativos",
  605: "Sueldos y Salarios e Ingresos Asimilados a Salarios",
  606: "Arrendamiento",
  607: "Régimen de Enajenación o Adquisición de Bienes",
  608: "Demás ingresos",
  610: "Residentes en el Extranjero sin Establecimiento Permanente en México",
  611: "Ingresos por Dividendos (socios y accionistas)",
  612: "Personas Físicas con Actividades Empresariales y Profesionales",
  614: "Ingresos por intereses",
  615: "Régimen de los ingresos por obtención de premios",
  616: "Sin obligaciones fiscales",
  620: "Sociedades Cooperativas de Producción que optan por diferir sus ingresos",
  621: "Incorporación Fiscal",
  622: "Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras",
  623: "Opcional para Grupos de Sociedades",
  624: "Coordinados",
  625: "Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas",
  626: "Régimen Simplificado de Confianza",
  628: "Hidrocarburos",
  629: "De los Regímenes Fiscales Preferentes y de las Empresas Multinacionales",
  630: "Enajenación de acciones en bolsa de valores",
};

const METODO_PAGO_LABELS = {
  PUE: "PUE - Pago en una sola exhibición",
  PPD: "PPD - Pago en parcialidades o diferido",
};

const safe = (s) => String(s ?? "").trim();

const dinero = (n) =>
  `$ ${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const regimenLabel = (code) => {
  const c = safe(code);
  if (!c) return "—";
  return REGIMEN_LABELS[c] ? `${c} - ${REGIMEN_LABELS[c]}` : c;
};

// "2026-08-06T16:36:30" (hora local del servidor), como lo imprime el SAT.
function fechaIso(d) {
  const x = d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(
    x.getMinutes()
  )}:${p(x.getSeconds())}`;
}

// QR de verificación del SAT (misma cadena que va en el CFDI 4.0).
function urlVerificacion({ uuid, rfcEmisor, rfcReceptor, total, sello }) {
  const tt = Number(total || 0).toFixed(6).padStart(17, "0");
  const fe = safe(sello).slice(-8);
  return (
    "https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx" +
    `?id=${encodeURIComponent(safe(uuid))}&re=${encodeURIComponent(safe(rfcEmisor))}` +
    `&rr=${encodeURIComponent(safe(rfcReceptor))}&tt=${tt}&fe=${encodeURIComponent(fe)}`
  );
}

function dibujaQr(doc, texto, x, y, size) {
  const qr = QRCode.create(texto, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const cell = size / n;
  doc.save().fillColor(BLACK);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.data[r * n + c]) {
        // +0.2 de traslape para evitar líneas blancas entre celdas al hacer zoom
        doc.rect(x + c * cell, y + r * cell, cell + 0.2, cell + 0.2).fill();
      }
    }
  }
  doc.restore();
}

// Etiqueta en negritas + valor debajo, centrados en la columna derecha.
function parEtiquetaValor(doc, x, y, w, etiqueta, valor) {
  doc.font("Helvetica-Bold").fontSize(7).fillColor(BLACK);
  const hEt = doc.heightOfString(etiqueta, { width: w, align: "center" });
  doc.text(etiqueta, x, y, { width: w, align: "center" });
  doc.font("Helvetica").fontSize(7);
  const v = safe(valor) || "—";
  const hVal = doc.heightOfString(v, { width: w, align: "center" });
  doc.text(v, x, y + hEt + 1, { width: w, align: "center" });
  return y + hEt + 1 + hVal + 4;
}

/* Líneas de la columna "Descripción" de un concepto. */
function lineasDescripcion(c, { base, iva, ivaRate, retIsr, isrRate, claveDesc }) {
  const out = [{ t: safe(c.descripcion) || "—", b: false }];
  if (c.extra) out[0].t += `\n${c.extra}`;
  out.push({ t: "", b: false });
  out.push({
    t: `Clave Prod. Serv. - ${safe(c.cProdServ) || "—"}${claveDesc ? ` ${claveDesc}` : ""}`,
    b: false,
  });
  if (ivaRate > 0 || retIsr > 0) {
    out.push({ t: "Impuestos:", b: false });
    if (ivaRate > 0) {
      out.push({ t: "   Traslados:", b: false });
      out.push({
        t: `      002 IVA Base - ${base.toFixed(2)} Tasa - ${ivaRate.toFixed(6)} Importe - ${dinero(iva)}`,
        b: false,
      });
    }
    if (retIsr > 0) {
      out.push({ t: "   Retenciones:", b: false });
      out.push({
        t: `      001 ISR Base - ${base.toFixed(2)} Tasa - ${isrRate.toFixed(6)} Importe - ${dinero(retIsr)}`,
        b: false,
      });
    }
  }
  return out;
}

/**
 * Dibuja la factura completa en `doc` (PDFKit, LETTER, bufferPages: true).
 *
 * data: { emisor, cliente, ordenes, conceptos, cfdi, totales, meta, clavesDesc, helpers }
 *  - conceptos: ya con `descuento` repartido (repartirDescuentoEnConceptos)
 *  - meta: { folio, fechaEmision(Date), uuid, sello, selloSat, cadena, noCertificadoSat,
 *            fechaCertificacion, rfcProvCertif, sinTimbrar }
 *  - helpers: { usoCfdiLabel, formaPagoLabel, numeroALetras, formatDireccion }
 */
function drawFacturaInegi(doc, data) {
  const { emisor = {}, cliente = {}, ordenes = [], conceptos = [], cfdi = {}, totales = {}, meta = {} } = data;
  const clavesDesc = data.clavesDesc || {};
  const h = data.helpers;
  const ivaRate = Number(cfdi.ivaRate || 0);
  const isrRate = Number(cfdi.isrRate || 0.0125);
  const aplicaIsr = !!cfdi.aplicarRetencionIsr;
  const objetoImp = ivaRate > 0 || aplicaIsr ? "02 - Sí objeto de impuesto." : "01 - No objeto de impuesto.";

  doc.fillColor(BLACK).strokeColor(BLACK);

  /* ================= SECCIÓN 1: encabezado ================= */
  const logoW = 118;
  try {
    doc.image(LOGO_PATH, M, M, { width: logoW });
  } catch (e) {
    // sin logo el resto de la factura se imprime igual
  }

  const colDerX = M + W - 200;
  const colDerW = 200;
  const centroX = M + logoW + 8;
  const centroW = colDerX - centroX - 8;

  // Centro: emisor y receptor
  let y = M;
  doc.font("Helvetica-Bold").fontSize(11);
  doc.text(safe(emisor.nombre) || "EMISOR (configura la Configuración Fiscal)", centroX, y, {
    width: centroW,
    align: "center",
  });
  y = doc.y + 1;
  const centrado = (txt, font = "Helvetica", size = 7.5) => {
    if (!safe(txt)) return;
    doc.font(font).fontSize(size).text(txt, centroX, y, { width: centroW, align: "center" });
    y = doc.y + 1;
  };
  centrado(safe(emisor.rfc), "Helvetica", 8);
  centrado(`RÉGIMEN FISCAL: ${regimenLabel(emisor.regimenFiscal)}`);
  const dirEmisor = [safe(emisor.direccionLinea1), safe(emisor.direccionLinea2)].filter(Boolean).join(", ");
  centrado(dirEmisor, "Helvetica", 6.5);
  if (safe(emisor.telefono)) centrado(`Tel. ${safe(emisor.telefono)}`, "Helvetica", 6.5);

  y += 6;
  centrado("CLIENTE", "Helvetica-Bold", 11);
  centrado(safe(cliente.nombre).toUpperCase() || "—", "Helvetica", 8);
  centrado(safe(cliente.rfc), "Helvetica", 7.5);
  centrado(`USO CFDI: ${h.usoCfdiLabel(cfdi.usoCfdi)}`);
  centrado(`DOMICILIO FISCAL: ${safe(cliente.codigoPostalFiscal) || "—"}`);
  centrado(`REGIMEN FISCAL: ${regimenLabel(cliente.regimenFiscal)}`);
  const dirCli = h.formatDireccion(cliente.direccion, cliente.pais);
  const dirCliTxt = [dirCli.linea1, dirCli.linea2].filter((s) => s && s !== "—").join(", ");
  centrado(dirCliTxt, "Helvetica", 6.5);
  const yCentro = y;

  // Derecha: datos de la factura
  let yd = M;
  doc.font("Helvetica-Bold").fontSize(12).text(`Factura ${safe(meta.folio) || "—"}`, colDerX, yd, {
    width: colDerW,
    align: "center",
  });
  yd = doc.y + 4;
  const sinTimbre = (v, ph) => safe(v) || ph;
  yd = parEtiquetaValor(doc, colDerX, yd, colDerW, "FOLIO FISCAL (UUID)", sinTimbre(meta.uuid, "— se asigna al timbrar —"));
  yd = parEtiquetaValor(
    doc, colDerX, yd, colDerW,
    "NO. DE SERIE DEL CERTIFICADO DEL SAT",
    sinTimbre(meta.noCertificadoSat, "— se asigna al timbrar —")
  );
  yd = parEtiquetaValor(
    doc, colDerX, yd, colDerW,
    "NO. DE SERIE DEL CERTIFICADO DEL EMISOR",
    safe(emisor.noCertificado)
  );
  yd = parEtiquetaValor(
    doc, colDerX, yd, colDerW,
    "FECHA Y HORA DE CERTIFICACIÓN",
    sinTimbre(meta.fechaCertificacion, "— se asigna al timbrar —")
  );
  yd = parEtiquetaValor(doc, colDerX, yd, colDerW, "FECHA Y HORA DE EMISIÓN DE CFDI", fechaIso(meta.fechaEmision));
  yd = parEtiquetaValor(
    doc, colDerX, yd, colDerW,
    "LUGAR DE EXPEDICIÓN",
    safe(cfdi.lugarExpedicion) || safe(emisor.lugarExpedicion)
  );

  y = Math.max(yCentro, yd, M + 52) + 6;

  /* ================= SECCIÓN 2: conceptos ================= */
  const cols = [
    { label: "Cantidad", w: 44, align: "center" },
    { label: "Unidad", w: 44, align: "center" },
    { label: "Descripción", w: 250, align: "left" },
    { label: "Precio Unitario", w: 68, align: "right" },
    { label: "Objeto Imp.", w: 68, align: "left" },
    { label: "Importe", w: 60, align: "right" },
  ];
  const sumaCols = cols.reduce((s, c) => s + c.w, 0);
  cols[2].w += W - sumaCols; // la descripción absorbe el resto del ancho

  const dibujaEncabezadoConceptos = (yy, conTitulo) => {
    if (conTitulo) {
      doc.rect(M, yy, W, 12).fill(BLACK);
      doc.fillColor("white").font("Helvetica-Bold").fontSize(8);
      doc.text("CONCEPTOS", M, yy + 2.5, { width: W, align: "center" });
      yy += 12;
    }
    doc.rect(M, yy, W, 12).fill(BLACK);
    doc.fillColor("white").font("Helvetica-Bold").fontSize(7);
    let x = M;
    cols.forEach((c) => {
      doc.text(c.label, x + 3, yy + 3, { width: c.w - 6, align: c.align === "left" ? "left" : c.align });
      x += c.w;
    });
    doc.fillColor(BLACK);
    return yy + 12;
  };

  // Datos del vehículo: se imprimen en el primer concepto cuando la factura es de una sola orden.
  const unicaOrden = ordenes.length === 1 && !ordenes[0].sinVehiculo ? ordenes[0] : null;
  const extraVehiculo = unicaOrden
    ? [
        [unicaOrden.marca, unicaOrden.modelo].filter(Boolean).join(" "),
        unicaOrden.anio && `MODELO ${unicaOrden.anio}`,
        unicaOrden.placas && `No. DE PLACAS ${unicaOrden.placas}`,
        unicaOrden.serie && `No. DE SERIE: ${unicaOrden.serie}`,
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const inicioConceptos = () => {
    y = dibujaEncabezadoConceptos(y, true);
  };
  inicioConceptos();
  let yInicioPagina = y;

  const cierraBordePagina = (yFin) => {
    doc.rect(M, yInicioPagina, W, yFin - yInicioPagina).strokeColor(BLACK).lineWidth(0.5).stroke();
  };

  conceptos.forEach((c, idx) => {
    const qty = Number(c.cantidad || 0);
    const vu = Number(c.valorUnitario || 0);
    const importe = qty * vu;
    const base = Math.max(importe - Number(c.descuento || 0), 0);
    const iva = base * ivaRate;
    const retIsr = aplicaIsr ? base * isrRate : 0;

    const lineas = lineasDescripcion(
      { ...c, extra: idx === 0 ? extraVehiculo : "" },
      { base, iva, ivaRate, retIsr, isrRate, claveDesc: clavesDesc[safe(c.cProdServ)] || "" }
    );
    doc.font("Helvetica").fontSize(7);
    const texto = lineas.map((l) => l.t).join("\n");
    const hTexto = doc.heightOfString(texto, { width: cols[2].w - 8 });
    const rowH = Math.max(18, hTexto + 6);

    if (y + rowH > BOTTOM) {
      cierraBordePagina(y);
      doc.addPage();
      y = dibujaEncabezadoConceptos(M, false);
      yInicioPagina = y;
    }

    let x = M;
    const vals = [
      qty.toFixed(2),
      safe(c.cUnidad),
      texto,
      dinero(vu),
      objetoImp,
      dinero(importe),
    ];
    doc.font("Helvetica").fontSize(7).fillColor(BLACK);
    cols.forEach((col, i) => {
      doc.text(vals[i], x + 4, y + 3, { width: col.w - 8, align: col.align });
      x += col.w;
    });
    y += rowH;
    doc.moveTo(M, y).lineTo(M + W, y).strokeColor("#888").lineWidth(0.4).stroke();
  });
  cierraBordePagina(y);
  y += 8;

  /* ================= Información de pago ================= */
  const letras = h.numeroALetras(totales.total).replace(/ PESOS (\d\d)\/100 M\.N\./, ", $1/100 MXN");
  const filasTotales = [
    ["SUBTOTAL", dinero(totales.subtotal)],
    ...(Number(totales.descuento) > 0 ? [["DESCUENTO", dinero(totales.descuento)]] : []),
    ...(ivaRate > 0 ? [[`TRASLADO IVA TASA ${ivaRate.toFixed(6)}`, dinero(totales.iva)]] : []),
    ...(Number(totales.isr) > 0 ? [[`RETENCIÓN ISR TASA ${isrRate.toFixed(6)}`, dinero(totales.isr)]] : []),
    ["TOTAL", dinero(totales.total)],
  ];
  const bloquePagoH = filasTotales.length * 12 + 8;

  // Si el bloque de pago + SAT + sellos ya no cabe, pasa a página nueva.
  const sellosH = 150;
  if (y + bloquePagoH + 70 + sellosH > BOTTOM) {
    doc.addPage();
    y = M;
  }

  doc.font("Helvetica-Bold").fontSize(7.5).text("IMPORTE CON LETRA", M, y + 2, { width: 110 });
  doc.font("Helvetica").fontSize(7.5).text(letras, M + 112, y + 2, { width: 250 });
  let yt = y;
  const totX = M + W - 230;
  filasTotales.forEach(([et, val]) => {
    const esTotal = et === "TOTAL";
    doc.font(esTotal ? "Helvetica-Bold" : "Helvetica-Bold").fontSize(7.5);
    doc.text(et, totX, yt + 2, { width: 130, align: "right" });
    doc.font("Helvetica").text(val, totX + 134, yt + 2, { width: 96, align: "right" });
    yt += 12;
  });
  y = Math.max(yt, doc.y) + 10;

  /* ================= SECCIÓN 3: información SAT + sellos ================= */
  const tipoCompTxt = "I - Ingreso";
  const info = [
    ["TIPO DE COMPROBANTE", tipoCompTxt],
    ["FORMA DE PAGO", h.formaPagoLabel(cfdi.formaPago)],
    ["MÉTODO DE PAGO", METODO_PAGO_LABELS[safe(cfdi.metodoPago)] || safe(cfdi.metodoPago) || "—"],
    ["MONEDA", safe(cfdi.moneda) === "USD" ? "USD - Dólar americano" : "MXN - Peso Mexicano"],
    ["VERSION", "4.0"],
    ["EXPORTACION", "01 - No aplica"],
  ];
  info.forEach(([et, val]) => {
    doc.font("Helvetica-Bold").fontSize(7.5).text(et, M, y, { width: 130 });
    doc.font("Helvetica").fontSize(7.5).text(val, M + 134, y, { width: 330 });
    y += 11;
  });
  y += 8;

  const qrSize = 92;
  const url = urlVerificacion({
    uuid: meta.uuid,
    rfcEmisor: emisor.rfc,
    rfcReceptor: cliente.rfc,
    total: totales.total,
    sello: meta.sello,
  });
  dibujaQr(doc, url, M, y, qrSize);

  const tx = M + qrSize + 10;
  const tw = W - qrSize - 10;
  let ty = y;
  const bloqueTexto = (titulo, cuerpo) => {
    doc.font("Helvetica-Bold").fontSize(6.5).text(titulo, tx, ty, { width: tw });
    ty = doc.y + 1;
    doc.font("Helvetica").fontSize(5.5).text(safe(cuerpo) || "—", tx, ty, { width: tw });
    ty = doc.y + 4;
  };
  bloqueTexto("SELLO DIGITAL DEL CFDI", meta.sello);
  bloqueTexto("SELLO DIGITAL DEL SAT", meta.selloSat || "— disponible al timbrar —");
  bloqueTexto(
    "CADENA ORIGINAL DEL COMPLEMENTO DE CERTIFICACIÓN DIGITAL DEL SAT",
    meta.cadenaComplemento || "— disponible al timbrar —"
  );

  /* ================= Pie en todas las páginas ================= */
  const rango = doc.bufferedPageRange();
  for (let i = 0; i < rango.count; i++) {
    doc.switchToPage(rango.start + i);
    // Se escribe dentro del margen inferior: sin lineBreak para que no abra otra página.
    doc.font("Helvetica").fontSize(7).fillColor(BLACK);
    doc.text("Este documento es una representación impresa de un CFDI.", M, PAGE_H - 48, {
      width: W - 90,
      align: "center",
      lineBreak: false,
    });
    doc.text(`Página ${i + 1} de ${rango.count}`, M + W - 90, PAGE_H - 48, {
      width: 90,
      align: "right",
      lineBreak: false,
    });
    if (safe(meta.pieSufijo)) {
      doc.fontSize(6.5).fillColor("#555").text(safe(meta.pieSufijo).replace(/^\s*—\s*/, ""), M, PAGE_H - 37, {
        width: W,
        align: "center",
        lineBreak: false,
      });
    }
  }
}

module.exports = { drawFacturaInegi, FORMATOS_FACTURA: ["NORMAL", "INEGI"] };
