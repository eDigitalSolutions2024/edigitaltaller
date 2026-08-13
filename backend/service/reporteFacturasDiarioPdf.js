// Reporte Diario de Ingresos - Facturas: replica el formato clásico de 9
// columnas del reporte en papel del sistema anterior (Venta del Día /
// Contado / Crédito / Anticipo / Cuentas por Cobrar), en una sola tabla
// dividida en 6 secciones separadas por bandas grises sin título (Anticipos /
// Anticipos cancelados / Complementos de pago / Notas de crédito / Facturas /
// Factura general), a partir de los datos ya agregados por
// buildReporteFacturasDiario en routes/reportes.js. Los montos van en estilo
// contable como el original: sin símbolo de moneda, negativos entre
// paréntesis y ceros como "-". Debajo de TOTAL INGRESO se agrega la tabla
// DEPÓSITO (Cheques / Transferencias / Tarjetas C/D / Efectivo).
const puppeteer = require('puppeteer');
const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');
require('dayjs/locale/es');
dayjs.locale('es');
const { dayjsFecha } = require('../utils/fechas');

let LOGO_DATA_URL = '';
try {
  const logoPath = path.join(__dirname, '../../frontend/public/images/logo_servicompactos.png');
  LOGO_DATA_URL = `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;
} catch (e) {
  console.warn('[reporteFacturasDiarioPdf] Logo no encontrado:', e.message);
}

function fmtFechaLarga(iso) {
  return dayjsFecha(iso).format('dddd, D [de] MMMM [de] YYYY');
}

function fmtFechaCorta(iso) {
  return dayjsFecha(iso).format('DD/MM/YYYY');
}

// Siempre 2 decimales, truncados (no redondeados): se limpia el ruido de
// flotantes más allá de la millonésima y luego se corta en el 2do decimal
// sin ajustar el dígito de más (2099.9952 -> 2099.99, no 2100.00).
function fmtMoney(n) {
  const v = Math.round((Number(n) || 0) * 1e6) / 1e6;
  const [intPart, decPart = ''] = Math.abs(v).toFixed(6).split('.');
  const decimals = decPart.slice(0, 2);
  const abs = `${new Intl.NumberFormat('es-MX').format(Number(intPart))}.${decimals}`;
  return v < 0 ? `(${abs})` : abs;
}

// Celda de fila: vacía si no aplica, "-" si el movimiento existe pero fue de 0
function fmtCelda(n) {
  if (n === undefined || n === null) return '';
  return Number(n) === 0 ? '-' : fmtMoney(n);
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

function fila(r, folioDefault) {
  return `
    <tr class="body-style">
      <td class="cen">${esc(r.folio ?? folioDefault ?? '')}</td>
      <td class="cen">${esc(r.ordenServicio)}</td>
      <td class="cliente">${esc(r.cliente)}</td>
      <td class="num">${fmtCelda(r.ventaDia)}</td>
      <td class="num">${fmtCelda(r.ingresoContado)}</td>
      <td class="num">${fmtCelda(r.ingresoCredito)}</td>
      <td class="num">${fmtCelda(r.anticipo)}</td>
      <td class="num">${fmtCelda(r.cuentasPorCobrar)}</td>
      <td class="notas">${esc(r.notas)}</td>
    </tr>`;
}

// Sección sin título, precedida por una banda gris como en el reporte original.
function banda(filas, folioDefault) {
  if (!filas.length) return '';
  return `
    <tr class="sep"><td colspan="9"></td></tr>
    ${filas.map((r) => fila(r, folioDefault)).join('')}`;
}

const DEPOSITO_LABELS = [
  ['cheques', 'CHEQUES'],
  ['transferencias', 'TRANSFERENCIAS'],
  ['tarjetasCD', 'TARJETAS C/D'],
  ['efectivo', 'EFECTIVO'],
];

function buildHtml(data, desde, hasta) {
  const {
    anticipos = [],
    anticiposCancelados = [],
    complementosPago = [],
    notasCredito = [],
    facturas = [],
    facturaGeneral = [],
    totales = {},
    deposito = {},
  } = data;

  const cuerpo = [
    banda(anticipos, 'ANT'),
    banda(anticiposCancelados, 'ANT'),
    banda(complementosPago),
    banda(notasCredito),
    banda(facturas),
    banda(facturaGeneral),
  ].join('');

  const sinDatos =
    !anticipos.length &&
    !anticiposCancelados.length &&
    !complementosPago.length &&
    !notasCredito.length &&
    !facturas.length &&
    !facturaGeneral.length;

  const filasDeposito = DEPOSITO_LABELS.map(
    ([key, label]) => `
      <tr>
        <td>${label}</td>
        <td class="text-end">${fmtTotal(deposito[key])}</td>
      </tr>`
  ).join('');

  const subtitulo = mismoDia(desde, hasta)
    ? fmtFechaLarga(desde)
    : `Del ${fmtFechaCorta(desde)} al ${fmtFechaCorta(hasta)}`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 9pt; color: #000; padding-bottom: 12mm; }

    /* ── LOGO (solo primera hoja) ── */
    .marca { width: fit-content; text-align: center; margin-bottom: 6px; }
    .marca img { height: 12mm; display: block; margin: 0 auto; }
    .marca .matriz{
      font-size: 10pt;
      letter-spacing: 1px;
      margin-top: 3px;
      font-style: italic;
      background: #b8b8b8;
      }
    .marca-txt {
      font-size: 13pt;
      font-weight: bold;
      color: #1f4e79;
      }

    /* ── TABLA ── */
    table.data { width: 100%; border-collapse: collapse; }
    table.data th, table.data td { border: 1px solid #666; padding: 2px 4px; }
    table.data tr { page-break-inside: avoid; }

    thead .fecha th { font-size: 12pt; font-weight: bold; text-align: center; padding: 4px; }
    thead .cols th {
      font-size: 8.5pt;
      font-weight: bold;
      text-align: center;
      vertical-align: middle;
      padding: 2px 3px;
    }

    .c-folio { width: 6%; }
    .c-orden { width: 7%; }
    .c-cliente { width: 30%; }
    .c-num { width: 8.5%; }
    .c-notas { width: 13%; }

    td.cen { text-align: center; }
    td.num { text-align: right; white-space: nowrap; }
    td.cliente { text-transform: uppercase; }
    td.notas { font-size: 8pt; text-align: center; text-transform: uppercase; }

    tr.sep td { background: #b8b8b8; height: 7px; padding: 0; }

    /* ── TOTALES ── */
    .fila-totales td { font-weight: bold; }
    .fila-totales .label { text-align: center; font-size: 10pt; }
    .fila-total-ingreso td.vacio { border: none; }
    .fila-total-ingreso .ti-label {
      font-weight: bold;
      font-size: 10pt;
      text-align: center;
      border: 2px solid #000;
    }
    .fila-total-ingreso .ti-valor { font-weight: bold; font-size: 10pt; border: 2px solid #000; }

    /* ── DEPÓSITO ── */
    .deposito { width: 45%; margin-top: 10px; }
    .deposito table.data thead td {
      background: #444;
      color: #fff;
      font-size: 8.5pt;
      font-weight: bold;
      padding: 4px 6px;
    }
    .deposito table.data tbody td { font-size: 8.5pt; padding: 3px 6px; }
    .deposito table.data tfoot td {
      font-size: 8.5pt;
      font-weight: bold;
      padding: 4px 6px;
      background: #eee;
    }
    .text-end { text-align: right; }

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

  <div class="marca">
    ${LOGO_DATA_URL ? `<img src="${LOGO_DATA_URL}" />` : '<span class="marca-txt">Servi compactos</span>'}
    <div class="matriz">Matriz</div>
  </div>

  <table class="data">
    <thead>
      <tr class="fecha"><th colspan="9">${esc(subtitulo)}</th></tr>
      <tr class="cols">
        <th class="c-folio">No.<br>Fact</th>
        <th class="c-orden">No.<br>Orden</th>
        <th class="c-cliente">Nombre del cliente</th>
        <th class="c-num">Venta del<br>día</th>
        <th class="c-num">Ingreso de<br>contado</th>
        <th class="c-num">Ingreso de<br>crédito</th>
        <th class="c-num">Anticipo</th>
        <th class="c-num">Cuentas<br>por cobrar</th>
        <th class="c-notas">Notas</th>
      </tr>
    </thead>
    <tbody>
      ${cuerpo}
      ${cuerpo ? '<tr class="sep"><td colspan="9"></td></tr>' : ''}
      <tr class="fila-totales">
        <td colspan="3" class="label">TOTALES</td>
        <td class="num">${fmtTotal(totales.totalVentaDia)}</td>
        <td class="num">${fmtTotal(totales.totalContado)}</td>
        <td class="num">${fmtTotal(totales.totalCredito)}</td>
        <td class="num">${fmtTotal(totales.totalAnticipo)}</td>
        <td class="num">${fmtTotal(totales.totalPorCobrar)}</td>
        <td></td>
      </tr>
      <tr class="fila-total-ingreso">
        <td colspan="3" class="vacio"></td>
        <td colspan="2" class="ti-label">TOTAL INGRESO</td>
        <td colspan="3" class="num ti-valor">${fmtMoney(totales.totalIngreso)}</td>
        <td class="vacio"></td>
      </tr>
    </tbody>
  </table>

  ${sinDatos ? '<p style="font-size:9pt; margin-top:6px;">No se encontraron movimientos de Facturas en el período seleccionado.</p>' : ''}

  <div class="deposito">
    <table class="data">
      <thead><tr><td colspan="2">DEPÓSITO</td></tr></thead>
      <tbody>${filasDeposito}</tbody>
      <tfoot><tr><td>TOTAL</td><td class="text-end">${fmtMoney(deposito.total)}</td></tr></tfoot>
    </table>
  </div>

  <div class="pie">
    <span>${fmtFechaLarga(new Date().toISOString())}</span>
    <span>Reporte Diario de Ingresos - Facturas</span>
  </div>

</body>
</html>`;
}

async function streamReporteFacturasDiarioPdf(res, data, desde, hasta) {
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
  res.setHeader('Content-Disposition', 'inline; filename="reporte_facturas_diario.pdf"');
  res.send(pdfBuffer);
}

module.exports = { streamReporteFacturasDiarioPdf };
