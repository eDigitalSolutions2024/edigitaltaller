import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../styles/DateInput.css";

// Selector de fecha propio — reemplaza <input type="date">.
// En tablet el picker nativo se abre pegado arriba de la pantalla; este
// calendario se ancla al campo (mismo patrón que Dropdown). El valor es
// "YYYY-MM-DD" (igual que el input nativo); onChange recibe { target: { name, value } }.

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS = ["L", "M", "M", "J", "V", "S", "D"];

const pad = (n) => String(n).padStart(2, "0");
const aISO = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

function parsear(valor) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor || "");
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
}

export default function DateInput({ name, value, onChange, disabled, className = "", placeholder = "dd/mm/aaaa", id }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const [vista, setVista] = useState(() => {
    const p = parsear(value);
    const hoy = new Date();
    return { y: p?.y ?? hoy.getFullYear(), m: p?.m ?? hoy.getMonth() };
  });
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const actual = parsear(value);
  const hoy = new Date();
  const hoyISO = aISO(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  const calcularPosicion = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const alturaPanel = 400;
    const ancho = Math.min(Math.max(rect.width, 300), window.innerWidth - 16);
    const abrirArriba = window.innerHeight - rect.bottom < alturaPanel && rect.top > window.innerHeight - rect.bottom;
    setCoords({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - ancho - 8)),
      width: ancho,
      top: abrirArriba ? undefined : rect.bottom + 4,
      bottom: abrirArriba ? window.innerHeight - rect.top + 4 : undefined,
    });
  }, []);

  const cerrar = useCallback(() => setOpen(false), []);

  const abrir = () => {
    if (disabled) return;
    const p = parsear(value);
    if (p) setVista({ y: p.y, m: p.m });
    calcularPosicion();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const down = (e) => {
      if (wrapRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      cerrar();
    };
    const key = (e) => { if (e.key === "Escape") cerrar(); };
    const repos = () => calcularPosicion();
    document.addEventListener("mousedown", down);
    document.addEventListener("touchstart", down);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", repos, true);
    window.addEventListener("resize", repos);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("touchstart", down);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", repos, true);
      window.removeEventListener("resize", repos);
    };
  }, [open, calcularPosicion, cerrar]);

  const emitir = (v) => onChange?.({ target: { name, value: v, type: "date" } });

  const elegir = (d) => {
    emitir(aISO(vista.y, vista.m, d));
    cerrar();
    triggerRef.current?.focus();
  };

  const mover = (delta) =>
    setVista((v) => {
      const total = v.y * 12 + v.m + delta;
      return { y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 };
    });

  // Celdas del mes (semana inicia en lunes)
  const primerDia = (new Date(vista.y, vista.m, 1).getDay() + 6) % 7;
  const diasMes = new Date(vista.y, vista.m + 1, 0).getDate();
  const celdas = [...Array(primerDia).fill(null), ...Array.from({ length: diasMes }, (_, i) => i + 1)];

  const texto = actual ? `${pad(actual.d)}/${pad(actual.m + 1)}/${actual.y}` : "";

  return (
    <div className="di-wrap" ref={wrapRef}>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className={`di-trigger ${className}`}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? cerrar() : abrir())}
      >
        <span className={texto ? "" : "di-placeholder"}>{texto || placeholder}</span>
        <svg className="di-icono" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path fill="currentColor" d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5M1 4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4z" />
        </svg>
      </button>

      {open && coords &&
        createPortal(
          <div
            className="di-panel"
            role="dialog"
            ref={panelRef}
            style={{ left: coords.left, width: coords.width, top: coords.top, bottom: coords.bottom }}
          >
            <div className="di-cabecera">
              <button type="button" className="di-nav" onClick={() => mover(-1)} aria-label="Mes anterior">‹</button>
              <strong>{MESES[vista.m]} {vista.y}</strong>
              <button type="button" className="di-nav" onClick={() => mover(1)} aria-label="Mes siguiente">›</button>
            </div>
            <div className="di-grid di-dias">
              {DIAS.map((d, i) => <span key={i}>{d}</span>)}
            </div>
            <div className="di-grid">
              {celdas.map((d, i) => {
                if (d === null) return <span key={i} />;
                const iso = aISO(vista.y, vista.m, d);
                return (
                  <button
                    key={i}
                    type="button"
                    className={`di-dia${iso === value ? " activo" : ""}${iso === hoyISO ? " hoy" : ""}`}
                    onClick={() => elegir(d)}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
            <div className="di-pie">
              <button type="button" className="di-link" onClick={() => { emitir(""); cerrar(); }}>Borrar</button>
              <button type="button" className="di-link" onClick={() => { emitir(hoyISO); cerrar(); }}>Hoy</button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
