// backend/service/vehiculoOperativoPdf.js
// Genera el PDF "Operativo" de la orden usando Puppeteer

const puppeteer = require('puppeteer');
const dayjs = require('dayjs');
const Codigo = require('../models/CodigoRefaccion'); // 👈 servicios / refacciones

// Colores acordes a tu sistema (mismos que vehiculoOrdenPdf)
const PRIMARY = '#2563EB';
const PRIMARY_DARK = '#1D4ED8';
const PRIMARY_TEXT = '#FFFFFF';

// ---------- HELPERS DE FORMATO ----------

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

// Evitamos "[object Object]" en dirección
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
  const clean = items.filter(Boolean);
  if (!clean.length) return '&nbsp;';
  return `<ul style="margin:0; padding-left:14px;">${clean
    .map((t) => `<li>${esc(t)}</li>`)
    .join('')}</ul>`;
}

// ---------- HTML DEL PDF OPERATIVO ----------

function buildOperativoHtml(vehiculo, serviciosDocs = []) {
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

  // Objeto actual de servicioReparacion (nuevo formato con serviciosSeleccionados)
  const servicioReparacion = vehiculo.servicioReparacion || {};
  const infoLlantas = servicioReparacion.infoLlantas || '';
  const revisionFallas = servicioReparacion.revisionFallas || '';

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

  // --- Servicios dinámicos desde la BD ---
  // serviciosDocs viene de Mongo: [{codigo, descripcion, grupoServicio, ...}]
  const serviciosMotor = [];
  const serviciosLubricacion = [];
  const serviciosRevision = [];
  const serviciosOtros = [];

  for (const s of serviciosDocs) {
    const label = `${s.codigo} - ${s.descripcion || ''}`.trim();
    const grupo = s.grupoServicio || 'otros'; // si no tienes ese campo, todo cae en "otros"

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
  const textoOtros = indicadoresTablero || otros || '';

  // HTML
  return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>Orden Operativa ${esc(ordenServicio)}</title>
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

  .grey-header {
    background: #E5E7EB;
    font-weight: bold;
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

  .footer-page {
    font-size: 8px;
    text-align: center;
    margin-top: 4px;
  }
</style>
</head>
<body>

<!-- =================== PÁGINA 1 =================== -->
<div class="page page-break">

  <!-- ENCABEZADO -->
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

  <!-- DATOS DEL CLIENTE -->
  <table style="margin-top: 4px;">
    <tr>
      <td class="grey-header" style="width: 23%;">NOMBRE DEL CLIENTE:</td>
      <td style="width: 47%;">${esc(nombreGobierno)}</td>
      <td class="orden-label" style="width: 15%;">ORDEN DE SERVICIO:</td>
      <td class="orden-label" style="width: 15%;"><span class="orden-num">${esc(
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

  <!-- DATOS DEL VEHÍCULO -->
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

  <!-- INDICADORES DEL TABLERO -->
  <div class="section-title" style="margin-top: 4px;">INDICADORES DEL TABLERO</div>
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

  <!-- OTROS -->
  <div class="section-title" style="margin-top: 3px;">OTROS</div>
  <table>
    <tr>
      <td class="medium-cell">
        ${esc(textoOtros) || '&nbsp;'}
      </td>
    </tr>
  </table>

  <!-- SERVICIO (DINÁMICO DESDE BD) -->
  <div class="section-title" style="margin-top: 3px;">S E R V I C I O</div>
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

  <!-- FALLAS REPORTADAS -->
  <div class="section-title" style="margin-top: 3px;">FALLAS REPORTADAS POR EL CLIENTE</div>
  <table>
    <tr>
      <td class="medium-cell">
        ${esc(fallasCliente) || '&nbsp;'}
      </td>
    </tr>
  </table>

  <!-- INFORMACIÓN DE LLANTAS -->
  <div class="section-title" style="margin-top: 3px;">INFORMACIÓN DE LLANTAS</div>
  <table>
    <tr>
      <td class="medium-cell">
        ${esc(textoLlantas) || '&nbsp;'}
      </td>
    </tr>
  </table>

  <!-- OBSERVACIONES -->
  <div class="section-title" style="margin-top: 3px;">OBSERVACIONES</div>
  <table>
    <tr>
      <td class="medium-cell">
        ${esc(observaciones) || '&nbsp;'}
      </td>
    </tr>
  </table>

  <div class="footer-page">Página 1 - 2</div>
</div>

<!-- =================== PÁGINA 2 =================== -->
<div class="page">

  <div class="small center" style="margin-bottom: 4px; color:${PRIMARY_DARK}; font-weight:bold;">
    Edigital Solutions - ORDEN OPERATIVA ${esc(ordenServicio)}
  </div>

  <!-- DIAGNÓSTICO DEL TÉCNICO -->
  <div class="section-title">DIAGNÓSTICO DEL TÉCNICO</div>
  <table>
    <tr>
      <td class="large-cell">${esc(vehiculo.diagnosticoTecnico || '')}</td>
    </tr>
  </table>

  <!-- REFACCIONES SOLICITADAS -->
  <div class="section-title" style="margin-top: 3px;">TÉCNICO "REFACCIONES SOLICITADAS"</div>
  <table>
    <tr>
      <th class="center" style="width:18%;">FECHA SOLICITUD</th>
      <th class="center" style="width:12%;">CANTIDAD</th>
      <th class="center" style="width:40%;">NOMBRE DE REFACCIÓN</th>
      <th class="center" style="width:30%;">OBSERVACIONES</th>
    </tr>
    ${
      (vehiculo.refaccionesSolicitadas || [])
        .map((r) => `
          <tr>
            <td class="center">${fmtFecha(
              r.fechaSolicitud || vehiculo.fechaRecepcion
            )}</td>
            <td class="center">${esc(r.cant || r.cantidad || '')}</td>
            <td>${esc(r.refaccion || r.nombre || '')}</td>
            <td>${esc(r.observaciones || '')}</td>
          </tr>
        `)
        .join('')
    }
    ${Array.from({ length: 10 })
      .map(
        () => `
      <tr><td>&nbsp;</td><td></td><td></td><td></td></tr>
    `
      )
      .join('')}
  </table>

  <!-- DIAGNÓSTICO DE CALIDAD -->
  <div class="section-title" style="margin-top: 6px;">DIAGNÓSTICO DE CALIDAD</div>
  <table>
    <tr>
      <td class="label" style="width:10%;">Fecha:</td>
      <td style="width:20%;">&nbsp;</td>
      <td class="label" style="width:10%;">Hora:</td>
      <td style="width:20%;">&nbsp;</td>
      <td style="width:40%;">&nbsp;</td>
    </tr>
    <tr>
      <td colspan="5" class="large-cell">&nbsp;</td>
    </tr>
    <tr>
      <td class="label">Nombre:</td>
      <td colspan="2">&nbsp;</td>
      <td class="label">Firma:</td>
      <td>&nbsp;</td>
    </tr>
  </table>

  <div class="footer-page">Página 2 - 2</div>
</div>

</body>
</html>
`;
}

// ---------- FUNCIÓN PRINCIPAL PARA STREAM ----------

async function streamVehiculoOperativoPdf(res, vehiculo) {
  const servicioReparacion = vehiculo.servicioReparacion || {};
  const codigosSel = servicioReparacion.serviciosSeleccionados || [];

  // Solo los servicios que marcaste en la pantalla
  let serviciosDocs = [];
  if (codigosSel.length) {
    serviciosDocs = await Codigo.find({
      tipo: 'servicio',
      codigo: { $in: codigosSel },
    }).lean();
  }

  const html = buildOperativoHtml(vehiculo, serviciosDocs);

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
    `inline; filename="orden_operativa_${vehiculo.ordenServicio}.pdf"`
  );
  res.send(pdfBuffer);
}

module.exports = { streamVehiculoOperativoPdf };
