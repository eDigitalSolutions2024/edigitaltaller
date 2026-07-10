// backend/service/devolucionRefaccionPdf.js
// Formato "Devolución de Refacciones" — media hoja, se imprime 3 veces
// (2 copias en la primera hoja y 1 en la segunda).
const puppeteer = require('puppeteer');
const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');
require('dayjs/locale/es');
dayjs.locale('es');

let LOGO_DATA_URL = '';
try {
  const logoPath = path.join(__dirname, '../../frontend/public/images/logo_servicompactos.png');
  const buf = fs.readFileSync(logoPath);
  LOGO_DATA_URL = `data:image/png;base64,${buf.toString('base64')}`;
} catch (e) {
  console.warn('[devolucionRefaccionPdf] Logo no encontrado:', e.message);
}

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Partes de fecha para el formato "{dia} de {Mes} del {año}"
function fechaPartes(fecha) {
  if (!fecha) return { dia: '', mes: '', anio: '' };
  const d = dayjs(fecha);
  if (!d.isValid()) return { dia: '', mes: '', anio: '' };
  const mes = d.format('MMMM');
  return {
    dia: d.format('DD'),
    mes: mes.charAt(0).toUpperCase() + mes.slice(1),
    anio: d.format('YYYY'),
  };
}

function fmtMonto(v) {
  if (v === null || v === undefined || String(v).trim() === '') return '';
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n)) return String(v);
  return new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(n);
}

const check = (on) => `<span class="chk">${on ? '&#10003;' : '&nbsp;'}</span>`;
const linea = (valor, ancho) =>
  `<span class="linea" style="min-width:${ancho || '20mm'}">${esc(valor) || '&nbsp;'}</span>`;

