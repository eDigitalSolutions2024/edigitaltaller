import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FaPrint } from "react-icons/fa";
import "../../../styles/anticipoRecibos.css";
import Dropdown from "../../../components/Dropdown";
import PdfViewer from "../../../components/PdfViewer";
import useTipoCambioActual from "../../../hooks/useTipoCambioActual";
import { getUser } from "../../../auth";
import {
  getNotaVentaPdfUrl,
  getRemisionPdfUrl,
  getReciboProvisionalPdfUrl,
  getReciboDolaresPdfUrl,
} from "../../../api/cajas";
import {
  ESTATUS_VALE_OPCIONES,
  getSiguienteNumeroVale,
  getSiguienteDig,
  createVale,
  getValePdfUrl,
} from "../../../api/vales";

// Terminales físicas para cobros con tarjeta (mismo catálogo que
// TERMINALES_TARJETA en backend/routes/cajas.js).
const TERMINALES = ["BANREGIO", "AMERICAN EXPRESS", "BANAMEX", "BANORTE", "BBVA BANCOMER"];
// Tipo de Nota de Venta / Remisión al registrar el cobro. "Cancelada" NO se
// ofrece aquí: no es una opción de alta, es un ESTADO que fija el flujo de
// cancelación (cancelar el comprobante desde Cajas o al facturar). Elegirlo al
// registrar no cancelaba nada — solo dejaba una etiqueta engañosa.
const TIPOS_NOTA = ["Contado", "Credito"];
// `nota` es lo que se sugiere en el campo Notas (el descriptor corto que sale
// en el Reporte Diario de Remisiones), independiente de cómo se llame la opción
// en pantalla.
const TIPOS_PAGO = [
  { value: "COMPLETO", label: "Generar Comprobante", nota: "Liquida" },
  { value: "ABONO", label: "Abono", nota: "Abono" },
  { value: "ANTICIPO", label: "Anticipo", nota: "Anticipo" },
];
// Formas de pago: las usa tanto el Recibo Provisional (Abono/Anticipo) como la
// Nota de Venta (Liquida). En caso de tarjeta se pide además la terminal.
const FORMAS_PAGO = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "CREDITO", label: "T. Crédito" },
  { value: "DEBITO", label: "T. Débito" },
  { value: "CHEQUE", label: "Cheque No." },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "COMBINADO", label: "Combinado" },
];
// EFECTIVO/EFECTIVO_USD desglosan el efectivo en pesos y dólares (con
// conversión, igual que el patrón de "Cantidad en Pesos/Dólares" del resto
// del formulario); los demás métodos del combinado son solo en pesos.
const MONTOS_COMBINADO_INICIAL = { EFECTIVO: "", EFECTIVO_USD: "", CREDITO: "", DEBITO: "", CHEQUE: "", TRANSFERENCIA: "" };
const MONTOS_COMBINADO_PESOS = ["EFECTIVO", "CREDITO", "DEBITO", "CHEQUE", "TRANSFERENCIA"];

const TOTAL_PASOS = 3;
const TITULOS_PASO = ["", "Tipo de pago", "Forma de pago y montos", "Vale de salida (opcional)"];

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

