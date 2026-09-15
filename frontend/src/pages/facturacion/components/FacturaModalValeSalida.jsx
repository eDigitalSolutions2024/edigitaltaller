import React, { useEffect, useState } from "react";
import { getUser } from "../../../auth";
import {
  getSiguienteNumeroVale,
  getSiguienteDig,
  createVale,
  ESTATUS_VALE_OPCIONES,
} from "../../../api/vales";

function nombreClienteOrden(orden) {
  const c = orden?.cliente || {};
  return c.tipoCliente === "Particular"
    ? [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(" ")
    : c.gobierno?.nombreGobierno || c.empresa?.razonSocial || c.nombre || "";
}

const FORM_VACIO = { quienEntrega: "", observaciones: "" };

// Vale de salida generado desde Nueva Factura una vez que el XML ya se generó
// (ver botón "Generar Vale de Salida" junto a "Ver Factura"): la factura ya
// documenta el cobro, así que no pasa por Registrar Pago de Cajas — mismo
// endpoint (POST /api/vales) y mismos campos que CajaModalValeGarantia.jsx.
export default function FacturaModalValeSalida({ show, orden, onClose, onGuardado }) {
  const user = getUser();

  const [noVale, setNoVale] = useState("");
  const [dig, setDig] = useState(0);
  const [autoNumero, setAutoNumero] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [estatus, setEstatus] = useState("Contado");
  const [imprimir, setImprimir] = useState(true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!show) return;
    setForm(FORM_VACIO);
    setError("");
    setDig(0);
    setNoVale("");
    setAutoNumero(false);
    setEstatus("Contado");
    setImprimir(true);
    getSiguienteNumeroVale()
      .then((res) => {
        setNoVale(String(res.data.numero));
        setAutoNumero(true);
      })
      .catch(() => setError("No se pudo consultar el siguiente número de vale."));
  }, [show]);

  if (!show || !orden) return null;

  const handleNoValeChange = (e) => {
    setNoVale(e.target.value.replace(/[^0-9]/g, ""));
    setAutoNumero(false);
  };

  const handleNoValeBlur = async () => {
    if (!noVale || autoNumero) return;
    try {
      const res = await getSiguienteDig(noVale);
      setDig(res.data.dig);
    } catch {
      // silencioso: el servidor recalcula el Dig correcto al guardar
    }
  };

  const handleDobleClickNoVale = async () => {
    try {
      const res = await getSiguienteNumeroVale();
      setNoVale(String(res.data.numero));
      setDig(0);
      setAutoNumero(true);
    } catch {
      setError("No se pudo consultar el siguiente número de vale.");
    }
  };

  const handleGuardar = async () => {
    if (!noVale) {
      setError("Captura o genera el número de vale.");
      return;
    }
    if (!form.quienEntrega.trim()) {
      setError("Captura quién entrega.");
      return;
    }
    try {
      setGuardando(true);
      setError("");
      const res = await createVale({
        noOrden: orden.ordenServicio,
        vehiculo: orden._id,
        noVale: Number(noVale),
        autoNumero,
        quienEntrega: form.quienEntrega.trim(),
        cajero: user?.name || user?.username || "",
        estatus,
        observaciones: form.observaciones.trim(),
        nombreCliente: nombreClienteOrden(orden),
        asesor: orden.creadoPor || "",
        marca: orden.marca || "",
        tipo: orden.modelo || "",
        modelo: orden.anio || "",
        color: orden.color || "",
        serie: orden.serie || "",
        placas: orden.placas || "",
        kms: orden.kmsMillas || "",
      });
      onGuardado(res.data.data, imprimir);
    } catch (err) {
      setError(err.response?.data?.msg || "Error al generar el vale de salida.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      className="modal d-block"
      tabIndex="-1"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title fw-bold">
              Generar Vale de Salida — Orden {orden.ordenServicio}
            </h5>
            <button type="button" className="btn-close" onClick={onClose} disabled={guardando} />
          </div>

          <div className="modal-body">
            <div className="row g-2">
              <div className="col-md-3">
                <label className="form-label small fw-semibold">No. Vale</label>
                <input
                  type="text"
                  className="form-control"
                  value={noVale}
                  onChange={handleNoValeChange}
                  onBlur={handleNoValeBlur}
                  onDoubleClick={handleDobleClickNoVale}
                  title="Doble click para generar el siguiente número automáticamente"
                />
              </div>
              <div className="col-md-2">
                <label className="form-label small fw-semibold">Dig</label>
                <input type="text" className="form-control" value={dig} readOnly />
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-semibold">
                  Quien Entrega<span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  className="form-control"
                  autoFocus
                  value={form.quienEntrega}
                  onChange={(e) => setForm((f) => ({ ...f, quienEntrega: e.target.value }))}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label small fw-semibold">Estatus</label>
                <select
                  className="form-select"
                  value={estatus}
                  onChange={(e) => setEstatus(e.target.value)}
                >
                  {ESTATUS_VALE_OPCIONES.map((op) => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </select>
              </div>
              <div className="col-12">
                <label className="form-label small fw-semibold">Observaciones del Vale</label>
                <textarea
                  className="form-control"
                  rows={2}
                  value={form.observaciones}
                  onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))}
                />
              </div>
            </div>

            <div className="form-check mt-2">
              <input
                className="form-check-input"
                type="checkbox"
                id="checkImprimirValeFactura"
                checked={imprimir}
                onChange={(e) => setImprimir(e.target.checked)}
              />
              <label className="form-check-label" htmlFor="checkImprimirValeFactura">
                Imprimir vale al generar
              </label>
            </div>

            {error && <p className="text-danger mt-2 mb-0">{error}</p>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={guardando}>
              Cancelar
            </button>
            <button type="button" className="btn btn-success fw-semibold" onClick={handleGuardar} disabled={guardando}>
              {guardando ? "Guardando..." : "Generar Vale"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
