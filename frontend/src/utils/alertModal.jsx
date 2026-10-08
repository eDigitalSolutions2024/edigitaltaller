import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import "../styles/alertModal.css";

// Sustituye window.alert() por un modal con el estilo de la app. Se instala una
// sola vez desde index.js, así los ~200 alert() existentes se ven como modal sin
// tocar cada archivo. A diferencia del alert nativo NO bloquea la ejecución; si
// llegan varios mensajes seguidos se muestran en cola, uno por uno.

let empujar = null; // setter del componente, disponible cuando ya montó
const pendientes = [];

// El tipo se infiere del texto (los mensajes ya existentes no lo indican).
function inferirTipo(texto) {
  const t = texto.toLowerCase();
  const empiezaOk = /^\s*(✅|✔)/.test(texto);
  const dicePositivo = /(correctamente|con éxito|con exito|exitosamente|guardad[oa]|actualizad[oa]|creada?|eliminad[oa]|cancelad[oa]|generad[oa]|timbrad[oa])\b/.test(t);
  const diceNegativo = /no se pudo|error|fall/.test(t);
  if (empiezaOk || (dicePositivo && !diceNegativo)) {
    return "exito";
  }
  if (/error|no se pudo|no se pudieron|fall[óo]|inválid|invalid|no existe|no tiene permiso|sin permiso|no autorizado/.test(t)) {
    return "error";
  }
  return "aviso";
}

const TITULOS = { exito: "Listo", error: "Ocurrió un problema", aviso: "Aviso" };
const ICONOS = { exito: "✓", error: "!", aviso: "i" };

function AlertHost() {
  const [cola, setCola] = useState([]);

  useEffect(() => {
    empujar = (msg) => setCola((c) => [...c, msg]);
    pendientes.splice(0).forEach((m) => empujar(m));
    return () => {
      empujar = null;
    };
  }, []);

  const actual = cola[0];
  const cerrar = () => setCola((c) => c.slice(1));

  useEffect(() => {
    if (!actual) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        cerrar();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [actual]);

  if (!actual) return null;

  return (
    <div className="am-overlay" onClick={cerrar}>
      <div
        className={`am-card am-${actual.tipo}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="am-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="am-head">
          <span className="am-icono">{ICONOS[actual.tipo]}</span>
          <h3 id="am-titulo">{TITULOS[actual.tipo]}</h3>
        </div>
        <div className="am-body">{actual.texto}</div>
        <div className="am-foot">
          {cola.length > 1 && <span className="am-restan">{cola.length - 1} más</span>}
          <button type="button" className="am-btn" autoFocus onClick={cerrar}>
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}

export function mostrarAlerta(mensaje) {
  const texto = mensaje === undefined || mensaje === null ? "" : String(mensaje);
  const msg = { texto, tipo: inferirTipo(texto) };
  if (empujar) empujar(msg);
  else pendientes.push(msg);
}

export function instalarAlertModal() {
  if (window.__alertModalInstalado) return;
  window.__alertModalInstalado = true;
  const contenedor = document.createElement("div");
  contenedor.id = "alert-modal-root";
  document.body.appendChild(contenedor);
  ReactDOM.createRoot(contenedor).render(<AlertHost />);
  window.alert = mostrarAlerta;
}
