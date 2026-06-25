// backend/service/VehiculoOperativoPdf.js
// Genera el PDF "Operativo" con formato de recepción de vehículo
// Página 1 (frente): inspección / servicios
// Página 2 (reverso): condiciones de servicio + concepto de reparaciones

const puppeteer = require('puppeteer');
const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');

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
  return dayjs(fechaISO).format('DD/MM/YYYY');
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

// ---------- HTML PRINCIPAL ----------

function buildHtml(vehiculo) {
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

  const gaugeSvg = buildGaugeSvg(insp.nivelGasolina);

  const canvasImg = insp.danoVehiculo
    ? `<img src="${insp.danoVehiculo}" style="max-width:100%;max-height:140px;object-fit:contain;"/>`
    : `<div style="width:100%;height:110px;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:9px;border:1px dashed #ccc;">Sin daños registrados</div>`;

  const esMex = (vehiculo.nacionalidad || '').toUpperCase() === 'MEX';
  const es4x4 = vehiculo.traccion === '4x4';
  const es4x2 = vehiculo.traccion === '4x2';

  // Líneas en blanco para el concepto de reparaciones (página 2)
  const lineasReparacion = Array.from({ length: 12 }, (_, i) => `
    <tr>
      <td style="width:20px;padding:2px 3px;border:none;">${i + 1}.-</td>
      <td style="border:none;border-bottom:0.7px solid #bbb;height:22px;padding:2px 4px;">&nbsp;</td>
      <td style="width:70px;border:none;border-bottom:0.7px solid #bbb;text-align:right;padding:2px 3px;">$</td>
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
</style>
</head>
<body>

<!-- ==================== PÁGINA 1 (FRENTE) ==================== -->
<div class="page">

<!-- ENCABEZADO -->
<table class="nb" style="margin-bottom:2px;">
  <tr>
    <td style="width:22%;vertical-align:top;">
      <div style="border:0.7px solid #888;padding:3px;font-size:9px;">
        <div style="margin-bottom:2px;"><strong>ASESOR:</strong> ______________________</div>
        <div><strong>ASESOR:</strong> ______________________</div>
      </div>
    </td>
    <td style="text-align:center;vertical-align:middle;padding:0 10px;">
      ${LOGO_DATA_URL
        ? `<img src="${LOGO_DATA_URL}" style="max-height:52px;max-width:220px;object-fit:contain;" />`
        : `<div style="font-size:26px;font-weight:800;color:#1E40AF;letter-spacing:1px;">Edigital Solutions</div>`
      }
    </td>
    <td style="width:26%;vertical-align:top;text-align:right;font-size:9px;">
      <div style="margin-bottom:2px;"><strong>TÉCNICO:</strong> _______________ &nbsp; HRS: ____</div>
      <div><strong>TÉCNICO:</strong> _______________ &nbsp; HRS: ____</div>
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
      <div style="font-weight:bold;font-size:9px;background:#E5E7EB;padding:2px 4px;margin:3px 0 2px;">INDICADORES DEL TABLERO</div>
      <div style="font-size:8.5px;margin-bottom:2px;">PRENDIDO "P" &nbsp; NO FUNCIONA "N"</div>
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
        ${insp.observaciones ? `<tr><td colspan="3" style="padding:1px 2px;border-top:0.5px solid #ccc;">OBS: ${esc(insp.observaciones)}</td></tr>` : ''}
      </table>
    </td>

    <td style="width:40%;vertical-align:middle;text-align:center;padding:3px;">
      <div style="font-weight:bold;font-size:9px;margin-bottom:2px;">DAÑOS DEL VEHÍCULO</div>
      ${canvasImg}
    </td>

    <td style="width:24%;vertical-align:middle;text-align:center;padding:3px;">
      <div style="font-weight:bold;font-size:9px;margin-bottom:2px;">Gasolina</div>
      ${gaugeSvg}
      <div style="font-size:11px;font-weight:bold;margin-top:4px;">
        ${esc(insp.nivelGasolina || '—')}
      </div>
    </td>
  </tr>
</table>

<!-- SERVICIO -->
<div class="sh">S &nbsp; E &nbsp; R &nbsp; V &nbsp; I &nbsp; C &nbsp; I &nbsp; O</div>
<table>
  <tr>
    <!-- Checkboxes izquierda -->
    <td style="width:43%;vertical-align:top;padding:2px 3px;">
      <table class="nb" style="width:100%;font-size:9px;">
        <tr><td colspan="2" class="gh" style="padding:2px 4px;">MANTENIMIENTO DEL MOTOR</td><td class="gh r" style="width:52px;padding:2px 4px;">$ IMPORTE</td></tr>
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

    <!-- Áreas de texto derecha -->
    <td style="width:57%;vertical-align:top;padding:2px 3px;">
      <table class="nb" style="width:100%;font-size:9px;">
        <tr>
          <td class="gh" style="padding:2px 4px;">FALLAS DE MOTOR Y OTROS:</td>
          <td class="gh r" style="width:68px;padding:2px 4px;">PRECIO $</td>
        </tr>
        <tr>
          <td style="height:45px;vertical-align:top;padding:2px 3px;">${esc(sr.fallasMotorOtros || sr.fallasReportadasCliente || '')}</td>
          <td style="vertical-align:top;padding:2px 3px;">${sr.precioFallasMotorOtros ? '$' + sr.precioFallasMotorOtros : '&nbsp;'}</td>
        </tr>

        <tr>
          <td class="gh" style="padding:2px 4px;">SISTEMA ELÉCTRICO Y AIRE ACONDICIONADO:</td>
          <td class="gh r" style="padding:2px 4px;">PRECIO $</td>
        </tr>
        <tr>
          <td style="height:45px;vertical-align:top;padding:2px 3px;">${esc(sr.sistemaElectricoAire || '')}</td>
          <td style="vertical-align:top;padding:2px 3px;">${sr.precioSistemaElectricoAire ? '$' + sr.precioSistemaElectricoAire : '&nbsp;'}</td>
        </tr>

        <tr>
          <td class="gh" style="padding:2px 4px;">SUSPENSIÓN, DIRECCIÓN Y FRENOS:</td>
          <td class="gh r" style="padding:2px 4px;">PRECIO $</td>
        </tr>
        <tr>
          <td style="height:45px;vertical-align:top;padding:2px 3px;">${esc(sr.suspensionDireccionFrenos || '')}</td>
          <td style="vertical-align:top;padding:2px 3px;">${sr.precioSuspensionDireccionFrenos ? '$' + sr.precioSuspensionDireccionFrenos : '&nbsp;'}</td>
        </tr>

        <tr>
          <td class="gh" style="padding:2px 4px;">SISTEMA DE ENFRIAMIENTO:</td>
          <td class="gh r" style="padding:2px 4px;">PRECIO $</td>
        </tr>
        <tr>
          <td style="height:45px;vertical-align:top;padding:2px 3px;">${esc(sr.sistemaEnfriamiento || '')}</td>
          <td style="vertical-align:top;padding:2px 3px;">${sr.precioSistemaEnfriamiento ? '$' + sr.precioSistemaEnfriamiento : '&nbsp;'}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

</div>

<!-- ==================== PÁGINA 2 (REVERSO) ==================== -->
<div class="page2">

  <!-- Referencia de la orden -->
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

  <!-- Condiciones + Concepto reparaciones (lado a lado) -->
  <table style="height:200mm;">
    <tr style="vertical-align:top;">

      <!-- CONDICIONES DE SERVICIO -->
      <td style="width:44%;padding:8px 10px;vertical-align:top;">
        <div style="font-weight:bold;text-align:center;font-size:11px;margin-bottom:8px;border-bottom:1px solid #000;padding-bottom:4px;">
          CONDICIONES DE SERVICIO
        </div>
        <p style="font-size:9px;line-height:1.6;text-align:justify;margin:0;">
          ACEPTO QUE EN CASO DE REQUERIR COMBUSTIBLE PARA PRUEBA Y REACONDICIONAMIENTO
          DE MI VEHÍCULO SEA CARGADO A MI CUENTA EN TODA OCASIÓN.
        </p>
        <p style="font-size:9px;line-height:1.6;text-align:justify;margin:8px 0 0;">
          IMPORTANTE: ACEPTO QUE LA EMPRESA Y/O SUS REPRESENTANTES NO SE HACEN RESPONSABLES
          POR OBJETOS DE VALOR OLVIDADOS O NO DEPOSITADOS EN LA RECEPCIÓN, CON RECIBO;
          POR ESCRITO, ASÍ COMO TAMPOCO SE RESPONSABILIZARÁN POR ROBO, INCENDIO O CUALQUIER
          OTRO SUCESO EXTRAÑO QUE AFECTE MIS INTERESES Y QUE ESTÉ FUERA DEL CONTROL DE LA EMPRESA.
        </p>
        <p style="font-size:9px;line-height:1.6;text-align:justify;margin:8px 0 0;">
          DECLARO: QUE SOY EL PROPIETARIO Y/O REPRESENTANTE Y AUTORIZO LAS REPARACIONES O
          SERVICIOS DESCRITOS EN LA PRESENTE ORDEN, ASÍ COMO EL USO DE REFACCIONES, ACCESORIOS,
          LUBRICANTES Y OTROS MATERIALES NECESARIOS PARA LLEVAR A CABO LA REPARACIÓN O SERVICIO
          SOLICITADO, MISMO QUE ACEPTO LIQUIDAR ANTES O EN EL MOMENTO QUE ME SEA ENTREGADO
          MI VEHÍCULO.
        </p>

        <!-- Firma del cliente -->
        <div style="margin-top:30px;font-size:10px;">
          <div style="border-top:1px solid #000;padding-top:6px;text-align:center;">
            FIRMA DEL CLIENTE
          </div>
          <div style="margin-top:20px;font-size:10px;">NOMBRE: _______________________________</div>
          <div style="margin-top:10px;font-size:10px;">FECHA DE ENTREGA: ____________________</div>
        </div>
      </td>

      <!-- CONCEPTO DE REPARACIONES -->
      <td style="width:56%;padding:8px 10px;vertical-align:top;border-left:0.7px solid #000;">
        <div style="font-weight:bold;text-align:center;font-size:11px;margin-bottom:8px;border-bottom:1px solid #000;padding-bottom:4px;">
          CONCEPTO DE LAS REPARACIONES EFECTUADAS
        </div>
        <table style="width:100%;font-size:10px;border-collapse:collapse;">
          <tr>
            <td style="width:20px;border:none;padding:2px 3px;font-weight:bold;">#</td>
            <td style="border:none;border-bottom:1px solid #000;padding:3px 4px;font-weight:bold;">DESCRIPCIÓN</td>
            <td style="width:75px;border:none;border-bottom:1px solid #000;text-align:right;padding:3px 4px;font-weight:bold;">PRECIO $</td>
            <td style="width:42px;border:none;border-bottom:1px solid #000;text-align:right;padding:3px 4px;font-weight:bold;">HRS</td>
          </tr>
          ${lineasReparacion}
          <tr>
            <td colspan="2" style="border:none;border-top:1px solid #000;text-align:right;padding:4px 6px;font-weight:bold;font-size:10px;">TOTAL:</td>
            <td style="border:none;border-top:1px solid #000;text-align:right;padding:4px 4px;font-weight:bold;">$</td>
            <td style="border:none;border-top:1px solid #000;"></td>
          </tr>
        </table>

        <div style="margin-top:16px;font-size:10px;">
          <div>TÉCNICO RESPONSABLE: _________________________________</div>
          <div style="margin-top:10px;">FIRMA: _______________________________</div>
        </div>
      </td>

    </tr>
  </table>

</div>

</body>
</html>`;
}

// ---------- FUNCIÓN PRINCIPAL ----------

async function streamVehiculoOperativoPdf(res, vehiculo, papel = 'a4') {
  const html = buildHtml(vehiculo);

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
