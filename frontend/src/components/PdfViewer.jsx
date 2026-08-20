import { useEffect, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import * as pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs";
import { FaSearchMinus, FaSearchPlus, FaDownload, FaPrint, FaSignature } from "react-icons/fa";
import FirmaModal from "./FirmaModal";
import "../styles/PdfViewer.css";

// El WebView de las tablets (FreeKiosk) no trae un visor de PDF nativo, así
// que el PDF se renderiza aquí mismo con pdf.js (canvas) en vez de depender
// de un <iframe>/<embed> apuntando directo al archivo. Se registra el
// worker como global en vez de apuntar GlobalWorkerOptions.workerSrc a un
// archivo aparte: varios navegadores/WebViews (incluido Firefox en ciertas
// versiones) fallan al crear el Worker de pdf.js como módulo ES, y su
// mecanismo de repuesto interno (un import() dinámico) falla igual. Con el
// worker ya importado y colgado en window.pdfjsWorker, pdf.js lo detecta y
// corre todo en el hilo principal sin depender de ninguna de las dos rutas.
if (typeof window !== "undefined") {
  window.pdfjsWorker = pdfjsWorker;
}

const ESCALA_MIN = 0.5;
const ESCALA_MAX = 2.5;
const ESCALA_PASO = 0.25;

function distancia(t1, t2) {
  return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
}

export default function PdfViewer({ src, fileName = "documento.pdf", height = 480, onFirmar }) {
  const [numPaginas, setNumPaginas] = useState(0);
  const [paginasListas, setPaginasListas] = useState(0);
  const [escala, setEscala] = useState(1);
  const [error, setError] = useState(null);
  const [anchoBase, setAnchoBase] = useState(0);
  const [tamanoHoja, setTamanoHoja] = useState(null); // { width, height } en pt
  const [mostrarFirma, setMostrarFirma] = useState(false);
  const containerRef = useRef(null);
  const pinchRef = useRef(null);

  // numPaginas se sabe en cuanto pdf.js termina de leer la estructura del
  // documento, pero el DIBUJO de cada canvas (page.render()) es asíncrono y
  // puede tardar un instante más — si se imprime en ese hueco (botón ya
  // habilitado pero el canvas aún en blanco), la impresión sale en blanco.
  // Se cuentan los renders reales completados antes de habilitar imprimir.
  const listoParaImprimir = numPaginas > 0 && paginasListas >= numPaginas;

  useEffect(() => {
    setNumPaginas(0);
    setPaginasListas(0);
    setEscala(1);
    setTamanoHoja(null);
    setError(null);
  }, [src]);

  // Un cambio de escala o de ancho (zoom, o el visor cambiando de tamaño)
  // hace que react-pdf vuelva a dibujar cada canvas desde cero — mientras
  // tanto, react-pdf mismo lo pone en visibility:hidden. Si se imprime justo
  // en ese momento, esa página saldría en blanco igual que en la carga
  // inicial, así que cuenta como "no listo" otra vez.
  useEffect(() => {
    setPaginasListas(0);
  }, [escala, anchoBase]);

  // Ancho disponible del contenedor (menos el padding): con escala=1 la
  // página se ajusta a ese ancho en vez de renderizarse a su tamaño real en
  // puntos (~612px para carta), que se ve diminuto dentro de un modal grande.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const medir = () => setAnchoBase(Math.max(0, el.clientWidth - 16));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Zoom con Ctrl+rueda del mouse (o gesto de pellizco en trackpad, que el
  // navegador reporta como wheel+ctrlKey) y con dos dedos en pantallas
  // táctiles. Se agregan como listeners nativos — no vía onWheel/onTouchMove
  // de React — porque React los registra "passive" por defecto y no
  // dejaría cancelar el zoom/scroll nativo del navegador con preventDefault().
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const aplicarZoom = (factor) => {
      setEscala((e) => Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, +(e * factor).toFixed(2))));
    };

    const onWheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      aplicarZoom(e.deltaY < 0 ? 1.08 : 1 / 1.08);
    };

    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        pinchRef.current = distancia(e.touches[0], e.touches[1]);
      }
    };

    const onTouchMove = (e) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const nuevaDist = distancia(e.touches[0], e.touches[1]);
        aplicarZoom(nuevaDist / pinchRef.current);
        pinchRef.current = nuevaDist;
      }
    };

    const onTouchEnd = (e) => {
      if (e.touches.length < 2) pinchRef.current = null;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  function imprimir() {
    if (!listoParaImprimir) return;
    // Nada de window.open(): en el WebView de la tablet (FreeKiosk) abrir
    // una ventana/pestaña nueva para imprimir no es fiable. Se llama
    // print() sobre la propia página; el CSS de PdfViewer.css (@media
    // print) oculta todo lo demás y deja visible solo este visor.
    window.print();
  }

  return (
    <div>
      {/* @page no tiene efecto en pantalla, solo al imprimir/exportar a PDF —
          se define aquí (no en PdfViewer.css) porque necesita el tamaño real
          de ESTE documento: varios reportes se generan apaisados (landscape)
          en el backend, algunos en A4 y otros en Carta. Sin avisarle al
          navegador, el diálogo de impresión asume vertical con el tamaño de
          papel que tenga configurado por default, y termina achicando o
          dejando franjas en un papel que no corresponde. Se usa el tamaño
          exacto en puntos del PDF (no la palabra "landscape"/"A4") para que
          coincida sin importar qué tamaño haya usado el backend. */}
      {tamanoHoja && (
        <style>{`@page { margin: 0; size: ${tamanoHoja.width}pt ${tamanoHoja.height}pt; }`}</style>
      )}
      <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2 pdfviewer-toolbar">
        <div className="btn-group">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => setEscala((e) => Math.max(ESCALA_MIN, +(e - ESCALA_PASO).toFixed(2)))}
            title="Alejar"
          >
            <FaSearchMinus />
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => setEscala((e) => Math.min(ESCALA_MAX, +(e + ESCALA_PASO).toFixed(2)))}
            title="Acercar"
          >
            <FaSearchPlus />
          </button>
        </div>
        <div className="d-flex gap-2">
          {onFirmar && (
            <button
              type="button"
              className="btn btn-sm btn-outline-success"
              onClick={() => setMostrarFirma(true)}
              disabled={!listoParaImprimir}
            >
              <FaSignature className="me-1" /> Firmar
            </button>
          )}
          <a className="btn btn-sm btn-outline-primary" href={src} download={fileName}>
            <FaDownload className="me-1" /> Descargar
          </a>
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={imprimir}
            disabled={!listoParaImprimir}
          >
            <FaPrint className="me-1" /> Imprimir
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="pdfviewer-print-area"
        style={{
          height,
          overflow: "auto",
          border: "1px solid #dee2e6",
          borderRadius: 4,
          background: "#525659",
          padding: 8,
          // Solo pan nativo; el pellizco (zoom) lo maneja el JS de arriba —
          // si se deja "auto", el navegador haría zoom de TODA la página
          // en vez de solo el documento.
          touchAction: "pan-x pan-y",
        }}
      >
        <Document
          file={src}
          onLoadSuccess={({ numPages }) => setNumPaginas(numPages)}
          onLoadError={() => setError("No se pudo cargar el PDF.")}
          loading={<div className="text-white text-center p-4">Cargando PDF…</div>}
        >
          {Array.from({ length: numPaginas }, (_, i) => (
            <div
              key={i}
              className="mb-2 pdfviewer-page-wrap"
              // Solo tiene efecto al imprimir (PdfViewer.css la usa dentro
              // de @media print) — fija la hoja a la altura FÍSICA exacta
              // de la página en vez de confiar en que el navegador calcule
              // solo, a partir del contenido, dónde cortar cada hoja.
              // break-after:page ya evita que el corte quede mal puesto,
              // pero distintos navegadores redondean la altura del canvas
              // de forma distinta — a veces por una fracción de punto de
              // más, lo suficiente para que el navegador reserve una hoja
              // extra casi en blanco solo para ese sobrante.
              style={tamanoHoja ? { "--pdfviewer-alto-hoja": `${tamanoHoja.height}pt` } : undefined}
            >
              <Page
                pageNumber={i + 1}
                scale={escala}
                width={anchoBase || undefined}
                className="pdfviewer-page"
                renderTextLayer={false}
                renderAnnotationLayer={false}
                // react-pdf dibuja el canvas a devicePixelRatio de la
                // pantalla (1 en un monitor normal) — nítido en pantalla,
                // pero al imprimirse a tamaño completo de hoja esos mismos
                // píxeles se estiran y se ven pixelados. Se fuerza una
                // resolución más alta sin importar la pantalla real, para
                // que tanto el zoom como la impresión salgan nítidos.
                devicePixelRatio={3}
                onLoadSuccess={
                  i === 0
                    ? (pagina) => setTamanoHoja({ width: pagina.originalWidth, height: pagina.originalHeight })
                    : undefined
                }
                onRenderSuccess={() => setPaginasListas((n) => n + 1)}
              />
            </div>
          ))}
        </Document>
        {error && <div className="text-danger text-center p-4">{error}</div>}
      </div>

      {mostrarFirma && (
        <FirmaModal
          onCerrar={() => setMostrarFirma(false)}
          onGuardar={async (dataUrl) => {
            await onFirmar(dataUrl);
            setMostrarFirma(false);
          }}
        />
      )}
    </div>
  );
}
