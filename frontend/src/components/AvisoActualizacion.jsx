import React, { useState } from "react";
import "../styles/alertModal.css";

// Aviso de nueva versión (ver useAutoReloadOnDeploy). Primero sale como modal;
// "Más tarde" lo reduce a una notificación fija en la esquina que se queda
// hasta que se actualice. Al recargar con la versión nueva ya no se dispara.
export default function AvisoActualizacion({ visible }) {
  const [minimizado, setMinimizado] = useState(false);

  if (!visible) return null;

  const actualizar = () => window.location.reload();

  if (minimizado) {
    return (
      <div className="av-toast" role="status">
        <span className="am-icono">↻</span>
        <div className="av-toast-texto">
          <strong>Nueva versión disponible</strong>
          <span>Guarda tu trabajo y actualiza.</span>
        </div>
        <button type="button" className="am-btn" onClick={actualizar}>
          Actualizar
        </button>
      </div>
    );
  }

  return (
    <div className="am-overlay">
      <div className="am-card am-aviso" role="alertdialog" aria-modal="true" aria-labelledby="av-titulo">
        <div className="am-head">
          <span className="am-icono">↻</span>
          <h3 id="av-titulo">Nueva versión disponible</h3>
        </div>
        <div className="am-body">
          Se actualizó el sistema. Guarda lo que estés capturando y presiona
          «Actualizar ahora» para cargar los cambios.
        </div>
        <div className="am-foot">
          <button
            type="button"
            className="am-btn"
            style={{ background: "#6b6b85" }}
            onClick={() => setMinimizado(true)}
          >
            Más tarde
          </button>
          <button type="button" className="am-btn" autoFocus onClick={actualizar}>
            Actualizar ahora
          </button>
        </div>
      </div>
    </div>
  );
}
