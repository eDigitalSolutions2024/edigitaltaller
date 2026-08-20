import { useEffect, useRef, useState } from "react";

// Resolución interna del canvas más alta que su tamaño en pantalla (CSS
// width:100%), para que la firma no se vea pixeleada en el PDF impreso.
const ANCHO_CANVAS = 800;
const ALTO_CANVAS = 260;

export default function FirmaModal({ titulo = "Firma de autorización", onGuardar, onCerrar }) {
  const canvasRef = useRef(null);
  const dibujandoRef = useRef(false);
  const [vacio, setVacio] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  function coords(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function onPointerDown(e) {
    e.preventDefault();
    dibujandoRef.current = true;
    const { x, y } = coords(e);
    canvasRef.current.getContext("2d").beginPath();
    canvasRef.current.getContext("2d").moveTo(x, y);
  }

  function onPointerMove(e) {
    if (!dibujandoRef.current) return;
    e.preventDefault();
    const { x, y } = coords(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineTo(x, y);
    ctx.stroke();
    setVacio(false);
  }

  function onPointerUp() {
    dibujandoRef.current = false;
  }

  function limpiar() {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setVacio(true);
  }

  async function guardar() {
    setGuardando(true);
    try {
      await onGuardar(canvasRef.current.toDataURL("image/png"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100"
      style={{ background: "rgba(0,0,0,.55)", zIndex: 10050 }}
      onClick={onCerrar}
    >
      <div
        className="bg-white shadow"
        style={{ width: "min(560px, 92%)", margin: "8% auto", borderRadius: 10, overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="d-flex justify-content-between align-items-center p-2 border-bottom">
          <b>{titulo}</b>
          <button className="btn btn-sm btn-outline-secondary" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
        </div>
        <div className="p-3">
          <canvas
            ref={canvasRef}
            width={ANCHO_CANVAS}
            height={ALTO_CANVAS}
            style={{
              width: "100%",
              height: 220,
              border: "1px solid #ccc",
              borderRadius: 4,
              touchAction: "none",
              background: "#fff",
              cursor: "crosshair",
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          />
          <div className="text-muted small mt-2">Firma con el mouse o el dedo dentro del recuadro.</div>
        </div>
        <div className="d-flex justify-content-between p-2 border-top">
          <button className="btn btn-sm btn-outline-danger" onClick={limpiar} disabled={vacio || guardando}>
            Borrar
          </button>
          <button className="btn btn-sm btn-primary" onClick={guardar} disabled={vacio || guardando}>
            {guardando ? "Guardando…" : "Guardar firma"}
          </button>
        </div>
      </div>
    </div>
  );
}
