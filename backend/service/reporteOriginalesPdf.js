const puppeteer = require('puppeteer');
const dayjs = require('dayjs');
require('dayjs/locale/es');
dayjs.locale('es');
const { dayjsFecha } = require('../utils/fechas');

function fmtFecha(iso) {
  return dayjsFecha(iso).format('DD-MMM-YY');
}

function fmtFechaLarga() {
  return dayjs().format('dddd, D [de] MMMM [de] YYYY');
}

function buildHtml(data, desde, hasta) {
  const filas = data.data
    .map(
      (o) => `
      <tr class="body-style">
        <td>${o.ordenServicio || ''}</td>
        <td>${o.nombre || ''}</td>
        <td>${o.telefono || ''}</td>
        <td>${o.serie || '---------'}</td>
        <td>${o.marca || ''}</td>
        <td>${o.tipo || ''}</td>
        <td>${o.asesor || ''}</td>
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

    /* ── ENCABEZADO ── */
    .header-table {
      width: 100%;
      border-collapse: collapse;
      border: 2px solid #000;
      margin-bottom: 8px;
    }
    .header-table td { padding: 5px 10px; }
    .cell-nombre { font-size: 16pt; font-weight: bold; border-bottom: 1px solid #000; }
    .cell-dir { font-size: 9pt; }

    /* ── TÍTULO + FECHAS ── */
    .titulo-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20px;
    }
    .titulo { font-size: 13pt; font-weight: bold; font-style: italic; }
    .fechas { text-align: right; font-size: 9pt; line-height: 1.7; }

    hr { border: none; border-top: 1px solid #000; margin: 5px 0 8px; }

    /* ── TABLA ── */
    table.data { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    table.data th {
      font-size: 8.5pt;
      font-weight: bold;
      border-bottom: 1px solid #000000;
      padding: 3px 4px;
      text-align: left;
    }
    table.data td { font-size: 8.5pt; padding: 2px 4px; }

    .total-clientes { font-size: 9pt; margin-top: 20px; font-weight: bold;}

    /* ── PIE ── */
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

    .body-style{
      border-bottom: .1px solid #35353590;
      padding: 4px;
    }

    @page { size: A4 portrait; margin: 14mm; }
  </style>
</head>
<body>

  <table class="header-table">
    <tr><td class="cell-nombre">SERVICOMPACTOS DE JUAREZ</td></tr>
    <tr><td class="cell-dir">PASEO TRIUNFO DE LA REPÚBLICA #322&nbsp;&nbsp;SAN LORENZO</td></tr>
  </table>

  <div class="titulo-row">
    <div class="titulo">Reporte De Originales</div>
    <div class="fechas">
      <div><strong>Desde:</strong>&nbsp;${fmtFecha(desde)}</div>
      <div><strong>Hasta:</strong>&nbsp;${fmtFecha(hasta)}</div>
    </div>
  </div>
  

  <table class="data">
    <thead>
      <tr>
        <th>No Orden</th>
        <th>Nombre</th>
        <th>Telefono</th>
        <th>No. Serie</th>
        <th>Marca</th>
        <th>Tipo</th>
        <th>Asesor</th>
      </tr>
    </thead>
    <tbody>${filas}</tbody>
  </table>

  <div class="total-clientes">Total de Clientes: ${data.total}</div>

  <div class="pie">
    <span>${fmtFechaLarga()}</span>
    <span>Page 1 of 1</span>
  </div>

</body>
</html>`;
}

async function streamReporteOriginalesPdf(res, data, desde, hasta) {
  const html = buildHtml(data, desde, hasta);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '13mm', bottom: '13mm', left: '13mm', right: '13mm' },
  });

  await browser.close();

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="reporte_originales.pdf"');
  res.send(pdfBuffer);
}

module.exports = { streamReporteOriginalesPdf };
