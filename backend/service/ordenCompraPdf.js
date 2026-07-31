// backend/service/ordenCompraPdf.js
// PDF de Orden de Compra, calcado del formato preimpreso de Servicompactos
// (logo + dirección, datos del proveedor, tabla de piezas y firmas).
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const FILAS_EN_BLANCO = 10; // renglones vacíos para capturar piezas a mano cuando no hay lineas digitales

let LOGO_DATA_URL = '';
try {
  const logoPath = path.join(__dirname, '../assets/pdf/logo_servicompactos.png');
  const buf = fs.readFileSync(logoPath);
  LOGO_DATA_URL = `data:image/png;base64,${buf.toString('base64')}`;
} catch (e) {
  console.warn('[ordenCompraPdf] Logo no encontrado:', e.message);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildOrdenCompraHtml(oc) {
  const fechaOC = oc.createdAt
    ? new Date(oc.createdAt).toLocaleDateString('es-MX')
    : new Date().toLocaleDateString('es-MX');

  const lineas = oc.lineas || [];
  const tieneLineas = lineas.length > 0;

  const total = lineas.reduce((acc, l) => {
    const importe =
      l.importeTotal ??
      (Number(l.cant || 0) * Number(l.precioUnitario || 0));
    return acc + (Number(importe) || 0);
  }, 0);

  const filaCapturada = (l) => {
    const importe =
      l.importeTotal ??
      (Number(l.cant || 0) * Number(l.precioUnitario || 0));
    return `
      <tr>
        <td class="text-center">${esc(l.cant)}</td>
        <td>${esc(l.refaccion)}</td>
        <td class="text-center">${esc(l.codigo)}</td>
        <td class="text-right">${Number(l.precioUnitario || 0).toFixed(2)}</td>
        <td class="text-right">${Number(importe || 0).toFixed(2)}</td>
      </tr>
    `;
  };

  const filaVacia = `
    <tr>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
    </tr>
  `;

  const filasHtml = tieneLineas
    ? lineas.map(filaCapturada).join('')
    : Array.from({ length: FILAS_EN_BLANCO }).map(() => filaVacia).join('');

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Orden de Compra ${esc(oc.numero)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, sans-serif;
      font-size: 11pt;
      color: #111;
    }
    @page { size: A4 portrait; margin: 14mm; }

    /* ── SECCIÓN 1: ENCABEZADO ── */
    .encabezado {
      display: flex;
      align-items: stretch;
      border-bottom: 2px solid #000;
      padding-bottom: 10px;
      margin-bottom: 14px;
      gap: 12px;
    }
    .encabezado__logo {
      width: 30%;
      display: flex;
      align-items: center;
    }
    .encabezado__logo img { max-width: 100%; max-height: 60px; object-fit: contain; }
    .encabezado__logo-txt { font-size: 18pt; font-weight: bold; color: #1f4e79; }
    .encabezado__titulo {
      width: 45%;
      text-align: center;
    }
    .encabezado__titulo h1 {
      font-size: 15pt;
      letter-spacing: 0.04em;
      margin-bottom: 4px;
    }
    .encabezado__direccion {
      font-size: 8.5pt;
      color: #333;
      line-height: 1.4;
    }
    .encabezado__folio {
      width: 25%;
      border: 1px solid #000;
      border-radius: 4px;
      padding: 6px 8px;
      text-align: center;
      align-self: center;
    }
    .encabezado__folio-label {
      font-size: 8.5pt;
      text-transform: uppercase;
      color: #555;
      letter-spacing: 0.06em;
    }
    .encabezado__folio-valor {
      font-size: 15pt;
      font-weight: bold;
      color: #b00000;
    }

    /* ── SECCIÓN 2: DATOS DEL PROVEEDOR ── */
    .datos-proveedor { margin-bottom: 16px; }
    .fila { display: flex; gap: 24px; margin-bottom: 8px; }
    .campo { flex: 1; display: flex; align-items: baseline; gap: 6px; }
    .campo--corto { flex: 0 0 35%; }
    .campo__label { font-weight: bold; white-space: nowrap; font-size: 10pt; }
    .campo__valor {
      flex: 1;
      border-bottom: 1px solid #999;
      padding: 1px 4px 2px;
      min-height: 14px;
      font-size: 10.5pt;
    }

    /* ── SECCIÓN 3: TABLA DE PIEZAS ── */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
    }
    thead th {
      background: #111;
      color: #fff;
      text-transform: uppercase;
      font-size: 9.5pt;
      padding: 6px 4px;
      border: 1px solid #111;
    }
    tbody td {
      border: 1px solid #999;
      padding: 7px 6px;
      font-size: 10pt;
      height: 20px;
    }
    tfoot td {
      font-weight: bold;
      border: 1px solid #999;
      padding: 6px;
      font-size: 10pt;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }

    /* ── SECCIÓN 4: POLÍTICA Y FIRMAS ── */
    .politica {
      font-size: 9pt;
      font-weight: bold;
      margin-bottom: 26px;
    }
    .firmas-fila {
      display: flex;
      justify-content: space-between;
      gap: 30px;
      margin-bottom: 30px;
    }
    .firma-col { flex: 1; text-align: center; }
    .firma-linea {
      border-top: 1px solid #000;
      margin-top: 34px;
      padding-top: 4px;
    }
    .firma-label {
      font-size: 9.5pt;
      font-weight: bold;
      text-transform: uppercase;
    }
    .firma-nombre {
      font-size: 13pt;
      font-weight: bold;
      color: #111;
      margin-bottom: 0;
    }
  </style>
</head>
<body>

  <!-- SECCIÓN 1: ENCABEZADO -->
  <div class="encabezado">
    <div class="encabezado__logo">
      ${LOGO_DATA_URL ? `<img src="${LOGO_DATA_URL}" />` : '<span class="encabezado__logo-txt">Servi compactos</span>'}
    </div>
    <div class="encabezado__titulo">
      <h1>ORDEN DE COMPRA</h1>
      <div class="encabezado__direccion">
        PASEO TRIUNFO DE LA REPUBLICA #322-B<br/>
        COL. SAN LORENZO, C.P. 32320, CD. JUÁREZ, CHIH.<br/>
        TEL. (656) 626-5651 AL 54
      </div>
    </div>
    <div class="encabezado__folio">
      <div class="encabezado__folio-label">No.</div>
      <div class="encabezado__folio-valor">${esc(oc.numero)}</div>
    </div>
  </div>

  <!-- SECCIÓN 2: DATOS DEL PROVEEDOR -->
  <div class="datos-proveedor">
    <div class="fila">
      <div class="campo">
        <span class="campo__label">Nombre:</span>
        <span class="campo__valor">${esc(oc.proveedor || '')}</span>
      </div>
      <div class="campo campo--corto">
        <span class="campo__label">Fecha:</span>
        <span class="campo__valor">${esc(fechaOC)}</span>
      </div>
    </div>
    <div class="fila">
      <div class="campo">
        <span class="campo__label">Domicilio:</span>
        <span class="campo__valor">${esc(oc.domicilioProveedor || '')}</span>
      </div>
    </div>
  </div>

  <!-- SECCIÓN 3: TABLA DE PIEZAS -->
  <table>
    <thead>
      <tr>
        <th style="width:10%">Cant.</th>
        <th style="width:40%">Descripción</th>
        <th style="width:18%">No. Parte</th>
        <th style="width:16%">Precio Unit.</th>
        <th style="width:16%">Total</th>
      </tr>
    </thead>
    <tbody>
      ${filasHtml}
    </tbody>
    ${
      tieneLineas
        ? `<tfoot>
             <tr>
               <td colspan="4" class="text-right">Total</td>
               <td class="text-right">${total.toFixed(2)}</td>
             </tr>
           </tfoot>`
        : ''
    }
  </table>

  <!-- SECCIÓN 4: POLÍTICA Y FIRMAS -->
  <div class="politica">
    POLÍTICA DE RECEPCIÓN: CONTRA-RECIBOS Y PAGOS MARTES DE 10:00 A 13:00 HRS.
  </div>

  <div class="firmas-fila">
    <div class="firma-col">
      <div class="firma-linea"></div>
      <div class="firma-label">Solicitado por</div>
    </div>
    <div class="firma-col">
      <div class="firma-linea"></div>
      <div class="firma-label">Autorizado por</div>
    </div>
  </div>

  <div class="firmas-fila">
    <div class="firma-col">
    <div class="firma-linea"></div>
    <div class="firma-label">Entrega</div>
    <div class="firma-nombre">${esc(oc.entrega || '')}</div>
    </div>
    <div class="firma-col">
      <div class="firma-linea"></div>
      <div class="firma-label">Recibe</div>
    </div>
  </div>

</body>
</html>
`;
}

async function streamOrdenCompraPdf(res, ordenCompra) {
  const html = buildOrdenCompraHtml(ordenCompra);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '14mm',
        right: '14mm',
        bottom: '14mm',
        left: '14mm',
      },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${ordenCompra.numero || 'orden_compra'}.pdf"`
    );
    res.send(pdfBuffer);
  } finally {
    await browser.close();
  }
}

module.exports = { streamOrdenCompraPdf };
