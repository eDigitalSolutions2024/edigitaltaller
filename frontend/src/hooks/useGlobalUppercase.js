import { useEffect } from "react";

// Tipos de <input> que no deben forzarse a mayúsculas (no son texto libre
// o su valor es sensible a mayúsculas/minúsculas: contraseñas, emails, números, fechas...)
const EXCLUDED_INPUT_TYPES = new Set([
  "password",
  "email",
  "number",
  "url",
  "date",
  "time",
  "datetime-local",
  "month",
  "week",
  "color",
  "file",
  "checkbox",
  "radio",
  "range",
  "hidden",
  "search",
]);

/**
 * Fuerza a mayúsculas, en toda la app, el valor de cualquier <input>/<textarea>
 * de texto libre mientras el usuario escribe. Un elemento puede optar por no
 * transformarse agregando el atributo `data-no-uppercase`.
 *
 * Se instala una sola vez en la raíz (App.js) mediante un listener nativo en
 * fase de captura, así que no hace falta tocar el onChange de cada input.
 */
export default function useGlobalUppercase() {
  useEffect(() => {
    const inputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    ).set;
    const textareaValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    ).set;

    const handleInput = (e) => {
      const el = e.target;
      if (!el) return;

      const tag = el.tagName;
      if (tag !== "INPUT" && tag !== "TEXTAREA") return;
      if (tag === "INPUT" && EXCLUDED_INPUT_TYPES.has(el.type)) return;
      if (el.dataset && "noUppercase" in el.dataset) return;
      if (typeof el.value !== "string") return;

      const upper = el.value.toUpperCase();
      if (upper === el.value) return;

      const start = el.selectionStart;
      const end = el.selectionEnd;
      const setter = tag === "INPUT" ? inputValueSetter : textareaValueSetter;
      setter.call(el, upper);
      try {
        el.setSelectionRange(start, end);
      } catch (_) {
        // Algunos tipos de input no soportan selectionRange; se ignora.
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };

    // "input" cubre la escritura normal; "change" cubre casos como el
    // autocompletado del navegador, que a veces solo dispara ese evento.
    document.addEventListener("input", handleInput, true);
    document.addEventListener("change", handleInput, true);
    return () => {
      document.removeEventListener("input", handleInput, true);
      document.removeEventListener("change", handleInput, true);
    };
  }, []);
}
