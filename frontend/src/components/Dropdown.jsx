import { Children, isValidElement, useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import "../styles/Dropdown.css";

// Placeholder — nunca se renderiza directamente, Dropdown lee sus props
// (value/children/disabled/title) desde React.Children para armar la lista.
export function DropdownOption() {
  return null;
}

function extraerOpciones(children) {
  const opciones = [];
  for (const child of Array.from(children ?? [])) {
    if (!isValidElement(child)) continue;
    const { value, children: label, disabled, title } = child.props;
    // Igual que <option> nativo: sin value explícito, se usa el texto como value.
    opciones.push({
      value: value !== undefined ? value : label,
      label,
      disabled: !!disabled,
      title,
    });
  }
  return opciones;
}

export default function Dropdown({
  name,
  value,
  onChange,
  disabled,
  required,
  className = "",
  id,
  style,
  children,
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const opciones = extraerOpciones(Children.toArray(children));
  const seleccionada = opciones.find((o) => String(o.value) === String(value ?? ""));

  const calcularPosicion = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const alturaEstimadaPanel = 260;
    const espacioAbajo = window.innerHeight - rect.bottom;
    const espacioArriba = rect.top;
    const abrirArriba = espacioAbajo < alturaEstimadaPanel && espacioArriba > espacioAbajo;

    setCoords({
      left: rect.left,
      width: rect.width,
      top: abrirArriba ? undefined : rect.bottom + 4,
      bottom: abrirArriba ? window.innerHeight - rect.top + 4 : undefined,
      maxHeight: Math.max(120, (abrirArriba ? espacioArriba : espacioAbajo) - 12),
    });
  }, []);

  const cerrar = useCallback(() => setOpen(false), []);

  const abrir = () => {
    if (disabled) return;
    calcularPosicion();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    calcularPosicion();

    const handlePointerDown = (e) => {
      if (wrapRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      cerrar();
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") cerrar();
    };
    const handleReposicionar = () => calcularPosicion();

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleReposicionar, true);
    window.addEventListener("resize", handleReposicionar);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleReposicionar, true);
      window.removeEventListener("resize", handleReposicionar);
    };
  }, [open, calcularPosicion, cerrar]);

  const elegir = (opcion) => {
    if (opcion.disabled) return;
    cerrar();
    triggerRef.current?.focus();
    onChange?.({
      target: { name, value: opcion.value, type: "select-one" },
    });
  };

  // Enter no abre el panel (igual que un <select> nativo) — varias pantallas
  // de la app interceptan Enter a nivel <form> para avanzar al siguiente
  // campo, y ambos comportamientos chocarían si Enter también abriera esto.
  const handleTriggerKeyDown = (e) => {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === " ") {
      e.preventDefault();
      abrir();
      return;
    }
    // Un <button> nativo se "clickea" solo al presionar Enter; hay que
    // bloquear ese default para que Enter no abra el panel.
    if (e.key === "Enter") {
      e.preventDefault();
    }
  };

  // Si el foco sale del trigger y del panel (ej. Tab, o un handler externo
  // que mueve el foco a otro campo) cerramos para no dejar el panel abierto
  // apuntando a un campo que ya no tiene el foco.
  const handleBlur = () => {
    requestAnimationFrame(() => {
      const activo = document.activeElement;
      if (wrapRef.current?.contains(activo)) return;
      if (panelRef.current?.contains(activo)) return;
      cerrar();
    });
  };

  return (
    <div className="dd-wrap" style={style} ref={wrapRef} onBlur={handleBlur}>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className={`dd-trigger ${className}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-required={required || undefined}
        onClick={() => (open ? cerrar() : abrir())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="dd-trigger-label">{seleccionada?.label ?? ""}</span>
        <span className="dd-caret" aria-hidden="true" />
      </button>

      {open &&
        coords &&
        createPortal(
          <ul
            className="dd-panel"
            role="listbox"
            ref={panelRef}
            style={{
              left: coords.left,
              width: coords.width,
              top: coords.top,
              bottom: coords.bottom,
              maxHeight: coords.maxHeight,
            }}
          >
            {opciones.map((opt, i) => (
              <li
                key={`${opt.value}-${i}`}
                role="option"
                title={opt.title}
                aria-selected={String(opt.value) === String(value ?? "")}
                aria-disabled={opt.disabled || undefined}
                className={
                  "dd-option" +
                  (String(opt.value) === String(value ?? "") ? " active" : "") +
                  (opt.disabled ? " disabled" : "")
                }
                onMouseDown={(e) => {
                  e.preventDefault();
                  elegir(opt);
                }}
              >
                {opt.label}
              </li>
            ))}
          </ul>,
          document.body
        )}
    </div>
  );
}

Dropdown.Option = DropdownOption;
