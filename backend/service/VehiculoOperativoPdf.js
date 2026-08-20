// backend/service/VehiculoOperativoPdf.js
// Genera el PDF "Operativo" con formato de recepción de vehículo
// Página 1 (frente): inspección / servicios
// Página 2 (reverso): condiciones de servicio + concepto de reparaciones
// Página 3: Contrato de Prestación de Servicios (NOM-174-SCFI-2007)

const puppeteer = require('puppeteer');
const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');
const { dayjsFecha } = require('../utils/fechas');
const { WATERMARK_CSS, watermarkHtml } = require('../utils/pdfWatermark');
const { esc } = require('../utils/htmlEscape');
const { CONTRATO_CSS, buildContratoBodyHtml } = require('../utils/contratoOrdenServicioHtml');
const ContratoOrdenServicio = require('../models/ContratoOrdenServicio');

// Carga el logo una sola vez al iniciar el módulo
let LOGO_DATA_URL = '';
try {
  const logoPath = path.join(__dirname, '../../frontend/public/images/logo_servicompactos.png');
  const buf = fs.readFileSync(logoPath);
  LOGO_DATA_URL = `data:image/png;base64,${buf.toString('base64')}`;
} catch (e) {
  console.warn('[VehiculoOperativoPdf] Logo no encontrado:', e.message);
}

function fmtFecha(fechaISO) {
  if (!fechaISO) return '';
  return dayjsFecha(fechaISO).format('DD/MM/YYYY');
}

function chk(val) {
  return val ? '&#9745;' : '&#9744;';
}

