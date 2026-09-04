// PDF del Recibo Provisional de un depósito de anticipo (saldo a favor de un
// cliente, sin ligar a ninguna orden), clon del layout de Recibo Provisional
// en cajaRecibosPdf.js: dos copias en páginas separadas (Caja / Cliente),
// mismo estilo. Se genera desde routes/anticipos.js (GET /:id/recibo-pdf).
// Un depósito de anticipo ya no tiene un documento propio ("Recibo de
// Anticipo"): es, sin más, un Recibo Provisional — comparte numeración con
// los ligados a una orden (ver CONTADOR_RECIBO_PROVISIONAL en routes/anticipos.js).
const puppeteer = require('puppeteer');
const { dayjsFecha } = require('../utils/fechas');

const money = (value) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);

// Todo campo de texto libre (observaciones, referencia, nombre del cliente)
// pasa por aquí antes de interpolarse en el HTML: el PDF se renderiza con
// Puppeteer a partir de HTML armado en el servidor, así que un campo sin
// escapar sería una inyección HTML dentro de ese proceso.
const escapeHtml = (value = '') =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const nombreCliente = (cliente) => {
  const c = cliente || {};
  if (c.tipoCliente === 'Particular') {
    return [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(' ') || '';
  }
  return c.gobierno?.nombreGobierno || c.empresa?.razonSocial || c.nombre || '';
};

const FORMA_PAGO_LABEL = {
  EFECTIVO: 'Efectivo',
  CREDITO: 'T. Crédito',
  DEBITO: 'T. Débito',
  CHEQUE: 'Cheque',
  TRANSFERENCIA: 'Transferencia',
  COMBINADO: 'Combinado',
};

// Cuando formaPago === 'COMBINADO', "Bueno por" desglosa cada método usado en
// vez de un solo monto (mismo criterio que importeFormaPagoHtml en
// cajaRecibosPdf.js, pero en una sola celda de tabla en vez de una caja aparte).
function buenoPorCombinadoTexto(combinado, tipoCambio) {
  const c = combinado || {};
  const partes = [];
  const efectivoPesos = Number(c.efectivo) || 0;
  const efectivoDolares = Number(c.efectivoDolares) || 0;
  if (efectivoPesos > 0 || efectivoDolares > 0) {
    const sub = [];
    if (efectivoPesos > 0) sub.push(`${money(efectivoPesos)} M.N.`);
    if (efectivoDolares > 0) sub.push(`$${efectivoDolares.toFixed(2)} USD`);
    partes.push(`Efectivo: ${sub.join(' + ')}${efectivoDolares > 0 ? ` (T.C. ${money(tipoCambio)})` : ''}`);
  }
  if (Number(c.credito) > 0) partes.push(`T. Crédito: ${money(c.credito)}${c.banco ? ` (${c.banco})` : ''}`);
  if (Number(c.debito) > 0) partes.push(`T. Débito: ${money(c.debito)}${c.banco ? ` (${c.banco})` : ''}`);
  if (Number(c.cheque) > 0) partes.push(`Cheque: ${money(c.cheque)}`);
  if (Number(c.transferencia) > 0) partes.push(`Transferencia: ${money(c.transferencia)}`);
  return partes.join(' + ');
}

const styles = `
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

function tablaResumen({ fechaTexto, buenoPorTexto, formaPagoTexto, saldoNuevoTexto }) {
  return `
    <table>
      <tr>
        <th>Fecha</th>
        <th>Forma de Pago</th>
        <th>Bueno por</th>
        <th>Saldo Resultante</th>
      </tr>
      <tr>
        <td>${fechaTexto}</td>
        <td>${formaPagoTexto}</td>
        <td>${buenoPorTexto}</td>
        <td>${saldoNuevoTexto}</td>
      </tr>
    </table>`;
}

// movimiento: AnticipoCliente tipo DEPOSITO. cliente: documento Cliente.
exports.generarAnticipoReciboPDF = async (res, movimiento, cliente) => {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    const fecha = dayjsFecha(movimiento?.fecha || new Date());

    const esCombinado = movimiento?.formaPago === 'COMBINADO';

    let buenoPorTexto;
    if (esCombinado) {
      buenoPorTexto = buenoPorCombinadoTexto(movimiento?.combinado, movimiento?.tipoCambio);
    } else {
      const pesos = Number(movimiento?.montoPesos || 0);
      const dolares = Number(movimiento?.montoDolares || 0);
      const partesBuenoPor = [];
      if (pesos > 0) partesBuenoPor.push(`${money(pesos)} M.N.`);
      if (dolares > 0) partesBuenoPor.push(`$${dolares.toFixed(2)} USD`);
      if (pesos > 0 && dolares > 0) partesBuenoPor.push(`(T.C. ${money(movimiento?.tipoCambio)})`);
      buenoPorTexto = partesBuenoPor.join(' + ') || `${money(movimiento?.monto)} M.N.`;
    }

    const formaPagoTexto = escapeHtml(
      FORMA_PAGO_LABEL[movimiento?.formaPago] +
        (movimiento?.chequeNumero && (movimiento?.formaPago === 'CHEQUE' || esCombinado)
          ? ` No. ${movimiento.chequeNumero}`
          : '')
    );

    const fechaTexto = escapeHtml(fecha.format('DD/MM/YYYY'));
    const clienteTexto = escapeHtml(nombreCliente(cliente));
    const observacionesTexto = escapeHtml(movimiento?.observaciones || '');
    const recibioTexto = escapeHtml(movimiento?.registradoPor || '');
    const folioTexto = escapeHtml(movimiento?.folioRecibo ?? '');
    const saldoNuevoTexto = money(movimiento?.saldoNuevo);

    const tabla = tablaResumen({ fechaTexto, buenoPorTexto, formaPagoTexto, saldoNuevoTexto });

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>${styles}</style>
</head>
<body>
  <div class="hoja hoja--caja">
    <div class="encabezado">
      <div>
        <h2>Recibo Provisional</h2>
        <small>(CAJA)</small>
      </div>
      <span class="folio">${folioTexto}</span>
    </div>

    ${tabla}

    <div class="dato"><span class="lbl">Recibimos de:</span> ${clienteTexto}</div>
    <div class="dato"><span class="lbl">Observaciones:</span> ${observacionesTexto}</div>
    <div class="dato"><span class="lbl">Recibió:</span> ${recibioTexto}</div>
  </div>

  <div class="hoja">
    <div class="encabezado">
      <div>
        <h2>Recibo Provisional</h2>
        <small>(CLIENTE)</small>
      </div>
      <span class="folio">${folioTexto}</span>
    </div>

    ${tabla}

    <div class="dato"><span class="lbl">Recibimos de:</span> ${clienteTexto}</div>

    <div class="firma-area">
      <div class="firma-linea">Recibió: ${recibioTexto}</div>
    </div>
  </div>
</body>
</html>`;

    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'Letter', printBackground: true });

    res.contentType('application/pdf');
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generando PDF de Recibo Provisional (anticipo):', error);
    if (!res.headersSent) res.status(500).send('Error al generar el PDF del Recibo Provisional');
  } finally {
    if (browser) await browser.close();
  }
};