function copiaHtml(dev) {
  const ff = fechaPartes(dev.fechaFactura);
  const fd = fechaPartes(dev.fechaDevolucion);
  const cant = dev.cantidadRecuperar || {};
  const dest = dev.destinoDevolucion || {};
  const mot = dev.motivoDevolucion || {};
  const fir = dev.firmas || {};
  const numeroConsecutivo = dev.folio ?? '';

  const refacciones = (dev.refacciones || [])
    .map(r => [r.codigo, r.nombre].filter(Boolean).join(' '))
    .filter(Boolean)
    .join(', ');

  return `
  <div class="copia">

    <!-- SECCIÓN 1: LOGO / TÍTULO / No. PENDIENTE -->
    <div class="s1">
      <div class="s1__logo">
        ${LOGO_DATA_URL ? `<img src="${LOGO_DATA_URL}" />` : '<b>Servicompactos</b>'}
      </div>
      <div class="s1__titulo">Devoluci&oacute;n de Refacciones</div>
      <div class="s1__num">${esc(numeroConsecutivo)}</div>
    </div>

    <!-- SECCIÓN 2: PROVEEDOR / REPORTE IMPORTANTE -->
    <div class="s2">
      <div class="s2__vacio"></div>
      <div class="s2__prov">Proveedor ${linea(dev.proveedor, '45mm')}</div>
      <div class="s2__rep">Reporte importante !</div>
    </div>

    <!-- SECCIÓN 3: DATOS -->
    <div class="s3">
      <div class="fila">
        <div class="col">
          Fecha de la factura ${linea(ff.dia, '8mm')} de ${linea(ff.mes, '18mm')} del ${linea(ff.anio, '12mm')}
          <span class="mini">(compra)</span>
        </div>
        <div class="col">
          Fecha de la devoluci&oacute;n ${linea(fd.dia, '8mm')} de ${linea(fd.mes, '18mm')} del ${linea(fd.anio, '12mm')}
        </div>
      </div>
      <div class="fila">
        <div class="col">No. de factura ${linea(dev.numeroFactura, '45mm')}</div>
        <div class="col">No. del comprobante de devoluci&oacute;n ${linea(dev.numeroComprobante, '32mm')}</div>
      </div>
      <div class="fila">
        <div class="col">Refacci&oacute;n (C&oacute;digo y nombre) ${linea(refacciones, '40mm')}</div>
        <div class="col">No. de Orden de Servicio ${linea(dev.numeroOrdenServicio, '35mm')}</div>
      </div>
      <div class="fila">
        <div class="col col--cant">Cantidad a recuperar&nbsp;&nbsp; Pesos ${linea(fmtMonto(cant.pesos), '22mm')}</div>
        <div class="col">D&oacute;lares ${linea(fmtMonto(cant.dolares), '20mm')}</div>
        <div class="col">Cheque ${linea(cant.cheque, '20mm')}</div>
      </div>
      <div class="fila">
        <div class="col col--cant">Vale... ${linea(cant.vale, '22mm')} <span class="mini">(ver anexo)</span></div>
        <div class="col">Garant&iacute;a ${linea(cant.garantia, '22mm')} <span class="mini">(pieza x pieza)</span></div>
        <div class="col"></div>
      </div>
    </div>

    <!-- SECCIÓN 4: DESTINO DE LA DEVOLUCIÓN -->
    <div class="s4">
      <div class="s4__label">Destino de la<br/>devoluci&oacute;n...</div>
      <div class="s4__op">Caja Chica Dlls ${check(dest.cajaChicaDlls)}</div>
      <div class="s4__op">Caja Chica MN ${check(dest.cajaChicaMN)}</div>
      <div class="s4__op">Banco ${check(dest.banco)}</div>
      <div class="s4__op">Cr&eacute;dito ${check(dest.credito)}</div>
    </div>

    <!-- SECCIÓN 5: NOMBRE Y FIRMA DE QUIEN RECIBE -->
    <div class="s5">
      Nombre y firma de quien recibe <span class="linea" style="flex:1">&nbsp;</span>
    </div>

    <!-- SECCIÓN 6: MOTIVO DE LA DEVOLUCIÓN -->
    <div class="s6">
      <div class="s6__label">Motivo de la<br/>devoluci&oacute;n...</div>
      <div class="s6__ops">
        <div class="s6__fila">
          <div class="s6__op">Error t&eacute;cnico ${check(mot.errorTecnico)}</div>
          <div class="s6__op">Error refaccionario ${check(mot.errorRefaccionario)}</div>
          <div class="s6__op">Error Proveedor ${check(mot.errorProveedor)}</div>
          <div class="s6__op">Core ${check(mot.core)}</div>
        </div>
        <div class="s6__fila">
          <div class="s6__op">Pieza defectuosa ${check(mot.piezaDefectuosa)}</div>
          <div class="s6__op">Cancelaci&oacute;n venta ${check(mot.cancelacionVenta)}</div>
          <div class="s6__op s6__op--otro">Otro ${linea(mot.otro, '32mm')}</div>
        </div>
      </div>
    </div>

    <!-- SECCIÓN 7: FIRMAS -->
    <div class="s7">
      <div class="s7__fila">
        <div class="firma"><div class="firma__linea">${esc(fir.gerenteCompras) || '&nbsp;'}</div><div class="firma__label">Gerente de Compras</div></div>
        <div class="firma"><div class="firma__linea">${esc(fir.comprador) || '&nbsp;'}</div><div class="firma__label">Comprador:</div></div>
        <div class="firma"><div class="firma__linea">${esc(fir.mensajero) || '&nbsp;'}</div><div class="firma__label">Mensajero:</div></div>
      </div>
      <div class="s7__fila s7__fila--centro">
        <div class="firma"><div class="firma__linea">${esc(fir.supervisadoPor) || '&nbsp;'}</div><div class="firma__label">Supervisado por:</div></div>
        <div class="firma"><div class="firma__linea">${esc(fir.auditadoPor) || '&nbsp;'}</div><div class="firma__label">Auditado por:</div></div>
      </div>
    </div>

  </div>`;
}

