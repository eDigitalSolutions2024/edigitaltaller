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

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
      <td style="border:1.5px solid #000;padding:3px 5px;font-weight:bold;text-align:center;font-size:9px;">VEHÍCULO/MARCA</td>
      <td style="border:1.5px solid #000;padding:3px 5px;font-weight:bold;text-align:center;font-size:9px;">AÑO</td>
      <td style="border:1.5px solid #000;padding:3px 5px;font-weight:bold;text-align:center;font-size:9px;">COLOR</td>
      <td style="border:1.5px solid #000;padding:3px 5px;font-weight:bold;text-align:center;font-size:9px;">FECHA DE INGRESO</td>
      <td style="border:1.5px solid #000;padding:3px 5px;font-weight:bold;text-align:center;font-size:13px;color:#E07B00;">ORDEN No.</td>
    </tr>
    <tr>
      <td style="border:1.5px solid #000;padding:3px 5px;font-size:9px;text-align:center;">${marca}</td>
      <td style="border:1.5px solid #000;padding:3px 5px;font-size:9px;text-align:center;">${anio}</td>
      <td style="border:1.5px solid #000;padding:3px 5px;font-size:9px;text-align:center;">${color}</td>
      <td style="border:1.5px solid #000;padding:3px 5px;font-size:9px;text-align:center;">${fechaRecepcion}</td>
      <td style="border:1.5px solid #000;padding:3px 5px;font-size:18px;text-align:center;font-weight:bold;color:#E07B00;">O-${orden}</td>
    </tr>
    <tr>
      <td colspan="6" style="border:1.5px solid #000;padding:4px 8px;font-size:8px;font-weight:bold;text-align:center;line-height:1.4;">
        UNA VEZ CONCLUIDA LA REPARACIÓN DE SU VEHÍCULO, DEBERÁ SER RECOGIDO DENTRO DE LAS SIGUIENTES 24 HORAS.
        DESPUÉS DE ESE PLAZO, SE GENERARÁ UN CARGO POR RESGUARDO DE $260.00 PESOS POR DIA
      </td>
    </tr>
    <tr>
      <td colspan="2" style="border:1.5px solid #000;padding:4px 6px;font-size:9px;font-weight:bold;background:#1E40AF;color:#fff;">Su...Asesor con espíritu de Servicio</td>
      <td colspan="2" style="border:1.5px solid #000;padding:4px 6px;font-size:9px;font-weight:bold;background:#1E40AF;color:#fff;text-align:center;">CELULAR</td>
      <td colspan="2" style="border:1.5px solid #000;padding:4px 6px;font-size:9px;font-weight:bold;background:#1E40AF;color:#fff;text-align:right;">Tels: (656) 6 23 56 51 al 54</td>
    </tr>
  </table>
</div>
`;
}

// ---------- PÁGINA 4: CONTRATO ----------
function buildPagina3() {
  return `
