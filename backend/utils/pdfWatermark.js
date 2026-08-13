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

// El ángulo se calcula con trigonometría CSS (soportada por el Chromium que
// trae puppeteer) a partir del propio tamaño de página (100vw/100vh), para
// que la diagonal siga siempre la dirección esquina inferior izquierda →
// esquina superior derecha sin importar si el PDF es A4, Carta u Oficio/Legal.
// Se pintan DOS copias PARALELAS a esa diagonal (misma inclinación), cada una
// desplazada en perpendicular hacia un lado, de modo que cada texto ocupe su
// propia mitad/sección de la hoja en vez de compartir el mismo trazo central.
// El translateY() se aplica ANTES del rotate() (los transforms de CSS se
// evalúan de derecha a izquierda), por lo que ese desplazamiento queda en el
// eje perpendicular al texto ya rotado. La magnitud del desplazamiento usa
// --wm-perp (distancia perpendicular de la diagonal a las otras dos esquinas,
// W*H/D expresado como W*sin(atan2(H,W)) para no multiplicar dos <length>
// directamente) en vez de una fracción fija de la diagonal: así, en hojas
// menos alargadas (carta) el desplazamiento se reduce en la misma proporción
// y el texto no se sale de la hoja.
const WATERMARK_CSS = `
  .watermark-marca-agua {
    position: fixed;
    top: 50%;
    left: 50%;
    --wm-chars: 9;
    --wm-perp: calc(100vw * sin(atan2(100vh, 100vw)));
    width: calc(hypot(100vw, 100vh) / 1.6);
    text-align: center;
    font-family: Arial, sans-serif;
    font-weight: 900;
    font-size: calc(hypot(100vw, 100vh) / (var(--wm-chars) * 1.2));
    line-height: 1;
    white-space: nowrap;
    z-index: 9999;
    pointer-events: none;
  }
  .watermark-marca-agua.wm-a {
    transform: translate(-50%, -50%) rotate(calc(-1 * atan2(100vh, 100vw))) translateY(calc(var(--wm-perp) * -0.55));
  }
  .watermark-marca-agua.wm-b {
    transform: translate(-50%, -50%) rotate(calc(-1 * atan2(100vh, 100vw))) translateY(calc(var(--wm-perp) * 0.55));
  }
  .watermark-cancelada {
    color: rgba(220, 38, 38, 0.45);
  }
  .watermark-garantia {
    --wm-chars: 8;
    color: rgba(234, 179, 8, 0.55);
  }
`;

function watermarkPairHtml(cls, texto) {
  return `
    <div class="watermark-marca-agua wm-a ${cls}">${texto}</div>
    <div class="watermark-marca-agua wm-b ${cls}">${texto}</div>
  `;
}

function watermarkHtml(orden) {
  if (esOrdenCancelada(orden)) {
    return watermarkPairHtml('watermark-cancelada', 'CANCELADA');
  }
  if (esOrdenGarantia(orden)) {
    return watermarkPairHtml('watermark-garantia', 'GARANTIA');
  }
  return '';
}

// Comprobantes de Caja (Nota de Venta, Remisión, Recibo Provisional, Recibo de
// Dólares) se marcan por pago, no por orden: un pago cancelado (ver POST
// /cajas/:id/pagos/:pagoId/cancelar) conserva su folio pero el PDF debe seguir
// mostrando que ya no es válido.
function watermarkHtmlPago(pago) {
  if (esPagoCancelado(pago)) {
    return watermarkPairHtml('watermark-cancelada', 'CANCELADO');
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
