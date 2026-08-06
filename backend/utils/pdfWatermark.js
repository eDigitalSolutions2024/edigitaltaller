// backend/utils/pdfWatermark.js
// Marca de agua "CANCELADA" para los PDFs de una orden (operativo, imprimir,
// presupuesto, venta). position:fixed se repite en cada página impresa por
// Chromium al generar el PDF con puppeteer.

function esOrdenCancelada(orden) {
  return (orden?.estadoOrden || '').toUpperCase() === 'CANCELADA';
}

const WATERMARK_CSS = `
  .watermark-cancelada {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-45deg);
    font-size: 110px;
    font-weight: 900;
    font-family: Arial, sans-serif;
    color: rgba(220, 38, 38, 0.45);
    letter-spacing: 10px;
    white-space: nowrap;
    z-index: 9999;
    pointer-events: none;
  }
`;

function watermarkHtml(orden) {
  if (!esOrdenCancelada(orden)) return '';
  return '<div class="watermark-cancelada">CANCELADA</div>';
}

module.exports = { esOrdenCancelada, WATERMARK_CSS, watermarkHtml };
