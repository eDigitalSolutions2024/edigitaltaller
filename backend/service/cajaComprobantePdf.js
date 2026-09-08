// PDF de comprobantes de Caja (Nota de Venta / Remisión), replicando el papel
// preimpreso de Servicompactos: encabezado con logo y folio, datos de cliente y
// vehículo, partidas con IVA ya incluido en el precio (sin desglosarlo),
// observaciones y pie con leyendas, cantidad con letra e importe total.
const puppeteer = require('puppeteer');
const dayjs = require('dayjs');
require('dayjs/locale/es');
const path = require('path');
const fs = require('fs');
const { dayjsFecha } = require('../utils/fechas');
const { cantidadConLetra } = require('../utils/numeroALetras');
const { calcularTotalesOrden } = require('../utils/cajaTotales');
const { WATERMARK_CSS, watermarkHtmlPago } = require('../utils/pdfWatermark');

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

const TERMINALES_TARJETA_PDF = ['BANREGIO', 'AMERICAN EXPRESS', 'BANAMEX', 'BANORTE', 'BBVA BANCOMER'];

// Texto legible de la forma de pago de una Nota de Venta. Vale tanto para las
// nuevas (notaVenta.formaPago + combinado/terminal) como para las viejas, que
// solo traían notaVenta.banco con el método o la terminal. En un pago
// combinado se imprime solo "Combinado" (el desglose por método va en el
// Recibo Provisional / Cierre de Caja, no en la Nota de Venta).
function formaPagoNotaVentaTexto(nv = {}) {
  if (nv.formaPago === 'COMBINADO') return 'Combinado';
  const banco = nv.banco || '';
  if (TERMINALES_TARJETA_PDF.includes(banco)) {
    const t = nv.formaPago === 'DEBITO' ? 'T. Débito' : nv.formaPago === 'CREDITO' ? 'T. Crédito' : 'Tarjeta';
    return `${t} — ${banco}`;
  }
  if (banco === 'CHEQUE' || nv.formaPago === 'CHEQUE') return `Cheque${nv.chequeNumero ? ` No. ${nv.chequeNumero}` : ''}`;
  if (banco === 'TRANSFERENCIA' || nv.formaPago === 'TRANSFERENCIA') return 'Transferencia';
  if (banco === 'DOLARES') return 'Dólares';
  if (banco === 'EFECTIVOS' || banco === '') return 'Efectivo';
  return banco;
}

// ===== Sello "PAGADO" =====
// La Nota de Venta se re-imprime con un sello a media hoja / lado derecho
// (fecha, hora + usuario y la cantidad con su forma de pago, desglosada por
// método si fue combinado) cuando la orden quedó liquidada. Dos casos:
//   1. Se liquidó con la opción "Liquidar" de Cajas (pago SIN_COMPROBANTE no
//      cancelado): se muestran los datos de esa liquidación.
//   2. La propia Nota de Venta se hizo a Contado y cubrió el total exacto:
//      se muestran los datos de la Nota de Venta.
const TOLERANCIA_SELLO = 0.01;

const FORMA_PAGO_LABEL = {
  EFECTIVO: 'Efectivo',
  CREDITO: 'T. Crédito',
  DEBITO: 'T. Débito',
  CHEQUE: 'Cheque',
  TRANSFERENCIA: 'Transferencia',
};

const SELLO_PAGADO_CSS = `
  .sello-pagado {
    position: fixed;
    top: 58%;
    right: 5%;
    width: 200px;
    padding: 9px 13px 10px;
    border: 3px double #1a7a34;
    border-radius: 6px;
    color: #1a7a34;
    transform: rotate(-7deg);
    font-family: Helvetica, Arial, sans-serif;
    opacity: 0.92;
    z-index: 9999;
    pointer-events: none;
  }
  .sello-pagado .sello-titulo {
    text-align: center;
    font-size: 25px;
    font-weight: 900;
    letter-spacing: 3px;
    border-bottom: 2px solid #1a7a34;
    padding-bottom: 3px;
    margin-bottom: 8px;
  }
  /* Cada renglón lleva un único font-weight: al rotar la caja, Chromium
     compone dos pesos distintos de la misma línea con ángulos ligeramente
     diferentes y el texto se ve "escalonado". */
  .sello-pagado .sello-fila { font-size: 10.5px; line-height: 1.75; font-weight: 700; white-space: nowrap; }
  .sello-pagado .sello-pago {
    margin-top: 7px;
    border-top: 1px dashed #1a7a34;
    padding-top: 5px;
    font-size: 10.5px;
    line-height: 1.6;
    font-weight: 700;
  }
  .sello-pagado .sello-pago .linea { display: block; }
`;

