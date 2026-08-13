// src/components/ImagenesOrden.jsx
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  subirImagenesOrden,
  eliminarImagenOrden,
  subirImagenesTemp,
  eliminarImagenTemp,
} from "../api/vehiculos";
import { getUser } from "../auth";
import { comprimirImagenes } from "../utils/comprimirImagen";

const API = process.env.REACT_APP_API_URL || "http://localhost:4000/api";
const SERVER = API.replace(/\/api$/, "");

// Antes de que la orden exista (modo creación) las imágenes se suben a una
// carpeta temporal identificada por `tempId`; al guardar la orden se migran
// al folio real (ver handleSubmit en VehiculoNuevoForm). Por eso este
// componente acepta `ordenId` XOR `tempId`: si ya hay orden, sube/borra ahí;
// si no, opera contra el endpoint temporal con el mismo shape de respuesta.
const ImagenesOrden = forwardRef(function ImagenesOrden(
  { ordenId, tempId, imagenes = [], onChange, readOnly = false },
  ref
) {
  const inputGaleriaRef = useRef(null);
  const inputCamaraRef = useRef(null);
  const [subiendo, setSubiendo] = useState(false);
  // Promesa de la subida en curso (si hay una): permite que el formulario
  // padre, al desmontarse antes de que termine, espere a que la subida se
  // resuelva antes de borrar la carpeta temporal (si se borra primero, la
  // subida en curso la recrea después y esa imagen queda huérfana en disco).
  const subidaEnCursoRef = useRef(Promise.resolve());
  useImperativeHandle(ref, () => ({
    esperarSubidasPendientes: () => subidaEnCursoRef.current,
  }));
  const [zoomIndex, setZoomIndex] = useState(null);
  // Formatos que el navegador no puede previsualizar inline (p. ej. HEIC de
  // iPhone/iPad) disparan onError en <img>; se listan aquí para mostrar un
  // ícono + nombre de archivo en vez de dejar que el navegador rendericé el
  // texto alternativo suelto encima del recuadro.
  const [erroresCarga, setErroresCarga] = useState(() => new Set());
  // Evita relanzar la verificación/alert varias veces para la misma imagen
  // (onError puede disparar más de una vez, o desde el thumbnail y el zoom).
  const imagenesVerificadasRef = useRef(new Set());

  const modoTemporal = !ordenId;
  const puedeSubir = ordenId || tempId;

  useEffect(() => {
    if (zoomIndex === null) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") setZoomIndex(null);
      if (e.key === "ArrowRight") setZoomIndex((i) => (i + 1) % imagenes.length);
      if (e.key === "ArrowLeft") setZoomIndex((i) => (i - 1 + imagenes.length) % imagenes.length);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [zoomIndex, imagenes.length]);

  const marcarErrorCarga = (filename) => {
    setErroresCarga((prev) => {
      const next = new Set(prev);
      next.add(filename);
      return next;
    });
  };

  const handleSeleccion = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const usuario = getUser();
    const promesa = (async () => {
      try {
        setSubiendo(true);
        const archivos = await comprimirImagenes(files);
        const res = modoTemporal
          ? await subirImagenesTemp(tempId, archivos)
          : await subirImagenesOrden(ordenId, archivos, usuario?.name || usuario?.username || "");
        const nuevasImagenes = res.data?.imagenes || [];
        if (onChange) onChange(nuevasImagenes);
      } catch (err) {
        console.error("Error subiendo imágenes:", err);
        const msg = err?.response?.data?.msg || "Error al subir las imágenes.";
        alert(msg);
      } finally {
        setSubiendo(false);
        if (inputGaleriaRef.current) inputGaleriaRef.current.value = "";
        if (inputCamaraRef.current) inputCamaraRef.current.value = "";
      }
    })();

    subidaEnCursoRef.current = promesa;
  };

  const eliminarImagen = async (imagen) => {
    const res = modoTemporal
      ? await eliminarImagenTemp(tempId, imagen.filename)
      : await eliminarImagenOrden(ordenId, imagen._id);
    const nuevasImagenes = res.data?.imagenes || [];
    if (onChange) onChange(nuevasImagenes);
    return nuevasImagenes;
  };

  const handleEliminar = async (imagen) => {
    if (!window.confirm("¿Eliminar esta imagen?")) return;
    try {
      await eliminarImagen(imagen);
      setZoomIndex(null);
    } catch (err) {
      console.error("Error eliminando imagen:", err);
      alert("Error al eliminar la imagen.");
    }
  };

  // El navegador dispara onError tanto cuando el archivo ya no existe en el
  // servidor (borrado directo en la BD/disco) como cuando existe pero el
  // formato no se puede previsualizar inline (p. ej. HEIC). Antes ambos casos
  // se trataban igual, mostrando un link a la URL cruda: para archivos
  // borrados eso llevaba a la página de error "Cannot GET /uploads/...".
  // Aquí se verifica con un HEAD si el archivo realmente sigue existiendo
  // para diferenciar ambos casos.
  const handleErrorCarga = async (img) => {
    if (imagenesVerificadasRef.current.has(img.filename)) return;
    imagenesVerificadasRef.current.add(img.filename);

    let noExiste = false;
    try {
      const resp = await fetch(`${SERVER}${img.url}`, { method: "HEAD" });
      noExiste = resp.status === 404;
    } catch {
      // No se pudo verificar (p. ej. sin conexión); se trata como formato
      // no soportado para no borrar la referencia por error.
    }

    if (noExiste) {
      try {
        await eliminarImagen(img);
      } catch (err) {
        console.error("Error eliminando imagen inexistente:", err);
      }
      if (imagenZoom?.filename === img.filename) setZoomIndex(null);
      alert(`La imagen "${img.filename}" ya no existe en el servidor y fue eliminada del registro.`);
    } else {
      marcarErrorCarga(img.filename);
    }
  };

  const imagenZoom = zoomIndex !== null ? imagenes[zoomIndex] : null;

  return (
    <div>
      {!readOnly && (
        <>
          <div className="d-flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary flex-fill"
              style={{ minWidth: 150, padding: "10px 16px", fontSize: 15, fontWeight: 500 }}
              disabled={subiendo || !puedeSubir}
              onClick={() => inputGaleriaRef.current?.click()}
            >
              {subiendo ? "Subiendo..." : "📁 Subir imágenes"}
            </button>
            <button
              type="button"
              className="btn btn-outline-primary flex-fill"
              style={{ minWidth: 150, padding: "10px 16px", fontSize: 15, fontWeight: 500 }}
              disabled={subiendo || !puedeSubir}
              onClick={() => inputCamaraRef.current?.click()}
            >
              📸 Capturar foto
            </button>
          </div>

          {/* Selección desde archivos/galería, varias a la vez */}
          <input
            ref={inputGaleriaRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={handleSeleccion}
          />
          {/* capture="environment" abre la cámara trasera directo en
              celulares/tablets en vez del selector de archivos */}
          <input
            ref={inputCamaraRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={handleSeleccion}
          />

          {modoTemporal && (
            <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>
              Se guardan al confirmar la orden; si no la guardas, se eliminan automáticamente.
            </p>
          )}
        </>
      )}

      {imagenes.length > 0 && (
        <div className="d-flex flex-wrap gap-2 mt-2">
          {imagenes.map((img, idx) => (
            <div
              key={img._id || img.filename}
              style={{ position: "relative", width: 72, height: 72 }}
            >
              {erroresCarga.has(img.filename) ? (
                <a
                  href={`${SERVER}${img.url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`No se puede previsualizar "${img.filename}" en el navegador. Clic para abrirla.`}
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2,
                    borderRadius: 6,
                    border: "1px solid #ddd",
                    background: "#f5f5f5",
                    textDecoration: "none",
                    color: "#666",
                    overflow: "hidden",
                    padding: 4,
                  }}
                >
                  <span style={{ fontSize: 20 }}>🖼️</span>
                  <span
                    style={{
                      fontSize: 8,
                      lineHeight: 1.1,
                      textAlign: "center",
                      wordBreak: "break-all",
                      maxHeight: 20,
                      overflow: "hidden",
                    }}
                  >
                    {img.filename}
                  </span>
                </a>
              ) : (
                <img
                  src={`${SERVER}${img.url}`}
                  alt=""
                  onClick={() => setZoomIndex(idx)}
                  onError={() => handleErrorCarga(img)}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    borderRadius: 6,
                    border: "1px solid #ddd",
                    cursor: "zoom-in",
                  }}
                />
              )}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => handleEliminar(img)}
                  title="Eliminar imagen"
                  style={{
                    position: "absolute",
                    top: -6,
                    right: -6,
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    border: "none",
                    background: "#E24B4A",
                    color: "#fff",
                    fontSize: 12,
                    lineHeight: "20px",
                    padding: 0,
                    cursor: "pointer",
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {imagenZoom && (
        <div
          onClick={() => setZoomIndex(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
        >
          <button
            type="button"
            onClick={() => setZoomIndex(null)}
            style={{
              position: "absolute",
              top: 16,
              right: 24,
              background: "transparent",
              border: "none",
              color: "#fff",
              fontSize: 32,
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            ×
          </button>

          {imagenes.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setZoomIndex((i) => (i - 1 + imagenes.length) % imagenes.length);
                }}
                style={navBtnStyle("left")}
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setZoomIndex((i) => (i + 1) % imagenes.length);
                }}
                style={navBtnStyle("right")}
              >
                ›
              </button>
            </>
          )}

          {erroresCarga.has(imagenZoom.filename) ? (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "#fff",
                borderRadius: 8,
                padding: 24,
                maxWidth: "80vw",
                textAlign: "center",
              }}
            >
              <p style={{ marginBottom: 12 }}>
                Este navegador no puede previsualizar <strong>{imagenZoom.filename}</strong>.
                <br />
                (Formatos como HEIC de iPhone/iPad no se muestran inline; descarga el archivo para verlo.)
              </p>
              <a
                href={`${SERVER}${imagenZoom.url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-primary"
              >
                Abrir / descargar archivo
              </a>
            </div>
          ) : (
            <img
              src={`${SERVER}${imagenZoom.url}`}
              alt=""
              onClick={(e) => e.stopPropagation()}
              onError={() => handleErrorCarga(imagenZoom)}
              style={{
                maxWidth: "90vw",
                maxHeight: "85vh",
                objectFit: "contain",
                borderRadius: 4,
              }}
            />
          )}

          {!readOnly && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleEliminar(imagenZoom);
              }}
              className="btn btn-sm btn-danger"
              style={{ position: "absolute", bottom: 24 }}
            >
              🗑️ Eliminar imagen
            </button>
          )}
        </div>
      )}
    </div>
  );
});

export default ImagenesOrden;

function navBtnStyle(side) {
  return {
    position: "absolute",
    [side]: 16,
    top: "50%",
    transform: "translateY(-50%)",
    background: "rgba(255,255,255,0.15)",
    border: "none",
    color: "#fff",
    fontSize: 32,
    width: 44,
    height: 44,
    borderRadius: "50%",
    cursor: "pointer",
  };
}
