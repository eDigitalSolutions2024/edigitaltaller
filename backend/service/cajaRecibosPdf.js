// PDFs de Recibo Provisional y Recibo de Dólares (Cajas), inspirados en el
// papel preimpreso de Servicompactos. Se generan automáticamente desde
// routes/cajas.js: el Provisional en cada abono/anticipo, el de Dólares
// siempre que el pago incluya montoDolares > 0.
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { dayjsFecha } = require('../utils/fechas');

const assetPath = (...parts) => path.join(__dirname, '..', 'assets', 'pdf', ...parts);

const imageBase64 = (filename) => {
  const filePath = assetPath(filename);
  if (!fs.existsSync(filePath)) return '';
  const ext = path.extname(filename).replace('.', '').toLowerCase();
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
};

const money = (value) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);

const escapeHtml = (value = '') =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const nombreCliente = (orden) => {
  const c = orden.cliente || {};
  if (c.tipoCliente === 'Particular') {
    return [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(' ') || '';
  }
  return c.gobierno?.nombreGobierno || c.empresa?.razonSocial || c.nombre || '';
};

const telefono = (orden) => {
  const c = orden.cliente || {};
  const tel = (c.telefonos || [])[0] || {};
  const cel = (c.celulares || [])[0] || {};
  const fijo = [tel.lada, tel.numero].filter(Boolean).join(' ');
  const celular = [cel.lada, cel.numero].filter(Boolean).join(' ');
  return fijo || celular || '';
};

// Layout a dos copias EN PÁGINAS SEPARADAS (misma plantilla y ancho para
// ambas): la primera hoja se queda con Caja, la segunda es la que se lleva
// el Cliente. Los datos se llenan con la info real del pago en lugar de
// dejarse en blanco para escribirse a mano.
const provisionalStyles = `
  @page { size: Letter; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #000; }
  .hoja {
    border: 1px solid #000;
    width: 100%;
    max-width: 680px;
    margin: 0 auto;
    color: #1414c8;
    padding: 18px 24px;
    display: flex;
    flex-direction: column;
    gap: 11px;
  }
  .hoja--caja { page-break-after: always; }
  .encabezado {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 1px solid #000;
    padding-bottom: 7px;
  }
  .encabezado h2 { margin: 0; font-weight: 600; font-size: 24px; }
  .encabezado small { color: #555; font-weight: 700; font-size: 13px; }
  .folio { color: #d00000; font-weight: 700; font-size: 24px; }
  table { border: 1px solid #000; border-collapse: collapse; width: 100%; font-size: 12.5px; }
  th, td { border: 1px solid #000; text-align: center; padding: 6px 8px; }
  .ref-dolares { display: block; margin-top: 4px; font-size: 11px; font-weight: 700; }
  .opciones { display: flex; flex-direction: row; gap: 14px; font-size: 12.5px; flex-wrap: wrap; }
  .agrup { display: flex; flex-direction: row; align-items: center; gap: 4px; }
  .agrup input { margin: 0; transform: scale(1.15); }
  .dato { font-size: 13px; border-bottom: 1px solid #777; padding-bottom: 3px; min-height: 17px; }
  .dato .lbl { font-weight: 700; }
  .fila2 { display: flex; flex-direction: row; gap: 18px; }
  .fila2 .dato { flex: 1; }
  .firma-area {
    display: flex;
    flex-direction: row;
    align-items: flex-end;
    justify-content: space-between;
    gap: 22px;
    margin-top: 14px;
    padding-top: 12px;
  }
  .firma-linea { flex: 1; text-align: center; border-top: 1px solid #000; padding-top: 4px; font-size: 12.5px; }
`;

// rp: pago.reciboProvisional. Genera la fila de checkboxes Efectivo/T.Crédito/T.Débito/Cheque No.
function checkboxesFormaPago(rp, idPrefix) {
  const marca = (v) => (rp.formaPago === v ? 'checked' : '');
  const chequeTexto = rp.formaPago === 'CHEQUE' && rp.chequeNumero ? escapeHtml(rp.chequeNumero) : '';
  return `
    <div class="opciones">
      <div class="agrup">
        <input type="checkbox" id="${idPrefix}-efe" ${marca('EFECTIVO')} disabled />
        <label for="${idPrefix}-efe">Efectivo</label>
      </div>
      <div class="agrup">
        <input type="checkbox" id="${idPrefix}-cre" ${marca('CREDITO')} disabled />
        <label for="${idPrefix}-cre">T. Crédito</label>
      </div>
      <div class="agrup">
        <input type="checkbox" id="${idPrefix}-deb" ${marca('DEBITO')} disabled />
        <label for="${idPrefix}-deb">T. Débito</label>
      </div>
      <div class="agrup">
        <input type="checkbox" id="${idPrefix}-che" ${marca('CHEQUE')} disabled />
        <label for="${idPrefix}-che">Cheque No. ${chequeTexto}</label>
      </div>
    </div>`;
}

// incluirReciboDolares: número del Recibo de Dólares ligado a este mismo
// abono/anticipo (si lo hubo); solo se muestra en la copia de Caja.
function tablaResumen({ fechaTexto, noOrdenTexto, buenoPorTexto, reciboDolaresNumero }) {
  return `
    <table>
      <tr>
        <th>Fecha</th>
        <th>No. de Orden de Rep. o Factura</th>
        <th>Bueno por</th>
      </tr>
      <tr>
        <td>${fechaTexto}</td>
        <td>${noOrdenTexto}</td>
        <td>
          ${buenoPorTexto}
          ${reciboDolaresNumero ? `<span class="ref-dolares">Recibo Dólares N°${escapeHtml(reciboDolaresNumero)}</span>` : ''}
        </td>
      </tr>
    </table>`;
}

// pago: subdocumento de orden.pagos con reciboProvisional.numero ya asignado.
exports.generarReciboProvisionalPDF = async (res, orden, pago) => {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    const fecha = dayjsFecha(pago?.fecha || new Date());
    const rp = pago?.reciboProvisional || {};

    // "Bueno por": desglosa Pesos y Dólares cuando el pago incluye ambos.
    const pesos = Number(pago?.montoPesos || 0);
    const dolares = Number(pago?.montoDolares || 0);
    const partesBuenoPor = [];
    if (pesos > 0) partesBuenoPor.push(`${money(pesos)} M.N.`);
    if (dolares > 0) partesBuenoPor.push(`$${dolares.toFixed(2)} USD`);
    if (pesos > 0 && dolares > 0) partesBuenoPor.push(`(T.C. ${money(pago?.tipoCambio)})`);
    const buenoPorTexto = partesBuenoPor.join(' + ') || `${money(pago?.monto)} M.N.`;

    const fechaTexto = escapeHtml(fecha.format('DD/MM/YYYY'));
    const noOrdenTexto = escapeHtml(orden.ordenServicio || '');
    const clienteTexto = escapeHtml(nombreCliente(orden));
    const telefonoTexto = escapeHtml(telefono(orden));
    const conceptoTexto = escapeHtml(rp.concepto || '');
    const razonTexto = escapeHtml(rp.razon || '');
    const recibioTexto = escapeHtml(rp.recibio || pago?.registradoPor || '');
    const autorizoTexto = escapeHtml(rp.autorizo || '');

    // El No. de Recibo de Dólares ligado a este mismo abono/anticipo solo se
    // muestra en la copia de Caja (ver checkbox de la solicitud del usuario).
    const tablaCaja = tablaResumen({
      fechaTexto,
      noOrdenTexto,
      buenoPorTexto,
      reciboDolaresNumero: pago?.reciboDolares?.numero,
    });
    const tablaCliente = tablaResumen({ fechaTexto, noOrdenTexto, buenoPorTexto });

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>${provisionalStyles}</style>
</head>
<body>
  <div class="hoja hoja--caja">
    <div class="encabezado">
      <div>
        <h2>Recibo Provisional</h2>
        <small>(CAJA)</small>
      </div>
      <span class="folio">${escapeHtml(rp.numero ?? '')}</span>
    </div>

    ${tablaCaja}
    ${checkboxesFormaPago(rp, 'r1')}

    <div class="dato"><span class="lbl">Recibimos de:</span> ${clienteTexto}</div>
    <div class="dato"><span class="lbl">Teléfono:</span> ${telefonoTexto}</div>
    <div class="dato"><span class="lbl">Por concepto de:</span> ${conceptoTexto}</div>
    <div class="dato"><span class="lbl">Razón del recibo:</span> ${razonTexto}</div>
    <div class="dato"><span class="lbl">Autorizó:</span> ${autorizoTexto}</div>
  </div>

  <div class="hoja">
    <div class="encabezado">
      <div>
        <h2>Recibo Provisional</h2>
        <small>(CLIENTE)</small>
      </div>
      <span class="folio">${escapeHtml(rp.numero ?? '')}</span>
    </div>

    ${tablaCliente}

    <div class="fila2">
      <div class="dato"><span class="lbl">Recibimos de:</span> ${clienteTexto}</div>
      <div class="dato"><span class="lbl">Por concepto de:</span> ${conceptoTexto}</div>
    </div>

    <div class="firma-area">
      <div class="firma-linea">Recibió: ${recibioTexto}</div>
      ${checkboxesFormaPago(rp, 'r2')}
    </div>
  </div>
</body>
</html>`;

    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'Letter', printBackground: true });

    res.contentType('application/pdf');
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generando PDF de Recibo Provisional:', error);
    if (!res.headersSent) res.status(500).send('Error al generar el PDF del Recibo Provisional');
  } finally {
    if (browser) await browser.close();
  }
};

// Estilos y layout de copia única inspirados en el papel preimpreso "Recibo
// de Dólares" (barra de título en negro + cuerpo con renglones etiqueta/valor).
const dolaresStyles = `
  @page { size: Letter; margin: 18mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #000; }
  .ReciboDolares {
    border: 1px solid #000;
    padding: 10px;
    width: 100%;
    max-width: 460px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .logo { max-width: 220px; max-height: 46px; object-fit: contain; margin-bottom: 8px; }
  .brand-fallback { color: #214190; font-size: 20px; font-weight: 700; margin-bottom: 8px; }
  .brand-fallback span { color: #ef6b21; }
  .tituloD {
    display: flex;
    flex-direction: row;
    border: 1px solid #000;
    width: 100%;
  }
  .tituloD-nombre {
    background-color: #000;
    width: 80%;
    text-align: center;
  }
  .tituloD-nombre h2 { color: #fff; margin: 6px 0; font-size: 15px; }
  .tituloD-folio { width: 20%; text-align: center; }
  .tituloD-folio h2 { margin: 6px 0; font-size: 15px; }
  .grupoD {
    border: 1px solid #000;
    border-top: none;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 10px;
  }
  .grupoD .leyenda { width: 100%; text-align: center; font-size: 10.5px; font-weight: 700; margin: 0 0 8px; }
  .tespacios { display: flex; flex-direction: row; align-items: baseline; width: 100%; margin-bottom: 8px; }
  .tespacios p { width: 42%; margin: 0; font-size: 12px; font-weight: 700; }
  .tespacios .valor {
    flex: 1;
    font-size: 12px;
    border-bottom: 1px solid #000;
    padding: 0 0 2px 6px;
    min-height: 14px;
  }
  .firma { width: 100%; text-align: center; font-size: 12px; font-weight: 700; margin-top: 30px; border-top: 1px solid #000; padding-top: 4px; }
`;

// pago: subdocumento de orden.pagos con reciboDolares.numero ya asignado.
exports.generarReciboDolaresPDF = async (res, orden, pago) => {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    const fecha = dayjsFecha(pago?.fecha || new Date());
    const logoSrc = imageBase64('logo_servicompactos.png');

    // Campo combinado: "Importe de la Factura o Remisión" cuando es un pago
    // completo/abono contra un comprobante, o "Anticipo" cuando el pago es un
    // anticipo. El monto se expresa en dólares (es el motivo del recibo); el
    // Tipo de Cambio de abajo permite calcular el equivalente en pesos.
    const etiquetaImporte = pago?.tipoPago === 'ANTICIPO' ? 'ANTICIPO' : 'IMPORTE DE LA FACTURA O REMISIÓN';
    const montoDolaresTexto = `$${Number(pago?.montoDolares || 0).toFixed(2)} USD`;

    const fila = (label, valor) => `
      <div class="tespacios">
        <p>${escapeHtml(label)}</p>
        <span class="valor">${valor}</span>
      </div>`;

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>${dolaresStyles}</style>
</head>
<body>
  <div class="ReciboDolares">
    ${logoSrc ? `<img src="${logoSrc}" class="logo" />` : `<div class="brand-fallback">Servi<span>compactos</span></div>`}

    <div class="tituloD">
      <div class="tituloD-nombre"><h2>Recibo de Dólares</h2></div>
      <div class="tituloD-folio"><h2>${escapeHtml(pago?.reciboDolares?.numero ?? '')}</h2></div>
    </div>

    <div class="grupoD">
      <p class="leyenda">CADA VEZ QUE SE RECIBA CUALQUIER CANTIDAD DLLS.</p>
      ${fila('FECHA:', escapeHtml(fecha.format('DD/MM/YYYY')))}
      ${fila('HORA:', escapeHtml(fecha.format('hh:mm A')))}
      ${fila('NO. ORDEN:', escapeHtml(orden.ordenServicio || ''))}
      ${fila(`${etiquetaImporte}:`, montoDolaresTexto)}
      ${fila('TIPO DE CAMBIO:', money(pago?.tipoCambio))}
      ${fila('RECIBIÓ:', escapeHtml(pago?.registradoPor || ''))}
      <p class="firma">Firma</p>
    </div>
  </div>
</body>
</html>`;

    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'Letter', printBackground: true });

    res.contentType('application/pdf');
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generando PDF de Recibo de Dólares:', error);
    if (!res.headersSent) res.status(500).send('Error al generar el PDF del Recibo de Dólares');
  } finally {
    if (browser) await browser.close();
  }
};
