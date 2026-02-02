// backend/service/ordenCompraPdf.js
const puppeteer = require('puppeteer');

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

  const veh = oc.orden || {}; // si viene populate
  const lineas = oc.lineas || [];

  const total = lineas.reduce((acc, l) => {
    const importe =
      l.importeTotal ??
      (Number(l.cant || 0) * Number(l.precioUnitario || 0));
    return acc + (Number(importe) || 0);
  }, 0);

  const filasHtml = lineas
    .map((l, idx) => {
      const importe =
        l.importeTotal ??
        (Number(l.cant || 0) * Number(l.precioUnitario || 0));
      return `
        <tr>
          <td class="text-center">${idx + 1}</td>
          <td class="text-center">${esc(l.cant)}</td>
          <td class="text-center">${esc(l.unidad)}</td>
          <td>${esc(l.refaccion)}</td>
          <td class="text-center">${esc(l.marca)}</td>
          <td class="text-center">${esc(l.codigo)}</td>
          <td class="text-center">${esc(l.moneda || 'MN')}</td>
          <td class="text-right">${Number(l.precioUnitario || 0).toFixed(2)}</td>
          <td class="text-right">${Number(importe || 0).toFixed(2)}</td>
        </tr>
      `;
    })
    .join('');

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Orden de Compra ${esc(oc.numero)}</title>
  <style>
    * {
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, system-ui,
        "Segoe UI", Roboto, Oxygen, Ubuntu, "Helvetica Neue", sans-serif;
    }
    body {
      margin: 0;
      padding: 16px 24px;
      font-size: 12px;
      color: #111827;
    }
    h1, h2, h3, h4 {
      margin: 0;
      padding: 0;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-left { text-align: left; }
    .mb-1 { margin-bottom: 4px; }
    .mb-2 { margin-bottom: 8px; }
    .mb-3 { margin-bottom: 12px; }
    .mb-4 { margin-bottom: 16px; }
    .mt-2 { margin-top: 8px; }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #111827;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    .header-left {
      max-width: 60%;
    }
    .titulo-sistema {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .subtitulo {
      font-size: 11px;
      color: #4b5563;
    }
    .box-oc {
      border: 1px solid #111827;
      padding: 6px 8px;
      border-radius: 4px;
      font-size: 11px;
      min-width: 160px;
    }
    .box-oc-label {
      font-size: 10px;
      text-transform: uppercase;
      color: #6b7280;
      letter-spacing: 0.08em;
    }
    .box-oc-num {
      font-size: 13px;
      font-weight: 700;
    }

    .section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 1px solid #d1d5db;
      padding-bottom: 3px;
      margin-bottom: 4px;
      color: #111827;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1.6fr 1.2fr;
      gap: 12px;
      margin-bottom: 10px;
    }
    .field-label {
      font-size: 10px;
      font-weight: 600;
      color: #6b7280;
    }
    .field-value {
      font-size: 11px;
      border-bottom: 1px solid #e5e7eb;
      padding: 1px 0 2px 0;
      min-height: 14px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      border-spacing: 0;
    }
    thead tr {
      background-color: #f3f4f6;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 4px 6px;
      font-size: 10px;
    }
    th {
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: #374151;
    }
    tfoot td {
      font-weight: 700;
      background-color: #f9fafb;
    }

    .firmas {
      margin-top: 28px;
      display: flex;
      justify-content: space-between;
      gap: 20px;
    }
    .firma-box {
      flex: 1;
      text-align: center;
      font-size: 10px;
    }
    .firma-line {
      margin-top: 30px;
      border-top: 1px solid #111827;
      padding-top: 4px;
    }
    .nota {
      font-size: 9px;
      color: #6b7280;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <!-- Encabezado -->
  <header class="header">
    <div class="header-left">
      <div class="titulo-sistema">Orden de Compra</div>
      <div class="subtitulo">Taller Automotriz - Control de Órdenes y Refacciones</div>
      <div class="subtitulo">Fecha: ${esc(fechaOC)}</div>
    </div>
    <div class="box-oc">
      <div class="box-oc-label">No. Orden de Compra</div>
      <div class="box-oc-num">${esc(oc.numero)}</div>
    </div>
  </header>

  <!-- Datos Generales -->
  <section class="mb-2">
    <div class="section-title">Datos Generales</div>
    <div class="grid-2">
      <div>
        <div class="field-label">Proveedor</div>
        <div class="field-value">${esc(oc.proveedor || '')}</div>

        <div class="field-label mt-2">Observaciones generales</div>
        <div class="field-value">${esc(oc.observaciones || '')}</div>
      </div>

      <div>
        <div class="field-label">Orden de Servicio</div>
        <div class="field-value">${esc(veh.ordenServicio || '')}</div>

        <div class="field-label mt-2">Vehículo</div>
        <div class="field-value">
          ${esc(veh.marca || '')} ${esc(veh.modelo || '')} ${
    veh.anio ? '(' + esc(veh.anio) + ')' : ''
  }
        </div>

        <div class="field-label mt-2">Placas / No. Económico</div>
        <div class="field-value">
          Placas: ${esc(veh.placas || '')} &nbsp;&nbsp; Económico: ${esc(
    veh.numeroEconomico || ''
  )}
        </div>
      </div>
    </div>
  </section>

  <!-- Detalle de la OC -->
  <section class="mb-2">
    <div class="section-title">Detalle de Refacciones / Servicios</div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Cant</th>
          <th>Unidad</th>
          <th>Descripción Refacción / Servicio</th>
          <th>Marca</th>
          <th>Código</th>
          <th>Moneda</th>
          <th>Precio Unit.</th>
          <th>Importe</th>
        </tr>
      </thead>
      <tbody>
        ${
          lineas.length === 0
            ? `
              <tr>
                <td colspan="9" class="text-center">
                  Sin partidas registradas.
                </td>
              </tr>
            `
            : filasHtml
        }
      </tbody>
      <tfoot>
        <tr>
          <td colspan="8" class="text-right">Total</td>
          <td class="text-right">${total.toFixed(2)}</td>
        </tr>
      </tfoot>
    </table>
  </section>

  <!-- Firmas -->
  <section class="firmas">
    <div class="firma-box">
      <div class="firma-line">Autorizó</div>
    </div>
    <div class="firma-box">
      <div class="firma-line">Recibió Proveedor</div>
    </div>
  </section>

  <p class="nota">
    Nota: Esta orden de compra es necesaria para la adquisición de refacciones
    y/o servicios. Favor de respetar precios y condiciones acordadas.
  </p>
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
        top: '15mm',
        right: '10mm',
        bottom: '15mm',
        left: '10mm',
      },
    });

    res.setHeader('Content-Type', 'application/pdf');
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