function buildGaugeSvg(nivelGasolina) {
  const CX = 100, CY = 100, R = 70;
  const START_DEG = 210, END_DEG = 330;

  const NIVELES = [
    { pct: 0,     label: 'E' },
    { pct: 0.125, label: '1/8' },
    { pct: 0.25,  label: '1/4' },
    { pct: 0.375, label: '3/8' },
    { pct: 0.5,   label: '1/2' },
    { pct: 0.625, label: '5/8' },
    { pct: 0.75,  label: '3/4' },
    { pct: 0.875, label: '7/8' },
    { pct: 1,     label: 'F' },
  ];

  const toRad = (deg) => deg * Math.PI / 180;
  const pctToAngle = (pct) => toRad(START_DEG + pct * (END_DEG - START_DEG));
  const pctToXY = (pct, radius) => ({
    x: CX + radius * Math.cos(pctToAngle(pct)),
    y: CY + radius * Math.sin(pctToAngle(pct)),
  });

  const arcPath = (pct0, pct1, r) => {
    const s = pctToXY(pct0, r);
    const e = pctToXY(pct1, r);
    const span = (pct1 - pct0) * toRad(END_DEG - START_DEG);
    return `M ${s.x.toFixed(1)} ${s.y.toFixed(1)} A ${r} ${r} 0 ${span > Math.PI ? 1 : 0} 1 ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
  };

  const currentNivel = NIVELES.find((n) => n.label === nivelGasolina);
  const currentPct = currentNivel ? currentNivel.pct : null;

  const needleColor =
    currentPct === null ? '#888' :
    currentPct <= 0.25  ? '#E24B4A' :
    currentPct <= 0.5   ? '#BA7517' : '#1D9E75';

  const needleAngle = pctToAngle(currentPct !== null ? currentPct : 0);
  const nx = (CX + 58 * Math.cos(needleAngle)).toFixed(1);
  const ny = (CY + 58 * Math.sin(needleAngle)).toFixed(1);

  const bgArc = arcPath(0, 1, R);
  const fgArc = currentPct !== null && currentPct > 0 ? arcPath(0, currentPct, R) : '';

  const dots = NIVELES.map((n) => {
    const pos = pctToXY(n.pct, R);
    const isActive = nivelGasolina === n.label;
    return `<circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="${isActive ? 5 : 3}" fill="${isActive ? needleColor : '#bbb'}"/>`;
  }).join('');

  const labelLine = nivelGasolina
    ? `<text x="${CX}" y="${CY + 20}" font-size="9" font-weight="bold" fill="${needleColor}" text-anchor="middle">${nivelGasolina}</text>`
    : '';

  return `<svg width="170" height="77" viewBox="0 28 200 90" xmlns="http://www.w3.org/2000/svg">
  <path d="${bgArc}" fill="none" stroke="#ddd" stroke-width="4" stroke-linecap="round"/>
  ${fgArc ? `<path d="${fgArc}" fill="none" stroke="${needleColor}" stroke-width="4" stroke-linecap="round"/>` : ''}
  ${dots}
  <line x1="${CX}" y1="${CY}" x2="${nx}" y2="${ny}" stroke="${needleColor}" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="${CX}" cy="${CY}" r="5" fill="${needleColor}"/>
  <text x="18" y="112" font-size="12" font-weight="500" fill="#888" text-anchor="middle">E</text>
  <text x="182" y="112" font-size="12" font-weight="500" fill="#888" text-anchor="middle">F</text>
  ${labelLine}
</svg>`;
}

// ---------- PÁGINA 3: RESUMEN VEHÍCULO ----------
function buildPaginaResumen(vehiculo, fechaRecepcion) {
  const marca = esc((vehiculo.marca || '') + ' ' + (vehiculo.modelo || '')).trim();
  const anio  = esc(vehiculo.anio  || '');
  const color = esc(vehiculo.color || '');
  const orden = esc(vehiculo.ordenServicio || '');
  const sinVehiculo = !!vehiculo.sinVehiculo;
  const totalCols = sinVehiculo ? 3 : 6;
  const pieColspan = sinVehiculo ? 1 : 2;

  return `
<!-- ==================== PÁGINA 3: RESUMEN VEHÍCULO ==================== -->
<div class="page3" style="display:flex;align-items:flex-start;justify-content:center;padding-top:20mm;">
  <table style="border-collapse:collapse;width:100%;border:1.5px solid #000;">
    <tr>
      <td rowspan="2" style="width:26%;border:1.5px solid #000;padding:4px 6px;text-align:center;vertical-align:middle;">
        ${LOGO_DATA_URL
          ? `<img src="${LOGO_DATA_URL}" style="max-height:54px;max-width:170px;object-fit:contain;"/>`
          : `<span style="font-size:14px;font-weight:800;color:#1E40AF;">Servicompactos</span>`}
      </td>
      ${sinVehiculo ? '' : `
      <td style="border:1.5px solid #000;padding:3px 5px;font-weight:bold;text-align:center;font-size:9px;">VEHÍCULO/MARCA</td>
      <td style="border:1.5px solid #000;padding:3px 5px;font-weight:bold;text-align:center;font-size:9px;">AÑO</td>
      <td style="border:1.5px solid #000;padding:3px 5px;font-weight:bold;text-align:center;font-size:9px;">COLOR</td>`}
      <td style="border:1.5px solid #000;padding:3px 5px;font-weight:bold;text-align:center;font-size:9px;">FECHA DE INGRESO</td>
      <td style="border:1.5px solid #000;padding:3px 5px;font-weight:bold;text-align:center;font-size:13px;color:#E07B00;">ORDEN No.</td>
    </tr>
    <tr>
      ${sinVehiculo ? '' : `
      <td style="border:1.5px solid #000;padding:3px 5px;font-size:9px;text-align:center;">${marca}</td>
      <td style="border:1.5px solid #000;padding:3px 5px;font-size:9px;text-align:center;">${anio}</td>
      <td style="border:1.5px solid #000;padding:3px 5px;font-size:9px;text-align:center;">${color}</td>`}
      <td style="border:1.5px solid #000;padding:3px 5px;font-size:9px;text-align:center;">${fechaRecepcion}</td>
      <td style="border:1.5px solid #000;padding:3px 5px;font-size:18px;text-align:center;font-weight:bold;color:#E07B00;">O-${orden}</td>
    </tr>
    <tr>
      <td colspan="${totalCols}" style="border:1.5px solid #000;padding:4px 8px;font-size:8px;font-weight:bold;text-align:center;line-height:1.4;">
        UNA VEZ CONCLUIDA LA REPARACIÓN DE SU VEHÍCULO, DEBERÁ SER RECOGIDO DENTRO DE LAS SIGUIENTES 24 HORAS.
        DESPUÉS DE ESE PLAZO, SE GENERARÁ UN CARGO POR RESGUARDO DE $260.00 PESOS POR DIA
      </td>
    </tr>
    <tr>
      <td colspan="${pieColspan}" style="border:1.5px solid #000;padding:4px 6px;font-size:9px;font-weight:bold;background:#1E40AF;color:#fff;">Su...Asesor con espíritu de Servicio</td>
      <td colspan="${pieColspan}" style="border:1.5px solid #000;padding:4px 6px;font-size:9px;font-weight:bold;background:#1E40AF;color:#fff;text-align:center;">CELULAR</td>
      <td colspan="${pieColspan}" style="border:1.5px solid #000;padding:4px 6px;font-size:9px;font-weight:bold;background:#1E40AF;color:#fff;text-align:right;">Tels: (656) 6 23 56 51 al 54</td>
    </tr>
  </table>
</div>
`;
}

// ---------- PÁGINA 4: CONTRATO ----------
// El contenido (título, cláusulas y pie de página) viene de la versión de
// ContratoOrdenServicio vigente cuando se creó esta orden — ver
// contratoOrdenServicioHtml.js para el layout compartido con el PDF
// standalone del historial (Configuración > Contrato de Orden de Servicio).
function buildPagina3(contrato, firmaClienteDataUrl) {
  return `
<!-- ==================== PÁGINA 4: CONTRATO ==================== -->
<div class="page3">
${buildContratoBodyHtml(contrato, firmaClienteDataUrl)}
</div>
`;
}

// ---------- HTML PRINCIPAL ----------

function buildHtml(vehiculo, asesorOverride = '', formato = 'operativo', contrato = null) {
  // Si la orden es de un grupo, en el PDF se muestra quién lo está
  // imprimiendo (quien presionó el botón), no necesariamente quien la creó.
  const asesor = vehiculo.creadoPor || '';
  const insp = vehiculo.inspeccionFisica || {};
  const sr   = vehiculo.servicioReparacion || {};
  const mm   = sr.mantenimientoMotor || {};
  const sint = sr.sintomas || {};

  const c   = vehiculo.cliente || {};
  const gob = c.gobierno || {};
  const tel = (c.telefonos || [])[0] || {};
  const cel = (c.celulares || [])[0] || {};
  const dir = c.direccion || {};

  // apellidoPaterno/apellidoMaterno son de "Particular"; en empresas no se
  // concatenan porque en registros migrados/viejos pueden quedar huérfanos.
  // Para Empresa Privada/Arrendadora y Gobierno el nombre principal es el
  // fiscal (razón social / nombre oficial de gobierno); Empresa Privada y
  // Arrendadora además muestran el nombre comercial en una segunda línea.
  const tipoClienteEnc = c.tipoCliente || 'Particular';
  const esParticularCliente = tipoClienteEnc === 'Particular';
  const esEmpresaCliente = tipoClienteEnc === 'Empresa Privada' || tipoClienteEnc === 'Empresa Arrendadora';
  const nombreCliente = esParticularCliente
    ? [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(' ')
    : (gob.nombreGobierno || c.empresa?.razonSocial || c.nombre || '');
  const labelNombreCliente = esParticularCliente ? 'NOMBRE DEL CLIENTE' : 'NOMBRE FISCAL';
  const nombreComercial = esEmpresaCliente ? (c.nombre || '') : '';
  const telefono  = [tel.lada, tel.numero].filter(Boolean).join(' ');
  const celular   = [cel.lada, cel.numero].filter(Boolean).join(' ');
  const correo    = (c.emails || [])[0] || '';
  const rfc       = c.rfc || '';
  const direccion = [dir.calle, dir.numeroExterior, dir.colonia, dir.ciudad, dir.estado]
    .filter(Boolean).join(', ');

  const fechaRecepcion = fmtFecha(vehiculo.fechaRecepcion);
  const hora = vehiculo.horaRecepcion || '';

  // Formato Cliente: solo la página resumen (logo, orden, fecha de ingreso).
  if (formato === 'cliente') {
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Formato Cliente ${esc(vehiculo.ordenServicio)}</title>
<style>
  * { box-sizing: border-box; font-family: Arial, sans-serif; }
  body { margin: 0; padding: 0; font-size: 10px; color: #000; }
  .page3 { width: 210mm; padding: 14mm 16mm; margin: 0 auto; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 0.5px solid #000; padding: 2px 3px; vertical-align: middle; }
${WATERMARK_CSS}
</style>
</head>
<body>
${watermarkHtml(vehiculo)}
${buildPaginaResumen(vehiculo, fechaRecepcion)}
</body>
</html>`;
  }

  const nivelGasolina = (insp.nivelGasolina && insp.nivelGasolina !== 'false') ? insp.nivelGasolina : null;
  const gaugeSvg = buildGaugeSvg(nivelGasolina);

  const canvasImg = insp.danoVehiculo
    ? `<img src="${insp.danoVehiculo}" style="display:block;max-height:140px;width:auto;margin:0 auto;"/>`
    : `<div style="width:auto;height:110px;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:9px;border:1px dashed #ccc;">Sin daños registrados</div>`;

  const esMex = (vehiculo.nacionalidad || '').toUpperCase() === 'MEX';
  const es4x4 = vehiculo.traccion === '4x4';
  const es4x2 = vehiculo.traccion === '4x2';

  // Servicios de catálogo seleccionados: se muestran tachados para indicar que
  // ya se movieron a presupuesto/venta y no deben repetirse en el taller.
  const snapshotLineas = [];
  for (const bundle of (vehiculo.serviciosCatalogoSeleccionados || [])) {
    snapshotLineas.push(bundle.nombre);
    for (const r of (bundle.refacciones || [])) {
      if (r.incluida === false) continue;
      snapshotLineas.push(r.observacion ? `${r.nombre} — ${r.observacion}` : r.nombre);
    }
  }

  const totalLineasReparacion = Math.max(12, snapshotLineas.length);
  const lineasReparacion = Array.from({ length: totalLineasReparacion }, (_, i) => {
    const texto = snapshotLineas[i];
    const contenido = texto
      ? `<span style="text-decoration:line-through;color:#666;">${esc(texto)}</span>`
      : '&nbsp;';
    return `
    <tr>
      <td style="width:20px;padding:2px 3px;border:none;">${i + 1}.-</td>
      <td style="border:none;border-bottom:0.7px solid #bbb;height:22px;padding:2px 4px;">${contenido}</td>
      <td style="width:40px;border:none;border-bottom:0.7px solid #bbb;text-align:right;padding:2px 3px;color:#555;">hrs</td>
    </tr>`;
  }).join('');

  const sinVehiculo = !!vehiculo.sinVehiculo;

  const condicionesConceptoHtml = `
  <table style="height:200mm;">
    <tr style="vertical-align:top;">

      <td class="condiciones-s"style="width:44%;padding:8px 10px;vertical-align:top;">
        <div style="font-weight:bold;text-align:center;font-size:11px;margin-bottom:8px;border-bottom:1px solid #000;padding-bottom:4px;">
          CONDICIONES DE SERVICIO
        </div>
        <p>
          ACEPTO QUE EN CASO DE REQUERIR COMBUSTIBLE PARA PRUEBA Y REACONDICIONAMIENTO
          DE MI VEHÍCULO SEA CARGADO A MI CUENTA EN TODA OCASIÓN.
        </p>
        <p >
          IMPORTANTE: ACEPTO QUE SERVICOMPACTOS DE JUÁREZ S.A. DE C.V Y/O SUS REPRESENTANTES NO SE HACEN RESPONSABLES POR OBJETOS DE VALOR OLVIDADOS O NO DEPOSITADOS EN LA RECEPCIÓN O LA CAJA, CON RECIBO, POR  ESCRITO, ASI COMO TAMPOCO SE RESPONSABILIZAN POR ROBO, INCENDIO, UNIDADES SIN ANTICONGELANTE O CUALQUIER OTRO SUSESO EXTRAÑO QUE AFECTE MIS INTERESES Y QUE ESTE FUERA DEL CONTROL DE LA EMPRESA, Y SUS REPRESENTANTES Y/O QUE NO SEA IMPUTABLE A LOS MISMOS.
        </p>
        <p >
          DECLARO: QUE SOY EL PROPIETARIO Y/O SOY REPRESENTANTE Y AUTORIZO LAS REPARACIONES O SERVICIOS DESCRITOS EN LA PRESENTE ORDEN, ASÍ COMO EL USO DE REFACCIONES, ACCESORIOS, LUBRICANTES Y OTROS MATERIALES NECESARIOS PARA LLEVAR A CABO LA REPARACIÓN O SERVICIO SOLICITADO MISMO QUE ACEPTO LIQUIDAR ANTES O EN EL MOMENTO QUE ME SEA ENTREGADO MI VEHÍCULO.
        </p>
        <p >
          ASÍ COMO QUE SE ME GARANTICEN LAS REFACCIONES POR NOVENTA DÍAS O MIL QUINIENTOS KMS. LO QUE PRIMERO OCURRA EN CONDICIONES DE USO NORMAL, EXCEPTO EN PARTES ELÉCTRICAS USADAS Y/O SURTIDAS POR EL MISMO.
        </p>
        <p >
          SI NO AUTORIZO LA REPARACIÓN Y/O ABANDONO DE MI VEHICULO POR CUALQUIER CIRCUNSTANCIA, EL TALLER PODRA APLICAR LA CONDICIÓN No. 9 DEL CONTRATO DE PRESTACIÓN DE SERVICIOS, EL CUAL PONDRA EL VEHICULO A DISPOSICIÓN LA AUTORIDAD CORRESPONDIENTE, SIN RESPONSABILIDAD ALGUNA PARA SERVICOMPACTOS DE JUÁREZ, S.A DE C.V.
        </p>
        <p>
          ESTOY DEACUERDO QUE UNA VEZ NOTIFICADO POR EL ASESOR DE SERVICIO QUE MI VEHICULO YA ESTA TERMINADO, DEBO RECOGERLO EN UN LAPSO NO MAYOR DE 24 HRS, DE LO CONTRARIO PAGARE UN HOSPEDAJE DE DOSCIENTOS SESENTA PESOS DIARIOS
        </p>

        <div style="margin-top:${vehiculo.firmaAutorizacionCliente ? '15' : '60'}px;font-size:10px;">
          ${vehiculo.firmaAutorizacionCliente
            ? `<img src="${vehiculo.firmaAutorizacionCliente}" style="display:block;height:45px;margin:0 auto;"/>`
            : ''}
          <div style="border-top:1.5px solid #000;margin-bottom:6px;"></div>
          <div style="text-align:center;font-weight:bold;font-size:9px;line-height:1.4;">
            AUTORIZACIÓN Y FIRMA DEL CLIENTE Y/O SUS REPRESENTANTES
          </div>
        </div>
      </td>

      <td style="width:56%;padding:8px 10px;vertical-align:top;border-left:0.7px solid #000;">
        <div style="font-weight:bold;text-align:center;font-size:11px;margin-bottom:8px;border-bottom:1px solid #000;padding-bottom:4px;">
          CONCEPTO DE LAS REPARACIONES EFECTUADAS
        </div>
        <table style="width:100%;font-size:10px;border-collapse:collapse;">
          <tr>
            <td style="width:20px;border:none;padding:2px 3px;font-weight:bold;">#</td>
            <td style="border:none;border-bottom:1px solid #000;padding:3px 4px;font-weight:bold;">DESCRIPCIÓN</td>
            <td style="width:42px;border:none;border-bottom:1px solid #000;text-align:right;padding:3px 4px;font-weight:bold;">HRS</td>
          </tr>
          ${lineasReparacion}
          <tr>
            <td colspan="2" style="border:none;border-top:1px solid #000;text-align:right;padding:4px 6px;font-weight:bold;font-size:10px;">TOTAL:</td>
            <td style="border:none;border-top:1px solid #000;text-align:right;padding:4px 4px;font-weight:bold;"></td>
          </tr>
        </table>

        <div style="margin-top:60px;font-size:10px;">
          <div style="border-top:1.5px solid #000;margin-bottom:6px;"></div>
          <div style="text-align:center;font-weight:bold;font-size:9px;line-height:1.4;">
            FIRMA DEL ASESOR O QUIEN LEVANTA LA ORDEN DE SERVICIO
          </div>
        </div>
      </td>

    </tr>
  </table>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Orden Operativa ${esc(vehiculo.ordenServicio)}</title>
<style>
  * { box-sizing: border-box; font-family: Arial, sans-serif; }
  body { margin: 0; padding: 0; font-size: 10px; color: #000; }
  .page  { width: 210mm; padding: 8mm 9mm; margin: 0 auto; }
  .page2 { width: 210mm; padding: 12mm 14mm; margin: 0 auto; page-break-before: always; }
  .page3 { width: 210mm; padding: 14mm 16mm; margin: 0 auto; page-break-before: always; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 0.5px solid #000; padding: 2px 3px; vertical-align: middle; }
  .nb td, .nb th { border: none; padding: 1px 2px; }
  .c { text-align: center; }
  .r { text-align: right; }
  .gh { background: #E5E7EB; font-weight: bold; }
  .sh {
    background: #1E40AF;
    color: #fff;
    font-weight: bold;
    text-align: center;
    letter-spacing: 2px;
    padding: 3px 0;
    font-size: 11px;
    margin: 3px 0;
  }
  .orden-num { color: #DC2626; font-weight: 800; font-size: 16px; }
  .sub-gh { background: #F3F4F6; font-weight: bold; }
  .p2-title {
    background: #1E40AF;
    color: #fff;
    font-weight: bold;
    text-align: center;
    letter-spacing: 2px;
    padding: 5px 0;
    font-size: 12px;
    margin-bottom: 6px;
  }

${CONTRATO_CSS}

  .condiciones-s p{
    font-size:8px;
    line-height:1.6;
    text-align:justify;
    justify:inter-word;
    margin-bottom:1px;
  }
${WATERMARK_CSS}
</style>
</head>
<body>
${watermarkHtml(vehiculo)}

<!-- ==================== PÁGINA 1 (FRENTE) ==================== -->
<div class="page">

<!-- ENCABEZADO -->
<table class="nb" style="margin-bottom:2px;">
  <tr>
    <td style="width:22%;vertical-align:top;">
      <div style="padding:3px; padding-left:0px;font-size:10px;">
        <div style="font-weight:bold;color:#1E40AF;">ASESOR</div>
        <div style="font-size:15px;font-weight:bold;">${esc(asesor) || '—'}</div>
      </div>
    </td>
    <td style="text-align:center;vertical-align:middle;padding:0 10px;">
      ${LOGO_DATA_URL
        ? `<img src="${LOGO_DATA_URL}" style="max-height:52px;max-width:220px;object-fit:contain;" />`
        : `<div style="font-size:26px;font-weight:800;color:#1E40AF;letter-spacing:1px;">Edigital Solutions</div>`
      }
    </td>
    <td style="width:26%;vertical-align:top;text-align:right;font-size:9px;">
      <div style="margin-bottom:2px;"></div>
      <div></div>
    </td>
  </tr>
</table>

<!-- NOMBRE + ORDEN -->
<table style="margin-bottom:2px;">
  <tr>
    <td class="gh" style="width:22%;font-size:9px;">${labelNombreCliente}:</td>
    <td style="width:48%;font-size:11px;font-weight:bold;">${esc(nombreCliente)}</td>
    <td rowspan="${nombreComercial ? 2 : 1}" class="gh c" style="width:17%;font-size:9px;">ORDEN DE SERVICIO</td>
    <td rowspan="${nombreComercial ? 2 : 1}" class="c" style="width:13%;"><span class="orden-num">${esc(vehiculo.ordenServicio)}</span></td>
  </tr>
  ${nombreComercial ? `
  <tr>
    <td class="gh" style="font-size:9px;">NOMBRE COMERCIAL:</td>
    <td style="font-size:10px;">${esc(nombreComercial)}</td>
  </tr>` : ''}
</table>

<!-- DIRECCIÓN / FECHA / RFC / TELS / CORREO -->
<table style="margin-bottom:2px;">
  <tr>
    <td class="gh" style="width:11%;font-size:9px;">DIRECCIÓN:</td>
    <td colspan="3" style="font-size:9px;">${esc(direccion)}</td>
    <td class="gh c" style="width:9%;font-size:9px;">TÉCNICO:</td>
    <td style="width:14%;">&nbsp;</td>
    <td class="gh c" style="width:9%;font-size:9px;">ANTICIPO:</td>
    <td style="width:12%;">&nbsp;</td>
  </tr>
  <tr>
    <td class="gh" style="font-size:9px;">FECHA RECEP.:</td>
    <td style="width:16%;font-size:9px;">${esc(fechaRecepcion)}</td>
    <td class="gh c" style="width:8%;font-size:9px;">HORA:</td>
    <td style="width:10%;font-size:9px;">${esc(hora)}</td>
    <td class="gh c" style="font-size:9px;">TÉCNICO:</td>
    <td>&nbsp;</td>
    <td class="gh c" style="font-size:9px;">ANTICIPO:</td>
    <td>&nbsp;</td>
  </tr>
  <tr>
    <td class="gh" style="font-size:9px;">RFC:</td>
    <td style="font-size:9px;">${esc(rfc)}</td>
    <td class="gh c" style="font-size:9px;">TELS:</td>
    <td style="font-size:9px;">${esc(telefono)}</td>
    <td class="gh c" style="font-size:9px;">CEL:</td>
    <td style="font-size:9px;">${esc(celular)}</td>
    <td class="gh c" style="font-size:9px;">CORREO:</td>
    <td style="font-size:9px;">${esc(correo)}</td>
  </tr>
</table>

${vehiculo.sinVehiculo ? '' : `
<!-- DATOS DEL VEHÍCULO -->
<table style="margin-bottom:2px;">
  <tr>
    <td class="gh c" style="width:13%;font-size:9px;">MARCA MODELO</td>
    <td style="width:24%;font-size:9px;font-weight:bold;">${esc(vehiculo.marca)} ${esc(vehiculo.modelo)}</td>
    <td class="gh c" style="width:6%;font-size:9px;">AÑO</td>
    <td style="width:9%;font-size:9px;">${esc(vehiculo.anio)}</td>
    <td class="gh c" style="width:7%;font-size:9px;">COLOR</td>
    <td style="width:10%;font-size:9px;">${esc(vehiculo.color)}</td>
    <td class="gh c" style="width:6%;font-size:8.5px;">MEX ${chk(esMex)}</td>
    <td class="gh c" style="width:6%;font-size:8.5px;">4X4 ${chk(es4x4)}</td>
    <td class="gh c" style="width:6%;font-size:8.5px;">4X2 ${chk(es4x2)}</td>
    <td class="gh c" style="width:5%;font-size:8.5px;">NO ${chk(!vehiculo.traccion)}</td>
    <td class="gh c" style="width:8%;font-size:9px;">GRÚA</td>
    <td style="font-size:9px;">${esc(insp.grua || '—')}</td>
  </tr>
  <tr>
    <td class="gh c" style="font-size:9px;">PLACAS</td>
    <td style="font-size:9px;">${esc(vehiculo.placas)}</td>
    <td class="gh c" style="font-size:9px;">MOTOR</td>
    <td style="font-size:9px;">${esc(vehiculo.motor)}</td>
    <td class="gh c" style="font-size:9px;">KMS/MI</td>
    <td style="font-size:9px;">${esc(vehiculo.kmsMillas)}</td>
    <td class="gh c" colspan="3" style="font-size:9px;">SERIE</td>
    <td colspan="3" style="font-size:9px;">${esc(vehiculo.serie)}</td>
  </tr>
  <tr>
    <td class="gh c" style="font-size:9px;">NO. ECONÓMICO</td>
    <td style="font-size:9px;">${esc(vehiculo.numeroEconomico)}</td>
    <td class="gh c" colspan="2" style="font-size:9px;">NOMBRE QUIEN DEJA VEHÍCULO</td>
    <td colspan="8" style="font-size:9px;">${esc(vehiculo.nombreUsuarioDejaVehiculo || '')}</td>
  </tr>
</table>`}

${vehiculo.sinVehiculo ? '' : `
<!-- ACCESORIOS + CANVAS + GASOLINA -->
<table style="margin-bottom:2px;">
  <tr>
    <td style="width:36%;vertical-align:top;padding:3px;">
      <div style="font-weight:bold;font-size:9px;background:#E5E7EB;padding:2px 4px;margin-bottom:2px;">ACCESORIOS AL RECIBIR</div>
      <table class="nb" style="width:100%;font-size:9px;">
        <tr><td style="padding:1px 2px;">ESPEJO LATERAL: ${chk(insp.espejoLateralIzq)} IZQ &nbsp; ${chk(insp.espejoLateralDer)} DER</td></tr>
        <tr><td style="padding:1px 2px;">COPAS DEL: ${chk(insp.copasDelanterasIzq)} IZQ &nbsp; ${chk(insp.copasDelanterasDer)} DER &nbsp; TRAS: ${chk(insp.copasTraserasIzq)} IZQ &nbsp; ${chk(insp.copasTraserasDer)} DER</td></tr>
        <tr><td style="padding:1px 2px;">PARABRISAS: <strong>${esc(insp.parabrisas || '—')}</strong> &nbsp;&nbsp; MICAS ${chk(insp.micas)}</td></tr>
        <tr><td style="padding:1px 2px;">FOCOS: ${chk(insp.focosDel)} DEL &nbsp; ${chk(insp.focosTras)} TRAS &nbsp;&nbsp; ESPEJO INT ${chk(insp.espejoInt)}</td></tr>
        <tr><td style="padding:1px 2px;">TAPETES DEL: ${chk(insp.tapetesDelanterosIzq)} IZQ &nbsp; ${chk(insp.tapetesDelanterosDer)} DER</td></tr>
        <tr><td style="padding:1px 2px;">TAPETES TRAS: ${chk(insp.tapetesTraserosIzq)} IZQ &nbsp; ${chk(insp.tapetesTraserosDer)} DER</td></tr>
        <tr><td style="padding:1px 2px;">ESTÉREO ${chk(insp.estereo)} &nbsp; ANTENA ${chk(insp.antena)} &nbsp; ENCENDEDOR ${chk(insp.encendedor)}</td></tr>
        <tr><td style="padding:1px 2px;">GATO ${chk(insp.gato)} &nbsp; EXTRA ${chk(insp.extra)} &nbsp; BATERÍA ${chk(insp.bateria)}</td></tr>
      </table>
      <div style="font-weight:bold;font-size:9px;background:#E5E7EB;padding:2px 4px;margin:3px 0 2px;">INDICADORES DEL TABLERO &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; PRENDIDO "P" &nbsp; NO FUNCIONA "N"</div>
      <table class="nb" style="width:100%;font-size:9px;">
        <tr>
          <td style="padding:1px 2px;">CHECK ENGINE ${chk(insp.checkEngine === 'SI')}</td>
          <td style="padding:1px 2px;">ABS ${chk(insp.abs === 'SI')}</td>
          <td style="padding:1px 2px;">AIR BAG ${chk(insp.airBag === 'SI')}</td>
        </tr>
        <tr>
          <td style="padding:1px 2px;">FRENOS ${chk(insp.frenos === 'SI')}</td>
          <td style="padding:1px 2px;">ACEITE ${chk(insp.aceite === 'SI')}</td>
          <td style="padding:1px 2px;">ALTERNADOR ${chk(insp.alternador === 'SI')}</td>
        </tr>
        ${insp.otros ? `<tr><td colspan="3" style="padding:1px 2px;">OTROS: ${esc(insp.otros)}</td></tr>` : ''}
        ${insp.observaciones ? `
        <tr><td colspan="3" style="padding:2px 4px;background:#E5E7EB;font-weight:bold;font-size:9px;">OBSERVACIONES</td></tr>
        <tr><td colspan="3" style="padding:2px 4px;">${esc(insp.observaciones)}</td></tr>` : ''}
      </table>
    </td>

    <td style="width:20%;vertical-align:middle;text-align:center;padding:3px;">
      <div style="font-weight:bold;font-size:9px;margin-bottom:2px;">DAÑOS DEL VEHÍCULO</div>
      ${canvasImg}
    </td>

    <td style="width:20%;vertical-align:middle;text-align:center;padding:3px;">
      <div style="font-weight:bold;font-size:9px;margin-bottom:2px;">Gasolina</div>
      ${gaugeSvg}
      <div style="font-size:11px;font-weight:bold;margin-top:4px;">
        ${esc(nivelGasolina || '—')}
      </div>
    </td>
  </tr>
</table>`}

${sinVehiculo ? condicionesConceptoHtml : `
<!-- SERVICIO -->
<div class="sh">S &nbsp; E &nbsp; R &nbsp; V &nbsp; I &nbsp; C &nbsp; I &nbsp; O</div>
<table>
  <tr>
    <td style="width:43%;vertical-align:top;padding:2px 3px;">
      <table class="nb" style="width:100%;font-size:9px;">
        <tr><td colspan="2" class="gh" style="padding:2px 4px;">MANTENIMIENTO DEL MOTOR</td><td class="gh r" style="width:52px;padding:2px 4px;"></td></tr>
        <tr><td style="width:15px;padding:1px 2px;">${chk(mm.afinacion)}</td><td style="padding:1px 2px;">AFINACIÓN</td><td>&nbsp;</td></tr>
        <tr><td style="padding:1px 2px;">${chk(mm.limpiezaInyectores)}</td><td style="padding:1px 2px;">LIMPIEZA DE INYECTORES</td><td>&nbsp;</td></tr>
        <tr><td style="padding:1px 2px;">${chk(mm.limpiezaCuerpoAceleracion)}</td><td style="padding:1px 2px;">LIMPIEZA AL CUERPO DE ACELERACIÓN</td><td>&nbsp;</td></tr>

        <tr><td colspan="3" class="sub-gh" style="padding:1px 4px;">LUBRICACIÓN</td></tr>
        <tr><td style="padding:1px 2px;">${chk(mm.cambioAceite)}</td><td style="padding:1px 2px;">CAMBIO DE ACEITE</td><td>&nbsp;</td></tr>
        <tr><td style="padding:1px 2px;">${chk(mm.engrase)}</td><td style="padding:1px 2px;">ENGRASADO</td><td>&nbsp;</td></tr>
        <tr><td style="padding:1px 2px;">${chk(mm.revisionNivelesFluidos)}</td><td style="padding:1px 2px;">REVISIÓN DE NIVELES DE FLUIDOS</td><td>&nbsp;</td></tr>
        <tr><td style="padding:1px 2px;">${chk(mm.lubricacionBisagras)}</td><td style="padding:1px 2px;">LUBRICACIÓN DE BISAGRAS</td><td>&nbsp;</td></tr>
        <tr><td style="padding:1px 2px;">${chk(mm.lubricarSuspensionDireccion)}</td><td style="padding:1px 2px;">LUBRICAR SUSPENSIÓN Y DIRECCIÓN</td><td>&nbsp;</td></tr>

        <tr><td colspan="3" class="sub-gh" style="padding:1px 4px;">REVISIÓN</td></tr>
        <tr><td style="padding:1px 2px;">${chk(mm.revisionCarretera)}</td><td style="padding:1px 2px;">REVISIÓN PARA CARRETERA</td><td>&nbsp;</td></tr>
        <tr><td style="padding:1px 2px;">${chk(mm.diagnosticoCompra)}</td><td style="padding:1px 2px;">DIAGNÓSTICO DE COMPRA</td><td>&nbsp;</td></tr>

        <tr><td colspan="3" class="gh" style="padding:2px 4px;">OTROS SERVICIOS</td></tr>
        <tr><td style="padding:1px 2px;">${chk(mm.alineacionComputadora)}</td><td style="padding:1px 2px;">ALINEACIÓN POR COMPUTADORA</td><td>&nbsp;</td></tr>
        <tr><td style="padding:1px 2px;">${chk(mm.balanceo4Ruedas)}</td><td style="padding:1px 2px;">BALANCEO EN LAS 4 RUEDAS</td><td>&nbsp;</td></tr>
        <tr><td style="padding:1px 2px;">${chk(mm.reemplazoBalatas4Ruedas)}</td><td style="padding:1px 2px;">REEMPLAZO DE BALATAS EN LAS 4 RUEDAS</td><td>&nbsp;</td></tr>
        <tr><td style="padding:1px 2px;">${chk(mm.recargaGasAC)}</td><td style="padding:1px 2px;">RECARGA DE GAS FREON / A/C</td><td>&nbsp;</td></tr>
        <tr><td style="padding:1px 2px;">${chk(mm.servicioCoolingTermostato)}</td><td style="padding:1px 2px;">SERVICIO ANTICONG Y TERMOSTATO</td><td>&nbsp;</td></tr>

        <tr><td colspan="3" class="gh" style="padding:2px 4px;">FALLAS REPORTADAS POR EL CLIENTE</td></tr>
        <tr><td style="padding:1px 2px;">${chk(sint.noEnciende)}</td><td style="padding:1px 2px;">NO ENCIENDE</td><td>&nbsp;</td></tr>
        <tr><td style="padding:1px 2px;">${chk(sint.tardaEncenderFrio)}</td><td style="padding:1px 2px;">TARDA PARA ENCENDER EN FRÍO</td><td>&nbsp;</td></tr>
        <tr><td style="padding:1px 2px;">${chk(sint.tardaEncenderCaliente)}</td><td style="padding:1px 2px;">TARDA PARA ENCENDER EN CALIENTE</td><td>&nbsp;</td></tr>
        <tr><td style="padding:1px 2px;">${chk(sint.cascabelea)}</td><td style="padding:1px 2px;">CASCABELEA</td><td>&nbsp;</td></tr>
        <tr><td style="padding:1px 2px;">${chk(sint.motorTembloroso)}</td><td style="padding:1px 2px;">MOTOR TEMBLOROSO</td><td>&nbsp;</td></tr>
        <tr><td style="padding:1px 2px;">${chk(sint.faltaPotencia)}</td><td style="padding:1px 2px;">FALTA POTENCIA</td><td>&nbsp;</td></tr>
        <tr>
          <td style="padding:1px 2px;">${chk(sint.hechaHumo)}</td>
          <td style="padding:1px 2px;">HECHA HUMO &nbsp; COLOR: ${esc(sint.humoColor || '')}</td>
          <td>&nbsp;</td>
        </tr>
      </table>
    </td>

    <td style="width:57%;vertical-align:top;padding:2px 3px;">
      <table class="nb" style="width:100%;font-size:9px;">
        <tr>
          <td class="gh" style="padding:2px 4px;">FALLAS DE MOTOR Y OTROS:</td>
        </tr>
        <tr>
          <td style="height:45px;vertical-align:top;padding:2px 3px;">${esc(sr.fallasMotorOtros || sr.fallasReportadasCliente || '')}</td>
        </tr>

        <tr>
          <td class="gh" style="padding:2px 4px;">SISTEMA ELÉCTRICO Y AIRE ACONDICIONADO:</td>
        </tr>
        <tr>
          <td style="height:45px;vertical-align:top;padding:2px 3px;">${esc(sr.sistemaElectricoAire || '')}</td>
        </tr>

        <tr>
          <td class="gh" style="padding:2px 4px;">SUSPENSIÓN, DIRECCIÓN Y FRENOS:</td>
        </tr>
        <tr>
          <td style="height:45px;vertical-align:top;padding:2px 3px;">${esc(sr.suspensionDireccionFrenos || '')}</td>
        </tr>

        <tr>
          <td class="gh" style="padding:2px 4px;">SISTEMA DE ENFRIAMIENTO:</td>
        </tr>
        <tr>
          <td style="height:45px;vertical-align:top;padding:2px 3px;">${esc(sr.sistemaEnfriamiento || '')}</td>
        </tr>

        <tr>
          <td class="gh" style="padding:2px 4px;">OBSERVACIONES GENERALES:</td>
        </tr>
        <tr>
          <td style="height:45px;vertical-align:top;padding:2px 3px;">${esc(sr.revisionFallas || '')}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>`}

</div>

${sinVehiculo ? '' : `
<!-- ==================== PÁGINA 1 (REVERSO) ==================== -->
<div class="page2">

  <table style="margin-bottom:10px;font-size:9px;">
    <tr>
      <td class="gh" style="width:30%;">ORDEN DE SERVICIO:
        <span style="color:#DC2626;font-weight:800;font-size:14px;margin-left:6px;">${esc(vehiculo.ordenServicio)}</span>
      </td>
      <td style="width:40%;">${esc(nombreCliente)}</td>
      <td class="gh c" style="width:15%;">FECHA</td>
      <td style="width:15%;">${esc(fechaRecepcion)}</td>
    </tr>
    <tr>
      <td class="gh">VEHÍCULO:</td>
      <td colspan="3">${esc(vehiculo.marca)} ${esc(vehiculo.modelo)} ${esc(vehiculo.anio)} &nbsp;|&nbsp; PLACAS: ${esc(vehiculo.placas)}</td>
    </tr>
  </table>

  ${condicionesConceptoHtml}

</div>`}

${buildPagina3(contrato, vehiculo.firmaAutorizacionCliente)}

</body>
</html>`;
}

