// Reporte de Pendientes de Factura: órdenes marcadas en Cajas como
// "Pendiente de Factura" (al cliente le faltaron datos fiscales) dentro del
// período seleccionado (según fecha en que se marcaron). Mismo formato
// general que el Reporte de Horas por Técnico.
const puppeteer = require('puppeteer');
const dayjs = require('dayjs');
require('dayjs/locale/es');
dayjs.locale('es');
const { dayjsFecha } = require('../utils/fechas');

function fmtFecha(iso) {
  return iso ? dayjsFecha(iso).format('DD-MMM-YY') : '';
}

function fmtFechaLarga() {
  return dayjs().format('dddd, D [de] MMMM [de] YYYY');
}

function fmtMoney(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildHtml(resultado, desde, hasta) {
  const filas = resultado.data
    .map(
      (it) => `
      <tr>
        <td>${esc(it.ordenServicio)}</td>
        <td>${esc(it.cliente)}</td>
        <td>${esc(it.marca)} ${esc(it.modelo)}</td>
        <td>${esc(it.serie)}</td>
        <td>${fmtFecha(it.fechaCierre)}</td>
        <td>${fmtFecha(it.pendienteFacturaEn)}</td>
        <td>${esc(it.pendienteFacturaPor)}</td>
        <td class="num">${fmtMoney(it.total)}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 10pt; color: #000; padding: 0 0 20mm; }

    .header-table {
      width: 100%;
      border-collapse: collapse;
      border: 2px solid #000;
      margin-bottom: 8px;
    }
    .header-table td { padding: 5px 10px; }
    .cell-nombre { font-size: 16pt; font-weight: bold; border-bottom: 1px solid #000; }
    .cell-dir { font-size: 9pt; }

    .titulo-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 5px;
    }
    .titulo { font-size: 13pt; font-weight: bold; font-style: italic; }
    .fechas { text-align: right; font-size: 9pt; line-height: 1.7; }

    table.data { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
    table.data th {
      font-size: 8pt;
      font-weight: bold;
      border-bottom: 1px solid #555;
      padding: 3px 4px;
      text-align: left;
    }
    table.data td { font-size: 8pt; padding: 3px 4px; vertical-align: top; }
    table.data .num { text-align: right; white-space: nowrap; }

    .gran-total {
      display: flex;
      justify-content: flex-end;
      margin-top: 12px;
      padding-top: 6px;
      border-top: 1px solid #000;
      font-size: 10pt;
      font-weight: bold;
    }

    .pie {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      display: flex;
      justify-content: space-between;
      font-size: 8pt;
      border-top: 1px solid #aaa;
      padding-top: 3px;
    }

    @page { size: A4 landscape; margin: 14mm; }
  </style>
</head>
<body>

  <table class="header-table">
    <tr><td class="cell-nombre">SERVICOMPACTOS DE JUAREZ</td></tr>
    <tr><td class="cell-dir">PASEO TRIUNFO DE LA REPÚBLICA #322&nbsp;&nbsp;SAN LORENZO</td></tr>
  </table>

  <div class="titulo-row">
    <div class="titulo">Reporte de Pendientes de Factura</div>
    <div class="fechas">
      <div><strong>Desde:</strong>&nbsp;${fmtFecha(desde)}</div>
      <div><strong>Hasta:</strong>&nbsp;${fmtFecha(hasta)}</div>
    </div>
  </div>

  ${
    resultado.data.length
      ? `<table class="data">
          <thead>
            <tr>
              <th>No. Orden</th>
              <th>Cliente</th>
              <th>Marca / Modelo</th>
              <th>No. Serie</th>
              <th>Fecha Cierre</th>
              <th>Marcada Pendiente</th>
              <th>Marcada Por</th>
              <th class="num">Total</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>`
      : '<p style="font-size:9pt;">No se encontraron órdenes pendientes de factura en el período seleccionado.</p>'
  }

  <div class="gran-total">
    <span>Órdenes pendientes: ${resultado.total}</span>
  </div>

  <div class="pie">
    <span>${fmtFechaLarga()}</span>
    <span>Reporte de Pendientes de Factura — Cajas</span>
  </div>

</body>
</html>`;
}

async function streamReportePendientesFacturaPdf(res, resultado, desde, hasta) {
  const html = buildHtml(resultado, desde, hasta);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });

  const pdfBuffer = await page.pdf({
    format: 'A4',
    landscape: true,
    printBackground: true,
    margin: { top: '13mm', bottom: '13mm', left: '13mm', right: '13mm' },
  });

  await browser.close();

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="reporte_pendientes_factura.pdf"');
  res.send(pdfBuffer);
}

module.exports = { streamReportePendientesFacturaPdf };
