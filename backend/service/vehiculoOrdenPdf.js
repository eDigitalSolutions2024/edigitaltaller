// backend/services/vehiculoOrdenPdf.js
// PDF que se genera con el botón "Imprimir" (2 hojas con condiciones)

const puppeteer = require('puppeteer');
const dayjs = require('dayjs');
const Codigo = require('../models/CodigoRefaccion'); // 👈 servicios / refacciones

// Paleta cercana a tu sistema
const PRIMARY = '#2563EB';
const PRIMARY_DARK = '#1D4ED8';
const PRIMARY_TEXT = '#FFFFFF';

// ---------- HELPERS ----------

function fmtFecha(fechaISO) {
  if (!fechaISO) return '';
  return dayjs(fechaISO).format('DD/MM/YYYY');
}

function fmtHora(fechaISO) {
  if (!fechaISO) return '';
  return dayjs(fechaISO).format('HH:mm');
}

function esc(str) {
  return (str ?? '').toString();
}

// Evitar [object Object] en la dirección
function fmtDireccionFull(v, extra = {}) {
  if (!v) {
    const { numeroExt, numeroInt, colonia, ciudad, estado } = extra;
    return [numeroExt, numeroInt, colonia, ciudad, estado]
      .filter(Boolean)
      .join(' ');
  }

  if (typeof v === 'string') return v;

  if (typeof v === 'object') {
    const {
      calle,
      numero,
      numeroExt,
      numeroInt,
      colonia,
      ciudad,
      estado,
      cp,
    } = v;
    return [
      calle,
      numero,
      numeroExt,
      numeroInt,
      colonia,
      ciudad,
      estado,
      cp,
    ]
      .filter(Boolean)
      .join(' ');
  }

  return String(v);
}

// Construye una lista HTML <ul> a partir de un arreglo de textos
function buildList(items = []) {
  const clean = (items || []).filter(Boolean);
  if (!clean.length) return '&nbsp;';
  return `<ul style="margin:0; padding-left:14px;">${clean
    .map((t) => `<li>${esc(t)}</li>`)
    .join('')}</ul>`;
}

// ---------- HTML DEL PDF "IMPRIMIR" ----------