// ---------- FUNCIÓN PRINCIPAL ----------

async function streamVehiculoOperativoPdf(res, vehiculo, papel = 'a4', asesorOverride = '', formato = 'operativo') {
  // El formato "cliente" no incluye la página del contrato, así que se evita
  // la consulta a BD si no hace falta. Para "operativo" se usa la versión del
  // contrato que estaba vigente cuando se CREÓ esta orden (vehiculo.contratoOrdenServicio,
  // asignada al crear la orden — ver POST /api/vehiculos) y no la más reciente:
  // así, al editar el contrato en Configuración, solo las órdenes nuevas cambian
  // y las ya existentes siguen imprimiendo el texto con el que se abrieron.
  // Las órdenes creadas antes de que existiera este campo no tienen referencia,
  // así que caen a la versión vigente actual (getOrCreate) como respaldo.
  let contrato = null;
  if (formato !== 'cliente') {
    contrato = vehiculo.contratoOrdenServicio
      ? await ContratoOrdenServicio.findById(vehiculo.contratoOrdenServicio)
      : null;
    if (!contrato) contrato = await ContratoOrdenServicio.getOrCreate();
  }
  const html = buildHtml(vehiculo, asesorOverride, formato, contrato);

  const formatMap = {
    a4:     'A4',
    carta:  'Letter',
    oficio: 'Legal',
  };
  const pdfFormat = formatMap[papel] || 'A4';

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });

  const pdfBuffer = await page.pdf({
    format: pdfFormat,
    printBackground: true,
    // Sin margen: el contenido ya trae su propio padding (ver .page/.page2/
    // .page3 arriba). Así la marca de agua, que se mide en vw/vh, puede
    // cubrir la hoja completa sin que el margen de impresión la recorte.
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
  });

  await browser.close();

  const filenamePrefix = formato === 'cliente' ? 'orden_cliente' : 'orden_operativa';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${filenamePrefix}_${vehiculo.ordenServicio}.pdf"`
  );
  res.send(pdfBuffer);
}

module.exports = { streamVehiculoOperativoPdf };