// Renglones "cantidad — cómo se pagó" de un cobro. `cobro` es pago.liquidacion
// (opción "Liquidar") o pago.notaVenta (Nota de Venta a Contado): ambos traen
// { formaPago, chequeNumero, combinado }. Un solo renglón para un método
// simple; un renglón por método cuando fue COMBINADO. Los dólares y el saldo a
// favor aplicado van en su propio renglón para que la suma sea el total.
function desgloseCobro(pago, cobro = {}) {
  const partes = [];

  if (cobro.formaPago === 'COMBINADO') {
    const c = cobro.combinado || {};
    if (Number(c.efectivo) > 0) partes.push(`Efectivo: ${money(c.efectivo)}`);
    if (Number(c.efectivoDolares) > 0) partes.push(`Efectivo: $${Number(c.efectivoDolares).toFixed(2)} USD`);
    if (Number(c.credito) > 0) partes.push(`T. Crédito: ${money(c.credito)}`);
    if (Number(c.debito) > 0) partes.push(`T. Débito: ${money(c.debito)}`);
    if (Number(c.cheque) > 0) partes.push(`Cheque${cobro.chequeNumero ? ` No. ${cobro.chequeNumero}` : ''}: ${money(c.cheque)}`);
    if (Number(c.transferencia) > 0) partes.push(`Transferencia: ${money(c.transferencia)}`);
  } else {
    const label = FORMA_PAGO_LABEL[cobro.formaPago] || 'Efectivo';
    const chequeNo = cobro.formaPago === 'CHEQUE' && cobro.chequeNumero ? ` No. ${cobro.chequeNumero}` : '';
    if (Number(pago?.montoPesos) > 0) partes.push(`${money(pago.montoPesos)} — ${label}${chequeNo}`);
    if (Number(pago?.montoDolares) > 0) partes.push(`$${Number(pago.montoDolares).toFixed(2)} USD`);
  }

  if (Number(pago?.saldoAplicado?.monto) > 0) {
    partes.push(`Saldo a favor: ${money(pago.saldoAplicado.monto)}`);
  }

  return partes.length ? partes : [money(pago?.monto)];
}

function selloPagadoHtml(pago, cobro) {
  if (!pago) return '';
  const fecha = dayjsFecha(pago.fecha || new Date()).locale('es');
  const diaMes = fecha.format('D [de] MMMM');
  const horaUsuario = [fecha.format('HH:mm'), pago.registradoPor].filter(Boolean).join(' — ');
  const lineasPago = desgloseCobro(pago, cobro)
    .map((l) => `<span class="linea">${escapeHtml(l)}</span>`)
    .join('');
  return `
  <div class="sello-pagado">
    <div class="sello-titulo">PAGADO</div>
    <div class="sello-fila">Fecha: ${escapeHtml(diaMes)}</div>
    <div class="sello-fila">Hora: ${escapeHtml(horaUsuario)}</div>
    <div class="sello-pago">${lineasPago}</div>
  </div>`;
}

