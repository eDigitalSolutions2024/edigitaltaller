import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import PdfViewer from "../components/PdfViewer";

/**
 * Modal genérico para mostrar un PDF con PdfViewer antes de imprimirlo, en
 * vez de mandarlo directo a una pestaña nueva con window.open(): en el
 * WebView de la tablet (FreeKiosk) esa pestaña no siempre deja ver ni
 * imprimir el documento. abrirPdf(src, fileName, titulo) abre el modal;
 * basta renderizar {pdfModal} una vez en el árbol del componente.
 */
export default function usePdfModal() {
  const [pdf, setPdf] = useState(null); // { src, fileName, titulo, onCerrar, onFirmar }

  // onCerrar (opcional): para flujos que navegan a otra pantalla justo
  // después de abrir el PDF (ej. crear algo y mostrar su comprobante) — ahí
  // hay que esperar a que el usuario cierre el modal antes de navegar, o el
  // cambio de ruta lo desmontaría junto con la página.
  // onFirmar (opcional): habilita el botón "Firmar" del visor (ver
  // PdfViewer/FirmaModal) para documentos que llevan firma capturada.
  const abrirPdf = useCallback((src, fileName = "documento.pdf", titulo = "Vista previa", onCerrar, onFirmar) => {
    setPdf({ src, fileName, titulo, onCerrar, onFirmar });
  }, []);

  const cerrarPdf = useCallback(() => {
    setPdf((prev) => {
      prev?.onCerrar?.();
      return null;
    });
  }, []);

  // Portal directo a <body>: al imprimir, todo lo demás se oculta con
  // display:none (ver @media print en PdfViewer.css) — así el modal queda
  // como único contenido de la página, sin ningún ancestro con
  // overflow/alto fijo de por medio, y el contenido puede fluir en varias
  // hojas de forma normal en vez de depender de position:absolute (ese
  // truco es poco confiable con documentos de varias páginas entre
  // navegadores — en Firefox llegó a repetir la misma hoja en cada página).
  const pdfModal = pdf && createPortal(
    <div
      className="position-fixed top-0 start-0 w-100 h-100 pdfmodal-backdrop"
      style={{ background: "rgba(0,0,0,.45)", zIndex: 9999 }}
      onClick={cerrarPdf}
    >
      <div
        className="bg-white shadow pdfmodal-box"
        style={{
          width: "92%",
          height: "92%",
          margin: "2% auto",
          borderRadius: 10,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="d-flex justify-content-between align-items-center p-2 border-bottom pdfmodal-header">
          <b>{pdf.titulo}</b>
          <button className="btn btn-sm btn-outline-danger" onClick={cerrarPdf}>
            Cerrar
          </button>
        </div>
        <div className="p-2 pdfmodal-body" style={{ flex: 1, overflow: "auto" }}>
          <PdfViewer
            key={pdf.src}
            src={pdf.src}
            fileName={pdf.fileName}
            height="100%"
            onFirmar={pdf.onFirmar}
          />
        </div>
      </div>
    </div>,
    document.body
  );

  return { pdfModal, abrirPdf, cerrarPdf };
}
