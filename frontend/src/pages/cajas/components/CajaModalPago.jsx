import React, { useEffect, useState } from "react";
import Dropdown from "../../../components/Dropdown";
import useTipoCambioActual from "../../../hooks/useTipoCambioActual";
import { getUser } from "../../../auth";
import { getReciboProvisionalPdfUrl, getReciboDolaresPdfUrl } from "../../../api/cajas";
import {
  ESTATUS_VALE_OPCIONES,
  getSiguienteNumeroVale,
  getSiguienteDig,
  createVale,
  getValePdfUrl,
} from "../../../api/vales";

const BANCOS = ["BANREGIO", "AMERICAN EXPRESS", "BANAMEX", "BANORTE", "BBVA BANCOMER", "DOLARES", "EFECTIVOS", "CHEQUE", "TRANSFERENCIA"];
const TIPOS_NOTA = ["Contado", "Credito", "Cancelada"];
// `nota` es lo que se sugiere en el campo Notas (el descriptor corto que sale
// en el Reporte Diario de Remisiones), independiente de cómo se llame la opción
// en pantalla.
const TIPOS_PAGO = [
  { value: "COMPLETO", label: "Remisión o Factura", nota: "Liquida" },
  { value: "ABONO", label: "Abono", nota: "Abono" },
  { value: "ANTICIPO", label: "Anticipo", nota: "Anticipo" },
];
const FORMAS_PAGO_PROVISIONAL = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "CREDITO", label: "T. Crédito" },
  { value: "DEBITO", label: "T. Débito" },
  { value: "CHEQUE", label: "Cheque No." },
  { value: "TRANSFERENCIA", label: "Transferencia" },
];

function formatMoney(n) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}

