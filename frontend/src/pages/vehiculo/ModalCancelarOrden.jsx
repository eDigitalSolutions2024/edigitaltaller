// src/pages/vehiculo/ModalCancelarOrden.jsx
import React, { useEffect, useState } from "react";

const MOTIVO_NO_APLICA_GARANTIA = "No aplica garantía";

// Modal para cancelar una orden desde Presupuesto y Venta al Cliente: pide
// el motivo de la cancelación. Cuando la orden es una solicitud de garantía
// (orden.garantia), además ofrece el motivo rápido "No aplica garantía" y un
// botón para notificar al administrador en vez de cancelar directamente: solo
// un admin puede resolver si la garantía aplica o no (ver Solicitudes de
// Garantía / ModalCancelarGarantia).
export default function ModalCancelarOrden({ show, orden, procesando, notificando, puedeCancelarDirecto = true, onClose, onCancelar, onNotificarAdmin }) {
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (show) setMotivo("");
  }, [show]);

  if (!show) return null;

  const esGarantia = !!orden?.garantia;
  const ocupado = !!procesando || !!notificando;
  const motivoListo = motivo.trim().length > 0;
  const soloNotificar = esGarantia && !puedeCancelarDirecto;

  return (
    <div
      className="modal d-block"
      tabIndex="-1"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget && !ocupado) onClose(); }}
    >
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title fw-bold">Cancelar orden {orden?.ordenServicio}</h5>
            <button type="button" className="btn-close" onClick={onClose} disabled={ocupado} />
          </div>

          <div className="modal-body">
            {esGarantia && (
              <div className="alert alert-warning py-2">
                Esta orden es una solicitud de garantía
                {orden.garantia?.ordenAnteriorFolio ? ` sobre la orden ${orden.garantia.ordenAnteriorFolio}` : ""}.
                {soloNotificar ? (
                  <>
                    {" "}Solo un administrador puede cancelarla. <strong>Notifica al administrador</strong>{" "}
                    para que la revise y decida si aplica o no; mientras la resuelve, la orden quedará bloqueada.
                  </>
                ) : (
                  <>
                    {" "}Si la garantía no aplica, es mejor <strong>notificar al administrador</strong>{" "}
                    para que la revise y decida si cancela la orden, en vez de cancelarla tú directamente.
                  </>
                )}
              </div>
            )}

            <label className="form-label fw-semibold">Motivo de la cancelación</label>
            <textarea
              className="form-control"
              rows={3}
              placeholder="Describe el motivo de la cancelación..."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              disabled={ocupado}
            />

            {esGarantia && (
              <button
                type="button"
                className="btn btn-link btn-sm px-0 mt-1"
                onClick={() => setMotivo(MOTIVO_NO_APLICA_GARANTIA)}
                disabled={ocupado}
              >
                Usar motivo: "{MOTIVO_NO_APLICA_GARANTIA}"
              </button>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={ocupado}>
              Cerrar
            </button>
            {esGarantia && (
              <button
                type="button"
                className="btn btn-warning fw-semibold"
                disabled={!motivoListo || ocupado}
                onClick={() => onNotificarAdmin(motivo.trim())}
              >
                {notificando ? "Notificando..." : "Notificar administrador"}
              </button>
            )}
            {!soloNotificar && (
              <button
                type="button"
                className="btn btn-danger fw-semibold"
                disabled={!motivoListo || ocupado}
                onClick={() => onCancelar(motivo.trim())}
              >
                {procesando ? "Cancelando..." : "Cancelar orden"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
