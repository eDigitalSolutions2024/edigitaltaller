import { useEffect } from "react";

/**
 * Activa el tema Chirey (styles/lineaChirey.css) en TODA el área de contenido
 * (`.app-content`), no solo en el componente: las pantallas de orden viven
 * dentro de layouts con cabecera y tarjeta propias (p. ej. "Vehículo").
 * Se quita solo al desmontar o cuando `activo` deja de ser true.
 */
export default function useTemaChirey(activo) {
  useEffect(() => {
    if (!activo) return undefined;
    const el = document.querySelector(".app-content");
    if (!el) return undefined;
    el.classList.add("chirey-tema");
    return () => el.classList.remove("chirey-tema");
  }, [activo]);
}
