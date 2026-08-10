// backend/utils/pdfWatermark.js
// Marca de agua para los PDFs de una orden (operativo, imprimir, presupuesto,
// venta): "CANCELADA" en rojo si la orden está cancelada, o "GARANTIA" en
// amarillo si la orden es una solicitud de garantía. position:fixed se repite
// en cada página impresa por Chromium al generar el PDF con puppeteer.

function esOrdenCancelada(orden) {
  return (orden?.estadoOrden || '').toUpperCase() === 'CANCELADA';
}

function esOrdenGarantia(orden) {
  return !!orden?.garantia;
}

function esPagoCancelado(pago) {
  return !!pago?.cancelado;
}

const WATERMARK_CSS = `
  .watermark-marca-agua {
    position: fixed;
    top: 50%;
    left: 50%;
    width: 250vw;
    transform: translate(-50%, -50%) rotate(-45deg);
    text-align: center;
    font-family: Arial, sans-serif;
    font-weight: 900;
    line-height: 1;
    white-space: nowrap;
    z-index: 9999;
    pointer-events: none;
  }
  .watermark-cancelada {
    font-size: 22vw;
    color: rgba(220, 38, 38, 0.45);
  }
  .watermark-garantia {
    font-size: 22vw;
    color: rgba(234, 179, 8, 0.55);
  }
`;

function watermarkHtml(orden) {
  if (esOrdenCancelada(orden)) {
    return '<div class="watermark-marca-agua watermark-cancelada">CANCELADA</div>';
  }
  if (esOrdenGarantia(orden)) {
    return '<div class="watermark-marca-agua watermark-garantia">GARANTIA</div>';
  }
  return '';
}

// Comprobantes de Caja (Nota de Venta, Remisión, Recibo Provisional, Recibo de
// Dólares) se marcan por pago, no por orden: un pago cancelado (ver POST
// /cajas/:id/pagos/:pagoId/cancelar) conserva su folio pero el PDF debe seguir
// mostrando que ya no es válido.
function watermarkHtmlPago(pago) {
  if (esPagoCancelado(pago)) {
    return '<div class="watermark-marca-agua watermark-cancelada">CANCELADO</div>';
  }
  return '';
}

module.exports = {
  esOrdenCancelada,
  esOrdenGarantia,
  esPagoCancelado,
  WATERMARK_CSS,
  watermarkHtml,
  watermarkHtmlPago,
};