<!-- ==================== PÁGINA 4: CONTRATO ==================== -->
<div class="page3">

  <div class="contrato-titulo">
    CONDICIONES DEL CONTRATO DE PRESTACIÓN DE SERVICIOS DE REPARACIÓN Y/O MANTENIMIENTO DE VEHÍCULOS
  </div>

  <ol class="contrato-lista">
    <li>&nbsp;&nbsp;&nbsp;&nbsp;En virtud de este contrato (*), el Distribuidor presta el servicio de reparación y/o mantenimiento al cliente (Consumidor), del vehículo cuyas características se detallan en este contrato.
    </li>

    <li>&nbsp;&nbsp;&nbsp;&nbsp;El Cliente expresa ser el dueño del vehículo y/o estar facultado para autorizar la reparación y/o mantenimiento del vehículo descrito en el presente contrato, por lo que acepta las condiciones y términos bajo las cuales se realizará la prestación del servicio descrita en el presente contrato.
      Asimismo, es sabedor de las posibles consecuencias que puede sufrir el vehículo con motivo de su reparación y/o mantenimiento y se responsabiliza de las mismas. El consumidor acepta haber tenido a la vista los precios por mano de obra, partes y/o refacciones a emplear en las operaciones a efectuar por parte del Distribuidor.
    </li>

    <li>&nbsp;&nbsp;&nbsp;&nbsp;El precio total por concepto de la prestación del servicio de reparación y/o mantenimiento será cubierto en las instalaciones del Distribuidor y en moneda nacional en la forma y término expresados en este contrato, incluyendo, en su caso, las partes y/o refacciones y los servicios adicionales que el cliente haya aceptado previamente.
    </li>

    <li>&nbsp;&nbsp;&nbsp;&nbsp;En la situación de que el Cliente solicite, o en su caso, el Distribuidor avise al Cliente de servicios adicionales a los establecidos en el presente contrato, este último los podrá autorizar vía telefónica. Asimismo, todas las quejas y sugerencias serán atendidas en el domicilio, teléfonos y horarios de atención señalados en la carátula o anverso del presente contrato.
    </li>

    <li>&nbsp;&nbsp;&nbsp;&nbsp;Las condiciones generales del vehículo materia de reparación y/o mantenimiento, son las siguientes:
      <strong>Exteriores:</strong> (&#160;&#160;) Limpiadores (plumas); (&#160;&#160;) Unidades de las luces; (&#160;&#160;) Antena; (&#160;&#160;) Espejos laterales; (&#160;&#160;) Cristales; (&#160;&#160;) Tapones de ruedas; (&#160;&#160;) Molduras completas; (&#160;&#160;) Tapón de gasolina; (&#160;&#160;) Claxon;
      <strong>Interiores:</strong> (&#160;&#160;) Instrumentos del tablero; (&#160;&#160;) Calefacción; (&#160;&#160;) Aire acondicionado; (&#160;&#160;) Radio/Tipo; (&#160;&#160;) Bocinas; (&#160;&#160;) Encendedor; (&#160;&#160;) Espejo retrovisor; (&#160;&#160;) Ceniceros; (&#160;&#160;) Cinturones de seguridad; (&#160;&#160;) Tapetes; (&#160;&#160;) Manijas y/o controles interiores; (&#160;&#160;) Equipo adicional; (&#160;&#160;) Accesorios;
      <strong>Aditamentos especiales:</strong> (&#160;&#160;) Otros.
      El vehículo se encuentra en las siguientes condiciones generales: Aspectos mecánicos _______________ aspectos de carrocería _______________.
    </li>

    <li>&nbsp;&nbsp;&nbsp;&nbsp;La prestación del servicio de reparación y/o mantenimiento del vehículo materia de este contrato, se otorga (&#160;&#160;) sin garantía; (&#160;&#160;) con garantía por un plazo de _______, (Art. 77 de la LFPC* no podrá ser inferior a 90 días) contados a partir de la entrega del vehículo. Para la garantía en partes, piezas, refacciones y accesorios. El distribuidor transmitirá la otorgada por la fabricante, la garantía deberá hacerse válida en el domicilio, teléfonos y horarios de atención señalados en la carátula o anverso del presente contrato, siempre y cuando no se haya efectuado una reparación por un tercero. El tiempo que dure la reparación y/o mantenimiento del vehículo, bajo la protección de la garantía, no es computable dentro del plazo de la misma. Las partes y/o refacciones empleadas en la reparación y/o mantenimiento del vehículo materia de este contrato, son nuevas y apropiadas para el funcionamiento del mismo. De igual forma, los gastos en que incurra el Cliente para hacer válida la garantía en un domicilio diverso al del Distribuidor, deberán ser cubiertos por éste.
    </li>

    <li>&nbsp;&nbsp;&nbsp;&nbsp;El Distribuidor será el responsable por las descomposturas, daños o pérdidas parciales o totales imputables a él, mientras el vehículo se encuentre bajo su resguardo para llevar a cabo la presentación del servicio de reparación y/o mantenimiento, o como consecuencia de la prestación del servicio, o bien, en el cumplimiento de la garantía, de acuerdo a lo establecido en el presente contrato. Asimismo, el Cliente autoriza al Distribuidor a usar el vehículo para efectos de prueba o verificación de las operaciones a realizar o realizadas. El cliente libera al Distribuidor de cualquier responsabilidad que hubiere surgido o pudiera surgir con relación al origen, propiedad o posesión del vehículo.
    </li>

    <li>&nbsp;&nbsp;&nbsp;&nbsp;El cliente podrá revocar su consentimiento, en un plazo de 5 días hábiles mediante aviso personal, correo electrónico o correo certificado, siempre y cuando no se hayan iniciado los trabajos de reparación y/o mantenimiento.
    </li>

    <li>&nbsp;&nbsp;&nbsp;&nbsp;En caso de que apliquen restricciones, estas se le darán a conocer al cliente.
    </li>

    <li>&nbsp;&nbsp;&nbsp;&nbsp;En caso de que el consumidor cancele la operación, está obligado a pagar de manera inmediata y previa a la entrega del vehículo, el importe de las operaciones efectuadas y partes y/o refacciones colocadas o adquiridas hasta el retiro del mismo.
    </li>

    <li>&nbsp;&nbsp;&nbsp;&nbsp;Son causas de rescisión del presente contrato: (i) Que el Distribuidor incumpla en la fecha y lugar de entrega del vehículo por causas imputables a él.- El Cliente le notificará por escrito el incumplimiento de dicha obligación y el Distribuidor entregará de manera inmediata el vehículo, debiendo descontar del monto total de la operación, la cantidad equivalente al ______% por concepto de pena convencional (ii) Que el Cliente incumpla con su obligación de pago.- En el evento que el Cliente incumpla con el pago por el concepto de la reparación y/o mantenimiento del vehículo, el Distribuidor le notificará por escrito su incumplimiento y podrá exigirle la rescisión o cumplimiento por mora, más la pena convencional del ______% del monto total de la operación. Las penas convencionales deberán ser equitativas y de la misma magnitud para las partes.
    </li>

    <li>&nbsp;&nbsp;&nbsp;&nbsp;El Consumidor deberá recoger el vehículo en la fecha y lugar establecida en el presente contrato, en caso contrario, se obliga a pagar al Distribuidor, la cantidad que resulte por concepto de almacenaje del vehículo por cada día que transcurra, tomando como referencia una tarifa no mayor al precio general establecido para estacionamientos públicos ubicados en la localidad del Distribuidor. Transcurrido un plazo de 15 días naturales a partir de la fecha señalada para la entrega del vehículo, y el Cliente no acuda a recoger el mismo, el Distribuidor sin responsabilidad alguna, pondrá a disposición de la autoridad correspondiente dicho vehículo. Sin perjuicio de lo anterior, el Distribuidor podrá realizar el cobro correspondiente por el concepto de almacenaje.
    </li>

    <li>&nbsp;&nbsp;&nbsp;&nbsp;El Distribuidor se obliga a expedir la factura o comprobante de pago por las operaciones efectuadas, en la cual se especificarán los precios por mano de obra, refacciones, materiales y accesorios empleados, así como la garantía que en su caso se otorgue, conforme al artículo 62 de la Ley Federal de Protección al Consumidor.
    </li>

    <li>&nbsp;&nbsp;&nbsp;&nbsp;El Distribuidor se obliga a: (i) No ceder o transmitir a terceros, con fines mercadotécnicos o publicitarios, los datos e información proporcionada por el consumidor con motivo del presente contrato (ii) No enviar publicidad sobre bienes y servicios, salvo autorización expresa del consumidor en la presente cláusula.<br>
      <div class="firma-linea">Firma o rúbrica de autorización del consumidor: _______________________________</div>
    </li>

    <li>&nbsp;&nbsp;&nbsp;&nbsp;Las partes están de acuerdo en someterse a la competencia de la Procuraduría Federal del Consumidor en la vía administrativa para resolver cualquier controversia que se suscite sobre la interpretación o cumplimiento de los términos y condiciones del presente contrato y de las disposiciones de la Ley Federal de Protección al Consumidor, la Norma Oficial Mexicana NOM-174-SCFI-2007, Prácticas comerciales-Elementos de información para la prestación de servicios en general y cualquier otra disposición aplicable, sin perjuicio del derecho que tienen las partes de someterse a la jurisdicción de los Tribunales competentes del domicilio del Distribuidor, renunciando las partes expresamente a cualquier otra jurisdicción que pudiera corresponderles por razón de sus domicilios futuros.
    </li>

    <li>&nbsp;&nbsp;&nbsp;&nbsp;El Cliente y Distribuidor aceptan la realización de la prestación del servicio de reparación y/o mantenimiento, en los términos establecidos en este contrato, y sabedores de su alcance legal, lo firman por duplicado.
    </li>
  </ol>

  <!-- Pie de página del contrato -->
  <div class="contrato-pie">
    <p>(*) El presente contrato fue registrado en la Procuraduría Federal del Consumidor bajo el número 115-2019 de fecha 10 de Enero de 2019</p>
    <p>*LFPC.- Ley Federal de Protección al Consumidor</p>
  </div>

</div>
`;
}

// ---------- HTML PRINCIPAL ----------

function buildHtml(vehiculo, asesorOverride = '') {
  // Si la orden es de un grupo, en el PDF se muestra quién lo está
  // imprimiendo (quien presionó el botón), no necesariamente quien la creó.
  const asesor = asesorOverride || vehiculo.creadoPor || '';
  const insp = vehiculo.inspeccionFisica || {};
  const sr   = vehiculo.servicioReparacion || {};
  const mm   = sr.mantenimientoMotor || {};
  const sint = sr.sintomas || {};

  const c   = vehiculo.cliente || {};
  const gob = c.gobierno || {};
  const tel = (c.telefonos || [])[0] || {};
  const cel = (c.celulares || [])[0] || {};
  const dir = c.direccion || {};

  const nombreCliente = gob.nombreGobierno ||
    [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(' ') || '';
  const telefono  = [tel.lada, tel.numero].filter(Boolean).join(' ');
  const celular   = [cel.lada, cel.numero].filter(Boolean).join(' ');
  const correo    = (c.emails || [])[0] || '';
  const rfc       = c.rfc || '';
  const direccion = [dir.calle, dir.numeroExterior, dir.colonia, dir.ciudad, dir.estado]
    .filter(Boolean).join(', ');

  const fechaRecepcion = fmtFecha(vehiculo.fechaRecepcion);
  const hora = vehiculo.horaRecepcion || '';

  const nivelGasolina = (insp.nivelGasolina && insp.nivelGasolina !== 'false') ? insp.nivelGasolina : null;
  const gaugeSvg = buildGaugeSvg(nivelGasolina);

  const canvasImg = insp.danoVehiculo
    ? `<img src="${insp.danoVehiculo}" style="display:block;max-height:140px;width:auto;margin:0 auto;"/>`
    : `<div style="width:auto;height:110px;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:9px;border:1px dashed #ccc;">Sin daños registrados</div>`;

  const esMex = (vehiculo.nacionalidad || '').toUpperCase() === 'MEX';
  const es4x4 = vehiculo.traccion === '4x4';
  const es4x2 = vehiculo.traccion === '4x2';

  const lineasReparacion = Array.from({ length: 12 }, (_, i) => `
    <tr>
      <td style="width:20px;padding:2px 3px;border:none;">${i + 1}.-</td>
      <td style="border:none;border-bottom:0.7px solid #bbb;height:22px;padding:2px 4px;">&nbsp;</td>
      <td style="width:40px;border:none;border-bottom:0.7px solid #bbb;text-align:right;padding:2px 3px;color:#555;">hrs</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Orden Operativa ${esc(vehiculo.ordenServicio)}</title>
<style>
  * { box-sizing: border-box; font-family: Arial, sans-serif; }
  body { margin: 0; padding: 0; font-size: 10px; color: #000; }
  .page  { width: 210mm; padding: 4mm 5mm; margin: 0 auto; }
  .page2 { width: 210mm; padding: 8mm 10mm; margin: 0 auto; page-break-before: always; }
  .page3 { width: 210mm; padding: 10mm 12mm; margin: 0 auto; page-break-before: always; }
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

  /* ── PÁGINA 3: CONTRATO ── */
  .contrato-titulo {
    font-size: 12px;
    font-weight: bold;
    font-style: italic;
    color: #000000;
    text-align: left;
    margin-bottom: 25px;
    line-height: 1.4;
    text-align: justify;
    text-justify: inter-word;
  }
  .contrato-lista {
    margin: 0;
    padding-left: 22px;
    list-style-type: decimal;
  }
  .contrato-lista li {
    font-size: 9px;
    line-height: 1.3;
    text-align: justify;
    text-justify: inter-word;
    margin-bottom: 1px;
    color: #000000;
  }
  .contrato-lista li strong {
    font-weight: bold;
  }
  .firma-linea {
    margin-top: 4px;
    font-size: 8.2px;
    border-top: 0.5px solid #555;
    padding-top: 3px;
    display: inline-block;
  }
  .contrato-pie {
    margin-top: 50px;
    padding-top: 5px;
    font-size: 10px;
    font-style: italic;
    color: #000000;
    line-height: 1.5;
    font-weight: 900;
    text-align: justify;
    text-justify: inter-word;
  }
  .contrato-pie p { margin: 1px 0; }

  .condiciones-s p{ 
    font-size:8px;
    line-height:1.6;
    text-align:justify;
    justify:inter-word;
    margin-bottom:1px;
  }
</style>
</head>
<body>

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
    <td class="gh" style="width:22%;font-size:9px;">NOMBRE DEL CLIENTE:</td>
    <td style="width:48%;font-size:11px;font-weight:bold;">${esc(nombreCliente)}</td>
    <td class="gh c" style="width:17%;font-size:9px;">ORDEN DE SERVICIO</td>
    <td class="c" style="width:13%;"><span class="orden-num">${esc(vehiculo.ordenServicio)}</span></td>
  </tr>
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
</table>

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
</table>

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
</table>

</div>

<!-- ==================== PÁGINA 2 (REVERSO) ==================== -->
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

        <div style="margin-top:60px;font-size:10px;">
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
  </table>

</div>

${buildPaginaResumen(vehiculo, fechaRecepcion)}
${buildPagina3()}

</body>
</html>`;
}

// ---------- FUNCIÓN PRINCIPAL ----------

async function streamVehiculoOperativoPdf(res, vehiculo, papel = 'a4', asesorOverride = '') {
  const html = buildHtml(vehiculo, asesorOverride);

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
    margin: { top: '4mm', bottom: '4mm', left: '4mm', right: '4mm' },
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