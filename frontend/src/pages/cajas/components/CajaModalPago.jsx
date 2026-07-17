import React, { useState } from "react";

const BANCOS = ["BANREGIO", "AMERICAN EXPRESS", "BANAMEX", "BANORTE", "BBVA BANCOMER", "DOLARES", "EFECTIVOS"];
const TIPOS_NOTA = ["Contado", "Credito", "Cancelada"];
const TIPOS_PAGO = [
  { value: "COMPLETO", label: "Pago Completo" },
  { value: "ABONO", label: "Abono" },
  { value: "ANTICIPO", label: "Anticipo" },
];

function formatMoney(n) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}

export default function CajaModalPago({ show, saldoPendiente, onClose, onSubmit }) {
  const [tipoPago, setTipoPago] = useState("ABONO");
  const [comprobante, setComprobante] = useState("NOTA_VENTA");

  // Datos de Nota de Venta (solo si comprobante === NOTA_VENTA)
  const [banco, setBanco] = useState("");
  const [tipoNota, setTipoNota] = useState("Contado");

  // Datos de Remisión (solo si comprobante === REMISION)
  const [tipoRemision, setTipoRemision] = useState("Contado");
  const [fechaPagada, setFechaPagada] = useState("");

  const [montoPesos, setMontoPesos] = useState("");
  const [montoDolares, setMontoDolares] = useState("");
  const [tipoCambio, setTipoCambio] = useState("");
  const [referencia, setReferencia] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  if (!show) return null;

  const totalPago = Number(montoPesos || 0) + Number(montoDolares || 0) * Number(tipoCambio || 0);

  const handleSubmit = async () => {
    if (totalPago <= 0) {
      setError("Captura una cantidad en pesos o en dólares mayor a 0.");
      return;
    }
    try {
      setGuardando(true);
      setError("");
      await onSubmit({
        tipoPago,
        comprobante,
        montoPesos: Number(montoPesos) || 0,
        montoDolares: Number(montoDolares) || 0,
        tipoCambio: Number(tipoCambio) || 0,
        referencia,
        observaciones,
        ...(comprobante === "NOTA_VENTA" ? { banco, tipoNota } : { tipoRemision, fechaPagada }),
      });
    } catch (err) {
      console.error(err);
      setError("Error al registrar el pago.");
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
            <h5 className="modal-title fw-bold">Registrar Pago / Abono</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body">
            {saldoPendiente !== undefined && (
              <p className="text-muted">
                Saldo Pendiente: <strong>{formatMoney(saldoPendiente)}</strong>
              </p>
            )}

            <div className="mb-2">
              <label className="form-label mb-0 fw-semibold">Tipo de Pago</label>
              <select className="form-select" value={tipoPago} onChange={(e) => setTipoPago(e.target.value)}>
                {TIPOS_PAGO.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="mb-2">
              <label className="form-label mb-0 fw-semibold">Comprobante</label>
              <select className="form-select" value={comprobante} onChange={(e) => setComprobante(e.target.value)}>
                <option value="NOTA_VENTA">Nota de Venta</option>
                <option value="REMISION">Remisión</option>
              </select>
            </div>

            {comprobante === "NOTA_VENTA" ? (
              <div className="row g-2 mb-2">
                <div className="col-6">
                  <label className="form-label mb-0">Banco</label>
                  <select className="form-select" value={banco} onChange={(e) => setBanco(e.target.value)}>
                    <option value="">Selecciona...</option>
                    {BANCOS.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div className="col-6">
                  <label className="form-label mb-0">Tipo</label>
                  <select className="form-select" value={tipoNota} onChange={(e) => setTipoNota(e.target.value)}>
                    {TIPOS_NOTA.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="row g-2 mb-2">
                <div className="col-6">
                  <label className="form-label mb-0">Tipo</label>
                  <select className="form-select" value={tipoRemision} onChange={(e) => setTipoRemision(e.target.value)}>
                    {TIPOS_NOTA.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="col-6">
                  <label className="form-label mb-0">Fecha de Pagada</label>
                  <input
                    type="date"
                    className="form-control"
                    value={fechaPagada}
                    onChange={(e) => setFechaPagada(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="row g-2 mb-2">
              <div className="col-md-6">
                <label className="form-label mb-0">Cantidad en Pesos</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  value={montoPesos}
                  onChange={(e) => setMontoPesos(e.target.value)}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label mb-0">Cantidad en Dólares</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  value={montoDolares}
                  onChange={(e) => setMontoDolares(e.target.value)}
                />
              </div>
            </div>

            <div className="mb-2">
              <label className="form-label mb-0">Tipo de Cambio</label>
              <input
                type="number"
                step="0.0001"
                className="form-control"
                value={tipoCambio}
                disabled={!Number(montoDolares)}
                onChange={(e) => setTipoCambio(e.target.value)}
              />
            </div>

            <div className="mb-2">
              <label className="form-label mb-0">Referencia</label>
              <input
                type="text"
                className="form-control"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
              />
            </div>

            <div className="mb-2">
              <label className="form-label mb-0">Observaciones</label>
              <textarea
                className="form-control"
                rows={2}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
              />
            </div>

            <p className="fw-bold mb-0">Total a Registrar: {formatMoney(totalPago)}</p>

            {error && <p className="text-danger mt-2 mb-0">{error}</p>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="button" className="btn btn-success fw-semibold" onClick={handleSubmit} disabled={guardando}>
              {guardando ? "Guardando..." : "Registrar Pago"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
