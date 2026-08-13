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

// El ángulo y el ancho se calculan con trigonometría CSS (soportada por el
// Chromium que trae puppeteer) a partir del propio tamaño de página
// (100vw/100vh), para que la diagonal toque siempre la esquina inferior
// izquierda y la esquina superior derecha sin importar si el PDF es A4,
// Carta u Oficio/Legal. El margen de impresión de cada PDF se dejó en 0 (ver
// los page.pdf() de cada service) para que el margen no recorte esta marca.
const WATERMARK_CSS = `
  .watermark-marca-agua {
    position: fixed;
    top: 50%;
    left: 50%;
    --wm-chars: 9;
    width: calc(hypot(100vw, 100vh));
    transform: translate(-50%, -50%) rotate(calc(-1 * atan2(100vh, 100vw)));
    text-align: center;
    font-family: Arial, sans-serif;
    font-weight: 900;
    font-size: calc(hypot(100vw, 100vh) / (var(--wm-chars) * 0.72));
    line-height: 1;
    white-space: nowrap;
    z-index: 9999;
    pointer-events: none;
  }
  .watermark-cancelada {
    color: rgba(220, 38, 38, 0.45);
  }
  .watermark-garantia {
    --wm-chars: 8;
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
