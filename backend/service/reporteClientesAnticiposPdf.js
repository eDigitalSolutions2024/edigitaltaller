// Reporte de Clientes con Anticipos: fotografía del saldo a favor actual de
// cada cliente (no es un rango de fechas, es un balance). Mismo formato
// general que reportePendientesFacturaPdf.js.
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

function buildHtml(resultado) {
  const filas = resultado.data
    .map(
      (it) => `
      <tr>
        <td>${esc(it.cliente)}</td>
        <td>${esc(it.telefono)}</td>
        <td>${fmtFecha(it.ultimoMovimiento)}</td>
        <td class="num">${fmtMoney(it.saldoAFavor)}</td>
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
      gap: 24px;
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

    @page { size: A4; margin: 14mm; }
  </style>
</head>
<body>

  <table class="header-table">
    <tr><td class="cell-nombre">SERVICOMPACTOS DE JUAREZ</td></tr>
    <tr><td class="cell-dir">PASEO TRIUNFO DE LA REPÚBLICA #322&nbsp;&nbsp;SAN LORENZO</td></tr>
  </table>

  <div class="titulo-row">
    <div class="titulo">Reporte de Clientes con Anticipos</div>
    <div class="fechas">
      <div><strong>Al día:</strong>&nbsp;${fmtFecha(new Date())}</div>
    </div>
  </div>

  ${
    resultado.data.length
      ? `<table class="data">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Teléfono</th>
              <th>Último Movimiento</th>
              <th class="num">Saldo a Favor</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>`
      : '<p style="font-size:9pt;">No hay clientes con saldo a favor actualmente.</p>'
  }

  <div class="gran-total">
    <span>Clientes: ${resultado.total}</span>
    <span>Saldo total: ${fmtMoney(resultado.totalSaldo)}</span>
  </div>

  <div class="pie">
    <span>${fmtFechaLarga()}</span>
    <span>Reporte de Clientes con Anticipos — Cajas</span>
  </div>

</body>
</html>`;
}

async function streamReporteClientesAnticiposPdf(res, resultado) {
  const html = buildHtml(resultado);

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
  res.setHeader('Content-Disposition', 'inline; filename="reporte_clientes_anticipos.pdf"');
  res.send(pdfBuffer);
}

module.exports = { streamReporteClientesAnticiposPdf };
