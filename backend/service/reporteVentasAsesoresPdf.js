const puppeteer = require('puppeteer');
const dayjs = require('dayjs');
require('dayjs/locale/es');
dayjs.locale('es');

function fmt(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0);
}

function fmtFecha(iso) {
  return dayjs(iso).format('DD-MMM-YY');
}

function fmtFechaLarga() {
  return dayjs().format('dddd, D [de] MMMM [de] YYYY');
}

function buildHtml(resultado, desde, hasta) {
  const grupos = resultado.data
    .map((grupo) => {
      const filas = grupo.ordenes
        .map(
          (o) => `
          <tr class="body-style">
            <td>${o.ordenServicio || ''}</td>
            <td>${o.nombreCliente || ''}</td>
            <td>${o.marca || ''}</td>
            <td>${o.tipo || ''}</td>
            <td class="text-right">${fmt(o.importe)}</td>
          </tr>`
        )
        .join('');

      return `
        <div class="asesor-header">Asesor: ${grupo.asesor}</div>
        <table class="data">
          <thead>
            <tr>
              <th>No Orden</th>
              <th>Nombre</th>
              <th>Marca</th>
              <th>Tipo</th>
              <th class="text-right">Importe</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
          <tfoot>
            <tr class="subtotal-row">
              <td colspan="2" style="font-style:italic; font-weight:bold;">Total de Ordenes: ${grupo.ordenes.length}</td>
              <td colspan="2" class="text-right" style="font-style:italic; font-weight:bold;">Total por Asesor</td>
              <td class="text-right" style="font-weight:bold;">${fmt(grupo.totalAsesor)}</td>
            </tr>
          </tfoot>
        </table>`;
    })
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

    /* ── TABLAS ── */
    table.data { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
    table.data th {
      font-size: 8.5pt;
      font-weight: bold;
      border-bottom: 1px solid #555;
      padding: 3px 4px;
      text-align: left;
    }
    table.data td { font-size: 8.5pt; padding: 2px 4px; }
    .text-right { text-align: right; }

    /* ── GRUPOS ASESOR ── */
    .asesor-header {
      font-weight: bold;
      font-style: italic;
      font-size: 10pt;
      margin-top: 20px;
      margin-bottom: 3px;
      border-bottom: 1px solid #000;
    }
    .subtotal-row td { 
      font-size: 9pt;
      // border-top: 1px solid #000; 
    }

    /* ── GRAN TOTAL ── */
    .gran-total {
      display: flex;
      justify-content: flex-end;
      gap: 30px;
      margin-top: 12px;
      padding-top: 6px;
      border-top: 1px solid #000;
      font-size: 10pt;
    }
    .gran-total .label { font-style: italic; font-weight: bold; font-size: 9pt; }

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

    /* tr ordenes */
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
    <div class="titulo">Reporte de Ventas (Asesores)</div>
    <div class="fechas">
      <div><strong>Desde:</strong>&nbsp;${fmtFecha(desde)}</div>
      <div><strong>Hasta:</strong>&nbsp;${fmtFecha(hasta)}</div>
    </div>
  </div>
  

  ${grupos}

  <div class="gran-total">
    <span class="label">Total de Ordenes: ${resultado.totalOrdenes}</span>
    <span><strong>Gran Total:</strong>&nbsp;&nbsp;${fmt(resultado.totalGeneral)}</span>
  </div>

  <div class="pie">
    <span>${fmtFechaLarga()}</span>
    <span>Page 1 of 1</span>
  </div>

</body>
</html>`;
}

async function streamReporteVentasAsesoresPdf(res, resultado, desde, hasta) {
  const html = buildHtml(resultado, desde, hasta);

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
  res.setHeader('Content-Disposition', 'inline; filename="reporte_ventas_asesores.pdf"');
  res.send(pdfBuffer);
}

module.exports = { streamReporteVentasAsesoresPdf };
