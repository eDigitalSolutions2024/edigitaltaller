const express = require("express");
const PDFDocument = require("pdfkit");
const path = require("path");

const router = express.Router();

function money(n) {
  const x = Number(n || 0);
  return x.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}
function fmtPct(rate) {
  const r = Number(rate || 0);
  return `${Math.round(r * 100)}%`;
}
function safe(s) {
  return String(s || "").trim();
}

router.post("/preview", async (req, res) => {
  try {
    const { cliente, conceptos, cfdi } = req.body;

    if (!cliente || !conceptos || !conceptos.length) {
      return res.status(400).json({ ok: false, error: "Faltan datos para el PDF." });
    }

    const subtotal = conceptos.reduce(
      (sum, c) => sum + Number(c.cantidad || 0) * Number(c.valorUnitario || 0),
      0
    );

    const ivaRate = Number(cfdi?.ivaRate || 0);
    const iva = subtotal * ivaRate;

    // Retención apagada por default
    const isrRate = Number(cfdi?.isrRate || 0.0125);
    const aplicarIsr = Boolean(cfdi?.aplicarRetencionIsr);
    const isr = aplicarIsr ? subtotal * isrRate : 0;

    const total = subtotal + iva - isr;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=preview.pdf");

    const doc = new PDFDocument({ size: "LETTER", margin: 24 });
    doc.pipe(res);

    // ======================
    // Layout
    // ======================
    const PAGE_W = doc.page.width;   // 612
    const PAGE_H = doc.page.height;  // 792
    const M = 24;
    const W = PAGE_W - M * 2;

    const BRAND_RED = "#b71c1c";
    const LINE = "#000000";

    function box(x, y, w, h) {
      doc.rect(x, y, w, h).strokeColor(LINE).lineWidth(1).stroke();
    }
    function fillRect(x, y, w, h, color) {
      doc.save();
      doc.fillColor(color).rect(x, y, w, h).fill();
      doc.restore();
    }
    function sectionBar(x, y, w, h, text) {
      fillRect(x, y, w, h, BRAND_RED);
      doc.fillColor("white").fontSize(10).font("Helvetica-Bold").text(text, x + 8, y + 5, {
        width: w - 16,
      });
      doc.fillColor("black").font("Helvetica");
    }

    // ======================
    // HEADER
    // ======================
    const headerY = M;
    const headerH = 150;
    box(M, headerY, W, headerH);

    // Logo
    const logoPath = path.join(__dirname, "..", "assets", "logo.png");
    try {
      doc.image(logoPath, M + 12, headerY + 12, { width: 90 });
    } catch (e) {}

    // Emisor (placeholders)
    const emisor = {
      nombre: safe(cfdi?.emisorNombre) || "TALLER (pendiente configurar)",
      rfc: safe(cfdi?.emisorRfc) || "RFC (pendiente)",
      domicilio: safe(cfdi?.emisorDomicilio) || "Domicilio (pendiente)",
      ciudad: safe(cfdi?.emisorCiudad) || "Ciudad/Estado (pendiente)",
      pais: safe(cfdi?.emisorPais) || "México",
      cp: safe(cfdi?.emisorCp) || "CP (pendiente)",
      regimen: safe(cfdi?.emisorRegimen) || "RÉGIMEN (pendiente)",
      csdSerie: safe(cfdi?.emisorCsdSerie) || "(pendiente)",
    };

    const fechaEmision = new Date().toISOString().slice(0, 19).replace("T", " ");

    // Columnas del header
    const headLeftX = M + 120;
    const headLeftW = 230;

    const headRightX = M + 360;
    const headRightW = (M + W) - headRightX - 10;

    const headY = headerY + 16;

    doc.font("Helvetica-Bold").fontSize(10).text("EMISOR:", headLeftX, headY);
    doc.font("Helvetica").fontSize(9);
    doc.text(emisor.nombre, headLeftX, headY + 14, { width: headLeftW });
    doc.text(emisor.rfc, headLeftX, headY + 26, { width: headLeftW });
    doc.text(emisor.domicilio, headLeftX, headY + 38, { width: headLeftW });
    doc.text(emisor.ciudad, headLeftX, headY + 50, { width: headLeftW });
    doc.text(`${emisor.pais} ${emisor.cp}`, headLeftX, headY + 62, { width: headLeftW });

    doc.font("Helvetica-Bold").fontSize(9);
    doc.text("FOLIO FISCAL:", headRightX, headY, { width: headRightW });
    doc.font("Helvetica").text("(pendiente timbrado)", headRightX + 85, headY, { width: headRightW - 85 });

    doc.font("Helvetica-Bold").text("NUMERO DE SERIE DEL CSD DEL EMISOR:", headRightX, headY + 14, { width: headRightW });
    doc.font("Helvetica").text(emisor.csdSerie, headRightX, headY + 26, { width: headRightW });

    doc.font("Helvetica-Bold").text("FECHA Y HORA DE EMISION DEL CFDI:", headRightX, headY + 40, { width: headRightW });
    doc.font("Helvetica").text(fechaEmision, headRightX, headY + 52, { width: headRightW });

    doc.font("Helvetica-Bold").text("USO CFDI:", headRightX, headY + 66, { width: headRightW });
    doc.font("Helvetica").text(safe(cfdi?.usoCfdi) || "—", headRightX + 58, headY + 66, { width: headRightW - 58 });

    doc.font("Helvetica-Bold").text("REGIMEN FISCAL:", headRightX, headY + 80, { width: headRightW });
    doc.font("Helvetica").text(emisor.regimen, headRightX + 92, headY + 80, { width: headRightW - 92 });

    doc.font("Helvetica-Bold").text("Tipo de Comprobante:", headRightX, headY + 98, { width: headRightW });
    doc.font("Helvetica").text("I - Ingresos", headRightX + 120, headY + 98, { width: headRightW - 120 });

    // ✅ FOLIO INTERNO (más visible y alineado)
    doc.font("Helvetica-Bold").text("FOLIO INTERNO:", headRightX, headY + 112, { width: headRightW });
    doc.font("Helvetica").text(
      safe(cfdi?.folioInterno) || "(pendiente)",
      headRightX + 92,
      headY + 112,
      { width: headRightW - 92 }
    );

    // ======================
    // RECEPTOR + DATOS CFDI
    // ======================
    const blockY = headerY + headerH + 10;
    const blockH = 120;
    box(M, blockY, W, blockH);

    const halfW = W / 2;
    sectionBar(M, blockY, halfW, 22, "Receptor");
    sectionBar(M + halfW, blockY, halfW, 22, "Datos del CFDI");

    doc.moveTo(M + halfW, blockY).lineTo(M + halfW, blockY + blockH).stroke();

    // Receptor
    const recX = M + 10;
    const recY = blockY + 32;
    const recW = halfW - 20;

    doc.font("Helvetica-Bold").fontSize(9).text("Nombre:", recX, recY);
    doc.font("Helvetica").text(safe(cliente?.nombre), recX + 52, recY, { width: recW - 52 });

    doc.font("Helvetica-Bold").text("RFC:", recX, recY + 14);
    doc.font("Helvetica").text(safe(cliente?.rfc), recX + 30, recY + 14, { width: recW - 30 });

    doc.font("Helvetica-Bold").text("Domicilio:", recX, recY + 28);
    doc.font("Helvetica").text(
      safe(cliente?.domicilioFiscal) || "Domicilio (pendiente)",
      recX + 60,
      recY + 28,
      { width: recW - 60 }
    );

    // Datos CFDI (reservando columna QR)
    const rightBlockX = M + halfW;
    const dataPad = 10;

    const qrW = 80;
    const qrH = 80;
    const qrX = M + W - (dataPad + qrW);
    const qrY = blockY + 30;

    const dX = rightBlockX + dataPad;
    const dY = blockY + 32;
    const dTextW = (qrX - 10) - dX;

    doc.font("Helvetica-Bold").fontSize(9).text("Moneda:", dX, dY, { width: dTextW });
    doc.font("Helvetica").text(safe(cfdi?.moneda) || "MXN", dX + 55, dY, { width: dTextW - 55 });

    doc.font("Helvetica-Bold").text("Tipo de Cambio:", dX, dY + 14, { width: dTextW });
    doc.font("Helvetica").text(
      cfdi?.moneda === "USD" ? String(cfdi?.tipoCambio || "—") : "—",
      dX + 90,
      dY + 14,
      { width: dTextW - 90 }
    );

    doc.font("Helvetica-Bold").text("Metodo de Pago:", dX, dY + 28, { width: dTextW });
    doc.font("Helvetica").text(safe(cfdi?.metodoPago) || "—", dX + 95, dY + 28, { width: dTextW - 95 });

    doc.font("Helvetica-Bold").text("Forma de Pago:", dX, dY + 42, { width: dTextW });
    doc.font("Helvetica").text(safe(cfdi?.formaPago) || "—", dX + 90, dY + 42, { width: dTextW - 90 });

    doc.font("Helvetica-Bold").text("Regimen Fiscal Receptor:", dX, dY + 56, { width: dTextW });
    doc.font("Helvetica").text(safe(cliente?.regimenFiscal) || "—", dX + 150, dY + 56, { width: dTextW - 150 });

    doc.font("Helvetica-Bold").text("OC:", dX, dY + 70, { width: dTextW });
    doc.font("Helvetica").text(safe(cfdi?.oc) || "—", dX + 25, dY + 70, { width: dTextW - 25 });

    box(qrX, qrY, qrW, qrH);
    doc.fontSize(7).fillColor("#444").text("QR", qrX + 34, qrY + 34);
    doc.fillColor("black");

    // ======================
    // INFO EXTRA
    // ======================
    const infoY = blockY + blockH + 12;
    const infoH = 58;
    box(M, infoY, W, infoH);
    sectionBar(M, infoY, W, 22, "Informacion Extra");

    doc.font("Helvetica").fontSize(9).text(
      safe(cfdi?.comentarios) || "—",
      M + 10,
      infoY + 30,
      { width: W - 20, height: infoH - 34 }
    );

    // ======================
    // TABLA CONCEPTOS (con Cantidad y sin pegado a la izquierda)
    // ======================
    let y = infoY + infoH + 12;

    const cols = [
      { label: "Cantidad", w: 52, align: "center" },
      { label: "Clave\nUnidad", w: 58, align: "center" },
      { label: "Unidad", w: 70, align: "center" },
      { label: "Descripcion", w: 200, align: "left" },
      { label: "Valor\nUnitario", w: 60, align: "right" },
      { label: "Impuesto", w: 60, align: "right" },
      { label: "Importe", w: 66, align: "right" },
    ];

    // ✅ La tabla ahora arranca en el margen (se ve “centrada” y no pegada)
    const startX = M;
    const totalW = cols.reduce((a, c) => a + c.w, 0);

    fillRect(startX, y, totalW, 22, BRAND_RED);
    doc.fillColor("white").font("Helvetica-Bold").fontSize(8);

    let x = startX;
    cols.forEach((c) => {
      doc.text(c.label, x + 4, y + 5, { width: c.w - 8, align: "center" });
      x += c.w;
    });

    doc.fillColor("black").font("Helvetica").fontSize(9);

    const rowH = 24;
    const tableH = 22 + rowH * conceptos.length;

    box(startX, y, totalW, tableH);
    y += 22;

    conceptos.forEach((c) => {
      const qty = Number(c.cantidad || 0);
      const vu = Number(c.valorUnitario || 0);
      const imp = qty * vu;
      const impIva = imp * ivaRate;

      let cx = startX;

      doc.text(String(qty), cx + 4, y + 7, { width: cols[0].w - 8, align: "center" });
      cx += cols[0].w;

      doc.text(safe(c.cUnidad), cx + 4, y + 7, { width: cols[1].w - 8, align: "center" });
      cx += cols[1].w;

      doc.text(safe(c.unidad), cx + 4, y + 7, { width: cols[2].w - 8, align: "center" });
      cx += cols[2].w;

      doc.text(safe(c.descripcion), cx + 6, y + 7, { width: cols[3].w - 12, align: "left" });
      cx += cols[3].w;

      doc.text(money(vu), cx + 4, y + 7, { width: cols[4].w - 8, align: "right" });
      cx += cols[4].w;

      doc.text(money(impIva), cx + 4, y + 7, { width: cols[5].w - 8, align: "right" });
      cx += cols[5].w;

      doc.text(money(imp), cx + 4, y + 7, { width: cols[6].w - 8, align: "right" });

      // líneas verticales
      let lx = startX;
      cols.forEach((cc) => {
        lx += cc.w;
        doc.moveTo(lx, y).lineTo(lx, y + rowH).stroke();
      });
      // línea horizontal
      doc.moveTo(startX, y + rowH).lineTo(startX + totalW, y + rowH).stroke();

      y += rowH;

      // si se alarga, por ahora solo nueva hoja simple
      if (y > 640) {
        doc.addPage();
        y = M;
      }
    });

    // ======================
    // TOTALES (derecha)
    // ======================
    const totalsY = y + 18;
    const totalsX = startX + totalW - 260;

    doc.font("Helvetica-Bold").fontSize(10);
    doc.text("SUBTOTAL", totalsX, totalsY, { width: 140, align: "right" });
    doc.text(money(subtotal), totalsX + 150, totalsY, { width: 110, align: "right" });

    doc.text(`IVA ${fmtPct(ivaRate)}`, totalsX, totalsY + 16, { width: 140, align: "right" });
    doc.font("Helvetica").text(money(iva), totalsX + 150, totalsY + 16, { width: 110, align: "right" });

    if (aplicarIsr) {
      doc.font("Helvetica-Bold").text(`Retencion ISR ${(isrRate * 100).toFixed(2)}%`, totalsX, totalsY + 32, {
        width: 140,
        align: "right",
      });
      doc.font("Helvetica").text(`- ${money(isr)}`, totalsX + 150, totalsY + 32, { width: 110, align: "right" });
    }

    doc.font("Helvetica-Bold").fontSize(11);
    doc.text("TOTAL", totalsX, totalsY + 56, { width: 140, align: "right" });
    doc.text(money(total), totalsX + 150, totalsY + 56, { width: 110, align: "right" });

    // Footer
    doc.font("Helvetica").fontSize(7).fillColor("#444");
    doc.text(
      "ESTE DOCUMENTO ES UNA VISTA PREVIA (SIN TIMBRADO CFDI 4.0).",
      M,
      PAGE_H - 35,
      { width: W, align: "center" }
    );
    doc.fillColor("black");

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
