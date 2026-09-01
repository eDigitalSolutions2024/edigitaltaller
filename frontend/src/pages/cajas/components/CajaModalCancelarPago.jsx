import React, { useEffect, useMemo, useRef, useState } from "react";
import PdfViewer from "../../../components/PdfViewer";
import { listFacturasCfdi } from "../../../api/facturasCfdi";
import { cancelarPagoCaja, getPreviewCancelacionUrl } from "../../../api/cajas";

function formatMoney(n) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}

function fechaCorta(v) {
  if (!v) return "";
  const d = new Date(v);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const TIPO_PAGO_LABELS = { COMPLETO: "Pago Completo", ABONO: "Abono", ANTICIPO: "Anticipo" };

function tipoPagoLabel(p) {
  if (!p) return "";
  if (p.comprobante === "REMISION" && p.remision?.tipo === "Credito") return "Crédito";
  return TIPO_PAGO_LABELS[p.tipoPago] || p.tipoPago;
}

function comprobanteLabel(p) {
  if (!p) return "";
  if (p.comprobante === "NOTA_VENTA") return `Nota Venta N°${p.notaVenta?.numero ?? "-"}`;
  if (p.comprobante === "REMISION") return `Remisión N°${p.remision?.numero ?? "-"}`;
  if (p.comprobante === "RECIBO_PROVISIONAL") return `Recibo Provisional N°${p.reciboProvisional?.numero ?? "-"}`;
  return "-";
}

// Modal compartido (Cajas y Facturar) para cancelar un anticipo / remisión /
// abono / nota. Dos modos:
//  - PASA_A_FACTURA_EXISTENTE: se liga a una factura ya generada (admin o cajas).
//    Antes de confirmar se muestra una vista previa (mini-PDF, solo para ver) de
//    cómo quedaría en el Reporte de Cajas.
//  - ERROR: corrección de captura (solo admin), pisa las notas con el motivo.
// Desde Cajas NO se puede cancelar hacia una factura que aún no existe: eso se
// hace en la pantalla de Facturar (elección por comprobante).
export default function CajaModalCancelarPago({
  show,
  pago,
  orden,
  esAdmin = false,
  modoForzado = null,
  onClose,
  onConfirmado,
}) {
  const esAnticipoORemision = useMemo(
    () =>
      !!pago &&
      ((pago.comprobante === "NOTA_VENTA" && pago.tipoPago === "ANTICIPO") ||
        pago.comprobante === "REMISION"),
    [pago]
  );

  const modosDisponibles = useMemo(() => {
    const m = [];
    if (esAnticipoORemision) m.push("PASA_A_FACTURA_EXISTENTE");
    if (esAdmin) m.push("ERROR");
    return m;
  }, [esAnticipoORemision, esAdmin]);

  const [modo, setModo] = useState(modoForzado || modosDisponibles[0] || "");
  const [motivo, setMotivo] = useState("");
  const [qFactura, setQFactura] = useState("");
  const [facturas, setFacturas] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [facturaSel, setFacturaSel] = useState(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const inputBuscarRef = useRef(null);

  useEffect(() => {
    if (!show) return;
    setModo(modoForzado || modosDisponibles[0] || "");
    setMotivo("");
    setQFactura("");
    setFacturas([]);
    setFacturaSel(null);
    setError("");
    setGuardando(false);
  }, [show, pago?._id, modoForzado, modosDisponibles]);

  // Búsqueda de factura (solo en modo EXISTENTE), con debounce.
  useEffect(() => {
    if (!show || modo !== "PASA_A_FACTURA_EXISTENTE") return;
    const term = qFactura.trim();
    if (!term) {
      setFacturas([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setBuscando(true);
        const res = await listFacturasCfdi({ q: term, tipo: "factura", estatus: "generada", limit: 8 });
        setFacturas(res.data?.docs || []);
      } catch {
        setFacturas([]);
      } finally {
        setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [qFactura, modo, show]);

  if (!show || !pago) return null;

  const previewUrl =
    modo === "PASA_A_FACTURA_EXISTENTE" && facturaSel
      ? getPreviewCancelacionUrl(orden._id, pago._id, { facturaId: facturaSel._id })
      : "";

  const puedeConfirmar =
    modo === "PASA_A_FACTURA_EXISTENTE"
      ? !!facturaSel
      : modo === "ERROR"
      ? !!motivo.trim()
      : false;

  const handleConfirmar = async () => {
    if (!puedeConfirmar || guardando) return;
    try {
      setGuardando(true);
      setError("");
      const payload =
        modo === "ERROR"
          ? { modo: "ERROR", motivo: motivo.trim() }
          : { modo: "PASA_A_FACTURA_EXISTENTE", facturaId: facturaSel._id };
      const res = await cancelarPagoCaja(orden._id, pago._id, payload);
      onConfirmado?.(res.data.vehiculo);
    } catch (err) {
      setError(err.response?.data?.msg || "Error al cancelar el comprobante.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      className="modal d-block"
      tabIndex="-1"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget && !guardando) onClose(); }}
    >
      <div
        className={`modal-dialog modal-dialog-centered modal-dialog-scrollable ${
          previewUrl ? "modal-xl" : "modal-lg"
        }`}
        style={{
          maxWidth: previewUrl ? "min(1400px, 95vw)" : undefined,
          transition: "max-width .2s ease",
        }}
      >
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title fw-bold">Cancelar comprobante</h5>
            <button type="button" className="btn-close" onClick={onClose} disabled={guardando} />
          </div>

          <div className="modal-body">
            <div className="alert alert-warning py-2">
              Vas a cancelar <strong>{comprobanteLabel(pago)}</strong> ({tipoPagoLabel(pago)}) de la orden{" "}
              <strong>{orden?.ordenServicio}</strong> por <strong>{formatMoney(pago.monto)}</strong>. El folio se
              conserva; el comprobante deja de contar como abonado.
            </div>

            {modosDisponibles.length === 0 && (
              <p className="text-muted mb-0">
                Este comprobante solo se puede cancelar por error (corrección de captura), y eso lo hace un
                administrador. Solicita la cancelación desde el historial de pagos.
              </p>
            )}

            {!modoForzado && modosDisponibles.length > 1 && (
              <div className="mb-3">
                <label className="form-label fw-semibold">¿Qué quieres hacer?</label>
                {modosDisponibles.includes("PASA_A_FACTURA_EXISTENTE") && (
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="radio"
                      name="modoCancelar"
                      id="modoExistente"
                      checked={modo === "PASA_A_FACTURA_EXISTENTE"}
                      onChange={() => setModo("PASA_A_FACTURA_EXISTENTE")}
                    />
                    <label className="form-check-label" htmlFor="modoExistente">
                      Pasarlo a una <strong>factura ya existente</strong>
                    </label>
                  </div>
                )}
                {modosDisponibles.includes("ERROR") && (
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="radio"
                      name="modoCancelar"
                      id="modoError"
                      checked={modo === "ERROR"}
                      onChange={() => setModo("ERROR")}
                    />
                    <label className="form-check-label" htmlFor="modoError">
                      Cancelar <strong>por error</strong> (corrección de captura)
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* ---- Modo: factura existente ---- */}
            {modo === "PASA_A_FACTURA_EXISTENTE" && (
              <div className="mb-3">
                <label className="form-label mb-1">Buscar factura (folio, cliente u orden)</label>
                <input
                  ref={inputBuscarRef}
                  type="text"
                  className="form-control"
                  value={qFactura}
                  onChange={(e) => { setQFactura(e.target.value); setFacturaSel(null); }}
                  placeholder="Ej. A123, LUIS PEREZ, T-2…"
                  autoFocus
                />
                {buscando && <div className="small text-muted mt-1">Buscando…</div>}
                {!buscando && qFactura.trim() && facturas.length === 0 && (
                  <div className="small text-muted mt-1">Sin resultados.</div>
                )}
                {facturas.length > 0 && (
                  <div className="list-group mt-2" style={{ maxHeight: 180, overflow: "auto" }}>
                    {facturas.map((f) => {
                      const folio = `${f.serie || ""}${f.folio || ""}`;
                      const activo = facturaSel?._id === f._id;
                      return (
                        <button
                          type="button"
                          key={f._id}
                          className={`list-group-item list-group-item-action${activo ? " active" : ""}`}
                          onClick={() => setFacturaSel(f)}
                        >
                          <div className="d-flex justify-content-between">
                            <span className="fw-semibold">{folio || "S/folio"}</span>
                            <span>{formatMoney(f.totales?.total)}</span>
                          </div>
                          <div className={`small${activo ? "" : " text-muted"}`}>
                            {(f.cliente?.nombre || "").toUpperCase()} · {fechaCorta(f.fecha)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ---- Modo: por error ---- */}
            {modo === "ERROR" && (
              <div className="mb-3">
                <label className="form-label mb-0 fw-semibold">Motivo de la cancelación</label>
                <textarea
                  className="form-control"
                  rows={3}
                  autoFocus
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </div>
            )}

            {/* ---- Vista previa (mini-PDF, solo para ver) ---- */}
            {previewUrl && (
              <div className="mb-2">
                <label className="form-label mb-1 fw-semibold">
                  Vista previa en el Reporte de Cajas
                </label>
                <div className="small text-muted mb-1">
                  Solo para ver cómo quedaría esta fila. No se imprime ni se descarga.
                </div>
                <div className="border rounded">
                  <PdfViewer
                    src={previewUrl}
                    fileName="preview-cancelacion.pdf"
                    height={680}
                    soloVista
                  />
                </div>
              </div>
            )}

            {error && <p className="text-danger mt-2 mb-0">{error}</p>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={guardando}>
              Cerrar
            </button>
            <button
              type="button"
              className="btn btn-danger fw-semibold"
              onClick={handleConfirmar}
              disabled={!puedeConfirmar || guardando}
            >
              {guardando ? "Cancelando..." : "Confirmar cancelación"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
