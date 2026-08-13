// src/utils/comprimirImagen.js
// Redimensiona y recomprime fotos en el navegador antes de subirlas: las
// tomadas con cámara de tablet/celular llegan en resoluciones enormes (varios
// MB) que tardan mucho en subir por el wifi del taller. Prioriza tamaño de
// archivo sobre nitidez (para esto basta con documentar el estado del
// vehículo, no se necesita alta resolución).
const MAX_DIMENSION = 1280;
const CALIDAD_JPEG = 0.6;

// Formatos que el navegador normalmente no puede decodificar via canvas
// (p. ej. HEIC de iPhone/iPad en navegadores no-Safari): se suben sin tocar.
export async function comprimirImagen(file) {
  if (!file.type || !file.type.startsWith("image/") || file.type === "image/svg+xml") {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.max(1, Math.round(bitmap.width * escala));
    const alto = Math.max(1, Math.round(bitmap.height * escala));

    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close?.();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", CALIDAD_JPEG));
    if (!blob || blob.size >= file.size) return file; // no mejoró, usa el original

    const nombre = file.name.replace(/\.\w+$/, "") + ".jpg";
    return new File([blob], nombre, { type: "image/jpeg", lastModified: Date.now() });
  } catch (err) {
    console.error("No se pudo comprimir la imagen, se sube sin cambios:", err);
    return file;
  }
}

export function comprimirImagenes(files) {
  return Promise.all(Array.from(files).map(comprimirImagen));
}
