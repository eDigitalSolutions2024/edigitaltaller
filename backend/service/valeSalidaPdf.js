const puppeteer = require('puppeteer');
const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');
require('dayjs/locale/es');
dayjs.locale('es');

let LOGO_DATA_URL = '';
try {
  const logoPath = path.join(__dirname, '../../frontend/public/images/logo_servicompactos.png');
  const buf = fs.readFileSync(logoPath);
  LOGO_DATA_URL = `data:image/png;base64,${buf.toString('base64')}`;
} catch (e) {
  console.warn('[valeSalidaPdf] Logo no encontrado:', e.message);
}

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmtFechaHora(fecha) {
  return dayjs(fecha).format('DD/MM/YYYY hh:mm:ss a').replace('am', 'a. m.').replace('pm', 'p. m.');
}

// Emoji 1 = Contado · Emoji 2 = Credito · Emoji 3 = cualquier otro estatus
function emojiSlot(estatus) {
  if (estatus === 'Contado') return 1;
  if (estatus === 'Credito') return 2;
  return 3;
}

function buildHtml(vale) {
  const noVale = `${vale.noVale ?? ''}-${vale.dig ?? 0}`;
  const slotActivo = emojiSlot(vale.estatus);
  const etiquetaSlot3 = slotActivo === 3 ? (vale.estatus || '').toUpperCase() : 'OTROS';

  const emoji = (n, cara) => `
    <div class="emoji-col">
      ${slotActivo === n ? `<div class="emoji-label">${n === 1 ? 'CONTADO' : n === 2 ? 'CREDITO' : etiquetaSlot3}</div>` : '<div class="emoji-label">&nbsp;</div>'}
      <div class="emoji-cara">${cara}</div>
      ${slotActivo === n ? '<div class="emoji-check">&#9989;</div>' : '<div class="emoji-check">&nbsp;</div>'}
    </div>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 11pt; color: #000; }
  @page { size: A4 portrait; margin: 12.7mm; }

  .hoja { width: 100%; }

  /* ── SECCIÓN 1: ENCABEZADO ── */
  .encabezado { display: flex;  margin-bottom: 10px; }
  .encabezado__izq { width: 55%; display: flex; flex-direction: column; }
  .encabezado__logo { display: flex; align-items: center; gap: 10px; padding: 8px 12px; }
  .encabezado__logo img { height: 63px; }
  .encabezado__logo-txt { font-size: 20pt; font-weight: bold; color: #1f4e79; }
  .encabezado__dir { padding: 6px 12px;  text-align: center; font-size: 8.5pt; line-height: 1.4; }
  .encabezado__der { width: 45%; display: flex; flex-direction: column; }
  .encabezado__barra { background: #4472c4; color: #fff; font-weight: bold; text-align: center; padding: 6px; font-size: 10.5pt; }
  .encabezado__fila { display: flex; border-top: 1px solid #000; }
  .encabezado__fila-label { width: 100%; text-align: center; font-size: 9pt; color: #444; padding: 4px 6px 0; }
  .encabezado__fila-valor { width: 100%; text-align: center; font-size: 12pt; font-weight: bold; padding: 0 6px 5px; }
  .encabezado__fila-valor.rojo { color: #c00000; font-size: 15pt; }
  .encabezado__fila-col { display: flex; flex-direction: column; border-top: 1px solid #999; }

  .titulo-principal { font-size: 30pt; font-weight: bold; color: #666; margin: 4px 0 14px; }

  /* ── SECCIÓN 2: DATOS ── */
  .datos { border-top: 2px solid #000; padding-top: 10px; margin-bottom: 6px; }
  .datos__fila { display: flex; flex-wrap: wrap; margin-bottom: 10px; }
  .campo { display: flex; align-items: baseline; margin-right: 24px; margin-bottom: 6px; }
  .campo--full { width: 100%; }
  .campo__label { font-style: italic; font-weight: bold; color: #1f4e79; margin-right: 8px; white-space: nowrap; }
  .campo__valor { border-bottom: 1px solid #999; background: #eef1f4; padding: 2px 10px; min-width: 140px; font-weight: 600; }

  /* ── SECCIÓN 3: EMOJIS ── */
  .emojis { border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 18px 0; margin-bottom: 10px; display: flex; justify-content: space-around; }
  .emoji-col { text-align: center; width: 30%; }
  .emoji-label { font-weight: bold; color: #1f4e79; font-size: 11pt; margin-bottom: 6px; }
  .emoji-cara { font-size: 46pt; line-height: 1; }
  .emoji-check { font-size: 20pt; margin-top: 6px; color: #2e7d32; }

  /* ── SECCIÓN 4: FIRMAS / OBSERVACIONES ── */
  .firmas { display: flex; justify-content: space-between; margin-top: 30px; }
  .firmas__col { width: 46%; text-align: center; }
  .firmas__titulo { font-style: italic; font-weight: bold; color: #1f4e79; margin-bottom: 55px; font-size: 10pt; }
  .firmas__linea { font-size: 10pt; font-family: "Times New Roman", Times, serif;font-weight: bold;}

  .observaciones { margin-top: 26px; }
  .observaciones__titulo { font-style: italic; font-weight: bold; color: #1f4e79; margin-bottom: 8px; }
  .observaciones__linea { border-bottom: 1px solid #999; height: 22px; margin-bottom: 14px; padding: 0 6px; font-size: 10pt; }
</style>
</head>
<body>
  <div class="hoja">

    <!-- SECCIÓN 1: ENCABEZADO -->
    <div class="encabezado">
      <div class="encabezado__izq">
        <div class="encabezado__logo">
          ${LOGO_DATA_URL ? `<img src="${LOGO_DATA_URL}" />` : '<span class="encabezado__logo-txt">Servi compactos</span>'}
        </div>
        <div class="encabezado__dir">
          PASEO TRIUNFO DE LA REPUBLICA # 322 - B<br/>
          COL.: SAN LORENZO, C.P.: 32320 CD. JUAREZ, CHIH., MEXICO
        </div>
      </div>
      <div class="encabezado__der">
        <div class="encabezado__barra">SERVICOMPACTOS DE JUAREZ</div>
        <div class="encabezado__fila-col">
          <div class="encabezado__fila-label">No. de Vale de salida</div>
          <div class="encabezado__fila-valor rojo">${esc(noVale)}</div>
        </div>
        <div class="encabezado__fila-col">
          <div class="encabezado__fila-label">Fecha de emisión</div>
          <div class="encabezado__fila-valor">${esc(fmtFechaHora(vale.fecha))}</div>
        </div>
        <div class="encabezado__fila-col">
          <div class="encabezado__fila-label">No. Orden de Servicio</div>
          <div class="encabezado__fila-valor">${esc(vale.noOrden)}</div>
        </div>
      </div>
    </div>

    <div class="titulo-principal">Vale de Salida</div>

    <!-- SECCIÓN 2: DATOS DEL CLIENTE / VEHÍCULO / CAJERA -->
    <div class="datos">
      <div class="datos__fila">
        <div class="campo campo--full">
          <span class="campo__label">Nombre de cliente:</span>
          <span class="campo__valor">${esc(vale.nombreCliente)}</span>
        </div>
      </div>

      <div class="datos__fila">
        <div class="campo">
          <span class="campo__label">Asesor de Servicio:</span>
          <span class="campo__valor">${esc(vale.asesor)}</span>
        </div>
        <div class="campo">
          <span class="campo__label">Cajera(o):</span>
          <span class="campo__valor">${esc(vale.cajero)}</span>
        </div>
      </div>

      <div class="datos__fila">
        <div class="campo">
          <span class="campo__label">Quien entrega el vehiculo:</span>
          <span class="campo__valor">${esc(vale.quienEntrega)}</span>
        </div>
        <div class="campo">
          <span class="campo__label">Color:</span>
          <span class="campo__valor">${esc(vale.color)}</span>
        </div>
      </div>

      <div class="datos__fila">
        <div class="campo">
          <span class="campo__label">Marca:</span>
          <span class="campo__valor">${esc(vale.marca)}</span>
        </div>
        <div class="campo">
          <span class="campo__label">Tipo:</span>
          <span class="campo__valor">${esc(vale.tipo)}</span>
        </div>
        <div class="campo">
          <span class="campo__label">Serie:</span>
          <span class="campo__valor">${esc(vale.serie)}</span>
        </div>
      </div>

      <div class="datos__fila">
        <div class="campo">
          <span class="campo__label">Modelo:</span>
          <span class="campo__valor">${esc(vale.modelo)}</span>
        </div>
        <div class="campo">
          <span class="campo__label">Placas:</span>
          <span class="campo__valor">${esc(vale.placas)}</span>
        </div>
        <div class="campo">
          <span class="campo__label">Kms:</span>
          <span class="campo__valor">${esc(vale.kms)}</span>
        </div>
      </div>
    </div>

    <!-- SECCIÓN 3: EMOJIS -->
    <div class="emojis">
      ${emoji(1, '&#128522;')}
      ${emoji(2, '&#128578;')}
      ${emoji(3, '&#128512;')}
    </div>

    <!-- SECCIÓN 4: FIRMAS / OBSERVACIONES -->
    <div class="firmas">
      <div class="firmas__col">
        <div class="firmas__titulo">Firma de autorización de caja</div>
        <div class="firmas__linea">Firma:_______________________________</div>
      </div>
      <div class="firmas__col">
        <div class="firmas__titulo">Firma de conformidad y recepción<br/>del vehiculo(Cliente)</div>
        <div class="firmas__linea">Firma:_______________________________</div>
      </div>
    </div>

    <div class="observaciones">
      <div class="observaciones__titulo">Observaciones:</div>
      <div class="observaciones__linea">${esc(vale.observaciones)}</div>
      <div class="observaciones__linea"></div>
    </div>

  </div>
</body>
</html>`;
}

async function streamValeSalidaPdf(res, vale) {
  const html = buildHtml(vale);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '12.7mm', bottom: '12.7mm', left: '12.7mm', right: '12.7mm' },
  });

  await browser.close();

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="vale_salida_${vale.noVale}-${vale.dig || 0}.pdf"`);
  res.send(pdfBuffer);
}

module.exports = { streamValeSalidaPdf };
