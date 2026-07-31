// Reporte Diario de Ingresos - Remisiones: replica el formato clásico de 9
// columnas del reporte en papel del sistema anterior (Venta del Día /
// Contado / Crédito / Anticipo / Cuentas por Cobrar), en una sola tabla
// dividida en 4 secciones (Anticipos / Canceladas y pasan a factura / Abonos
// y liquidaciones / Nueva venta del día), a partir de los datos ya agregados
// por buildReporteRemisionesDiario en routes/reportes.js.
const puppeteer = require('puppeteer');
const dayjs = require('dayjs');
require('dayjs/locale/es');
dayjs.locale('es');
const { dayjsFecha } = require('../utils/fechas');

function fmtFechaLarga(iso) {
  return dayjsFecha(iso).format('dddd, D [de] MMMM [de] YYYY');
}

function fmtFechaCorta(iso) {
  return dayjsFecha(iso).format('DD/MM/YYYY');
}

function fmtMoney(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n) || 0);
}

// Celda de fila: vacía si no aplica (en vez de "$0.00")
function fmtCelda(n) {
  return n === undefined || n === null ? '' : fmtMoney(n);
}

// Celda de totales: "-" cuando es cero, igual que el reporte original
function fmtTotal(n) {
  return Number(n) === 0 ? '-' : fmtMoney(n);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function mismoDia(desde, hasta) {
  return dayjsFecha(desde).format('YYYY-MM-DD') === dayjsFecha(hasta).format('YYYY-MM-DD');
}

function fila(r) {
  return `
    <tr class="body-style">
      <td>${r.folio ?? ''}</td>
      <td>${esc(r.ordenServicio)}</td>
      <td>${esc(r.cliente)}</td>
      <td class="num">${fmtCelda(r.ventaDia)}</td>
      <td class="num">${fmtCelda(r.ingresoContado)}</td>
      <td class="num">${fmtCelda(r.ingresoCredito)}</td>
      <td class="num">${fmtCelda(r.anticipo)}</td>
      <td class="num">${fmtCelda(r.cuentasPorCobrar)}</td>
      <td class="obs">${esc(r.notas)}</td>
    </tr>`;
}

function banda(titulo, filas) {
  if (!filas.length) return '';
  return `
    <tr class="banda-header"><td colspan="9">${titulo}</td></tr>
    ${filas.map(fila).join('')}`;
}

function buildHtml(data, desde, hasta) {
  const { anticipos = [], canceladas = [], abonos = [], nuevaVenta = [], totales = {} } = data;

  const cuerpo = [
    banda('Anticipos', anticipos),
    banda('Canceladas y pasan a factura', canceladas),
    banda('Abonos y liquidaciones', abonos),
    banda('Nueva venta del día', nuevaVenta),
  ].join('');

  const sinDatos = !anticipos.length && !canceladas.length && !abonos.length && !nuevaVenta.length;

  const subtitulo = mismoDia(desde, hasta)
    ? fmtFechaLarga(desde)
    : `Del ${fmtFechaCorta(desde)} al ${fmtFechaCorta(hasta)}`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 10pt; color: #000; padding: 0 0 20mm; }

    /* ── TÍTULO ── */
    .titulo-central { text-align: center; margin-bottom: 14px; }
    .titulo { font-size: 14pt; font-weight: bold; }
    .subtitulo { font-size: 11pt; margin-top: 2px; }

    /* ── TABLA ── */
    table.data { 
      width: 100%; 
      border-collapse: collapse; 
      margin-bottom: 10px; 
      border: 1px solid #555;
    
    }

    table.data th {
      font-size: 8pt;
      font-weight: bold;
      border: 1px solid #555;
      padding: 3px 4px;
      text-align: left;
    }
    table.data td { font-size: 8.5pt; padding: 3px 4px; vertical-align: top; }
    table.data .num { text-align: right; white-space: nowrap; }
    table.data .obs { width: 20%; }
    .body-style td { border: 1px solid #35353590; }

    .banda-header td {
      font-weight: bold;
      font-size: 9.5pt;
      background: #dcdcdc;
      padding: 4px 6px;
    }

    /* ── TOTALES ── */
    table.totales { width: 100%; border-collapse: collapse; margin-top: 8px; }
    table.totales td { font-size: 9pt; padding: 4px 6px; border-top: 2px solid #000; }
    table.totales .num { text-align: right; white-space: nowrap; }
    table.totales .label { font-weight: bold; }
    .total-ingreso {
      display: flex;
      justify-content: space-between;
      margin-top: 6px;
      padding: 5px 6px;
      background: #dcdcdc;
      font-size: 10.5pt;
      font-weight: bold;
    }

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

    @page { size: A4 landscape; margin: 14mm; }
  </style>
</head>
<body>

  <div class="titulo-central">
    <div class="titulo">Reporte diario de ingresos</div>
    <div class="subtitulo">${esc(subtitulo)}</div>
  </div>

  <table class="data">
    <thead>
      <tr>
        <th>No. Rem</th>
        <th>No. Orden</th>
        <th>Nombre del cliente</th>
        <th class="num">Venta del día</th>
        <th class="num">Ingreso de contado</th>
        <th class="num">Ingreso de crédito</th>
        <th class="num">Anticipo</th>
        <th class="num">Cuentas por cobrar</th>
        <th class="obs">Notas</th>
      </tr>
    </thead>
    <tbody>
      ${cuerpo || ''}
    </tbody>
  </table>

  ${sinDatos ? '<p style="font-size:9pt;">No se encontraron movimientos de Remisiones en el período seleccionado.</p>' : ''}

  <table class="totales">
    <tr>
      <td class="label" colspan="3">TOTALES</td>
      <td class="num">${fmtTotal(totales.totalVentaDia)}</td>
      <td class="num">${fmtTotal(totales.totalContado)}</td>
      <td class="num">${fmtTotal(totales.totalCredito)}</td>
      <td class="num">${fmtTotal(totales.totalAnticipo)}</td>
      <td class="num">${fmtTotal(totales.totalPorCobrar)}</td>
      <td></td>
    </tr>
  </table>

  <div class="total-ingreso">
    <span>TOTAL INGRESO</span>
    <span>${fmtMoney(totales.totalIngreso)}</span>
  </div>

  <div class="pie">
    <span>${fmtFechaLarga(new Date().toISOString())}</span>
    <span>Reporte Diario de Ingresos - Remisiones</span>
  </div>

</body>
</html>`;
}

async function streamReporteRemisionesDiarioPdf(res, data, desde, hasta) {
  const html = buildHtml(data, desde, hasta);

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
  res.setHeader('Content-Disposition', 'inline; filename="reporte_remisiones_diario.pdf"');
  res.send(pdfBuffer);
}

module.exports = { streamReporteRemisionesDiarioPdf };
