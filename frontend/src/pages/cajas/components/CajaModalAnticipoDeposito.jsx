import React, { useEffect, useState } from "react";
import Dropdown from "../../../components/Dropdown";
import useTipoCambioActual from "../../../hooks/useTipoCambioActual";

const FORMAS_PAGO = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "CREDITO", label: "T. Crédito" },
  { value: "DEBITO", label: "T. Débito" },
  { value: "CHEQUE", label: "Cheque No." },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "COMBINADO", label: "Combinado" },
];

// Terminales físicas (mismo catálogo que BANCO_A_TERMINAL en
// backend/utils/cierreCajaTerminales.js): un depósito con tarjeta debe decir
// en cuál se cobró para que el Cierre de Caja cuadre por terminal.
const TERMINALES = ["BANREGIO", "AMERICAN EXPRESS", "BANAMEX", "BANORTE", "BBVA BANCOMER"];

// EFECTIVO/EFECTIVO_USD desglosan el efectivo en pesos y dólares (con
// conversión, igual que "Cantidad en Pesos/Dólares"); los demás métodos del
// combinado son solo en pesos. Mismo patrón que CajaModalPago.jsx.
const MONTOS_COMBINADO_INICIAL = { EFECTIVO: "", EFECTIVO_USD: "", CREDITO: "", DEBITO: "", CHEQUE: "", TRANSFERENCIA: "" };
const MONTOS_COMBINADO_PESOS = ["EFECTIVO", "CREDITO", "DEBITO", "CHEQUE", "TRANSFERENCIA"];

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
// ligarlo a ninguna orden — imprime un Recibo Provisional igual que
// cualquier otro (ya no existe un "Recibo de Anticipo" aparte). Mismo
// patrón de captura pesos/dólares/forma de pago (incluido Combinado) que
// CajaModalPago.jsx (Abono/Anticipo), sin tipoPago/comprobante ni vale de
// salida, que no aplican aquí; tampoco lleva "aplicar anticipo del
// cliente" — no se puede fondear un anticipo nuevo con saldo a favor que
// el cliente ya tiene.
export default function CajaModalAnticipoDeposito({ show, cliente, onClose, onSubmit }) {
  const [montoPesos, setMontoPesos] = useState("");
  const [montoDolares, setMontoDolares] = useState("");
  const [tipoCambio, setTipoCambio] = useState("");
  const [formaPago, setFormaPago] = useState("EFECTIVO");
  const [chequeNumero, setChequeNumero] = useState("");
  const [banco, setBanco] = useState("");
  // Desglose por método cuando formaPago === "COMBINADO"; su suma reemplaza
  // los campos de Cantidad en Pesos/Dólares (que se deshabilitan en ese caso).
  const [montosCombinado, setMontosCombinado] = useState(MONTOS_COMBINADO_INICIAL);
  const [terminalCombinado, setTerminalCombinado] = useState("");
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
    setMontosCombinado(MONTOS_COMBINADO_INICIAL);
    setTerminalCombinado("");
    setObservaciones("");
    setError("");
  }, [show, tipoCambioConfig]);

  // Con Combinado, Pesos/Dólares no se capturan a mano: pesos es la suma de
  // los métodos en pesos del desglose, y dólares es el Efectivo en dólares.
  useEffect(() => {
    if (formaPago !== "COMBINADO") return;
    const totalPesos = MONTOS_COMBINADO_PESOS.reduce((acc, k) => acc + (Number(montosCombinado[k]) || 0), 0);
    setMontoPesos(totalPesos > 0 ? String(totalPesos) : "");
    const totalDolares = Number(montosCombinado.EFECTIVO_USD) || 0;
    setMontoDolares(totalDolares > 0 ? String(totalDolares) : "");
  }, [formaPago, montosCombinado]);

  if (!show || !cliente) return null;

  const dolaresConvertidos = Number(montoDolares || 0) * Number(tipoCambio || 0);
  const totalDeposito = Number(montoPesos || 0) + dolaresConvertidos;

  const combinadoAplicado = () => ({
    credito: Number(montosCombinado.CREDITO) || 0,
    efectivo: Number(montosCombinado.EFECTIVO) || 0,
    efectivoDolares: Number(montosCombinado.EFECTIVO_USD) || 0,
    debito: Number(montosCombinado.DEBITO) || 0,
    cheque: Number(montosCombinado.CHEQUE) || 0,
    transferencia: Number(montosCombinado.TRANSFERENCIA) || 0,
    banco: terminalCombinado,
  });

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
    if (
      formaPago === "COMBINADO" &&
      (Number(montosCombinado.CREDITO) > 0 || Number(montosCombinado.DEBITO) > 0) &&
      !terminalCombinado
    ) {
      setError("Selecciona la terminal donde se cobró la parte con tarjeta del combinado.");
      return;
    }
    if (formaPago === "COMBINADO" && Number(montosCombinado.CHEQUE) > 0 && !chequeNumero.trim()) {
      setError("Captura el número de cheque.");
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
        ...(formaPago === "COMBINADO" ? { combinado: combinadoAplicado() } : {}),
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
                      readOnly={formaPago === "COMBINADO"}
                      title={formaPago === "COMBINADO" ? "Se calcula sola con la suma del desglose combinado" : undefined}
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
                      readOnly={formaPago === "COMBINADO"}
                      title={
                        formaPago === "COMBINADO"
                          ? "Se calcula solo con el Efectivo en dólares del desglose combinado"
                          : undefined
                      }
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

                {formaPago === "COMBINADO" && (
                  <div className="border rounded p-3 mb-2">
                    <label className="form-label fw-semibold d-block">Desglose del pago combinado</label>
                    <div className="row g-2">
                      <div className="col-6">
                        <label className="form-label mb-0 small">Efectivo (Pesos)</label>
                        <input
                          type="number"
                          step="0.01"
                          className="form-control form-control-sm"
                          value={montosCombinado.EFECTIVO}
                          onChange={(e) => setMontosCombinado((prev) => ({ ...prev, EFECTIVO: e.target.value }))}
                        />
                      </div>
                      <div className="col-6">
                        <label className="form-label mb-0 small">Efectivo (Dólares)</label>
                        <input
                          type="number"
                          step="0.01"
                          className="form-control form-control-sm"
                          value={montosCombinado.EFECTIVO_USD}
                          onChange={(e) => setMontosCombinado((prev) => ({ ...prev, EFECTIVO_USD: e.target.value }))}
                        />
                        {Number(montosCombinado.EFECTIVO_USD) > 0 && Number(tipoCambio) > 0 && (
                          <small className="text-muted">
                            ≈ {formatMoney(Number(montosCombinado.EFECTIVO_USD) * Number(tipoCambio))} MXN
                          </small>
                        )}
                      </div>
                      <div className="col-6">
                        <label className="form-label mb-0 small">T. Crédito</label>
                        <input
                          type="number"
                          step="0.01"
                          className="form-control form-control-sm"
                          value={montosCombinado.CREDITO}
                          onChange={(e) => setMontosCombinado((prev) => ({ ...prev, CREDITO: e.target.value }))}
                        />
                      </div>
                      <div className="col-6">
                        <label className="form-label mb-0 small">T. Débito</label>
                        <input
                          type="number"
                          step="0.01"
                          className="form-control form-control-sm"
                          value={montosCombinado.DEBITO}
                          onChange={(e) => setMontosCombinado((prev) => ({ ...prev, DEBITO: e.target.value }))}
                        />
                      </div>
                      {(Number(montosCombinado.CREDITO) > 0 || Number(montosCombinado.DEBITO) > 0) && (
                        <div className="col-12">
                          <label className="form-label mb-0 small">Terminal</label>
                          <Dropdown
                            className="form-select form-select-sm"
                            value={terminalCombinado}
                            onChange={(e) => setTerminalCombinado(e.target.value)}
                          >
                            <Dropdown.Option value="">Selecciona...</Dropdown.Option>
                            {TERMINALES.map((t) => (
                              <Dropdown.Option key={t} value={t}>{t}</Dropdown.Option>
                            ))}
                          </Dropdown>
                          <small className="text-muted">Obligatoria: con qué terminal se cobró el T. Crédito/T. Débito.</small>
                        </div>
                      )}
                      <div className="col-6">
                        <label className="form-label mb-0 small">No. de Cheque</label>
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          value={chequeNumero}
                          onChange={(e) => setChequeNumero(e.target.value)}
                        />
                      </div>
                      <div className="col-6">
                        <label className="form-label mb-0 small">Cantidad (Cheque)</label>
                        <input
                          type="number"
                          step="0.01"
                          className="form-control form-control-sm"
                          value={montosCombinado.CHEQUE}
                          onChange={(e) => setMontosCombinado((prev) => ({ ...prev, CHEQUE: e.target.value }))}
                        />
                      </div>
                      <div className="col-12">
                        <label className="form-label mb-0 small">Transferencia</label>
                        <input
                          type="number"
                          step="0.01"
                          className="form-control form-control-sm"
                          value={montosCombinado.TRANSFERENCIA}
                          onChange={(e) => setMontosCombinado((prev) => ({ ...prev, TRANSFERENCIA: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="col-md-6">
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
