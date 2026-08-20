// Genera el PDF de una versión puntual del Contrato de Orden de Servicio
// (usado desde el historial en Configuración: "Ver / Descargar PDF").
const puppeteer = require('puppeteer');
const { dayjsFecha } = require('../utils/fechas');
const { CONTRATO_CSS, buildContratoBodyHtml } = require('../utils/contratoOrdenServicioHtml');

function buildHtml(contrato) {
  const fechaVersion = contrato?.createdAt
    ? dayjsFecha(contrato.createdAt).format('DD/MM/YYYY HH:mm')
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Contrato de Orden de Servicio</title>
<style>
  * { box-sizing: border-box; font-family: Arial, sans-serif; }
  body { margin: 0; padding: 0; font-size: 10px; color: #000; }
  .page3 { width: 210mm; padding: 14mm 16mm; margin: 0 auto; }
  .version-info { font-size: 9px; color: #666; text-align: right; margin-bottom: 10px; }
${CONTRATO_CSS}
</style>
</head>
<body>
<div class="page3">
  ${fechaVersion ? `<div class="version-info">Versión vigente desde: ${fechaVersion}</div>` : ''}
  ${buildContratoBodyHtml(contrato)}
</div>
</body>
</html>`;
}

async function streamContratoOrdenServicioPdf(res, contrato) {
  const html = buildHtml(contrato);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
  });

  await browser.close();

  const fechaArchivo = contrato?.createdAt
    ? dayjsFecha(contrato.createdAt).format('YYYYMMDD_HHmm')
    : 'version';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="contrato_orden_servicio_${fechaArchivo}.pdf"`
  );
  res.send(pdfBuffer);
}

module.exports = { streamContratoOrdenServicioPdf };
