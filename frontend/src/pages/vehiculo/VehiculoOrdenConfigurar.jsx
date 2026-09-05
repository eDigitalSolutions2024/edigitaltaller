// src/pages/vehiculo/VehiculoOrdenConfigurar.jsx
import React, { useState } from "react";
import { restoreOrden, cambiarAsesorOrden, cambiarClienteOrden } from "../../api/vehiculos";
import ModalCambiarAsesor from "./ModalCambiarAsesor";
import ModalCambiarCliente from "./ModalCambiarCliente";

export default function VehiculoOrdenConfigurar({ orden, onRestored, onAsesorCambiado, onClienteCambiado }) {
  const [restableciendo, setRestableciendo] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [guardandoAsesor, setGuardandoAsesor] = useState(false);
  const [modalClienteAbierto, setModalClienteAbierto] = useState(false);
  const [guardandoCliente, setGuardandoCliente] = useState(false);

  if (!orden) return null;

  const yaCerrada = orden.estadoOrden === "CERRADA";
  const yaCancelada = orden.estadoOrden === "CANCELADA";
  const puedeRestablecer = yaCerrada || yaCancelada;

  // El asesor de la orden (creadoPor) tiene prioridad sobre el asesor por
  // defecto del cliente — igual que en VehiculoOrdenGeneral.
  const asesorActual = orden.creadoPor || orden.cliente?.asesorResponsable || "";

  const handleRestablecerOrden = async () => {
    if (!puedeRestablecer) return;

    const ok = window.confirm(
      `¿Restablecer esta orden ${yaCerrada ? "cerrada" : "cancelada"}? Regresará al estado en el que se encontraba anteriormente.`
    );
    if (!ok) return;

    try {
      setRestableciendo(true);
      const res = await restoreOrden(orden._id);
      if (onRestored) onRestored(res.data.vehiculo);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.msg || "Error al restablecer la orden.");
    } finally {
      setRestableciendo(false);
    }
  };

  const handleConfirmarCambioAsesor = async (asesorId) => {
    try {
      setGuardandoAsesor(true);
      const res = await cambiarAsesorOrden(orden._id, asesorId);
      if (onAsesorCambiado) onAsesorCambiado(res.data.vehiculo);
      setModalAbierto(false);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.msg || "Error al cambiar el asesor de la orden.");
    } finally {
      setGuardandoAsesor(false);
    }
  };

  const handleConfirmarCambioCliente = async (clienteId, motivo) => {
    try {
      setGuardandoCliente(true);
      const res = await cambiarClienteOrden(orden._id, clienteId, motivo);
      if (onClienteCambiado) onClienteCambiado(res.data.vehiculo);
      setModalClienteAbierto(false);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.msg || "Error al cambiar el cliente de la orden.");
    } finally {
      setGuardandoCliente(false);
    }
  };

  return (
    <div className="card card-body mb-4">
      <h4 className="mb-3">CONFIGURACIÓN DE LA ORDEN</h4>

      <div className="d-flex flex-column gap-3" style={{ maxWidth: 460 }}>
        <div className="border rounded p-3">
          <div className="fw-semibold mb-1">Restablecer orden</div>
          <p className="text-muted small mb-2">
            Regresa una orden cerrada o cancelada al estado en el que se encontraba anteriormente.
          </p>
          <button
            type="button"
            className={`btn btn-sm ${puedeRestablecer ? "btn-primary" : "btn-secondary"}`}
            onClick={handleRestablecerOrden}
            disabled={!puedeRestablecer || restableciendo}
            title={!puedeRestablecer ? "Solo se puede restablecer una orden cerrada o cancelada" : undefined}
          >
            {restableciendo ? "Restableciendo..." : "Restablecer orden"}
          </button>
        </div>

        <div className="border rounded p-3">
          <div className="fw-semibold mb-1">Cambiar asesor</div>
          <p className="text-muted small mb-2">
            Reasigna esta orden a otro asesor de servicio.
          </p>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setModalAbierto(true)}>
            Cambiar asesor
          </button>
        </div>

        <div className="border rounded p-3">
          <div className="fw-semibold mb-1">Cambiar cliente</div>
          <p className="text-muted small mb-2">
            Corrige el cliente cuando la orden se abrió por error con el cliente
            equivocado. No disponible si la orden ya tiene pagos, factura o
            anticipo aplicado.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setModalClienteAbierto(true)}
          >
            Cambiar cliente
          </button>
        </div>
      </div>

      {modalAbierto && (
        <ModalCambiarAsesor
          asesorActual={asesorActual}
          guardando={guardandoAsesor}
          onClose={() => !guardandoAsesor && setModalAbierto(false)}
          onConfirm={handleConfirmarCambioAsesor}
        />
      )}

      {modalClienteAbierto && (
        <ModalCambiarCliente
          clienteActual={orden.cliente}
          guardando={guardandoCliente}
          onClose={() => !guardandoCliente && setModalClienteAbierto(false)}
          onConfirm={handleConfirmarCambioCliente}
        />
      )}
    </div>
  );
}
