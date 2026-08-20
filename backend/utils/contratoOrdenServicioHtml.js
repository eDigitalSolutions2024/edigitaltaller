// Layout compartido del contrato de orden de servicio (título, cláusulas
// numeradas, línea de firma y pie de página): lo usa tanto la página 4 del
// PDF operativo (VehiculoOperativoPdf.js) como la descarga standalone de una
// versión del historial (ContratoOrdenServicioPdf.js), para que ambas se
// vean idénticas.
const { esc } = require('./htmlEscape');

const CONTRATO_CSS = `
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
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .firma-linea-img {
    height: 65px;
    max-width: 240px;
    object-fit: contain;
    display: block;
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
`;

// firmaClienteDataUrl (opcional): firma capturada en el Formato Operativo
// (vehiculo.firmaAutorizacionCliente, PUT /:id/firma-operativo). Cuando existe,
// se dibuja sobre la línea de autorización del contrato en vez del espacio en
// blanco para firmar a mano. La descarga standalone del historial
// (ContratoOrdenServicioPdf.js) no tiene una orden detrás, así que siempre
// llama a esta función sin firma y muestra el espacio en blanco.
function buildContratoBodyHtml(contrato, firmaClienteDataUrl = '') {
  const titulo = esc(contrato?.titulo || '');
  const clausulasHtml = (contrato?.clausulas || [])
    .map((clausula) => `<li>${esc(clausula)}</li>`)
    .join('\n    ');
  const pieHtml = (contrato?.piePagina || [])
    .map((linea) => `<p>${esc(linea)}</p>`)
    .join('\n    ');
  const firmaHtml = firmaClienteDataUrl
    ? `<img src="${firmaClienteDataUrl}" class="firma-linea-img" alt="Firma del cliente"/>`
    : '_______________________________';

  return `
  <div class="contrato-titulo">
    ${titulo}
  </div>

  <ol class="contrato-lista">
    ${clausulasHtml}
  </ol>

  <div class="firma-linea">Firma o rúbrica de autorización del consumidor: ${firmaHtml}</div>

  <div class="contrato-pie">
    ${pieHtml}
  </div>
`;
}

module.exports = { CONTRATO_CSS, buildContratoBodyHtml };