export default function CajaModalPago({ show, orden, saldoPendiente, saldoClienteDisponible = 0, anticiposDisponibles = [], onClose, onSubmit, onValeGuardado }) {
  const user = getUser();

  // Paso actual del asistente (1: tipo de pago · 2: forma de pago y montos ·
  // 3: vale de salida opcional).
  const [paso, setPaso] = useState(1);

  // Sin valor inicial: el cajero debe elegir explícitamente el tipo de pago.
  const [tipoPago, setTipoPago] = useState("");
  const [tipoPagoInvalido, setTipoPagoInvalido] = useState(false);
  const [comprobante, setComprobante] = useState("");
  const [comprobanteInvalido, setComprobanteInvalido] = useState(false);

  // Datos de Nota de Venta (solo si comprobante === NOTA_VENTA)
  const [tipoNota, setTipoNota] = useState("Contado");

  // Datos de Remisión (solo si comprobante === REMISION). La Fecha de Pagada
  // no se captura aquí: la marca el backend cuando la orden se queda sin saldo
  // pendiente (ver POST /api/cajas/:id/pagos).
  const [tipoRemision, setTipoRemision] = useState("Contado");

  // Forma de pago del comprobante que mueve dinero (Recibo Provisional y Nota
  // de Venta comparten catálogo).
  const [formaPago, setFormaPago] = useState("EFECTIVO");
  const [chequeNumero, setChequeNumero] = useState("");
  const [reciboConcepto, setReciboConcepto] = useState("");
  const [reciboRecibio, setReciboRecibio] = useState("");
  // Desglose por método cuando formaPago === "COMBINADO"; su suma reemplaza
  // a montoPesos (ver efecto más abajo).
  const [montosCombinado, setMontosCombinado] = useState(MONTOS_COMBINADO_INICIAL);
  // Terminal con la que se cobró el T. Crédito/T. Débito del combinado.
  const [terminalCombinado, setTerminalCombinado] = useState("");
  // Terminal de un pago SIMPLE con tarjeta (formaPago CREDITO/DEBITO).
  // Obligatoria para que el Cierre de Caja cuadre por terminal.
  const [terminalSimple, setTerminalSimple] = useState("");

  // Solo para tipoPago === "ANTICIPO": a qué reporte diario de Cajas se suma
  // (Facturas o Remisiones), ver pago.anticipoDestino en el backend.
  const [anticipoDestino, setAnticipoDestino] = useState("");
  const [anticipoDestinoInvalido, setAnticipoDestinoInvalido] = useState(false);

  const [montoPesos, setMontoPesos] = useState("");
  const [montoDolares, setMontoDolares] = useState("");
  const [tipoCambio, setTipoCambio] = useState("");
  // Saldo a favor del cliente aplicado a este pago (pago combinado o pago
  // total con saldo). El máximo que ve el cajero es solo UX: el backend
  // siempre revalida el saldo real al guardar (ver POST /:id/pagos).
  const [montoSaldoAplicado, setMontoSaldoAplicado] = useState("");
  // Monto a usar de cada recibo de anticipo elegido: { [depositoId]: "123.45" }.
  const [anticiposSel, setAnticiposSel] = useState({});
  const [observaciones, setObservaciones] = useState("");
  const [notas, setNotas] = useState("");
  const [notasEditadas, setNotasEditadas] = useState(false);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Vale de salida (opcional, generado junto con el pago)
  const [generarVale, setGenerarVale] = useState(false);
  const [noVale, setNoVale] = useState("");
  const [dig, setDig] = useState(0);
  const [autoNumero, setAutoNumero] = useState(false);
  const [quienEntrega, setQuienEntrega] = useState("");
  const [estatusVale, setEstatusVale] = useState("Contado");
  const [estatusValeEditado, setEstatusValeEditado] = useState(false);
  const [observacionesVale, setObservacionesVale] = useState("");

  // Al terminar de registrar, el modal deja de mostrar el formulario y pasa al
  // panel de impresión: guarda el pago y el vale recién creados y ofrece un
  // botón por cada documento (Vale de Salida, Nota de Venta / Remisión, Recibo
  // Provisional, Recibo de Dólares) para imprimirlo ahí mismo antes de cerrar,
  // sin tener que buscar los botones en la pantalla de la orden.
  const [pagoRegistrado, setPagoRegistrado] = useState(null);
  const [valeRegistrado, setValeRegistrado] = useState(null);
  // Documento que se está previsualizando dentro de este mismo modal (no en
  // uno aparte): { src, fileName, titulo } o null para volver a la lista.
  const [preview, setPreview] = useState(null);

  const { tipoCambio: tipoCambioConfig, loading: cargandoTipoCambio } = useTipoCambioActual();

  // Una vez que la orden ya tiene una Remisión, no se puede generar otra
  // Remisión ni una Nota de Venta (y por lo tanto tampoco un Liquida, que
  // depende de una de las dos): solo quedan disponibles Abono/Anticipo.
  const bloqueaFacturacion = (orden.pagos || []).some((p) => p.comprobante === "REMISION");

  useEffect(() => {
    setTipoCambio(tipoCambioConfig ? String(tipoCambioConfig) : "");
  }, [tipoCambioConfig]);

  // Con forma de pago Combinado, el total en pesos y en dólares dejan de
  // capturarse a mano: pesos es la suma de los métodos en pesos del desglose,
  // y dólares es el monto en dólares del Efectivo combinado (ver inputs
  // "Cantidad en Pesos/Dólares", que se deshabilitan en ese caso).
  useEffect(() => {
    if (formaPago !== "COMBINADO") return;
    const totalPesos = MONTOS_COMBINADO_PESOS.reduce((acc, k) => acc + (Number(montosCombinado[k]) || 0), 0);
    setMontoPesos(totalPesos > 0 ? String(totalPesos) : "");
    const totalDolares = Number(montosCombinado.EFECTIVO_USD) || 0;
    setMontoDolares(totalDolares > 0 ? String(totalDolares) : "");
  }, [formaPago, montosCombinado]);

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
    setMontoSaldoAplicado("");
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
    setPaso(1);
    setTipoPago("");
    // Corresponde al tipoPago vacío de arriba: se fija aquí (no solo en el
    // efecto de [tipoPago]) porque si el modal ya estaba sin tipo de pago la
    // vez anterior, ese efecto no vuelve a dispararse al reabrir (el valor no cambia).
    setComprobante("");
    setTipoPagoInvalido(false);
    setComprobanteInvalido(false);
    setTipoNota("Contado");
    setTipoRemision("Contado");
    setFormaPago("EFECTIVO");
    setChequeNumero("");
    setMontosCombinado(MONTOS_COMBINADO_INICIAL);
    setTerminalCombinado("");
    setTerminalSimple("");
    setReciboConcepto(orden?.ordenServicio || "");
    setReciboRecibio(user?.name || user?.username || "");
    setAnticipoDestino("");
    setAnticipoDestinoInvalido(false);
    setMontoPesos("");
    setMontoDolares("");
    setMontoSaldoAplicado("");
    setAnticiposSel({});
    setObservaciones("");
    setNotas("");
    setNotasEditadas(false);
    setError("");
    setPagoRegistrado(null);
    setValeRegistrado(null);
    setPreview(null);
    setGenerarVale(false);
    setNoVale("");
    setDig(0);
    setAutoNumero(false);
    setQuienEntrega("");
    setEstatusVale("Contado");
    setEstatusValeEditado(false);
    setObservacionesVale("");
  }, [show]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!show) return null;

  // Panel de impresión: se muestra en cuanto el pago queda registrado, en
  // lugar de cerrar el modal. Reúne todos los documentos que generó este pago
  // con un botón para cada uno; la vista previa se abre DENTRO de este mismo
  // modal (no en otro aparte) y con "Volver" se regresa a la lista. El modal
  // solo se cierra con "Salir" o la ✕.
  if (pagoRegistrado) {
    const p = pagoRegistrado;
    const oid = orden._id;
    const documentos = [];
    if (valeRegistrado?._id) {
      const folioVale = `${valeRegistrado.noVale}${valeRegistrado.dig ? `-${valeRegistrado.dig}` : ""}`;
      documentos.push({
        key: "vale",
        label: `Vale de Salida N°${folioVale}`,
        clase: "btn-danger",
        src: getValePdfUrl(valeRegistrado._id),
        fileName: "vale.pdf",
        titulo: "Vale de Salida",
      });
    }
    if (p.comprobante === "NOTA_VENTA") {
      documentos.push({
        key: "nota",
        label: `Nota de Venta N°${p.notaVenta?.numero ?? ""}`,
        clase: "btn-danger",
        src: getNotaVentaPdfUrl(oid, p._id),
        fileName: "nota-venta.pdf",
        titulo: "Nota de Venta",
      });
    }
    if (p.comprobante === "REMISION") {
      documentos.push({
        key: "remision",
        label: `Remisión N°${p.remision?.numero ?? ""}`,
        clase: "btn-danger",
        src: getRemisionPdfUrl(oid, p._id),
        fileName: "remision.pdf",
        titulo: "Remisión",
      });
    }
    if (p.reciboProvisional?.numero) {
      documentos.push({
        key: "provisional",
        label: `Recibo Provisional N°${p.reciboProvisional.numero}`,
        clase: "btn-secondary",
        src: getReciboProvisionalPdfUrl(oid, p._id),
        fileName: "recibo-provisional.pdf",
        titulo: "Recibo Provisional",
      });
    }
    if (p.reciboDolares?.numero) {
      documentos.push({
        key: "dolares",
        label: `Recibo de Dólares N°${p.reciboDolares.numero}`,
        clase: "btn-info",
        src: getReciboDolaresPdfUrl(oid, p._id),
        fileName: "recibo-dolares.pdf",
        titulo: "Recibo en Dólares",
      });
    }

    // Con una vista previa abierta se usa el mismo contenedor portaleado a
    // <body> que usePdfModal (clases pdfmodal-*): así el CSS de impresión de
    // PdfViewer.css (que oculta todo lo que no sea ese contenedor) funciona
    // igual que cuando el visor se abre suelto.
    //
    // IMPORTANTE: nada aquí llama a onClose. Cerrar la vista previa (botón
    // "Volver", la ✕, o clic en el fondo) solo hace setPreview(null) y regresa
    // a la lista de documentos; el modal de pago se cierra únicamente desde esa
    // lista ("Salir" / ✕). Antes la ✕ de la previa llamaba a onClose y cerraba
    // todo el menú de golpe.
    if (preview) {
      return createPortal(
        <div
          className="position-fixed top-0 start-0 w-100 h-100 pdfmodal-backdrop"
          style={{ background: "rgba(0,0,0,.5)", zIndex: 9999 }}
          onClick={() => setPreview(null)}
        >
          <div
            className="bg-white shadow pdfmodal-box"
            style={{
              width: "92%",
              height: "92%",
              margin: "2% auto",
              borderRadius: 10,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="d-flex justify-content-between align-items-center p-2 border-bottom pdfmodal-header">
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setPreview(null)}>
                ← Volver a los documentos
              </button>
              <b className="text-truncate mx-2">{preview.titulo}</b>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => setPreview(null)}
                title="Cerrar vista previa (vuelve a la lista de documentos)"
              >
                ✕
              </button>
            </div>
            <div className="p-2 pdfmodal-body" style={{ flex: 1, overflow: "auto" }}>
              {/* Sin `key`: al cambiar de documento PdfViewer reaprovecha el
                  visor y solo recarga el `src` (ya resetea su estado en un
                  effect sobre [src]), en vez de desmontarse y volverse a
                  montar en cada cambio. */}
              <PdfViewer src={preview.src} fileName={preview.fileName} height="100%" />
            </div>
          </div>
        </div>,
        document.body
      );
    }

    return (
      <div className="modal d-block" tabIndex="-1" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title fw-bold">Pago Registrado</h5>
              <button type="button" className="btn-close" onClick={onClose} title="Salir" />
            </div>

            <div className="modal-body">

              {documentos.length > 0 ? (
                <div className="d-flex flex-column gap-2">
                  {documentos.map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      className={`btn ${d.clase} d-flex align-items-center justify-content-center gap-2`}
                      onClick={() => setPreview({ src: d.src, fileName: d.fileName, titulo: d.titulo })}
                    >
                      <FaPrint /> Ver / Imprimir {d.label}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-muted mb-0">Este pago no generó documentos para imprimir.</p>
              )}
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-success fw-semibold" onClick={onClose}>
                Salir
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const dolaresConvertidos = Number(montoDolares || 0) * Number(tipoCambio || 0);
  const totalPago = Number(montoPesos || 0) + dolaresConvertidos;

  const saldoValido =
    typeof saldoPendiente === "number" && !Number.isNaN(saldoPendiente) ? Math.max(saldoPendiente, 0) : undefined;

  // Saldo a favor del cliente que se puede aplicar a este pago: no más de lo
  // que el cliente tiene disponible, ni más de lo que falta por cubrir de la
  // orden (cuando ese dato aplica). Es solo un tope de UX — el backend
  // siempre vuelve a validar el saldo real al momento de guardar.
  const maxSaldoAplicable = Math.max(
    0,
    Math.min(saldoClienteDisponible || 0, saldoValido !== undefined ? saldoValido : Infinity)
  );
  // Monto elegido recibo por recibo (topado al restante de cada recibo).
  const montoAnticiposSel = (anticiposDisponibles || []).reduce((s, a) => {
    const v = Number(anticiposSel[a.depositoId]) || 0;
    return s + Math.max(0, Math.min(v, Number(a.restante) || 0));
  }, 0);
  const montoSaldoGenerico = Math.max(0, Number(montoSaldoAplicado) || 0);
  const montoSaldo = Math.min(montoSaldoGenerico + montoAnticiposSel, maxSaldoAplicable);
  const totalConSaldo = totalPago + montoSaldo;

  // El "cambio" (efectivo recibido de más) solo aplica a un Liquida (COMPLETO,
  // contra el total de la orden): hay un tope exacto que no debe rebasarse y
  // lo que sobre se regresa como cambio en vez de registrarse. Un Abono no
  // tiene ese tope. Un Anticipo tampoco: no se da cambio — todo lo recibido se
  // guarda como saldo a favor del cliente para esta orden (ver
  // esAnticipoSaldo). El saldo a favor aplicado nunca se "da de cambio": solo
  // el efectivo/dólares capturados se recortan para absorber el excedente
  // (ver montosAplicados).
  const cambio =
    tipoPago === "COMPLETO" && saldoValido !== undefined && totalConSaldo > saldoValido
      ? totalConSaldo - saldoValido
      : 0;
  const totalAplicado = cambio > 0 ? saldoValido : totalConSaldo;

  // Un Anticipo no se abona a la orden: su dinero se registra como saldo a
  // favor del cliente (con su forma de pago), y la orden se cobra de ese saldo
  // cuando ya tenga servicios/precio.
  const esAnticipoSaldo = tipoPago === "ANTICIPO";

  // Recibo Provisional (Abono/Anticipo) y Recibo de Dólares (montoDolares > 0)
  // se generan automáticamente al registrar el pago (ver backend/routes/cajas.js).
  const generaProvisional = tipoPago === "ABONO" || tipoPago === "ANTICIPO";
  const generaDolares = Number(montoDolares) > 0;

  // La forma de pago se captura para el comprobante que mueve dinero: Recibo
  // Provisional (Abono/Anticipo) y Nota de Venta (Liquida). Una Remisión no
  // lleva forma de pago aquí.
  const usaFormaPago =
    !esRemisionCredito && (comprobante === "RECIBO_PROVISIONAL" || comprobante === "NOTA_VENTA");
  const esProvisional = comprobante === "RECIBO_PROVISIONAL";

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

  // Análogo a montosAplicados, pero para el desglose del pago Combinado: el
  // cambio se resta primero del Efectivo (pesos y luego dólares), que es lo
  // único que realmente se puede "regresar" a medio cobro — T. Crédito/T.
  // Débito/Cheque/Transferencia quedan tal cual se capturaron.
  const combinadoAplicado = () => {
    let efectivo = Number(montosCombinado.EFECTIVO) || 0;
    let efectivoDolares = Number(montosCombinado.EFECTIVO_USD) || 0;
    if (cambio > 0) {
      const reducPesos = Math.min(efectivo, cambio);
      efectivo -= reducPesos;
      const restante = cambio - reducPesos;
      if (restante > 0 && Number(tipoCambio) > 0) {
        efectivoDolares -= Math.min(efectivoDolares, restante / Number(tipoCambio));
      }
    }
    return {
      credito: Number(montosCombinado.CREDITO) || 0,
      efectivo,
      efectivoDolares,
      debito: Number(montosCombinado.DEBITO) || 0,
      cheque: Number(montosCombinado.CHEQUE) || 0,
      transferencia: Number(montosCombinado.TRANSFERENCIA) || 0,
      banco: terminalCombinado,
    };
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

  // Valida el paso actual antes de avanzar. `handleSubmit` vuelve a revalidar
  // todo al final, así que esto es solo para no dejar avanzar con datos a medias.
  const validarPaso = (n) => {
    if (n === 1) {
      if (!tipoPago) {
        setError("Selecciona el tipo de pago.");
        setTipoPagoInvalido(true);
        return false;
      }
      if (tipoPago === "ANTICIPO" && !anticipoDestino) {
        setError("Selecciona a qué reporte (Factura o Remisión) aplica este anticipo.");
        setAnticipoDestinoInvalido(true);
        return false;
      }
      if (tipoPago === "COMPLETO" && bloqueaFacturacion) {
        setError("Esta orden ya tiene una Remisión registrada; no se puede registrar otra Remisión o Factura.");
        return false;
      }
      if (tipoPago === "COMPLETO" && !comprobante) {
        setError("Selecciona un comprobante (Nota de Venta o Remisión).");
        setComprobanteInvalido(true);
        return false;
      }
      return true;
    }
    if (n === 2) {
      if (!esRemisionCredito && totalConSaldo <= 0) {
        setError("Captura una cantidad en pesos, en dólares, o de saldo a favor, mayor a 0.");
        return false;
      }
      if (
        usaFormaPago &&
        (formaPago === "CHEQUE" || (formaPago === "COMBINADO" && Number(montosCombinado.CHEQUE) > 0)) &&
        !chequeNumero.trim()
      ) {
        setError("Captura el número de cheque.");
        return false;
      }
      if (usaFormaPago && (formaPago === "CREDITO" || formaPago === "DEBITO") && !terminalSimple) {
        setError("Selecciona la terminal donde se cobró la tarjeta.");
        return false;
      }
      if (
        usaFormaPago &&
        formaPago === "COMBINADO" &&
        (Number(montosCombinado.CREDITO) > 0 || Number(montosCombinado.DEBITO) > 0) &&
        !terminalCombinado
      ) {
        setError("Selecciona la terminal donde se cobró la parte con tarjeta del pago combinado.");
        return false;
      }
      if (Number(montoDolares) > 0 && !Number(tipoCambio)) {
        setError("No hay un tipo de cambio configurado. Regístralo en Configuración.");
        return false;
      }
      return true;
    }
    return true;
  };

  const handleAtras = () => {
    setError("");
    setPaso((p) => Math.max(1, p - 1));
  };

  const handleSiguiente = () => {
    if (!validarPaso(paso)) return;
    setError("");
    setPaso((p) => Math.min(TOTAL_PASOS, p + 1));
  };

  const handleSubmit = async () => {
    // Revalidación completa (independiente de por qué paso se llegó aquí).
    if (!validarPaso(1)) {
      setPaso(1);
      return;
    }
    if (!validarPaso(2)) {
      setPaso(2);
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
      }

      const { pesos, dolares } = montosAplicados();

      // Reparte el saldo aplicable (topado a maxSaldoAplicable vía montoSaldo)
      // entre los recibos elegidos primero y el saldo genérico después, para
      // que la suma que ve el backend nunca pase de lo permitido.
      let cupo = montoSaldo;
      const anticiposAplicadosPayload = [];
      for (const a of anticiposDisponibles || []) {
        if (cupo <= 0.005) break;
        const pedido = Math.max(0, Math.min(Number(anticiposSel[a.depositoId]) || 0, Number(a.restante) || 0));
        const usar = Math.round(Math.min(pedido, cupo) * 100) / 100;
        if (usar > 0.005) {
          anticiposAplicadosPayload.push({ depositoId: a.depositoId, monto: usar });
          cupo = Math.round((cupo - usar) * 100) / 100;
        }
      }
      const montoSaldoGenericoPayload = Math.max(0, Math.round(cupo * 100) / 100);

      const pagoCreado = await onSubmit({
        tipoPago,
        comprobante,
        montoPesos: pesos,
        montoDolares: dolares,
        tipoCambio: Number(tipoCambio) || 0,
        montoSaldoAplicado: montoSaldoGenericoPayload,
        ...(anticiposAplicadosPayload.length ? { anticiposAplicados: anticiposAplicadosPayload } : {}),
        observaciones,
        notas,
        ...(comprobante === "NOTA_VENTA"
          ? {
              formaPago,
              chequeNumero,
              terminal: terminalSimple,
              tipoNota,
              ...(formaPago === "COMBINADO" ? { combinado: combinadoAplicado() } : {}),
            }
          : comprobante === "REMISION"
          ? { tipoRemision }
          : {
              formaPago,
              chequeNumero,
              reciboConcepto,
              reciboRecibio,
              terminal: terminalSimple,
              ...(tipoPago === "ANTICIPO" ? { anticipoDestino } : {}),
              ...(formaPago === "COMBINADO" ? { combinado: combinadoAplicado() } : {}),
            }),
      });

      // El pago ya quedó registrado. En vez de cerrar el modal, se pasa al
      // panel de impresión (ver el bloque `if (pagoRegistrado)` más arriba) con
      // el pago y el vale recién creados, para imprimir ahí mismo el Vale, la
      // Nota/Remisión y los recibos antes de cerrar.
      if (pagoCreado) {
        setValeRegistrado(valeGuardado);
        setPagoRegistrado(pagoCreado);
      } else {
        onClose();
      }
    } catch (err) {
      console.error(err);
      setError("Error al registrar el pago.");
    } finally {
      setGuardando(false);
    }
  };

  // ===== Bloques reutilizables del paso 2 =====

  const bloqueFormaPago = (
    <div className="border rounded p-3 mb-3">
      <label className="form-label fw-semibold">Forma de pago</label>
      <div className="row g-2">
        {esProvisional && (
          <div className="col-sm-4">
            <label className="form-label mb-0 small text-muted">Día</label>
            <input type="text" className="form-control" value={formatFechaCorta(new Date())} readOnly data-no-uppercase />
          </div>
        )}
        <div className={esProvisional ? "col-sm-8" : "col-12"}>
          <label className="form-label mb-0 small text-muted">Método</label>
          <Dropdown className="form-select" value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>
            {FORMAS_PAGO.map((f) => (
              <Dropdown.Option key={f.value} value={f.value}>{f.label}</Dropdown.Option>
            ))}
          </Dropdown>
        </div>
      </div>

      {formaPago === "CHEQUE" && (
        <div className="mt-2">
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
        <div className="mt-2">
          <label className="form-label mb-0">Terminal</label>
          <Dropdown className="form-select" value={terminalSimple} onChange={(e) => setTerminalSimple(e.target.value)}>
            <Dropdown.Option value="">Selecciona...</Dropdown.Option>
            {TERMINALES.map((t) => (
              <Dropdown.Option key={t} value={t}>{t}</Dropdown.Option>
            ))}
          </Dropdown>
          <small className="text-muted">
            Obligatoria: en qué terminal se cobró la tarjeta (para el Cierre de Caja).
          </small>
        </div>
      )}
    </div>
  );

  const bloqueCombinado = formaPago === "COMBINADO" && (
    <div className="border rounded p-3 mb-3">
      <label className="form-label fw-semibold d-block">Desglose del pago combinado</label>
      <div className="row g-2">
        <div className="col-6 col-md-4">
          <label className="form-label mb-0 small">Efectivo (Pesos)</label>
          <input
            type="number"
            step="0.01"
            className="form-control form-control-sm"
            value={montosCombinado.EFECTIVO}
            onChange={(e) => setMontosCombinado((prev) => ({ ...prev, EFECTIVO: e.target.value }))}
          />
        </div>
        <div className="col-6 col-md-4">
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
        <div className="col-6 col-md-4">
          <label className="form-label mb-0 small">T. Crédito</label>
          <input
            type="number"
            step="0.01"
            className="form-control form-control-sm"
            value={montosCombinado.CREDITO}
            onChange={(e) => setMontosCombinado((prev) => ({ ...prev, CREDITO: e.target.value }))}
          />
        </div>
        <div className="col-6 col-md-4">
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
          <div className="col-12 col-md-4">
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
        <div className="col-6 col-md-4">
          <label className="form-label mb-0 small">No. de Cheque</label>
          <input
            type="text"
            className="form-control form-control-sm"
            value={chequeNumero}
            onChange={(e) => setChequeNumero(e.target.value)}
          />
        </div>
        <div className="col-6 col-md-4">
          <label className="form-label mb-0 small">Cantidad (Cheque)</label>
          <input
            type="number"
            step="0.01"
            className="form-control form-control-sm"
            value={montosCombinado.CHEQUE}
            onChange={(e) => setMontosCombinado((prev) => ({ ...prev, CHEQUE: e.target.value }))}
          />
        </div>
        <div className="col-12 col-md-4">
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
  );

  const bloqueAlertaCredito = esRemisionCredito && (
    <div className="alert alert-info py-2 small">
      <strong>Remisión a Crédito:</strong> no se captura importe ni referencia. La venta queda registrada como
      cuenta por cobrar y el saldo se cubre con abonos posteriores; al quedar en ceros el sistema marca la
      Fecha de Pagada.
    </div>
  );

  const bloqueMontosInput = !esRemisionCredito && (
    <>
      <div className="border rounded p-3 mb-3">
        <label className="form-label fw-semibold">Montos</label>
        <div className="row g-2">
          <div className="col-6">
            <label className="form-label mb-0 small text-muted">Cantidad en Pesos</label>
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
            <label className="form-label mb-0 small text-muted">Cantidad en Dólares</label>
            <input
              type="number"
              step="0.01"
              className="form-control"
              value={montoDolares}
              onChange={(e) => setMontoDolares(e.target.value)}
              readOnly={formaPago === "COMBINADO"}
              title={formaPago === "COMBINADO" ? "Se calcula solo con el Efectivo en dólares del desglose combinado" : undefined}
            />
            {Number(montoDolares) > 0 && Number(tipoCambio) > 0 && (
              <small className="text-muted">≈ {formatMoney(dolaresConvertidos)} MXN</small>
            )}
          </div>
          <div className="col-12">
            <label className="form-label mb-0 small text-muted">Tipo de Cambio</label>
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
        </div>
      </div>
    </>
  );

  const sumaRestanteRecibos = (anticiposDisponibles || []).reduce(
    (s, a) => s + (Number(a.restante) || 0),
    0
  );
  // Saldo del cliente que no está atado a un recibo concreto (p. ej. reembolsos
  // de usos previos): solo se puede aplicar con el campo genérico.
  const saldoSinRecibo = Math.max(
    0,
    (Number(saldoClienteDisponible) || 0) - sumaRestanteRecibos
  );

  const etiquetaRecibo = (a) => {
    // Un anticipo (ligado a una orden o no) es, sin más, un Recibo
    // Provisional — comparten la misma numeración (ver routes/anticipos.js).
    const numero = a.reciboProvisionalNumero ?? a.folioRecibo;
    const folio = numero != null ? `Recibo provisional #${numero}` : "Anticipo";
    const os = a.ordenServicio ? ` · ${a.ordenServicio}` : "";
    const f = a.fecha ? ` · ${new Date(a.fecha).toLocaleDateString("es-MX")}` : "";
    return `${folio}${os}${f}`;
  };

  // "Cómo se hizo" ese recibo: forma de pago con la que entró el anticipo (+
  // terminal, si fue tarjeta) — mismo catálogo que la Nota de Venta/Recibo
  // Provisional (Vehiculo.js FORMAS_PAGO_CAJA).
  const FORMA_PAGO_RECIBO_LABEL = {
    EFECTIVO: "Efectivo",
    TRANSFERENCIA: "Transferencia",
    CHEQUE: "Cheque",
    CREDITO: "Crédito",
    DEBITO: "Débito",
    COMBINADO: "Combinado",
  };
  const formaPagoRecibo = (a) => {
    const base = FORMA_PAGO_RECIBO_LABEL[a.formaPago] || a.formaPago || "—";
    return a.banco ? `${base} · ${a.banco}` : base;
  };

  // Selecciona/deselecciona una tarjeta de recibo. Al seleccionar, precarga
  // el campo con lo que todavía falta cubrir del pago (topado a lo
  // disponible de ESE recibo) para que, si un solo recibo alcanza, el
  // cajero no tenga que escribir nada; puede ajustarlo después.
  const toggleAnticipoSel = (a) => {
    setAnticiposSel((prev) => {
      if (prev[a.depositoId] !== undefined) {
        const next = { ...prev };
        delete next[a.depositoId];
        return next;
      }
      const restA = Number(a.restante) || 0;
      const cupoLibre = Math.max(0, maxSaldoAplicable - montoAnticiposSel - montoSaldoGenerico);
      const sugerido = Math.min(restA, cupoLibre > 0 ? cupoLibre : restA);
      return { ...prev, [a.depositoId]: String(Math.round(sugerido * 100) / 100) };
    });
  };

  const bloqueSaldoFavor = !esRemisionCredito && !esAnticipoSaldo && saldoClienteDisponible > 0 && (
    <div className="border rounded p-3 mb-3 bg-light">
      <label className="form-label mb-1 fw-semibold">Aplicar anticipo del cliente</label>
      <div className="text-muted small mb-2">
        Saldo a favor: <strong>{formatMoney(saldoClienteDisponible)}</strong>
        {saldoValido !== undefined && (
          <>
            {" "}· Máximo a este pago: <strong>{formatMoney(maxSaldoAplicable)}</strong>
          </>
        )}
      </div>

      {(anticiposDisponibles || []).length > 0 && (
        <div className="anticipo-lista mb-1">
          {anticiposDisponibles.map((a) => {
            const restA = Number(a.restante) || 0;
            const seleccionado = anticiposSel[a.depositoId] !== undefined;
            return (
              <div
                key={a.depositoId}
                role="button"
                tabIndex={0}
                className={`anticipo-fila${seleccionado ? " is-selected" : ""}`}
                onClick={() => toggleAnticipoSel(a)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleAnticipoSel(a);
                  }
                }}
              >
                <div className="anticipo-fila__header">
                  <div className="d-flex align-items-center">
                    <span className="anticipo-fila__caret">▸</span>
                    <div>
                      <div className="small fw-semibold">{etiquetaRecibo(a)}</div>
                      <div className="text-muted small">Disponible: {formatMoney(restA)}</div>
                    </div>
                  </div>
                  <span className="badge text-bg-secondary">{formaPagoRecibo(a)}</span>
                </div>

                {/* Siempre montado (para animar el despliegue con CSS); solo
                    ocupa espacio/es interactivo cuando la fila está seleccionada. */}
                <div className="anticipo-fila__expand">
                  <div className="anticipo-fila__expand-inner">
                    <div
                      className="anticipo-fila__expand-content"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <label className="form-label small mb-1">
                        ¿Cuánto se retira de este recibo?
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={restA}
                        className="form-control"
                        tabIndex={seleccionado ? 0 : -1}
                        value={anticiposSel[a.depositoId] ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setAnticiposSel((prev) => {
                            if (v === "" || Number.isNaN(Number(v))) {
                              return { ...prev, [a.depositoId]: v };
                            }
                            return {
                              ...prev,
                              [a.depositoId]: Number(v) > restA ? String(restA) : v,
                            };
                          });
                        }}
                        onFocus={(e) => e.target.select()}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(saldoSinRecibo > 0.005 || (anticiposDisponibles || []).length === 0) && (
        <div className="mt-2">
          <label className="form-label mb-0 small">
            {(anticiposDisponibles || []).length > 0 ? "Otro saldo a favor (sin recibo)" : "Monto a usar"}
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max={maxSaldoAplicable}
            className="form-control"
            value={montoSaldoAplicado}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "" || Number.isNaN(Number(v))) {
                setMontoSaldoAplicado(v);
                return;
              }
              setMontoSaldoAplicado(Number(v) > maxSaldoAplicable ? String(maxSaldoAplicable) : v);
            }}
            placeholder="0.00"
          />
        </div>
      )}

      <small className="text-muted d-block mt-2">
        Total a aplicar: <strong>{formatMoney(montoSaldo)}</strong>. Se puede combinar con efectivo/tarjeta.
      </small>
    </div>
  );

  const bloqueTotales = !esRemisionCredito && (
    <>
      <div className="border rounded p-3 mb-3">
        {formaPago === "COMBINADO" ? (
          <>
            {Number(montosCombinado.EFECTIVO) > 0 && (
              <p className="d-flex justify-content-between mb-1">
                <span className="text-muted">Efectivo (Pesos)</span>
                <span>{formatMoney(montosCombinado.EFECTIVO)}</span>
              </p>
            )}
            {Number(montosCombinado.EFECTIVO_USD) > 0 && (
              <p className="d-flex justify-content-between mb-1">
                <span className="text-muted">Efectivo (Dólares)</span>
                <span>
                  {formatMoney(dolaresConvertidos)}{" "}
                  <small className="text-muted">(${Number(montosCombinado.EFECTIVO_USD).toFixed(2)} USD)</small>
                </span>
              </p>
            )}
            {Number(montosCombinado.CREDITO) > 0 && (
              <p className="d-flex justify-content-between mb-1">
                <span className="text-muted">T. Crédito</span>
                <span>{formatMoney(montosCombinado.CREDITO)}</span>
              </p>
            )}
            {Number(montosCombinado.DEBITO) > 0 && (
              <p className="d-flex justify-content-between mb-1">
                <span className="text-muted">T. Débito</span>
                <span>{formatMoney(montosCombinado.DEBITO)}</span>
              </p>
            )}
            {Number(montosCombinado.CHEQUE) > 0 && (
              <p className="d-flex justify-content-between mb-1">
                <span className="text-muted">Cheque{chequeNumero ? ` No. ${chequeNumero}` : ""}</span>
                <span>{formatMoney(montosCombinado.CHEQUE)}</span>
              </p>
            )}
            {Number(montosCombinado.TRANSFERENCIA) > 0 && (
              <p className="d-flex justify-content-between mb-1">
                <span className="text-muted">Transferencia</span>
                <span>{formatMoney(montosCombinado.TRANSFERENCIA)}</span>
              </p>
            )}
          </>
        ) : (
          <>
            <p className="d-flex justify-content-between mb-1">
              <span className="text-muted">Pesos</span>
              <span>{formatMoney(montoPesos)}</span>
            </p>
            <p className="d-flex justify-content-between mb-1">
              <span className="text-muted">Dólares convertidos</span>
              <span>{formatMoney(dolaresConvertidos)}</span>
            </p>
          </>
        )}
        {montoSaldo > 0 && (
          <p className="d-flex justify-content-between mb-1">
            <span className="text-muted">Saldo aplicado</span>
            <span>{formatMoney(montoSaldo)}</span>
          </p>
        )}
        <hr className="my-1" />
        <p className="d-flex justify-content-between fw-bold mb-0">
          <span>Total {montoSaldo > 0 ? "(con saldo)" : "Recibido"}</span>
          <span>{formatMoney(totalConSaldo)}</span>
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
        {esAnticipoSaldo && totalConSaldo > 0 && (
          <div className="alert alert-info py-2 px-2 small mb-0 mt-2">
            No se da cambio: se registra como <strong>saldo a favor del cliente</strong> para esta orden. Saldo
            del cliente: <strong>{formatMoney(saldoClienteDisponible)}</strong> →{" "}
            <strong>{formatMoney((Number(saldoClienteDisponible) || 0) + totalConSaldo)}</strong>
          </div>
        )}
      </div>
    </>
  );

  const bloqueInfoRecibos = !esRemisionCredito && (generaProvisional || generaDolares) && (
    <div className="border rounded p-2 mb-3">
      <small className="text-muted">
        Al registrar el pago se generará{generaProvisional ? " un Recibo Provisional" : ""}
        {generaProvisional && generaDolares ? " y" : ""}
        {generaDolares ? " un Recibo de Dólares" : ""}; podrás imprimirlo enseguida, sin cerrar esta ventana.
      </small>
    </div>
  );

  const bloqueDatosRecibo = esProvisional && (
    <div className="border rounded p-3 mb-3">
      <label className="form-label fw-semibold">Datos del recibo</label>
      <div className="mb-2">
        <label className="form-label mb-0 small text-muted">Recibimos de</label>
        <input type="text" className="form-control" value={nombreClienteOrden(orden)} readOnly />
      </div>
      <div className="mb-2">
        <label className="form-label mb-0 small text-muted">Teléfono del Cliente (Celular)</label>
        <input type="text" className="form-control" value={telefonoCelularOrden(orden)} readOnly data-no-uppercase />
      </div>
      <div className="mb-2">
        <label className="form-label mb-0 small text-muted">Por concepto de</label>
        <input
          type="text"
          className="form-control"
          value={reciboConcepto}
          onChange={(e) => setReciboConcepto(e.target.value)}
        />
      </div>
      <div>
        <label className="form-label mb-0 small text-muted">Recibió</label>
        <input
          type="text"
          className="form-control"
          value={reciboRecibio}
          onChange={(e) => setReciboRecibio(e.target.value)}
        />
      </div>
    </div>
  );

  const bloqueObservaciones = comprobante === "NOTA_VENTA" || comprobante === "REMISION" ? (
    <div className="border rounded p-3 mb-3">
      <div className="mb-2">
        <label className="form-label mb-0 small text-muted">Observaciones</label>
        <textarea
          className="form-control"
          rows={2}
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
        />
      </div>
      <div>
        <label className="form-label mb-0 small text-muted">Notas</label>
        <input
          type="text"
          className="form-control"
          value={notas}
          onChange={(e) => { setNotas(e.target.value); setNotasEditadas(true); }}
          placeholder="Abono, Liquida, Anticipo…"
        />
        <small className="text-muted">Se sugiere sola según el tipo de pago; puedes cambiarla.</small>
      </div>
    </div>
  ) : null;

  // Resumen de solo lectura de lo ya elegido en pasos anteriores, para no
  // tener que retroceder a revisarlo. Crece con cada paso completado.
  const resumenPrevio = [];
  if (paso > 1 && tipoPago) {
    resumenPrevio.push({ k: "Tipo de pago", v: TIPOS_PAGO.find((t) => t.value === tipoPago)?.label || tipoPago });
    resumenPrevio.push({
      k: "Comprobante",
      v:
        tipoPago === "COMPLETO" && comprobante === "NOTA_VENTA"
          ? `Nota de Venta · ${tipoNota}`
          : tipoPago === "COMPLETO" && comprobante === "REMISION"
          ? `Remisión · ${tipoRemision}`
          : "Recibo Provisional",
    });
    if (tipoPago === "ANTICIPO") {
      resumenPrevio.push({
        k: "Aplica a",
        v:
          anticipoDestino === "NOTA_VENTA"
            ? "Reporte de Facturas"
            : anticipoDestino === "REMISION"
            ? "Reporte de Remisiones"
            : "—",
      });
    }
  }
  if (paso > 2) {
    if (usaFormaPago) {
      const term =
        (formaPago === "CREDITO" || formaPago === "DEBITO") && terminalSimple
          ? ` · ${terminalSimple}`
          : formaPago === "COMBINADO" && terminalCombinado
          ? ` · ${terminalCombinado}`
          : "";
      resumenPrevio.push({ k: "Forma de pago", v: (FORMAS_PAGO.find((f) => f.value === formaPago)?.label || formaPago) + term });
    }
    resumenPrevio.push({
      k: "Total recibido",
      v: esRemisionCredito
        ? "Sin importe (crédito)"
        : formatMoney(totalConSaldo) + (montoSaldo > 0 ? " (con saldo)" : ""),
    });
    if (cambio > 0) resumenPrevio.push({ k: "Cambio a dar", v: formatMoney(cambio) });
    if (esProvisional && reciboConcepto) resumenPrevio.push({ k: "Concepto", v: reciboConcepto });
  }

  return (
    <div className="modal d-block" tabIndex="-1" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-xl">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title fw-bold">Registrar Pago / Abono</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body">
            {saldoValido !== undefined && (
              <p className="text-muted mb-2">
                Saldo Pendiente: <strong>{formatMoney(saldoValido)}</strong>
              </p>
            )}

            {/* ===== Indicador de pasos ===== */}
            <div className="d-flex align-items-center mb-2">
              {[1, 2, 3].map((n) => (
                <React.Fragment key={n}>
                  <div
                    className={`rounded-circle d-flex align-items-center justify-content-center fw-bold flex-shrink-0 ${
                      paso >= n ? "bg-success text-white" : "bg-light text-muted border"
                    }`}
                    style={{ width: 30, height: 30, fontSize: 14 }}
                  >
                    {n}
                  </div>
                  {n < 3 && (
                    <div
                      className="flex-grow-1 mx-1"
                      style={{ height: 2, background: paso > n ? "#198754" : "#dee2e6" }}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>
            <p className="fw-semibold text-secondary mb-2">
              Paso {paso} de {TOTAL_PASOS}: {TITULOS_PASO[paso]}
            </p>

            {/* Resumen informativo (solo lectura) de lo capturado en pasos previos */}
            {resumenPrevio.length > 0 && (
              <div className="border rounded bg-light px-3 py-2 mb-3">
                <div
                  className="text-muted text-uppercase fw-semibold mb-1"
                  style={{ fontSize: 11, letterSpacing: ".3px" }}
                >
                  Ya capturado
                </div>
                <div className="d-flex flex-wrap gap-3 small">
                  {resumenPrevio.map((it) => (
                    <span key={it.k}>
                      <span className="text-muted">{it.k}:</span> <strong>{it.v}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {bloqueaFacturacion && (
              <div className="alert alert-warning py-2 small">
                Esta orden ya tiene una Remisión registrada: no se puede generar otra Remisión ni una Nota de
                Venta. Solo se pueden registrar Abonos o Anticipos (Recibo Provisional).
              </div>
            )}

            {/* ===== PASO 1: tipo de pago ===== */}
            {paso === 1 && (
              <>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Tipo de Pago</label>
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

                {tipoPago === "COMPLETO" && (
                  <>
                    <div className="mb-3">
                      <label className="form-label fw-semibold">Comprobante</label>
                      <Dropdown
                        className={`form-select${comprobanteInvalido ? " is-invalid border-danger" : ""}`}
                        value={comprobante}
                        onChange={(e) => { setComprobante(e.target.value); setComprobanteInvalido(false); }}
                      >
                        <Dropdown.Option value="">Selecciona...</Dropdown.Option>
                        <Dropdown.Option value="NOTA_VENTA">Nota de Venta</Dropdown.Option>
                        <Dropdown.Option value="REMISION">Remisión</Dropdown.Option>
                      </Dropdown>
                      {comprobanteInvalido && <small className="text-danger">Debes elegir un comprobante.</small>}
                    </div>

                    {comprobante === "NOTA_VENTA" && (
                      <div className="mb-3">
                        <label className="form-label mb-0">Tipo de Nota</label>
                        <Dropdown className="form-select" value={tipoNota} onChange={(e) => setTipoNota(e.target.value)}>
                          {TIPOS_NOTA.map((t) => (
                            <Dropdown.Option key={t} value={t}>{t}</Dropdown.Option>
                          ))}
                        </Dropdown>
                      </div>
                    )}

                    {comprobante === "REMISION" && (
                      <div className="mb-3">
                        <label className="form-label mb-0">Tipo de Remisión</label>
                        <Dropdown className="form-select" value={tipoRemision} onChange={(e) => setTipoRemision(e.target.value)}>
                          {TIPOS_NOTA.map((t) => (
                            <Dropdown.Option key={t} value={t}>{t}</Dropdown.Option>
                          ))}
                        </Dropdown>
                        <small className="text-muted">
                          La Fecha de Pagada se registra sola cuando la orden queda sin saldo pendiente.
                        </small>
                      </div>
                    )}
                  </>
                )}

                {(tipoPago === "ABONO" || tipoPago === "ANTICIPO") && (
                  <div className="mb-2">
                    <label className="form-label fw-semibold d-block">Comprobante</label>
                    <span className="badge bg-secondary">Recibo Provisional</span>
                  </div>
                )}

                {tipoPago === "ANTICIPO" && (
                  <div className="mb-2">
                    <label className="form-label fw-semibold">Aplicar a Reporte de</label>
                    <Dropdown
                      className={`form-select${anticipoDestinoInvalido ? " is-invalid border-danger" : ""}`}
                      value={anticipoDestino}
                      onChange={(e) => { setAnticipoDestino(e.target.value); setAnticipoDestinoInvalido(false); }}
                    >
                      <Dropdown.Option value="">Selecciona...</Dropdown.Option>
                      <Dropdown.Option value="NOTA_VENTA">Factura</Dropdown.Option>
                      <Dropdown.Option value="REMISION">Remisión</Dropdown.Option>
                    </Dropdown>
                    {anticipoDestinoInvalido && (
                      <small className="text-danger">Debes elegir a qué reporte aplica este anticipo.</small>
                    )}
                  </div>
                )}

                {!tipoPago && (
                  <p className="text-muted small mb-0">Selecciona un tipo de pago para continuar.</p>
                )}
              </>
            )}

            {/* ===== PASO 2: forma de pago y montos =====
                Dos columnas para que el modal crezca a lo ancho (modal-xl) en
                vez de a lo largo: a la izquierda la captura (forma de pago y
                montos), a la derecha el resultado (saldo, totales, recibo). */}
            {paso === 2 && (
              <div className="row g-3">
                <div className="col-md-6">
                  {bloqueAlertaCredito}
                  {usaFormaPago && bloqueFormaPago}
                  {usaFormaPago && bloqueCombinado}
                  {bloqueMontosInput}
                </div>
                <div className="col-md-6">
                  {bloqueSaldoFavor}
                  {bloqueTotales}
                  {bloqueInfoRecibos}
                  {bloqueDatosRecibo}
                  {bloqueObservaciones}
                </div>
              </div>
            )}

            {/* ===== PASO 3: vale de salida opcional ===== */}
            {paso === 3 && (
              <>
                <div className="form-check mb-2">
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

                {generarVale ? (
                  <div className="border rounded p-3">
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
                          required
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

                    <small className="text-muted d-block mt-2">
                      El Vale de Salida se creará con este pago; podrás imprimirlo enseguida, sin cerrar esta ventana.
                    </small>
                  </div>
                ) : (
                  <p className="text-muted small mb-0">
                    Si no necesitas Vale de Salida, pulsa <strong>Registrar Pago</strong>.
                  </p>
                )}
              </>
            )}

            {error && <p className="text-danger mt-3 mb-0">{error}</p>}
          </div>

          <div className="modal-footer justify-content-between">
            <div>
              {paso > 1 && (
                <button type="button" className="btn btn-outline-secondary" onClick={handleAtras} disabled={guardando}>
                  ← Atrás
                </button>
              )}
            </div>
            <div className="d-flex gap-2">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={guardando}>
                Cancelar
              </button>
              {paso < TOTAL_PASOS ? (
                <button type="button" className="btn btn-primary fw-semibold" onClick={handleSiguiente}>
                  Siguiente →
                </button>
              ) : (
                <button type="button" className="btn btn-success fw-semibold" onClick={handleSubmit} disabled={guardando}>
                  {guardando ? "Guardando..." : "Registrar Pago"}
                </button>
              )}
            </div>
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
