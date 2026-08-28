import React, { useEffect, useState } from "react";
import Dropdown from "../../../components/Dropdown";
import useTipoCambioActual from "../../../hooks/useTipoCambioActual";

const FORMAS_PAGO = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "CREDITO", label: "T. Crédito" },
  { value: "DEBITO", label: "T. Débito" },
  { value: "CHEQUE", label: "Cheque No." },
  { value: "TRANSFERENCIA", label: "Transferencia" },
];

// Terminales físicas (mismo catálogo que BANCO_A_TERMINAL en
// backend/utils/cierreCajaTerminales.js): un depósito con tarjeta debe decir
// en cuál se cobró para que el Cierre de Caja cuadre por terminal.
const TERMINALES = ["BANREGIO", "AMERICAN EXPRESS", "BANAMEX", "BANORTE", "BBVA BANCOMER"];

function formatMoney(n) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}

function nombreCliente(c) {
  if (!c) return "";
  return c.tipoCliente === "Particular"
    ? [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(" ")
    : c.gobierno?.nombreGobierno || c.empresa?.razonSocial || c.nombre || "";
}

// Registra un depósito de anticipo (saldo a favor) para un cliente, sin
// ligarlo a ninguna orden. Mismo patrón de captura pesos/dólares/forma de
// pago que CajaModalPago.jsx (Abono/Anticipo), sin tipoPago/comprobante ni
// vale de salida, que no aplican aquí.
export default function CajaModalAnticipoDeposito({ show, cliente, onClose, onSubmit }) {
  const [montoPesos, setMontoPesos] = useState("");
  const [montoDolares, setMontoDolares] = useState("");
  const [tipoCambio, setTipoCambio] = useState("");
  const [formaPago, setFormaPago] = useState("EFECTIVO");
  const [chequeNumero, setChequeNumero] = useState("");
  const [banco, setBanco] = useState("");
  const [referencia, setReferencia] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const { tipoCambio: tipoCambioConfig, loading: cargandoTipoCambio } = useTipoCambioActual();

  useEffect(() => {
    if (!show) return;
    setMontoPesos("");
    setMontoDolares("");
    setTipoCambio(tipoCambioConfig ? String(tipoCambioConfig) : "");
    setFormaPago("EFECTIVO");
    setChequeNumero("");
    setBanco("");
    setReferencia("");
    setObservaciones("");
    setError("");
  }, [show, tipoCambioConfig]);

  if (!show || !cliente) return null;

  const dolaresConvertidos = Number(montoDolares || 0) * Number(tipoCambio || 0);
  const totalDeposito = Number(montoPesos || 0) + dolaresConvertidos;

  const handleSubmit = async () => {
    if (totalDeposito <= 0) {
      setError("Captura una cantidad en pesos o en dólares mayor a 0.");
      return;
    }
    if (formaPago === "CHEQUE" && !chequeNumero.trim()) {
      setError("Captura el número de cheque.");
      return;
    }
    if ((formaPago === "CREDITO" || formaPago === "DEBITO") && !banco) {
      setError("Selecciona la terminal donde se cobró la tarjeta.");
      return;
    }
    if (Number(montoDolares) > 0 && !Number(tipoCambio)) {
      setError("No hay un tipo de cambio configurado. Regístralo en Configuración.");
      return;
    }

    try {
      setGuardando(true);
      setError("");
      await onSubmit({
        clienteId: cliente._id,
        montoPesos: Number(montoPesos) || 0,
        montoDolares: Number(montoDolares) || 0,
        tipoCambio: Number(tipoCambio) || 0,
        formaPago,
        chequeNumero,
        banco,
        referencia,
        observaciones,
      });
    } catch (err) {
      setError(err.response?.data?.msg || "Error al registrar el anticipo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal d-block" tabIndex="-1" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="modal-dialog modal-dialog-centered modal-lg">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title fw-bold">Registrar Anticipo</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body">
            <p className="text-muted">
              Cliente: <strong>{nombreCliente(cliente)}</strong> · Saldo actual:{" "}
              <strong>{formatMoney(cliente.saldoAFavor)}</strong>
            </p>

            <div className="row g-3">
              <div className="col-md-6">
                <div className="row g-2 mb-2">
                  <div className="col-6">
                    <label className="form-label mb-0">Cantidad en Pesos</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control"
                      value={montoPesos}
                      onChange={(e) => setMontoPesos(e.target.value)}
                    />
                  </div>
                  <div className="col-6">
                    <label className="form-label mb-0">Cantidad en Dólares</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control"
                      value={montoDolares}
                      onChange={(e) => setMontoDolares(e.target.value)}
                    />
                    {Number(montoDolares) > 0 && Number(tipoCambio) > 0 && (
                      <small className="text-muted">≈ {formatMoney(dolaresConvertidos)} MXN</small>
                    )}
                  </div>
                </div>

                <div className="mb-2">
                  <label className="form-label mb-0">Tipo de Cambio</label>
                  <input
                    type="number"
                    step="0.0001"
                    className="form-control"
                    value={tipoCambio}
                    disabled
                    readOnly
                    title="Se toma del tipo de cambio definido en Configuración"
                  />
                  {!cargandoTipoCambio && !tipoCambioConfig && Number(montoDolares) > 0 && (
                    <small className="text-danger">
                      No hay un tipo de cambio configurado. Regístralo en Configuración.
                    </small>
                  )}
                </div>

                <div className="row g-2 mb-2">
                  <div className="col-6">
                    <label className="form-label mb-0">Forma de Pago</label>
                    <Dropdown className="form-select" value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>
                      {FORMAS_PAGO.map((f) => (
                        <Dropdown.Option key={f.value} value={f.value}>{f.label}</Dropdown.Option>
                      ))}
                    </Dropdown>
                  </div>
                  {formaPago === "CHEQUE" && (
                    <div className="col-6">
                      <label className="form-label mb-0">No. de Cheque</label>
                      <input
                        type="text"
                        className="form-control"
                        value={chequeNumero}
                        onChange={(e) => setChequeNumero(e.target.value)}
                      />
                    </div>
                  )}
                  {(formaPago === "CREDITO" || formaPago === "DEBITO") && (
                    <div className="col-6">
                      <label className="form-label mb-0">Terminal</label>
                      <Dropdown className="form-select" value={banco} onChange={(e) => setBanco(e.target.value)}>
                        <Dropdown.Option value="">Selecciona...</Dropdown.Option>
                        {TERMINALES.map((t) => (
                          <Dropdown.Option key={t} value={t}>{t}</Dropdown.Option>
                        ))}
                      </Dropdown>
                      <small className="text-muted">Obligatoria (para el Cierre de Caja).</small>
                    </div>
                  )}
                </div>
              </div>

              <div className="col-md-6">
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
                    rows={3}
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                  />
                </div>

                <div className="border rounded p-2 mt-3">
                  <p className="d-flex justify-content-between mb-1">
                    <span className="text-muted">Pesos</span>
                    <span>{formatMoney(montoPesos)}</span>
                  </p>
                  <p className="d-flex justify-content-between mb-1">
                    <span className="text-muted">Dólares convertidos</span>
                    <span>{formatMoney(dolaresConvertidos)}</span>
                  </p>
                  <hr className="my-1" />
                  <p className="d-flex justify-content-between fw-bold mb-0">
                    <span>Total del Anticipo</span>
                    <span>{formatMoney(totalDeposito)}</span>
                  </p>
                </div>
              </div>
            </div>

            {error && <p className="text-danger mt-2 mb-0">{error}</p>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={guardando}>
              Cancelar
            </button>
            <button type="button" className="btn btn-success fw-semibold" onClick={handleSubmit} disabled={guardando}>
              {guardando ? "Guardando..." : "Registrar Anticipo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