function buildHtml(dev) {
  const copia = copiaHtml(dev);

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 9pt; color: #000; }
  @page { size: A4 portrait; margin: 6mm 8mm; }

  /* Cada copia ocupa media hoja; 2 por página y la 3ª en hoja nueva */
  .copia {
    background: #e7e7e72d;
    height: 138mm;
    // border: 1mm solid #000;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .copia + .copia { margin-top: 6mm; }
  .copia--salto { page-break-before: always; margin-top: 0 !important; }

  .linea {
    display: inline-block;
    border-bottom: 0.3mm solid #000;
    padding: 0 2mm;
    text-align: center;
    font-weight: bold;
    vertical-align: bottom;
  }
  .mini { font-size: 7pt; }
  .chk {
    display: inline-block;
    width: 5mm; height: 4.2mm;
    border: 0.3mm solid #555;
    text-align: center;
    font-size: 9pt; line-height: 4.2mm;
    vertical-align: middle;
    margin-left: 1.5mm;
  }

  /* ── SECCIÓN 1 ── */
  .s1 { flex: 0 0 11%; display: flex; align-items: center;  padding: 0 3mm; }
  .s1__logo { width: 25%; }
  .s1__logo img { height: 11mm; }
  .s1__titulo { width: 55%; text-align: center; font-size: 15pt; font-weight: bold; color: #444; }
  .s1__num { width: 20%; text-align: right; font-size: 13pt; color: #555; padding-right: 4mm; }

  /* ── SECCIÓN 2 ── */
  .s2 { flex: 0 0 7%; display: flex; align-items: center;  padding: 0 3mm; }
  .s2__vacio { width: 25%; }
  .s2__prov { width: 50%; text-align: center; }
  .s2__rep { width: 25%; text-align: right; font-size: 9.5pt; }

  /* ── SECCIÓN 3 ── */
  .s3 { flex: 0 0 33%;  padding: 2mm 3mm; display: flex; flex-direction: column; justify-content: space-around; }
  .s3 .fila { display: flex; }
  .s3 .col { width: 50%; }
  .s3 .fila:nth-child(4) .col--cant,
  .s3 .fila:nth-child(5) .col--cant { width: 44%; padding-left: 0; }
  .s3 .fila:nth-child(4) .col:not(.col--cant),
  .s3 .fila:nth-child(5) .col:not(.col--cant) { width: 28%; }

  /* ── SECCIÓN 4 ── */
  .s4 { flex: 0 0 9%; display: flex; align-items: center;  padding: 0 3mm; }
  .s4__label { width: 18%; font-size: 8.5pt; }
  .s4__op { width: 20.5%; }

  /* ── SECCIÓN 5 ── */
  .s5 { flex: 0 0 7%; display: flex; align-items: center;  padding: 0 3mm; }

  /* ── SECCIÓN 6 ── */
  .s6 { flex: 0 0 14%; display: flex; align-items: center;  padding: 0 3mm; }
  .s6__label { width: 18%; font-size: 8.5pt; }
  .s6__ops { width: 82%; display: flex; flex-direction: column; gap: 2.5mm; }
  .s6__fila { display: flex; }
  .s6__op { width: 25%; }
  .s6__op--otro { width: 50%; }

  /* ── SECCIÓN 7 ── */
  .s7 { flex: 1; display: flex; flex-direction: column; justify-content: space-evenly; padding: 2mm 3mm; }
  .s7__fila { display: flex; justify-content: space-between; }
  .s7__fila--centro { justify-content: space-around; }
  .firma { width: 30%; text-align: left; }
  .firma__linea {
    border-bottom: 0.3mm solid #000; height: 6mm;
    display: flex; align-items: flex-end; justify-content: center;
    font-weight: bold; font-size: 8.5pt; text-align: center;
    padding: 0 1mm; overflow: hidden;
  }
  .firma__label { font-size: 9pt; padding-top: 0.5mm; }
</style>
</head>
<body>
  ${copia}
</body>
</html>`;
}

async function streamDevolucionRefaccionPdf(res, dev) {
  const html = buildHtml(dev);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '6mm', bottom: '6mm', left: '8mm', right: '8mm' },
  });

  await browser.close();

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="devolucion_refacciones_${dev.folio}.pdf"`);
  res.send(pdfBuffer);
}

module.exports = { streamDevolucionRefaccionPdf };
