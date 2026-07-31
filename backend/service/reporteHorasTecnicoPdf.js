// Reporte de Recursos Humanos: Horas trabajadas por técnico.
// Agrupa por técnico las asignaciones de mano de obra de órdenes en el
// período (filtrado por fecha de recepción), pudiendo incluir órdenes
// cerradas, abiertas o todas. Mismo formato general que el reporte de C x C.
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

function chk(v) {
  return v ? '&#9745;' : '&#9744;';
}

const ESTADO_LABEL = { cerradas: 'Cerradas', abiertas: 'Abiertas', todas: 'Todas' };

function buildHtml(resultado, desde, hasta, estado) {
  const grupos = resultado.data
    .map((grupo) => {
      const filas = grupo.items
        .map(
          (it) => `
          <tr class="body-style">
            <td>${esc(it.ordenServicio)}</td>
            <td>${fmtFecha(it.fechaOrden)}</td>
            <td>${esc(it.serie)}</td>
            <td>${esc(it.nombre)}</td>
            <td class="center">${chk(it.cerrada)}</td>
            <td>${fmtFecha(it.fechaCierre)}</td>
            <td class="center">${chk(it.remision)}</td>
            <td class="num">${fmtMoney(it.montoServicio)}</td>
            <td class="num">${fmtMoney(it.total)}</td>
            <td class="num">${fmtMoney(it.iva)}</td>
            <td class="num">${it.horas}</td>
          </tr>`
        )
        .join('');

      return `
        <div class="mecanico-header">${esc(grupo.mecanico)}</div>
        <table class="data">
          <thead>
            <tr>
              <th>No. Orden</th>
              <th>Fecha Orden</th>
              <th>No. Serie</th>
              <th>Nombre</th>
              <th class="center">Cerrada</th>
              <th>Fecha Cerrada</th>
              <th class="center">Rem</th>
              <th class="num">Servicio</th>
              <th class="num">Total</th>
              <th class="num">IVA</th>
              <th class="num">Horas</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
          <tfoot>
            <tr class="subtotal-row">
              <td colspan="7" style="font-style:italic; font-weight:bold;">Totales por Técnico: ${esc(grupo.mecanico)}</td>
              <td class="num" style="font-weight:bold;">${fmtMoney(grupo.totalServicio)}</td>
              <td class="num" style="font-weight:bold;">${fmtMoney(grupo.totalServicio)}</td>
              <td class="num" style="font-weight:bold;">${fmtMoney(grupo.totalIva)}</td>
              <td class="num" style="font-weight:bold;">${grupo.totalHoras}</td>
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
      margin-bottom: 5px;
    }
    .titulo { font-size: 13pt; font-weight: bold; font-style: italic; }
    .fechas { text-align: right; font-size: 9pt; line-height: 1.7; }

    /* ── TABLAS ── */
    table.data { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
    table.data th {
      font-size: 8pt;
      font-weight: bold;
      border-bottom: 1px solid #555;
      padding: 3px 4px;
      text-align: left;
    }
    table.data td { font-size: 8pt; padding: 2px 4px; vertical-align: top; }
    table.data .num { text-align: right; white-space: nowrap; }
    table.data .center { text-align: center; }

    /* ── GRUPOS TÉCNICO ── */
    .mecanico-header {
      font-weight: bold;
      font-style: italic;
      font-size: 10pt;
      margin-top: 20px;
      margin-bottom: 3px;
      border-bottom: 1px solid #000;
    }
    .subtotal-row td { font-size: 8.5pt; border-top: 1px solid #555; }
    .body-style td { padding-top: 4px; }

    /* ── GRAN TOTAL ── */
    .gran-total {
      display: flex;
      justify-content: space-between;
      margin-top: 12px;
      padding-top: 6px;
      border-top: 1px solid #000;
      font-size: 10pt;
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

  <table class="header-table">
    <tr><td class="cell-nombre">SERVICOMPACTOS DE JUAREZ</td></tr>
    <tr><td class="cell-dir">PASEO TRIUNFO DE LA REPÚBLICA #322&nbsp;&nbsp;SAN LORENZO</td></tr>
  </table>

  <div class="titulo-row">
    <div class="titulo">Reporte de Horas Trabajadas por Técnico</div>
    <div class="fechas">
      <div><strong>Desde:</strong>&nbsp;${fmtFecha(desde)}</div>
      <div><strong>Hasta:</strong>&nbsp;${fmtFecha(hasta)}</div>
      <div><strong>Órdenes:</strong>&nbsp;${esc(ESTADO_LABEL[estado] || 'Todas')}</div>
    </div>
  </div>

  ${grupos || '<p style="font-size:9pt;">No se encontraron órdenes en el período seleccionado.</p>'}

  <div class="gran-total">
    <span>Total Servicio: ${fmtMoney(resultado.totalGeneralServicio)}</span>
    <span>Total IVA: ${fmtMoney(resultado.totalGeneralIva)}</span>
    <span>Total Horas: ${resultado.totalGeneralHoras}</span>
  </div>

  <div class="pie">
    <span>${fmtFechaLarga()}</span>
    <span>Reporte de Horas Trabajadas por Técnico — Recursos Humanos</span>
  </div>

</body>
</html>`;
}

async function streamReporteHorasTecnicoPdf(res, resultado, desde, hasta, estado) {
  const html = buildHtml(resultado, desde, hasta, estado);

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
  res.setHeader('Content-Disposition', 'inline; filename="reporte_horas_tecnico.pdf"');
  res.send(pdfBuffer);
}

module.exports = { streamReporteHorasTecnicoPdf };
