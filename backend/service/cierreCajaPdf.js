// Cierre de Caja: réplica en PDF del formato en papel que se llena a mano
// cada día (conteo de billetes/monedas, terminales, dólares y vales).
const puppeteer = require('puppeteer');
const dayjs = require('dayjs');
require('dayjs/locale/es');
dayjs.locale('es');
const { dayjsFecha } = require('../utils/fechas');
const { calcularTotalesCierre } = require('../utils/cierreCajaTotales');

const TERMINALES_LABELS = [
  ['bancomer', 'TERMINAL BANCOMER'],
  ['banregio', 'TERMINAL BANREGIO'],
  ['banamex', 'TERMINAL BANAMEX'],
  ['americanExpress', 'TERMINAL A. EXPRESS'],
  ['cheques', 'CHEQUES'],
  ['transferencias', 'TRANSFERENCIAS'],
];

function fmtFechaLarga(fecha) {
  return dayjsFecha(fecha).format('dddd, D [de] MMMM [de] YYYY');
}

function fmtMoney(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n) || 0);
}

function fmtCantidad(n) {
  const v = Number(n) || 0;
  return v === 0 ? '-' : v.toLocaleString('es-MX');
}

function fmtSubtotal(n) {
  const v = Number(n) || 0;
  return v === 0 ? '-' : fmtMoney(v);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function filasConteo(items) {
  return (items || [])
    .map(
      (it) => `
      <tr>
        <td>${fmtMoney(it.denominacion)}</td>
        <td class="text-end">${fmtCantidad(it.cantidad)}</td>
        <td class="text-end">${fmtSubtotal(Number(it.denominacion || 0) * Number(it.cantidad || 0))}</td>
      </tr>`
    )
    .join('');
}

function buildHtml(cierre, totales) {
  const filasBilletes = filasConteo(cierre.billetes);
  const filasMonedas = filasConteo(cierre.monedas);

  const filasTerminales = TERMINALES_LABELS.map(
    ([key, label]) => `
      <tr>
        <td>${label}</td>
        <td class="text-end">${fmtSubtotal(cierre.terminales?.[key])}</td>
      </tr>`
  ).join('');

  const filasVales = (cierre.vales || [])
    .map(
      (v) => `
      <tr>
        <td>${esc(v.folio)}</td>
        <td class="text-end">${fmtSubtotal(v.monto)}</td>
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
      margin-bottom: 14px;
    }
    .titulo { font-size: 13pt; font-weight: bold; font-style: italic; }
    .fecha-cierre { text-align: right; font-size: 9pt; text-transform: capitalize; }

    .cols { display: flex; gap: 14px; }
    .col { flex: 1; }

    table.data { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    table.data thead td, table.data thead th {
      background: #444;
      color: #fff;
      font-size: 8.5pt;
      font-weight: bold;
      padding: 4px 6px;
      text-align: left;
    }
    table.data tbody td {
      font-size: 8.5pt;
      padding: 3px 6px;
      border: 1px solid #999;
    }
    table.data tfoot td {
      font-size: 8.5pt;
      font-weight: bold;
      padding: 4px 6px;
      border: 1px solid #999;
      background: #eee;
    }
    .text-end { text-align: right; }

    .box {
      border: 1px solid #999;
      margin-bottom: 10px;
    }
    .box-titulo {
      background: #444;
      color: #fff;
      font-size: 8.5pt;
      font-weight: bold;
      padding: 4px 6px;
    }
    .box-valor {
      font-size: 11pt;
      font-weight: bold;
      padding: 6px;
      text-align: right;
    }
    .box-valor.diferencia-positiva { color: #146c2e; }
    .box-valor.diferencia-negativa { color: #b02a2a; }

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

    @page { size: A4 portrait; margin: 14mm; }
  </style>
</head>
<body>

  <table class="header-table">
    <tr><td class="cell-nombre">SERVICOMPACTOS DE JUAREZ</td></tr>
    <tr><td class="cell-dir">PASEO TRIUNFO DE LA REPÚBLICA #322&nbsp;&nbsp;SAN LORENZO</td></tr>
  </table>

  <div class="titulo-row">
    <div class="titulo">Cierre de Caja</div>
    <div class="fecha-cierre">${fmtFechaLarga(cierre.fecha)}</div>
  </div>

  <div class="cols">
    <div class="col">
      <table class="data">
        <thead><tr><td colspan="3">BILLETES</td></tr></thead>
        <tbody>${filasBilletes}</tbody>
        <tfoot><tr><td colspan="2">TOTAL</td><td class="text-end">${fmtMoney(totales.totalBilletes)}</td></tr></tfoot>
      </table>

      <table class="data">
        <thead><tr><td colspan="2">TERMINALES</td></tr></thead>
        <tbody>${filasTerminales}</tbody>
        <tfoot><tr><td>TOTAL</td><td class="text-end">${fmtMoney(totales.totalTerminales)}</td></tr></tfoot>
      </table>

      <div class="box">
        <div class="box-titulo">TOTAL COBRADO</div>
        <div class="box-valor">${fmtMoney(totales.totalCobrado)}</div>
      </div>

      <div class="box">
        <div class="box-titulo">TOTAL REPORTES</div>
        <div class="box-valor">${fmtMoney(cierre.totalReportes)}</div>
      </div>

      <div class="box">
        <div class="box-titulo">FONDO DE CAJA</div>
        <div class="box-valor">${fmtMoney(cierre.fondoCaja)}</div>
      </div>

      <div class="box">
        <div class="box-titulo">DIFERENCIA</div>
        <div class="box-valor ${totales.diferencia >= 0 ? 'diferencia-positiva' : 'diferencia-negativa'}">${fmtMoney(totales.diferencia)}</div>
      </div>
    </div>

    <div class="col">
      <table class="data">
        <thead><tr><td colspan="3">MONEDAS</td></tr></thead>
        <tbody>${filasMonedas}</tbody>
        <tfoot><tr><td colspan="2">TOTAL</td><td class="text-end">${fmtMoney(totales.totalMonedas)}</td></tr></tfoot>
      </table>

      <table class="data">
        <thead><tr><td colspan="2">DÓLARES</td></tr></thead>
        <tbody>
          <tr><td>Cantidad</td><td class="text-end">${fmtSubtotal(cierre.dolares?.cantidad)}</td></tr>
          <tr><td>T.C.</td><td class="text-end">${cierre.dolares?.tipoCambio ? Number(cierre.dolares.tipoCambio).toFixed(4) : '-'}</td></tr>
        </tbody>
        <tfoot><tr><td>TOTAL</td><td class="text-end">${fmtMoney(totales.totalDolares)}</td></tr></tfoot>
      </table>

      <table class="data">
        <thead><tr><td colspan="2">VALES</td></tr></thead>
        <tbody>${filasVales}</tbody>
        <tfoot><tr><td>TOTAL</td><td class="text-end">${fmtMoney(totales.totalVales)}</td></tr></tfoot>
      </table>
    </div>
  </div>

  <div class="pie">
    <span>${fmtFechaLarga(dayjs().toISOString())} — Capturado por: ${esc(cierre.capturadoPor)}</span>
    <span>Page 1 of 1</span>
  </div>

</body>
</html>`;
}

async function streamCierreCajaPdf(res, cierre) {
  const totales = calcularTotalesCierre(cierre);
  const html = buildHtml(cierre, totales);

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
  res.setHeader('Content-Disposition', 'inline; filename="cierre_caja.pdf"');
  res.send(pdfBuffer);
}

module.exports = { streamCierreCajaPdf };
