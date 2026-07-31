// Reporte de Recursos Humanos: C x C de mano de obra por mecánico.
// Agrupa por mecánico las asignaciones de mano de obra de órdenes cerradas
// en el rango de fechas, mostrando el monto del servicio ligado del
// presupuesto (lo que se cobra al cliente) y el monto de mano de obra a
// pagar (horas x tarifa fija). Mismo formato general que Garantías.
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

function fmtMoney(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildHtml(resultado, desde, hasta, mecanico) {
  const grupos = resultado.data
    .map((grupo) => {
      const filas = grupo.items
        .map(
          (it) => `
          <tr class="body-style">
            <td>${esc(it.ordenServicio)}</td>
            <td>${esc(it.cliente)}</td>
            <td>${it.fechaCierre ? fmtFecha(it.fechaCierre) : ''}</td>
            <td>${esc(it.concepto)}</td>
            <td class="num">${it.horas}</td>
            <td class="num">${fmtMoney(it.montoServicio)}</td>
            <td class="num">${fmtMoney(it.montoManoObra)}</td>
          </tr>`
        )
        .join('');

      return `
        <div class="mecanico-header">Mecánico: ${esc(grupo.mecanico)}</div>
        <table class="data">
          <thead>
            <tr>
              <th>No Orden</th>
              <th>Cliente</th>
              <th>Fecha Cierre</th>
              <th>Servicio</th>
              <th class="num">Horas</th>
              <th class="num">Monto Servicio</th>
              <th class="num">Mano de Obra a Pagar</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
          <tfoot>
            <tr class="subtotal-row">
              <td colspan="5" style="font-style:italic; font-weight:bold;">Subtotal ${esc(grupo.mecanico)}</td>
              <td class="num" style="font-weight:bold;">${fmtMoney(grupo.totalServicios)}</td>
              <td class="num" style="font-weight:bold;">${fmtMoney(grupo.totalManoObra)}</td>
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
      font-size: 8.5pt;
      font-weight: bold;
      border-bottom: 1px solid #555;
      padding: 3px 4px;
      text-align: left;
    }
    table.data td { font-size: 8.5pt; padding: 2px 4px; vertical-align: top; }
    table.data .num { text-align: right; white-space: nowrap; }

    /* ── GRUPOS MECÁNICO ── */
    .mecanico-header {
      font-weight: bold;
      font-style: italic;
      font-size: 10pt;
      margin-top: 20px;
      margin-bottom: 3px;
      border-bottom: 1px solid #000;
    }
    .subtotal-row td { font-size: 9pt; border-top: 1px solid #555; }
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
    <div class="titulo">Recursos Humanos — Reporte de C x C</div>
    <div class="fechas">
      <div><strong>Desde:</strong>&nbsp;${fmtFecha(desde)}</div>
      <div><strong>Hasta:</strong>&nbsp;${fmtFecha(hasta)}</div>
      ${mecanico ? `<div><strong>Mecánico:</strong>&nbsp;${esc(mecanico)}</div>` : ''}
    </div>
  </div>

  ${grupos || '<p style="font-size:9pt;">No se encontró mano de obra registrada en el período seleccionado.</p>'}

  <div class="gran-total">
    <span>Total Monto Servicios: ${fmtMoney(resultado.totalServiciosGeneral)}</span>
    <span>Total Mano de Obra a Pagar: ${fmtMoney(resultado.totalManoObraGeneral)}</span>
  </div>

  <div class="pie">
    <span>${fmtFechaLarga()}</span>
    <span>Reporte de C x C — Recursos Humanos</span>
  </div>

</body>
</html>`;
}

async function streamReporteRhCxCPdf(res, resultado, desde, hasta, mecanico) {
  const html = buildHtml(resultado, desde, hasta, mecanico);

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
  res.setHeader('Content-Disposition', 'inline; filename="reporte_rh_cxc.pdf"');
  res.send(pdfBuffer);
}

module.exports = { streamReporteRhCxCPdf };