function nombreClienteOrden(orden) {
  const c = orden.cliente || {};
  return c.tipoCliente === "Particular"
    ? [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(" ")
    : c.gobierno?.nombreGobierno || c.empresa?.razonSocial || c.nombre || "";
}

function telefonoCelularOrden(orden) {
  const cel = (orden.cliente?.celulares || [])[0];
  if (!cel) return "";
  return [cel.lada, cel.numero].filter(Boolean).join(" ");
}

export default function CajaModalPago({ show, orden, saldoPendiente, onClose, onSubmit, onValeGuardado, onImprimir }) {
  const user = getUser();

  // Sin valor inicial: el cajero debe elegir explícitamente el tipo de pago.
  const [tipoPago, setTipoPago] = useState("");
  const [tipoPagoInvalido, setTipoPagoInvalido] = useState(false);
  const [comprobante, setComprobante] = useState("");
  const [comprobanteInvalido, setComprobanteInvalido] = useState(false);

  // Datos de Nota de Venta (solo si comprobante === NOTA_VENTA)
  const [banco, setBanco] = useState("");
  const [tipoNota, setTipoNota] = useState("Contado");

  // Datos de Remisión (solo si comprobante === REMISION). La Fecha de Pagada
  // no se captura aquí: la marca el backend cuando la orden se queda sin saldo
  // pendiente (ver POST /api/cajas/:id/pagos).
  const [tipoRemision, setTipoRemision] = useState("Contado");

  // Datos de Recibo Provisional (solo si comprobante === RECIBO_PROVISIONAL,
  // es decir, tipoPago Abono o Anticipo)
  const [formaPago, setFormaPago] = useState("EFECTIVO");
  const [chequeNumero, setChequeNumero] = useState("");
  const [reciboConcepto, setReciboConcepto] = useState("");
  const [reciboRazon, setReciboRazon] = useState("");
  const [reciboRecibio, setReciboRecibio] = useState("");
  const [reciboAutorizo, setReciboAutorizo] = useState("");

  const [montoPesos, setMontoPesos] = useState("");
  const [montoDolares, setMontoDolares] = useState("");
  const [tipoCambio, setTipoCambio] = useState("");
  const [referencia, setReferencia] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [notas, setNotas] = useState("");
  const [notasEditadas, setNotasEditadas] = useState(false);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Vale de salida (opcional, generado junto con el pago)
  const [generarVale, setGenerarVale] = useState(false);
  const [imprimirVale, setImprimirVale] = useState(true);
  const [noVale, setNoVale] = useState("");
  const [dig, setDig] = useState(0);
  const [autoNumero, setAutoNumero] = useState(false);
  const [quienEntrega, setQuienEntrega] = useState("");
  const [estatusVale, setEstatusVale] = useState("Contado");
  const [estatusValeEditado, setEstatusValeEditado] = useState(false);
  const [observacionesVale, setObservacionesVale] = useState("");

  // Recibo Provisional (Abono/Anticipo) y Recibo de Dólares (si hay montoDolares):
  // se generan automáticamente al registrar el pago; esta opción solo controla
  // si además se abren para imprimir en cuanto se termina de registrar.
  const [imprimirAlFinalizar, setImprimirAlFinalizar] = useState(true);

  const { tipoCambio: tipoCambioConfig, loading: cargandoTipoCambio } = useTipoCambioActual();

  // Una vez que la orden ya tiene una Remisión, no se puede generar otra
  // Remisión ni una Nota de Venta (y por lo tanto tampoco un Liquida, que
  // depende de una de las dos): solo quedan disponibles Abono/Anticipo.
  const bloqueaFacturacion = (orden.pagos || []).some((p) => p.comprobante === "REMISION");

  useEffect(() => {
    setTipoCambio(tipoCambioConfig ? String(tipoCambioConfig) : "");
  }, [tipoCambioConfig]);

  // Un Abono/Anticipo siempre se documenta con Recibo Provisional; un Liquida
  // usa Nota de Venta o Remisión (selección manual, ver más abajo).
  useEffect(() => {
    if (tipoPago === "ABONO" || tipoPago === "ANTICIPO") {
      setComprobante("RECIBO_PROVISIONAL");
      setComprobanteInvalido(false);
    } else if (!tipoPago || comprobante === "RECIBO_PROVISIONAL") {
      setComprobante("");
    }
  }, [tipoPago]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sugerencia automática de Notas según el tipo de movimiento; el usuario
  // puede sobrescribirla libremente (p. ej. cambiarla por la forma de pago).
  useEffect(() => {
    if (notasEditadas) return;
    if (comprobante === "REMISION" && tipoRemision === "Cancelada") {
      setNotas("Se cancela remisión y pasa a factura");
      return;
    }
    // Una remisión a crédito no es un movimiento de dinero: no se sugiere nota.
    if (comprobante === "REMISION" && tipoRemision === "Credito") {
      setNotas("");
      return;
    }
    setNotas(TIPOS_PAGO.find((t) => t.value === tipoPago)?.nota || "");
  }, [tipoPago, comprobante, tipoRemision, notasEditadas]);

  // Una Remisión a Crédito documenta la venta pero no recibe dinero hoy: no se
  // capturan importes ni referencia, y lo ya capturado se limpia al elegirla.
  const esRemisionCredito =
    tipoPago === "COMPLETO" && comprobante === "REMISION" && tipoRemision === "Credito";

  useEffect(() => {
    if (!esRemisionCredito) return;
    setMontoPesos("");
    setMontoDolares("");
    setReferencia("");
  }, [esRemisionCredito]);

  // El Estatus del vale se sugiere solo cuando el comprobante (Nota/Remisión)
  // se paga Contado o Credito; el usuario puede sobrescribirlo libremente.
  useEffect(() => {
    if (estatusValeEditado) return;
    if (comprobante !== "NOTA_VENTA" && comprobante !== "REMISION") return;
    const tipoComprobante = comprobante === "REMISION" ? tipoRemision : tipoNota;
    if (tipoComprobante === "Contado" || tipoComprobante === "Credito") {
      setEstatusVale(tipoComprobante);
    }
  }, [comprobante, tipoNota, tipoRemision, estatusValeEditado]);

  // Reinicia el formulario cada vez que se abre el modal.
  useEffect(() => {
    if (!show) return;
    setTipoPago("");
    // Corresponde al tipoPago vacío de arriba: se fija aquí (no solo en el
    // efecto de [tipoPago]) porque si el modal ya estaba sin tipo de pago la
    // vez anterior, ese efecto no vuelve a dispararse al reabrir (el valor no cambia).
    setComprobante("");
    setTipoPagoInvalido(false);
    setComprobanteInvalido(false);
    setBanco("");
    setTipoNota("Contado");
    setTipoRemision("Contado");
    setFormaPago("EFECTIVO");
    setChequeNumero("");
    setReciboConcepto(orden?.ordenServicio || "");
    setReciboRazon("");
    setReciboRecibio(user?.name || user?.username || "");
    setReciboAutorizo("");
    setMontoPesos("");
    setMontoDolares("");
    setReferencia("");
    setObservaciones("");
    setNotas("");
    setNotasEditadas(false);
    setError("");
    setGenerarVale(false);
    setImprimirVale(true);
    setNoVale("");
    setDig(0);
    setAutoNumero(false);
    setQuienEntrega("");
    setEstatusVale("Contado");
    setEstatusValeEditado(false);
    setObservacionesVale("");
    setImprimirAlFinalizar(true);
  }, [show]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!show) return null;

  const dolaresConvertidos = Number(montoDolares || 0) * Number(tipoCambio || 0);
  const totalPago = Number(montoPesos || 0) + dolaresConvertidos;

  const saldoValido =
    typeof saldoPendiente === "number" && !Number.isNaN(saldoPendiente) ? Math.max(saldoPendiente, 0) : undefined;
  const cambio = saldoValido !== undefined && totalPago > saldoValido ? totalPago - saldoValido : 0;
  const totalAplicado = cambio > 0 ? saldoValido : totalPago;

  // Recibo Provisional (Abono/Anticipo) y Recibo de Dólares (montoDolares > 0)
  // se generan automáticamente al registrar el pago (ver backend/routes/cajas.js).
  const generaProvisional = tipoPago === "ABONO" || tipoPago === "ANTICIPO";
  const generaDolares = Number(montoDolares) > 0;

  // Recorta lo capturado a lo que en realidad resta de la orden: el excedente
  // (cambio) no se registra como parte del pago.
  const montosAplicados = () => {
    let pesos = Number(montoPesos) || 0;
    let dolares = Number(montoDolares) || 0;
    if (cambio > 0) {
      const reducPesos = Math.min(pesos, cambio);
      pesos -= reducPesos;
      const restante = cambio - reducPesos;
      if (restante > 0 && Number(tipoCambio) > 0) {
        dolares -= Math.min(dolares, restante / Number(tipoCambio));
      }
    }
    return { pesos, dolares };
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

  const crearVale = async () => {
    const res = await createVale({
      noOrden: orden.ordenServicio,
      vehiculo: orden._id,
      noVale: Number(noVale),
      autoNumero,
      quienEntrega: quienEntrega.trim(),
      cajero: user?.name || user?.username || "",
      estatus: estatusVale,
      observaciones: observacionesVale.trim(),
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
    return res.data.data;
  };

  const handleSubmit = async () => {
    if (!tipoPago) {
      setError("Selecciona el tipo de pago.");
      setTipoPagoInvalido(true);
      return;
    }
    // Una Remisión a Crédito se registra sin importe: es la venta a crédito.
    if (!esRemisionCredito && totalPago <= 0) {
      setError("Captura una cantidad en pesos o en dólares mayor a 0.");
      return;
    }
    if (tipoPago === "COMPLETO" && bloqueaFacturacion) {
      setError("Esta orden ya tiene una Remisión registrada; no se puede registrar otra Remisión o Factura.");
      return;
    }
    if (tipoPago === "COMPLETO" && !comprobante) {
      setError("Selecciona un comprobante (Nota de Venta o Remisión).");
      setComprobanteInvalido(true);
      return;
    }
    if (comprobante === "RECIBO_PROVISIONAL" && formaPago === "CHEQUE" && !chequeNumero.trim()) {
      setError("Captura el número de cheque.");
      return;
    }
    if (Number(montoDolares) > 0 && !Number(tipoCambio)) {
      setError("No hay un tipo de cambio configurado. Regístralo en Configuración.");
      return;
    }
    if (generarVale && !noVale) {
      setError("Captura o genera el número de vale.");
      return;
    }

    try {
      setGuardando(true);
      setError("");

      let valeGuardado = null;
      if (generarVale) {
        valeGuardado = await crearVale();
        onValeGuardado && onValeGuardado(valeGuardado);
        if (imprimirVale) onImprimir(getValePdfUrl(valeGuardado._id), "vale.pdf", "Vale de Salida");
      }

      const { pesos, dolares } = montosAplicados();
      const pagoCreado = await onSubmit({
        tipoPago,
        comprobante,
        montoPesos: pesos,
        montoDolares: dolares,
        tipoCambio: Number(tipoCambio) || 0,
        referencia,
        observaciones,
        notas,
        ...(comprobante === "NOTA_VENTA"
          ? { banco, tipoNota }
          : comprobante === "REMISION"
          ? { tipoRemision }
          : { formaPago, chequeNumero, reciboConcepto, reciboRazon, reciboRecibio, reciboAutorizo }),
      });

      if (imprimirAlFinalizar && pagoCreado) {
        if (pagoCreado.reciboProvisional?.numero)
          onImprimir(getReciboProvisionalPdfUrl(orden._id, pagoCreado._id), "recibo-provisional.pdf", "Recibo Provisional");
        if (pagoCreado.reciboDolares?.numero)
          onImprimir(getReciboDolaresPdfUrl(orden._id, pagoCreado._id), "recibo-dolares.pdf", "Recibo en Dólares");
      }
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
    >
      <div className="modal-dialog modal-dialog-centered modal-lg">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title fw-bold">Registrar Pago / Abono</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body">
            {saldoValido !== undefined && (
              <p className="text-muted">
                Saldo Pendiente: <strong>{formatMoney(saldoValido)}</strong>
              </p>
            )}

            {bloqueaFacturacion && (
              <div className="alert alert-warning py-2 small">
                Esta orden ya tiene una Remisión registrada: no se puede generar otra Remisión ni una Nota de
                Venta. Solo se pueden registrar Abonos o Anticipos (Recibo Provisional).
              </div>
            )}

            <div className="row g-3">
              <div className="col-md-6">
                <div className="mb-2">
                  <label className="form-label mb-0 fw-semibold">Tipo de Pago</label>
                  <Dropdown
                    className={`form-select${tipoPagoInvalido ? " is-invalid border-danger" : ""}`}
                    value={tipoPago}
                    onChange={(e) => { setTipoPago(e.target.value); setTipoPagoInvalido(false); }}
                  >
                    <Dropdown.Option value="">Selecciona una opción...</Dropdown.Option>
                    {TIPOS_PAGO.map((t) => (
                      <Dropdown.Option
                        key={t.value}
                        value={t.value}
                        disabled={t.value === "COMPLETO" && bloqueaFacturacion}
                        title={t.value === "COMPLETO" && bloqueaFacturacion ? "Bloqueado: la orden ya tiene una Remisión" : undefined}
                      >
                        {t.label}
                      </Dropdown.Option>
                    ))}
                  </Dropdown>
                  {tipoPagoInvalido && <small className="text-danger">Debes elegir un tipo de pago.</small>}
                </div>

                {tipoPago === "COMPLETO" ? (
                  <>
                    <div className="mb-2">
                      <label className="form-label mb-0 fw-semibold">Comprobante</label>
                      <Dropdown
                        className={`form-select${comprobanteInvalido ? " is-invalid border-danger" : ""}`}
                        value={comprobante}
                        onChange={(e) => { setComprobante(e.target.value); setComprobanteInvalido(false); }}
                      >
                        <Dropdown.Option value="">Selecciona...</Dropdown.Option>
                        <Dropdown.Option value="NOTA_VENTA">Nota de Venta</Dropdown.Option>
                        <Dropdown.Option value="REMISION">Remisión</Dropdown.Option>
                      </Dropdown>
                      {comprobanteInvalido && (
                        <small className="text-danger">Debes elegir un comprobante.</small>
                      )}
                    </div>

                    {comprobante === "NOTA_VENTA" && (
                      <div className="row g-2 mb-2">
                        <div className="col-6">
                          <label className="form-label mb-0">Banco / Forma de pago</label>
                          <Dropdown className="form-select" value={banco} onChange={(e) => setBanco(e.target.value)}>
                            <Dropdown.Option value="">Selecciona...</Dropdown.Option>
                            {BANCOS.map((b) => (
                              <Dropdown.Option key={b} value={b}>{b}</Dropdown.Option>
                            ))}
                          </Dropdown>
                        </div>
                        <div className="col-6">
                          <label className="form-label mb-0">Tipo</label>
                          <Dropdown className="form-select" value={tipoNota} onChange={(e) => setTipoNota(e.target.value)}>
                            {TIPOS_NOTA.map((t) => (
                              <Dropdown.Option key={t} value={t}>{t}</Dropdown.Option>
                            ))}
                          </Dropdown>
                        </div>
                      </div>
                    )}

                    {comprobante === "REMISION" && (
                      <div className="row g-2 mb-2">
                        <div className="col-6">
                          <label className="form-label mb-0">Tipo</label>
                          <Dropdown className="form-select" value={tipoRemision} onChange={(e) => setTipoRemision(e.target.value)}>
                            {TIPOS_NOTA.map((t) => (
                              <Dropdown.Option key={t} value={t}>{t}</Dropdown.Option>
                            ))}
                          </Dropdown>
                          <small className="text-muted">
                            La Fecha de Pagada se registra sola cuando la orden queda sin saldo pendiente.
                          </small>
                        </div>
                      </div>
                    )}

                    {!comprobante && (
                      <p className="text-muted small mb-2">Selecciona un comprobante para continuar.</p>
                    )}

                    {!esRemisionCredito && (
                      <div className="mb-2">
                        <label className="form-label mb-0">Referencia</label>
                        <input
                          type="text"
                          className="form-control"
                          value={referencia}
                          onChange={(e) => setReferencia(e.target.value)}
                        />
                      </div>
                    )}

                    <div className="mb-2">
                      <label className="form-label mb-0">Observaciones</label>
                      <textarea
                        className="form-control"
                        rows={2}
                        value={observaciones}
                        onChange={(e) => setObservaciones(e.target.value)}
                      />
                    </div>

                    <div className="mb-2">
                      <label className="form-label mb-0">Notas</label>
                      <input
                        type="text"
                        className="form-control"
                        value={notas}
                        onChange={(e) => { setNotas(e.target.value); setNotasEditadas(true); }}
                        placeholder="Abono, Liquida, Anticipo…"
                      />
                      <small className="text-muted">Se sugiere sola según el tipo de pago; puedes cambiarla.</small>
                    </div>
                  </>
                ) : !tipoPago ? (
                  <p className="text-muted small mb-2">Selecciona un tipo de pago para continuar.</p>
                ) : (
                  <>
                    <div className="mb-2">
                      <label className="form-label mb-0 fw-semibold d-block">Comprobante</label>
                      <span className="badge bg-secondary">Recibo Provisional</span>
                    </div>

                    <div className="row g-2 mb-2">
                      <div className="col-6">
                        <label className="form-label mb-0">Día</label>
                        <input type="text" className="form-control" value={formatFechaCorta(new Date())} readOnly data-no-uppercase />
                      </div>
                      <div className="col-6">
                        <label className="form-label mb-0">Tipo de Pago</label>
                        <Dropdown className="form-select" value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>
                          {FORMAS_PAGO_PROVISIONAL.map((f) => (
                            <Dropdown.Option key={f.value} value={f.value}>{f.label}</Dropdown.Option>
                          ))}
                        </Dropdown>
                      </div>
                    </div>

                    {formaPago === "CHEQUE" && (
                      <div className="mb-2">
                        <label className="form-label mb-0">No. de Cheque</label>
                        <input
                          type="text"
                          className="form-control"
                          value={chequeNumero}
                          onChange={(e) => setChequeNumero(e.target.value)}
                        />
                      </div>
                    )}

                    <div className="mb-2">
                      <label className="form-label mb-0">Recibimos de</label>
                      <input type="text" className="form-control" value={nombreClienteOrden(orden)} readOnly />
                    </div>

                    <div className="mb-2">
                      <label className="form-label mb-0">Teléfono del Cliente (Celular)</label>
                      <input type="text" className="form-control" value={telefonoCelularOrden(orden)} readOnly data-no-uppercase />
                    </div>

                    <div className="mb-2">
                      <label className="form-label mb-0">Por concepto de</label>
                      <input
                        type="text"
                        className="form-control"
                        value={reciboConcepto}
                        onChange={(e) => setReciboConcepto(e.target.value)}
                      />
                    </div>

                    <div className="mb-2">
                      <label className="form-label mb-0">Razón del recibo</label>
                      <input
                        type="text"
                        className="form-control"
                        value={reciboRazon}
                        onChange={(e) => setReciboRazon(e.target.value)}
                      />
                    </div>

                    <div className="row g-2 mb-2">
                      <div className="col-6">
                        <label className="form-label mb-0">Recibió</label>
                        <input
                          type="text"
                          className="form-control"
                          value={reciboRecibio}
                          onChange={(e) => setReciboRecibio(e.target.value)}
                        />
                      </div>
                      <div className="col-6">
                        <label className="form-label mb-0">Autorizó</label>
                        <input
                          type="text"
                          className="form-control"
                          value={reciboAutorizo}
                          onChange={(e) => setReciboAutorizo(e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="col-md-6">
                {esRemisionCredito ? (
                  <div className="alert alert-info py-2 small mb-0">
                    <strong>Remisión a Crédito:</strong> no se captura importe ni referencia. La venta queda
                    registrada como cuenta por cobrar y el saldo se cubre con abonos posteriores; al quedar
                    en ceros el sistema marca la Fecha de Pagada.
                  </div>
                ) : (
                  <>
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
                          <small className="text-muted">
                            ≈ {formatMoney(dolaresConvertidos)} MXN
                          </small>
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
                        <span>Total Recibido</span>
                        <span>{formatMoney(totalPago)}</span>
                      </p>
                      {cambio > 0 && (
                        <>
                          <p className="d-flex justify-content-between mb-1 mt-2">
                            <span className="text-muted">Aplicado a la Orden</span>
                            <span>{formatMoney(totalAplicado)}</span>
                          </p>
                          <p className="d-flex justify-content-between fw-bold text-danger mb-0">
                            <span>Cambio a Dar</span>
                            <span>{formatMoney(cambio)}</span>
                          </p>
                        </>
                      )}
                    </div>

                    {(generaProvisional || generaDolares) && (
                      <div className="border rounded p-2 mt-3">
                        <div className="form-check">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            id="checkImprimirRecibos"
                            checked={imprimirAlFinalizar}
                            onChange={(e) => setImprimirAlFinalizar(e.target.checked)}
                          />
                          <label className="form-check-label fw-semibold" htmlFor="checkImprimirRecibos">
                            Imprimir al finalizar
                          </label>
                        </div>
                        <small className="text-muted">
                          Se generará{generaProvisional ? " un Recibo Provisional" : ""}
                          {generaProvisional && generaDolares ? " y" : ""}
                          {generaDolares ? " un Recibo de Dólares" : ""} al registrar este pago.
                        </small>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <hr className="my-3" />

            <div className="form-check">
              <input
                className="form-check-input"
                type="checkbox"
                id="checkGenerarVale"
                checked={generarVale}
                onChange={(e) => setGenerarVale(e.target.checked)}
              />
              <label className="form-check-label fw-semibold" htmlFor="checkGenerarVale">
                Generar Vale de Salida con este pago
              </label>
            </div>

            {generarVale && (
              <div className="border rounded p-3 mt-2">
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
                      data-no-uppercase
                    />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label small fw-semibold">Dig</label>
                    <input type="text" className="form-control" value={dig} readOnly data-no-uppercase />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label small fw-semibold">Quien Entrega</label>
                    <input
                      type="text"
                      className="form-control"
                      value={quienEntrega}
                      onChange={(e) => setQuienEntrega(e.target.value)}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label small fw-semibold">Estatus</label>
                    <Dropdown
                      className="form-select"
                      value={estatusVale}
                      onChange={(e) => { setEstatusVale(e.target.value); setEstatusValeEditado(true); }}
                    >
                      {ESTATUS_VALE_OPCIONES.map((op) => (
                        <Dropdown.Option key={op} value={op}>{op}</Dropdown.Option>
                      ))}
                    </Dropdown>
                    <small className="text-muted">Se sugiere solo según el Tipo del comprobante; puedes cambiarla.</small>
                  </div>
                  <div className="col-12">
                    <label className="form-label small fw-semibold">Observaciones del Vale</label>
                    <textarea
                      className="form-control"
                      rows={2}
                      value={observacionesVale}
                      onChange={(e) => setObservacionesVale(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-check mt-2">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="checkImprimirVale"
                    checked={imprimirVale}
                    onChange={(e) => setImprimirVale(e.target.checked)}
                  />
                  <label className="form-check-label" htmlFor="checkImprimirVale">
                    Imprimir vale al registrar el pago
                  </label>
                </div>
              </div>
            )}

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

function formatFechaCorta(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
