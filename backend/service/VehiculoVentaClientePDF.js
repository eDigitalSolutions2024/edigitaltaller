const puppeteer = require('puppeteer');
const dayjs = require('dayjs');
const path = require('path');
const fs = require('fs');


const assetPath = (...parts) =>
  path.join(__dirname, '..', 'assets', 'pdf', ...parts);

const imageBase64 = (filename) => {
  const filePath = assetPath(filename);
  if (!fs.existsSync(filePath)) return "";

  const ext = path.extname(filename).replace(".", "").toLowerCase();
  const mime = ext === "png" ? "image/png" : "image/jpeg";
  const data = fs.readFileSync(filePath).toString("base64");

  return `data:${mime};base64,${data}`;
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
  if (orden.nombreGobierno) return orden.nombreGobierno;

  const nombre = [
    orden.nombreCliente,
    orden.apellidoPaterno,
    orden.apellidoMaterno,
  ]
    .filter(Boolean)
    .join(' ');

  return nombre || orden.cliente?.nombre || 'N/A';
};

const telefono = (orden) => {
  const fijo = [orden.telefonoFijoLada, orden.telefonoFijo]
    .filter(Boolean)
    .join('');
  const cel = [orden.celularLada, orden.celular].filter(Boolean).join('');

  return fijo || cel || 'N/A';
};

exports.generarVentaClientePDF = async (res, orden) => {
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    const fechaActual = dayjs().format('DD/MM/YYYY');
    const horaRecepcion = orden.horaRecepcion || '';
    const fechaRecepcion = orden.fechaRecepcion
      ? dayjs(orden.fechaRecepcion).format('DD/MM/YYYY')
      : fechaActual;

    const items = (orden.ventaCliente || []).map((item) => {
      const cant = Number(item.cant || 0);
      const precio = Number(item.precioVenta || 0);
      const subtotal = cant * precio;
      const iva = subtotal * 0.08;

      return {
        cant,
        desc: item.concepto || '',
        precio,
        iva,
        total: subtotal + iva,
      };
    });

    const subtotal = items.reduce(
      (acc, item) => acc + Number(item.cant || 0) * Number(item.precio || 0),
      0
    );
    const iva = subtotal * 0.08;
    const totalFinal = subtotal + iva;

    const direccion = [
      orden.direccion,
      orden.numeroExt,
      orden.numeroInt,
      orden.colonia,
    ]
      .filter(Boolean)
      .join(' ');

      const logoSrc = imageBase64('logo_servicompactos.png');
      const engomadoSrc = imageBase64('engomado_ecologico.jpg');
      const marcasSrc = imageBase64('marcas_llantas.jpg');


    const htmlContent = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: Legal; margin: 10mm; }
    body {
      font-family: Helvetica, Arial, sans-serif;
      font-size: 16px;
      color: #000;
      margin: 0;
      padding: 0;
    }

    .top {
      display: grid;
      grid-template-columns: 78px 1fr 210px;
      align-items: start;
      gap: 10px;
      margin-bottom: 6px;
    }

    .qr {
      width: 54px;
      height: 54px;
      border: 8px solid #111;
      box-sizing: border-box;
      margin-left: 8px;
      margin-top: 2px;
    }

    .brand {
      text-align: center;
      color: #214190;
      font-size: 30px;
      font-weight: 700;
      line-height: 1;
      padding-top: 8px;
    }

    .brand span {
      color: #ef6b21;
    }

    .advisor {
      font-size: 16px;
      font-weight: 700;
      line-height: 1.5;
      padding-top: 8px;
    }

    .title {
      text-align: center;
      font-size: 17px;
      font-weight: 700;
      margin: 6px 0 2px;
    }

    .address {
      text-align: center;
      font-size: 16px;
      margin-bottom: 4px;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
      font-size: 16px;
    }

    .data-table td {
      border: 1px solid #000;
      padding: 2px 3px;
      vertical-align: top;
    }

    .label {
      font-weight: 700;
    }

    .os-label {
      background: #214190;
      color: #fff;
      font-weight: 700;
    }

    .os-number {
      color: red;
      font-weight: 700;
      text-align: center;
    }

    .items {
      width: 92%;
      margin: 0 auto 8px;
      border-collapse: collapse;
      font-size: 16px;
    }

    .items th {
      border-bottom: 1px solid #000;
      padding: 4px 3px;
      text-align: center;
      font-weight: 700;
    }

    .items td {
      padding: 3px;
      text-align: center;
    }

    .items .desc {
      text-align: center;
    }

    .items .money {
      text-align: right;
      white-space: nowrap;
    }

    .obs {
      width: 92%;
      margin: 8px auto 0;
      border-top: 1px solid #000;
      padding-top: 4px;
      font-size: 16px;
      min-height: 18px;
    }

    .included {
      width: 92%;
      margin: 8px auto;
      text-align: center;
      font-size: 16px;
      font-weight: 700;
    }

    .legal {
      width: 92%;
      margin: 0 auto;
      font-size: 16px;
      line-height: 1.7;
      text-align: justify;
    }

    .green-banner {
      width: 82%;
      margin: 10px auto;
      background: #8bd045;
      color: #fff;
      text-align: center;
      font-size: 16px;
      font-weight: 700;
      padding: 8px 10px;
      line-height: 1.5;
    }

    .tires-title {
      text-align: center;
      font-size: 16px;
      font-weight: 700;
      margin-top: 10px;
    }

    .tires-sub {
      text-align: center;
      font-size: 16px;
      margin-bottom: 6px;
    }

    .brand-grid {
      width: 80%;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 7px;
      align-items: center;
      text-align: center;
      font-size: 16px;
      font-weight: 700;
    }

    .brand-grid div {
      border: 1px solid #ddd;
      padding: 3px;
      min-height: 16px;
    }

    .logo {
        max-width: 500px;
        max-height: 70px;
        object-fit: contain;
    }

  </style>