// Decide si la Nota de Venta lleva sello "PAGADO" y con qué cobro se llena.
// `pagoNota` es el pago cuya Nota de Venta se está imprimiendo; `totales` los
// de calcularTotalesOrden(orden). Devuelve { pago, cobro } o null.
function selloPagadoParaNota(orden, pagoNota, totales) {
  if (totales.saldoPendiente > TOLERANCIA_SELLO) return null;

  const liquidacion = [...(orden?.pagos || [])]
    .filter((p) => p.comprobante === 'SIN_COMPROBANTE' && !p.cancelado)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
  if (liquidacion) return { pago: liquidacion, cobro: liquidacion.liquidacion || {} };

  if (pagoNota?.notaVenta?.tipo === 'Contado' && !pagoNota?.cancelado) {
    return { pago: pagoNota, cobro: pagoNota.notaVenta || {} };
  }
  return null;
}

const nombreCliente = (orden) => {
  const c = orden.cliente || {};
  if (c.tipoCliente === 'Particular') {
    return [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(' ') || '';
  }
  return c.gobierno?.nombreGobierno || c.nombre || '';
};

const domicilio = (orden) => {
  const d = (orden.cliente || {}).direccion || {};
  const calle = [d.calle, d.numeroExterior, d.numeroInterior].filter(Boolean).join(' ');
  return `${calle} Col.: ${d.colonia || ''} C.P.: ${d.cp || d.codigoPostal || ''}`;
};

const ciudad = (orden) => {
  const d = (orden.cliente || {}).direccion || {};
  return [d.ciudad, d.estado].filter(Boolean).join(', ');
};

const telefono = (orden) => {
  const c = orden.cliente || {};
  const tel = (c.telefonos || [])[0] || {};
  const cel = (c.celulares || [])[0] || {};
  const fijo = [tel.lada, tel.numero].filter(Boolean).join(' ');
  const celular = [cel.lada, cel.numero].filter(Boolean).join(' ');
  return fijo || celular || '';
};

// Descuentos activos que aplican a una partida específica (mismo criterio que
// CajaCostoVentaTable en el frontend: porcentajes sobre el subtotal de la línea).
const descuentoLinea = (row, descuentosActivos) => {
  const subtotalLinea = Number(row.cant || 0) * Number(row.precioVenta || 0);
  return descuentosActivos
    .filter((d) => row._id && String(d.lineaId) === String(row._id))
    .reduce(
      (s, d) =>
        s + (d.tipo === 'PORCENTAJE' ? subtotalLinea * (Number(d.valor || 0) / 100) : Number(d.valor || 0)),
      0
    );
};

// tipo: 'NOTA_VENTA' | 'REMISION' — pago es el subdocumento de orden.pagos cuyo
// comprobante (folio) se imprime.
exports.generarComprobanteCajaPDF = async (res, orden, pago, tipo) => {
  let browser;
  const esNota = tipo === 'NOTA_VENTA';

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    const folio = esNota ? pago?.notaVenta?.numero : pago?.remision?.numero;
    const formaPagoTexto = esNota ? formaPagoNotaVentaTexto(pago?.notaVenta || {}) : '';
    const fecha = dayjsFecha(pago?.fecha || new Date()).locale('es').format('DD-MMM-YY');

    // IVA aplicado dentro del precio de cada partida, sin mostrarse desglosado.
    const totales = calcularTotalesOrden(orden);

    // Sello "PAGADO": solo en la Nota de Venta y solo si la orden quedó
    // liquidada (por "Liquidar" o por la propia Nota de Venta a Contado).
    const sello = esNota ? selloPagadoParaNota(orden, pago, totales) : null;
    const ivaRate = totales.ivaPct / 100;
    const descuentosActivos = (orden.descuentos || []).filter((d) => d.activo !== false);

    const lineas = (orden.ventaCliente || []).map((r) => {
      const cant = Number(r.cant || 0);
      const precioUni = Number(r.precioVenta || 0) * (1 + ivaRate);
      const importe = cant * precioUni;
      const descuento = descuentoLinea(r, descuentosActivos);
      return {
        cant,
        concepto: r.concepto || '',
        precioUni,
        importe,
        descuento,
        total: importe - descuento,
      };
    });

    const logoSrc = imageBase64('logo_servicompactos.png');
    const tituloFolio = esNota ? 'Nota de Venta:' : 'No. Remisión:';

    const htmlContent = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: Letter; margin: 12mm 14mm; }
    html, body { height: 100%; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 13px;
      color: #000;
      margin: 0;
      display: flex;
      flex-direction: column;
    }
    .label { font-style: italic; font-weight: 700; }

    /* ===== 1. Logo y folio ===== */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 18px;
    }
    .logo { max-width: 320px; max-height: 60px; object-fit: contain; }
    .brand-fallback { color: #214190; font-size: 28px; font-weight: 700; }
    .brand-fallback span { color: #ef6b21; }
    .folio { font-size: 17px; padding-top: 10px; white-space: nowrap; }
    .folio .num { font-family: Helvetica, Arial, sans-serif; font-size: 16px; margin-left: 8px; }

    /* ===== 2. Datos del cliente y vehículo ===== */
    .datos {
      border-top: 1px solid #000;
      border-bottom: 1px solid #000;
      padding: 8px 4px 10px;
      display: grid;
      grid-template-columns: 46% 32% 22%;
      column-gap: 8px;
      line-height: 1.9;
    }
    .datos .valor { font-family: Helvetica, Arial, sans-serif; font-size: 12.5px; }

    /* ===== 3. Partidas ===== */
    .items { width: 100%; border-collapse: collapse; margin-top: 4px; }
    .items th {
      font-style: italic;
      font-weight: 700;
      border-bottom: 1.5px solid #000;
      padding: 4px 4px;
      text-align: right;
    }
    .items th.cant { text-align: center; }
    .items th.desc { text-align: left; }
    .items td {
      font-family: Helvetica, Arial, sans-serif;
      font-size: 12px;
      padding: 4px 4px;
      text-align: right;
      vertical-align: top;
    }
    .items td.cant { text-align: center; }
    .items td.desc { text-align: left; }
    .totales-tabla {
      display: flex;
      justify-content: flex-end;
      gap: 60px;
      padding: 6px 4px 0;
      font-size: 14px;
    }
    .totales-tabla .valor { font-family: Helvetica, Arial, sans-serif; font-size: 13px; margin-left: 10px; }

    /* ===== 4. Observaciones ===== */
    .obs { flex: 1; padding-top: 40px; }
    .obs .texto {
      font-family: Helvetica, Arial, sans-serif;
      font-size: 12.5px;
      margin-top: 6px;
      white-space: pre-wrap;
    }

    /* ===== 5. Nota final ===== */
    .leyendas { border-top: 2.5px solid #000; padding-top: 4px; }
    .leyendas .incluye {
      text-align: center;
      font-weight: 700;
      font-family: Helvetica, Arial, sans-serif;
      font-size: 13px;
      border-bottom: 2.5px solid #000;
      padding-bottom: 3px;
      margin-bottom: 8px;
    }
    .leyendas p { margin: 0 0 6px; text-align: justify; font-size: 12.5px; }
    .cierre {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-top: 14px;
    }
    .cierre .letra { font-size: 12.5px; padding-top: 14px; }
    .cierre .importes { text-align: right; }
    .cierre .fila { margin-bottom: 26px; font-size: 15px; }
    .cierre .valor { font-family: Helvetica, Arial, sans-serif; font-size: 13.5px; margin-left: 18px; }
${WATERMARK_CSS}
${SELLO_PAGADO_CSS}
  </style>
</head>
<body>
  ${watermarkHtmlPago(pago)}
  ${sello ? selloPagadoHtml(sello.pago, sello.cobro) : ''}
  <div class="header">
    ${logoSrc ? `<img src="${logoSrc}" class="logo" />` : `<div class="brand-fallback">Servi<span>compactos</span></div>`}
    <div class="folio label">${tituloFolio}<span class="num">${escapeHtml(folio ?? '')}</span></div>
  </div>

  <div class="datos">
    <div>
      <span class="label">Cliente:</span> <span class="valor">${escapeHtml(nombreCliente(orden))}</span><br>
      <span class="label">Domicilio:</span> <span class="valor">${escapeHtml(domicilio(orden))}</span><br>
      <span class="label">Ciudad:</span> <span class="valor">${escapeHtml(ciudad(orden))}</span><br>
      <span class="label">Fecha:</span> <span class="valor">${escapeHtml(fecha)}</span>
      &nbsp;&nbsp;<span class="label">${esNota ? 'Telefono:' : 'Tel:'}</span> <span class="valor">${escapeHtml(telefono(orden))}</span>
    </div>
    <div>
      <span class="label">Marca:</span> <span class="valor">${escapeHtml([orden.marca, orden.modelo].filter(Boolean).join(' , '))}</span><br>
      <span class="label">Serie:</span> <span class="valor">${escapeHtml(orden.serie || '')}</span><br>
      <span class="label">Placas:</span> <span class="valor">${escapeHtml(orden.placas || '')}</span><br>
      ${esNota ? `<span class="label">Forma de pago:</span> <span class="valor">${escapeHtml(formaPagoTexto)}</span>` : ''}
    </div>
    <div>
      <span class="label">Modelo:</span> <span class="valor">${escapeHtml(orden.anio || '')}</span><br>
      <span class="label">Kms:</span> <span class="valor">${escapeHtml(orden.kmsMillas || '0')}</span><br>
      <span class="label">Color:</span> <span class="valor">${escapeHtml(orden.color || '')}</span>
    </div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th class="cant" style="width: 7%;">Cant.</th>
        <th class="desc" style="width: 47%;">Descripción</th>
        <th style="width: 12%;">Precio Uni</th>
        <th style="width: 12%;">Importe</th>
        <th style="width: 10%;">Descuento</th>
        <th style="width: 12%;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${
        lineas.length
          ? lineas
              .map(
                (l) => `
      <tr>
        <td class="cant">${l.cant}</td>
        <td class="desc">${escapeHtml(l.concepto)}</td>
        <td>${money(l.precioUni)}</td>
        <td>${money(l.importe)}</td>
        <td>${money(l.descuento)}</td>
        <td>${money(l.total)}</td>
      </tr>`
              )
              .join('')
          : `<tr><td class="desc" colspan="6">Sin partidas registradas.</td></tr>`
      }
    </tbody>
  </table>
  <div class="totales-tabla">
    <div><span class="label">Sub Descto:</span><span class="valor">${totales.descuentoMonto > 0 ? money(totales.descuentoMonto) : ''}</span></div>
    <div><span class="label">Sub Total</span><span class="valor">${money(totales.totalOrden)}</span></div>
  </div>

  <div class="obs">
    <span class="label">Observaciones:</span>
    <div class="texto">${escapeHtml(pago?.observaciones || '')}</div>
  </div>

  <div class="leyendas">
    <div class="incluye">ESTE SERVICIO INCLUYE MANO DE OBRA Y REFACCIONES</div>
    <p><span class="label">Importante:</span> Las cotizaciones incluidas en la presente nota tienen una validez de 15 días a partir de la fecha de la emisión de la misma.</p>
    <p><span class="label">Garantía:</span> Nuestras reparaciones estan garantizadas por noventa (90) días o mil quinientos kmts. en condiciones de uso normal, y que no hayan sido intervenidas por terceros. Excepto en partes electricas, usadas y/o surtidas por el cliente.</p>
    <p>Recibí vehículo, en conformidad con los servicios mencionados en la presente nota.</p>

    <div class="cierre">
      <div class="letra">${escapeHtml(cantidadConLetra(totales.totalOrden))}</div>
      <div class="importes">
        <div class="fila"><span class="label">Sub-Total:</span><span class="valor">${money(totales.totalOrden)}</span></div>
        <div class="fila"><span class="label">Importe Total:</span><span class="valor">${money(totales.totalOrden)}</span></div>
      </div>
    </div>
  </div>
</body>
</html>`;

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
    });

    res.contentType('application/pdf');
    res.send(pdfBuffer);
  } catch (error) {
    console.error(`Error generando PDF de ${esNota ? 'Nota de Venta' : 'Remisión'}:`, error);
    res.status(500).send('Error al generar el PDF del comprobante');
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};