function buildOrdenHtml(vehiculo, serviciosDocs = []) {
  const {
    ordenServicio,
    nombreGobierno,
    rfc,
    telefonoFijo,
    celular,
    direccion,
    numeroExt,
    numeroInt,
    colonia,
    ciudad,
    estado,
    correo,
    grua,
    marca,
    modelo,
    anio,
    color,
    serie,
    placas,
    kmsMillas,
    nacionalidad,
    motor,
    numeroEconomico,
    checkEngine,
    abs,
    airBag,
    frenos,
    aceite,
    alternador,
    observaciones,
    indicadoresTablero,
    otros,
    diagnosticoTecnico,
  } = vehiculo;

  const servicioReparacion = vehiculo.servicioReparacion || {};
  const infoLlantas = servicioReparacion.infoLlantas || '';
  const revisionFallas = servicioReparacion.revisionFallas || '';

  // --- Servicios dinámicos desde la BD (misma lógica que OPERATIVO) ---
  const serviciosMotor = [];
  const serviciosLubricacion = [];
  const serviciosRevision = [];
  const serviciosOtros = [];

  for (const s of serviciosDocs) {
    const label = `${s.codigo} - ${s.descripcion || ''}`.trim();
    const grupo = s.grupoServicio || 'otros';

    if (grupo === 'motor') serviciosMotor.push(label);
    else if (grupo === 'lubricacion') serviciosLubricacion.push(label);
    else if (grupo === 'revision') serviciosRevision.push(label);
    else serviciosOtros.push(label);
  }

  const serviciosMotorHtml = buildList(serviciosMotor);
  const serviciosLubricacionHtml = buildList(serviciosLubricacion);
  const serviciosRevisionHtml = buildList(serviciosRevision);
  const serviciosOtrosHtml = buildList(serviciosOtros);

  // --- Texto de fallas reportadas y llantas ---
  const fallasCliente = diagnosticoTecnico || revisionFallas || '';
  const textoLlantas = infoLlantas || '';

  // --- Otros / comentarios generales ---
  const textoOtros = indicadoresTablero || otros || observaciones || '';

  // Texto de "Condiciones de servicio"
  const condicionesCortas = `
    ACEPTO QUE MI CASO REQUIERE COMUNICARME PARA PRUEBA Y REPROGRAMACIÓN DE MI VEHÍCULO. 
    QUEDA BAJO MI RESPONSABILIDAD CUALQUIER OBJETO QUE PERMANEZCA EN EL VEHÍCULO. 
    AUTORIZO SE REALICEN LAS PRUEBAS Y MOVIMIENTOS NECESARIOS PARA LA REPARACIÓN.
  `;

  const condicionesLargas = `
    1. En virtud de este contrato, el distribuidor presta el servicio de reparación o mantenimiento del vehículo del Cliente, cuyas características se detallan en este documento.<br/>
    2. El Cliente declara ser el dueño del vehículo o tener facultades para autorizar la reparación o mantenimiento descritos, aceptando las condiciones y términos aquí indicados.<br/>
    3. El precio total por concepto de mano de obra, refacciones y servicios adicionales será cubierto en las instalaciones del Distribuidor, de acuerdo con lo convenido con el Cliente.<br/>
    4. Si el Cliente solicita servicios adicionales no contemplados inicialmente, el Distribuidor podrá realizarlos previa autorización, incluso por vía telefónica, dejando constancia en el presente contrato.<br/>
    5. El Distribuidor no será responsable por objetos personales, valores u otros bienes dejados dentro del vehículo durante su estancia en el taller.<br/>
    6. Para efectos de garantía de reparación, se aplicarán las condiciones establecidas por el fabricante y por el propio Distribuidor, mismas que el Cliente declara conocer y aceptar.<br/>
    7. El Cliente se obliga a recoger el vehículo en la fecha acordada; en caso contrario, el Distribuidor podrá cobrar un cargo razonable por concepto de almacenaje.<br/>
    8. En caso de cancelación del servicio por parte del Cliente, éste deberá cubrir el costo de los trabajos y refacciones ya realizados o instalados en el vehículo.<br/>
    9. El Distribuidor entregará la factura o comprobante correspondiente por el importe total de la operación efectuada.<br/>
    10. En todo lo no previsto en estas cláusulas, se estará a lo dispuesto por la legislación aplicable en materia de protección al consumidor y servicios automotrices.
  `;

  const fechaRecepcion = fmtFecha(vehiculo.fechaRecepcion);
  const horaRecepcion =
    vehiculo.horaRecepcion || fmtHora(vehiculo.fechaRecepcion);

  const direccionCompleta = fmtDireccionFull(direccion, {
    numeroExt,
    numeroInt,
    colonia,
    ciudad,
    estado,
  });

  return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>Orden de Servicio ${esc(ordenServicio)}</title>
<style>
  * { box-sizing: border-box; font-family: Arial, sans-serif; }
  body { margin: 0; padding: 0; font-size: 9.5px; }

  .page {
    width: 210mm;
    min-height: 297mm;
    padding: 8mm 8mm 10mm 8mm;
    margin: 0 auto;
    position: relative;
  }
  .page-break { page-break-after: always; }

  table { border-collapse: collapse; width: 100%; }
  th, td {
    border: 0.8px solid #000;
    padding: 2px 3px;
    vertical-align: middle;
  }
  .no-border td, .no-border th { border: none; }

  .small { font-size: 8.5px; }
  .center { text-align: center; }
  .right { text-align: right; }
  .label { font-weight: bold; }

  .brand-name {
    font-size: 22px;
    font-weight: 800;
    letter-spacing: 0.6px;
    color: ${PRIMARY_DARK};
  }
  .brand-slogan {
    font-size: 9px;
    margin-top: 2px;
    color: #4B5563;
  }
  .header-address {
    font-size: 8px;
    margin-top: 2px;
    color: #6B7280;
  }

  .grey-header {
    background: #E5E7EB;
    font-weight: bold;
  }
  .orden-label {
    background: #F3F4F6;
    font-weight: bold;
    text-align: center;
  }
  .orden-num {
    color: #DC2626;
    font-weight: 800;
    font-size: 14px;
  }

  .qr-box {
    border: 1px solid #6B7280;
    width: 32mm;
    height: 32mm;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: #6B7280;
  }

  .section-title {
    background: ${PRIMARY_DARK};
    color: ${PRIMARY_TEXT};
    font-weight: bold;
    text-align: center;
    padding: 2px 0;
    margin-top: 4px;
    letter-spacing: 1px;
  }
  .sub-title {
    background: #E5E7EB;
    font-weight: bold;
    text-align: center;
    padding: 1px 0;
  }

  .medium-cell { height: 60px; }
  .large-cell { height: 80px; }

  .condiciones-box {
    font-size: 7.5px;
    line-height: 1.25;
    text-align: justify;
  }

  .footer-page {
    font-size: 8px;
    text-align: center;
    margin-top: 4px;
  }
</style>
</head>
<body>

<!-- ================= PÁGINA 1 ================= -->
<div class="page page-break">

  <!-- Encabezado -->
  <table class="no-border">
    <tr>
      <td style="width: 25mm; vertical-align: top;">
        <div class="qr-box">QR</div>
      </td>
      <td style="text-align: center;">
        <div class="brand-name">Edigital Solutions</div>
        <div class="brand-slogan">Profesionales al servicio de su automóvil</div>
        <div class="header-address">
          32370, Av Valentín Fuentes Varela 1779, La Fuente, 32370 Juárez, Chih.
          Tel: (656) *********
        </div>
      </td>
      <td style="width: 40mm; text-align: right; font-size: 9px; vertical-align: top;">
        <div class="small"><span class="label">ASESOR:</span> admin</div>
      </td>
    </tr>
  </table>

  <!-- Datos del cliente -->
  <table style="margin-top:4px;">
    <tr>
      <td class="grey-header" style="width:23%;">NOMBRE DEL CLIENTE:</td>
      <td style="width:47%;">${esc(nombreGobierno)}</td>
      <td class="orden-label" style="width:15%;">ORDEN DE SERVICIO:</td>
      <td class="orden-label" style="width:15%;"><span class="orden-num">${esc(
        ordenServicio
      )}</span></td>
    </tr>
    <tr>
      <td class="grey-header">FECHA DE RECEPCIÓN:</td>
      <td>${esc(fechaRecepcion)} A LAS ${esc(horaRecepcion)} hrs</td>
      <td class="grey-header">CORREO</td>
      <td>${esc(correo)}</td>
    </tr>
    <tr>
      <td class="grey-header">RFC:</td>
      <td>${esc(rfc)}</td>
      <td class="grey-header">TELÉFONO</td>
      <td>${esc(telefonoFijo || celular || '')}</td>
    </tr>
    <tr>
      <td class="grey-header">DIRECCIÓN:</td>
      <td colspan="3">${esc(direccionCompleta)}</td>
    </tr>
  </table>

  <!-- Datos vehículo -->
  <table>
    <tr>
      <td class="grey-header" style="width:12%;">MARCA</td>
      <td style="width:13%;">${esc(marca)}</td>
      <td class="grey-header" style="width:12%;">MODELO</td>
      <td style="width:13%;">${esc(modelo)}</td>
      <td class="grey-header" style="width:12%;">AÑO</td>
      <td style="width:13%;">${esc(anio)}</td>
      <td class="grey-header" style="width:12%;">COLOR</td>
      <td style="width:13%;">${esc(color)}</td>
    </tr>
    <tr>
      <td class="grey-header">PLACAS</td>
      <td>${esc(placas)}</td>
      <td class="grey-header">MOTOR</td>
      <td>${esc(motor)}</td>
      <td class="grey-header">KMS/MILLAS</td>
      <td>${esc(kmsMillas)}</td>
      <td class="grey-header">NACIONALIDAD</td>
      <td>${esc(nacionalidad)}</td>
    </tr>
    <tr>
      <td class="grey-header">NO. ECONÓMICO</td>
      <td>${esc(numeroEconomico)}</td>
      <td class="grey-header">SERIE</td>
      <td colspan="3">${esc(serie)}</td>
      <td class="grey-header">GRÚA</td>
      <td>${esc(grua)}</td>
    </tr>
  </table>

  <!-- Indicadores -->
  <div class="section-title" style="margin-top:4px;">INDICADORES DEL TABLERO</div>
  <table>
    <tr>
      <th class="center">CHECK ENGINE</th>
      <th class="center">ABS</th>
      <th class="center">AIR BAG</th>
      <th class="center">FRENOS</th>
      <th class="center">ACEITE</th>
      <th class="center">ALTERNADOR</th>
    </tr>
    <tr>
      <td class="center">${esc(checkEngine || '')}</td>
      <td class="center">${esc(abs || '')}</td>
      <td class="center">${esc(airBag || '')}</td>
      <td class="center">${esc(frenos || '')}</td>
      <td class="center">${esc(aceite || '')}</td>
      <td class="center">${esc(alternador || '')}</td>
    </tr>
  </table>

  <!-- Otros -->
  <div class="section-title" style="margin-top:3px;">OTROS</div>
  <table>
    <tr>
      <td class="medium-cell">
        ${esc(textoOtros) || '&nbsp;'}
      </td>
    </tr>
  </table>

  <!-- Servicio -->
  <div class="section-title" style="margin-top:3px;">S E R V I C I O</div>
  <div class="sub-title">DETALLE DE SERVICIOS SOLICITADOS</div>
  <table>
    <tr>
      <th class="center" style="width:25%;">MOTOR / SUSPENSIÓN</th>
      <th class="center" style="width:25%;">LUBRICACIÓN</th>
      <th class="center" style="width:25%;">REVISIÓN / AJUSTES</th>
      <th class="center" style="width:25%;">OTROS SERVICIOS</th>
    </tr>
    <tr>
      <td class="large-cell">${serviciosMotorHtml}</td>
      <td class="large-cell">${serviciosLubricacionHtml}</td>
      <td class="large-cell">${serviciosRevisionHtml}</td>
      <td class="large-cell">${serviciosOtrosHtml}</td>
    </tr>
  </table>

  <!-- Fallas -->
  <div class="section-title" style="margin-top:3px;">FALLAS REPORTADAS POR EL CLIENTE</div>
  <table>
    <tr>
      <td class="medium-cell">
        ${esc(fallasCliente) || '&nbsp;'}
      </td>
    </tr>
  </table>

  <!-- Llantas -->
  <div class="section-title" style="margin-top:3px;">INFORMACIÓN DE LLANTAS</div>
  <table>
    <tr>
      <td class="medium-cell">
        ${esc(textoLlantas) || '&nbsp;'}
      </td>
    </tr>
  </table>

  <!-- Condiciones de servicio (resumen) -->
  <div class="section-title" style="margin-top:3px;">CONDICIONES DE SERVICIO</div>
  <table>
    <tr>
      <td class="condiciones-box">
        ${condicionesCortas}
      </td>
    </tr>
  </table>

  <div class="footer-page">Página 1 - 2</div>

</div>

<!-- ================= PÁGINA 2 ================= -->
<div class="page">

  <table class="no-border">
    <tr>
      <td class="center" style="font-weight:bold; font-size:10px;">
        AUTORIZACIÓN Y FIRMA DEL CLIENTE Y/O SUS REPRESENTANTES
      </td>
      <td class="center" style="font-weight:bold; font-size:10px;">
        FIRMA DEL ASESOR O QUIEN LEVANTA LA ORDEN DE SERVICIO
      </td>
    </tr>
  </table>

  <div class="section-title" style="margin-top:4px; letter-spacing:0;">
    CONDICIONES DEL CONTRATO DE PRESTACIÓN DE SERVICIOS DE REPARACIÓN Y/O MANTENIMIENTO DE VEHÍCULOS
  </div>

  <table>
    <tr>
      <td class="condiciones-box">
        ${condicionesLargas}
      </td>
    </tr>
  </table>

  <div class="footer-page">Página 2 - 2</div>
</div>

</body>
</html>
`;
}

// ---------- FUNCIÓN PRINCIPAL ----------

async function streamVehiculoOrdenPdf(res, vehiculo) {
  // Igual que en el OPERATIVO: leemos los códigos seleccionados y jalamos los docs
  const servicioReparacion = vehiculo.servicioReparacion || {};
  const codigosSel = servicioReparacion.serviciosSeleccionados || [];

  let serviciosDocs = [];
  if (codigosSel.length) {
    serviciosDocs = await Codigo.find({
      tipo: 'servicio',
      codigo: { $in: codigosSel },
    }).lean();
  }

  const html = buildOrdenHtml(vehiculo, serviciosDocs);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '5mm', bottom: '5mm', left: '5mm', right: '5mm' },
  });

  await browser.close();

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="orden_servicio_${vehiculo.ordenServicio}.pdf"`
  );
  res.send(pdfBuffer);
}

module.exports = { streamVehiculoOrdenPdf };