</head>
<body>
  <div class="top">
    <div class="qr"></div>

    <div class="brand">
    ${
        logoSrc
        ? `<img src="${logoSrc}" class="logo" />`
        : `Servi<span>compactos</span>`
    }
    </div>


    <div class="advisor">
      ASESOR: ${escapeHtml(orden.asesor || 'admin')}<br>
      Tel: ${escapeHtml(orden.telefonoAsesor || '')}<br>
      Correo: ${escapeHtml(orden.correoAsesor || '')}<br>
      Fecha Cotización: ${fechaActual}
    </div>
  </div>

  <div class="title">PRESUPUESTO</div>
  <div class="address">
    Paseo Triunfo de la República No. 322-B, Cd. Juárez Chihuahua, Col. San Lorenzo, CP. 32320
    Tels: (656) 6 23 56 51 al 54
  </div>

  <table class="data-table">
    <tr>
      <td class="label" style="width: 20%;">NOMBRE DEL CLIENTE:</td>
      <td colspan="3">${escapeHtml(nombreCliente(orden))}</td>
      <td class="os-label" style="width: 18%;">ORDEN DE SERVICIO:</td>
      <td class="os-number" style="width: 14%;">${escapeHtml(orden.ordenServicio || '')}</td>
    </tr>
    <tr>
      <td class="label">FECHA DE RECEPCION:</td>
      <td colspan="2">${fechaRecepcion}${horaRecepcion ? ` A LAS ${escapeHtml(horaRecepcion)}` : ''}</td>
      <td class="label">CORREO</td>
      <td colspan="2">${escapeHtml(orden.correo || '')}</td>
    </tr>
    <tr>
      <td class="label">RFC:</td>
      <td>${escapeHtml(orden.rfc || '')}</td>
      <td class="label">TELEFONO</td>
      <td>${escapeHtml(telefono(orden))}</td>
      <td class="label">CELULAR</td>
      <td>${escapeHtml(orden.celular || '')}</td>
    </tr>
    <tr>
      <td class="label">DIRECCION:</td>
      <td colspan="5">${escapeHtml(direccion)}</td>
    </tr>
    <tr>
      <td align="center"><b>MARCA</b><br>${escapeHtml(orden.marca || '')}</td>
      <td align="center"><b>MODELO</b><br>${escapeHtml(orden.modelo || '')}</td>
      <td align="center"><b>AÑO</b><br>${escapeHtml(orden.anio || '')}</td>
      <td align="center"><b>COLOR</b><br>${escapeHtml(orden.color || '')}</td>
      <td align="center"><b>NACIONALIDAD</b><br>${escapeHtml(orden.nacionalidad || '')}</td>
      <td align="center"><b>SERIE</b><br>${escapeHtml(orden.serie || '')}</td>
    </tr>
    <tr>
      <td align="center"><b>PLACAS</b><br>${escapeHtml(orden.placas || '')}</td>
      <td align="center"><b>MOTOR</b><br>${escapeHtml(orden.motor || '')}</td>
      <td align="center"><b>KMS/MILLAS</b><br>${escapeHtml(orden.kmsMillas || '')}</td>
      <td align="center"><b>DIRIGIDO A:</b><br>${escapeHtml(orden.dirigidoA || '')}</td>
      <td align="center"><b>NUMERO ECONOMICO:</b><br>${escapeHtml(orden.numeroEconomico || '')}</td>
      <td></td>
    </tr>
  </table>

  <table class="items">
    <thead>
      <tr>
        <th style="width: 15%;">Cantidad</th>
        <th style="width: 51%;">Descripción del Servicio y/o Reparación</th>
        <th style="width: 12%;">Precio</th>
        <th style="width: 10%;">IVA</th>
        <th style="width: 12%;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${
        items.length
          ? items
              .map(
                (item) => `
        <tr>
          <td>${item.cant}</td>
          <td class="desc">${escapeHtml(item.desc)}</td>
          <td class="money">${money(item.precio)}</td>
          <td class="money">${money(item.iva)}</td>
          <td class="money">${money(item.total)}</td>
        </tr>`
              )
              .join('')
          : `<tr><td colspan="5">Sin partidas de venta al cliente.</td></tr>`
      }
      <tr>
        <td></td>
        <td></td>
        <td colspan="2" style="text-align:right;"><b>Importe Total:</b></td>
        <td class="money"><b>${money(totalFinal)}</b></td>
      </tr>
    </tbody>
  </table>

  <div class="obs">
    <b>Observaciones:</b> ${escapeHtml(orden.observCotizacion || orden.observacionesExternas || '')}
  </div>

  <div class="included">
    TODOS NUESTROS SERVICIOS INCLUYEN MANO DE OBRA Y REFACCIONES
  </div>

  <div class="legal">
    <p><b>Importante:</b> La presente cotización tiene una vigencia de 15 días a partir esta fecha y esta sujeta a cambios sin previo aviso, así mismo a la variación del dólar.</p>
    <p><b>Garantía:</b> Nuestras reparaciones estan garantizadas por noventa (90) días en condiciones de uso normal y que no hayan sido intervenidas por terceros. No hay garantia en partes eléctricas y/o usadas, ni en bombas de gasolina.</p>
  </div>

  ${
    engomadoSrc
        ? `<div class="engomado" style="text-align:center;"><img src="${engomadoSrc}" /></div>`
        : `<div class="green-banner">
            “Solicite su engomado ecológico y juntos cuidemos el medio ambiente”<br>
            (Precio 3 UMA’s IVA incluido)
        </div>`
    }

  <div class="tires-title">CENTRO LLANTERO MULTIMARCAS</div>
  <div class="tires-sub">
    Venta e instalación de llantas nuevas en las marcas de mayor prestigio al mejor precio !
  </div>

  ${
    marcasSrc
        ? `<div class="marcas"><img src="${marcasSrc}" /></div>`
        : `<div class="brand-grid">
            <div>MICHELIN</div>
            <div>GOODYEAR</div>
            <div>Continental</div>
            <div>NEXEN</div>
            <div>BFGoodrich</div>
            <div>DUNLOP</div>
            <div>Euzkadi</div>
            <div>NITTO</div>
            <div>PIRELLI</div>
            <div>HANKOOK</div>
            <div>BRIDGESTONE</div>
            <div>Y muchas más!!!</div>
        </div>`
    }
</body>
</html>`;

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'Legal',
      printBackground: true,
      margin: { top: '8mm', bottom: '10mm', left: '10mm', right: '10mm' },
    });

    res.contentType('application/pdf');
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generando PDF de venta al cliente:', error);
    res.status(500).send('Error al generar el PDF de venta al cliente');
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};
