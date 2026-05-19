// src/components/VehicleDamageCanvas.jsx
import React, { useEffect, useRef, useState } from "react";

const TOOLS = [
  { id: "libre", label: "✏️ Trazo libre" },
  { id: "circulo", label: "⭕ Círculo" },
  { id: "x", label: "✕ Marcar" },
];

const COLORS = ["#E24B4A", "#1D9E75", "#378ADD", "#BA7517"];

export default function VehicleDamageCanvas({ value, onChange, readOnly = false }) {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const imgRef = useRef(null);
  const isDrawing = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const snapshot = useRef(null);

  const [tool, setTool] = useState("libre");
  const [color, setColor] = useState("#E24B4A");
  const [grosor, setGrosor] = useState(3);
  const [imgLoaded, setImgLoaded] = useState(false);

  // Cargar imagen base
  useEffect(() => {
    const img = new Image();
    img.src = "/images/vehicle_damage_selector.jpg";
    img.onload = () => {
      imgRef.current = img;
      setImgLoaded(true);
    };
  }, []);

  // Dibujar imagen base + anotaciones guardadas
  useEffect(() => {
    if (!imgLoaded) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgRef.current, 0, 0, canvas.width, canvas.height);

    // Si hay anotaciones guardadas, las restauramos
    if (value) {
      const saved = new Image();
      saved.onload = () => ctx.drawImage(saved, 0, 0);
      saved.src = value;
    }
  }, [imgLoaded, value]);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e) => {
    if (readOnly) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);

    isDrawing.current = true;
    startPos.current = pos;

    // Guardamos snapshot antes de dibujar (para círculo y X)
    snapshot.current = ctx.getImageData(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = color;
    ctx.lineWidth = grosor;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (tool === "libre") {
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    }
  };

  const draw = (e) => {
    if (!isDrawing.current || readOnly) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);

    ctx.strokeStyle = color;
    ctx.lineWidth = grosor;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (tool === "libre") {
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    } else {
      // Para círculo y X restauramos el snapshot en cada movimiento
      ctx.putImageData(snapshot.current, 0, 0);

      if (tool === "circulo") {
        const dx = pos.x - startPos.current.x;
        const dy = pos.y - startPos.current.y;
        const r = Math.sqrt(dx * dx + dy * dy);
        ctx.beginPath();
        ctx.arc(startPos.current.x, startPos.current.y, r, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (tool === "x") {
        const size = Math.max(
          Math.abs(pos.x - startPos.current.x),
          Math.abs(pos.y - startPos.current.y)
        );
        const cx = startPos.current.x;
        const cy = startPos.current.y;
        ctx.beginPath();
        ctx.moveTo(cx - size, cy - size);
        ctx.lineTo(cx + size, cy + size);
        ctx.moveTo(cx + size, cy - size);
        ctx.lineTo(cx - size, cy + size);
        ctx.stroke();
      }
    }
  };

  const endDraw = (e) => {
    if (!isDrawing.current || readOnly) return;
    e.preventDefault();
    isDrawing.current = false;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.closePath();

    // Guardar como base64 y notificar al padre
    if (onChange) {
      onChange(canvas.toDataURL("image/png"));
    }
  };

  const handleClear = () => {
    if (readOnly) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (imgRef.current) {
      ctx.drawImage(imgRef.current, 0, 0, canvas.width, canvas.height);
    }
    if (onChange) onChange(null);
  };

  return (
    <div>
      {/* Barra de herramientas */}
      {!readOnly && (
        <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
          {/* Herramientas */}
          <div className="btn-group btn-group-sm">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`btn ${tool === t.id ? "btn-dark" : "btn-outline-secondary"}`}
                onClick={() => setTool(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Colores */}
          <div className="d-flex gap-1">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: c,
                  border: color === c ? "3px solid #333" : "2px solid #ccc",
                  cursor: "pointer",
                  padding: 0,
                }}
              />
            ))}
          </div>

          {/* Grosor */}
          <div className="d-flex align-items-center gap-1">
            <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Grosor</span>
            <input
              type="range"
              min="1"
              max="10"
              value={grosor}
              onChange={(e) => setGrosor(Number(e.target.value))}
              style={{ width: 70 }}
            />
            <span style={{ fontSize: 11, color: "var(--color-text-secondary)", minWidth: 16 }}>{grosor}</span>
          </div>

          {/* Limpiar */}
          <button
            type="button"
            className="btn btn-sm btn-outline-danger ms-auto"
            onClick={handleClear}
          >
            🗑️ Limpiar
          </button>
        </div>
      )}

      {/* Canvas */}
      <div style={{ position: "relative", width: "100%", border: "1px solid #ddd", borderRadius: 6, overflow: "hidden", cursor: readOnly ? "default" : tool === "libre" ? "crosshair" : "cell" }}>
        {!imgLoaded && (
          <div className="text-center py-4 text-muted" style={{ fontSize: 13 }}>
            Cargando imagen...
          </div>
        )}
        <canvas
          ref={canvasRef}
          width={800}
          height={800}
          style={{ width: "100%", display: imgLoaded ? "block" : "none", touchAction: "none" }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </div>

      {!readOnly && (
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>
          {tool === "libre" && "Arrastra para dibujar trazos libres sobre el vehículo."}
          {tool === "circulo" && "Haz clic y arrastra para dibujar un círculo sobre la zona dañada."}
          {tool === "x" && "Haz clic y arrastra para marcar con X la zona dañada."}
        </p>
      )}
    </div>
  );
}