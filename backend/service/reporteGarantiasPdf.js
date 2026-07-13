// Reporte de Garantías (auditoría): órdenes con garantía autorizada,
// agrupadas por asesor, con mecánicos y costo (venta + mano de obra).
// Mismo formato general que el reporte de órdenes abiertas.
const puppeteer = require('puppeteer');
const dayjs = require('dayjs');
require('dayjs/locale/es');
dayjs.locale('es');
const { dayjsFecha } = require('../utils/fechas');

function fmtFecha(iso) {
  return dayjsFecha(iso).format('DD-MMM-YY');
}

function fmtFechaCorta(iso) {
  return dayjsFecha(iso).format('DD/MM/YYYY');
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

function observacionesGarantia(o) {
  const lineas = ['***GARANTIA***'];
  if (o.motivo) lineas.push(`MOTIVO: ${esc(o.motivo)}`);
  if (o.fechaGarantia) lineas.push(`FECHA: ${fmtFechaCorta(o.fechaGarantia)}`);
  if (o.autorizaCarreon) lineas.push('AUTORIZA SR. CARREON');
  return lineas.join('<br>');
}

function buildHtml(resultado, desde, hasta, asesor) {
  const grupos = resultado.data
    .map((grupo) => {
      const filas = grupo.ordenes
        .map(
          (o) => `
          <tr class="body-style">
            <td>${esc(o.ordenServicio)}</td>
            <td>${esc(o.cliente)}</td>
            <td>${esc(o.ordenAnterior)}</td>
            <td>${o.fecha ? fmtFecha(o.fecha) : ''}</td>
            <td>${esc(o.marca)}</td>
            <td>${esc(o.modelo)}</td>
            <td>${esc(o.serie)}</td>
            <td>${esc(o.asesor)}</td>
            <td class="num">${fmtMoney(o.costo)}</td>
            <td class="obs">${observacionesGarantia(o)}</td>
          </tr>
          <tr class="mecanicos-row">
            <td colspan="10"><em><b>Mecánicos:</b></em>&nbsp;&nbsp;${esc(o.mecanicos.join('; '))}${o.mecanicos.length ? ';' : 'Sin mano de obra registrada.'}</td>
          </tr>`
        )
        .join('');

      return `
        <div class="asesor-header">Asesor: ${esc(grupo.asesor)}</div>
        <table class="data">
          <thead>
            <tr>
              <th>No Orden</th>
              <th>Cliente</th>
              <th>Ord. Ant</th>
              <th>Fecha</th>
              <th>Marca</th>
              <th>Modelo</th>
              <th>Serie</th>
              <th>Asesor</th>
              <th class="num">Costo</th>
              <th class="obs">Observaciones</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
          <tfoot>
            <tr class="subtotal-row">
              <td colspan="10" style="font-style:italic; font-weight:bold;">Cant. Ordenes: ${grupo.totalAsesor}</td>
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
    table.data .obs { width: 30%; }

    /* ── GRUPOS ASESOR ── */
    .asesor-header {
      font-weight: bold;
      font-style: italic;
      font-size: 10pt;
      margin-top: 20px;
      margin-bottom: 3px;
      border-bottom: 1px solid #000;
    }
    .subtotal-row td { font-size: 9pt; border-top: 1px solid #555; }
    .mecanicos-row td {
      font-size: 8.5pt;
      border-bottom: .5px solid #35353590;
      padding: 2px 4px 4px;
    }
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
    <div class="titulo">Reporte de Garantías</div>
    <div class="fechas">
      <div><strong>Desde:</strong>&nbsp;${fmtFecha(desde)}</div>
      <div><strong>Hasta:</strong>&nbsp;${fmtFecha(hasta)}</div>
      ${asesor ? `<div><strong>Asesor:</strong>&nbsp;${esc(asesor)}</div>` : ''}
    </div>
  </div>

  ${grupos || '<p style="font-size:9pt;">No se encontraron garantías autorizadas en el período seleccionado.</p>'}

  <div class="gran-total">
    <span>Total de Ordenes: ${resultado.totalOrdenes}</span>
    <span>Costo total: ${fmtMoney(resultado.totalCosto)}</span>
  </div>

  <div class="pie">
    <span>${fmtFechaLarga()}</span>
    <span>Reporte de Garantías</span>
  </div>

</body>
</html>`;
}

async function streamReporteGarantiasPdf(res, resultado, desde, hasta, asesor) {
  const html = buildHtml(resultado, desde, hasta, asesor);

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
  res.setHeader('Content-Disposition', 'inline; filename="reporte_garantias.pdf"');
  res.send(pdfBuffer);
}

module.exports = { streamReporteGarantiasPdf };
