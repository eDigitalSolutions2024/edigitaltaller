import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FaPrint } from "react-icons/fa";
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
  { value: "COMBINADO", label: "Combinado" },
];
// EFECTIVO/EFECTIVO_USD desglosan el efectivo en pesos y dólares (con
// conversión, igual que el patrón de "Cantidad en Pesos/Dólares" del resto
// del formulario); los demás métodos del combinado son solo en pesos.
const MONTOS_COMBINADO_INICIAL = { EFECTIVO: "", EFECTIVO_USD: "", CREDITO: "", DEBITO: "", CHEQUE: "", TRANSFERENCIA: "" };
const MONTOS_COMBINADO_PESOS = ["EFECTIVO", "CREDITO", "DEBITO", "CHEQUE", "TRANSFERENCIA"];
// Bancos que corresponden a una terminal física (mismo catálogo que
// BANCO_A_TERMINAL en backend/utils/cierreCajaTerminales.js): con cuál se
// cobró la parte de T. Crédito/T. Débito de un pago Combinado, para que
// sume al Cierre de Caja del día.
const TERMINALES = BANCOS.filter((b) => !["DOLARES", "EFECTIVOS", "CHEQUE", "TRANSFERENCIA"].includes(b));

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

export default function CajaModalPago({ show, orden, saldoPendiente, saldoClienteDisponible = 0, onClose, onSubmit, onValeGuardado }) {
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
  const [reciboRecibio, setReciboRecibio] = useState("");
  // Desglose por método cuando formaPago === "COMBINADO"; su suma reemplaza
  // a montoPesos (ver efecto más abajo).
  const [montosCombinado, setMontosCombinado] = useState(MONTOS_COMBINADO_INICIAL);
  // Terminal con la que se cobró el T. Crédito/T. Débito del combinado.
  const [terminalCombinado, setTerminalCombinado] = useState("");
  // Terminal de un Recibo Provisional SIMPLE con tarjeta (formaPago
  // CREDITO/DEBITO). Obligatoria para que el Cierre de Caja cuadre por terminal.
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
  const [referencia, setReferencia] = useState("");
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
    setReferencia("");
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
  const montoSaldo = Math.min(Number(montoSaldoAplicado) || 0, maxSaldoAplicable);
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

  const handleSubmit = async () => {
    if (!tipoPago) {
      setError("Selecciona el tipo de pago.");
      setTipoPagoInvalido(true);
      return;
    }
    if (tipoPago === "ANTICIPO" && !anticipoDestino) {
      setError("Selecciona a qué reporte (Factura o Remisión) aplica este anticipo.");
      setAnticipoDestinoInvalido(true);
      return;
    }
    // Una Remisión a Crédito se registra sin importe: es la venta a crédito.
    // El total puede cubrirse solo con saldo (efectivo/dólares en 0).
    if (!esRemisionCredito && totalConSaldo <= 0) {
      setError("Captura una cantidad en pesos, en dólares, o de saldo a favor, mayor a 0.");
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
    if (
      comprobante === "RECIBO_PROVISIONAL" &&
      (formaPago === "CHEQUE" || (formaPago === "COMBINADO" && Number(montosCombinado.CHEQUE) > 0)) &&
      !chequeNumero.trim()
    ) {
      setError("Captura el número de cheque.");
      return;
    }
    // Cualquier cobro con tarjeta debe registrar la terminal (Cierre de Caja).
    if (tipoPago === "COMPLETO" && comprobante === "NOTA_VENTA" && !banco) {
      setError("Selecciona el banco / terminal de la Nota de Venta.");
      return;
    }
    if (
      comprobante === "RECIBO_PROVISIONAL" &&
      (formaPago === "CREDITO" || formaPago === "DEBITO") &&
      !terminalSimple
    ) {
      setError("Selecciona la terminal donde se cobró la tarjeta.");
      return;
    }
    if (
      comprobante === "RECIBO_PROVISIONAL" &&
      formaPago === "COMBINADO" &&
      (Number(montosCombinado.CREDITO) > 0 || Number(montosCombinado.DEBITO) > 0) &&
      !terminalCombinado
    ) {
      setError("Selecciona la terminal donde se cobró la parte con tarjeta del pago combinado.");
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
      }

      const { pesos, dolares } = montosAplicados();
      const pagoCreado = await onSubmit({
        tipoPago,
        comprobante,
        montoPesos: pesos,
        montoDolares: dolares,
        tipoCambio: Number(tipoCambio) || 0,
        montoSaldoAplicado: montoSaldo,
        referencia,
        observaciones,
        notas,
        ...(comprobante === "NOTA_VENTA"
          ? { banco, tipoNota }
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
      // panel de impresión (ver el bloque `if (pagoRegistrado)` más abajo) con
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

  return (
    <div
      className="modal d-block"
      tabIndex="-1"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog modal-dialog-centered modal-xl">
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
              <div className={formaPago === "COMBINADO" ? "col-md-4" : "col-md-6"}>
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

                    {tipoPago === "ANTICIPO" && (
                      <div className="mb-2">
                        <label className="form-label mb-0 fw-semibold">Aplicar a Reporte de</label>
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

                    {(formaPago === "CREDITO" || formaPago === "DEBITO") && (
                      <div className="mb-2">
                        <label className="form-label mb-0">Terminal</label>
                        <Dropdown
                          className="form-select"
                          value={terminalSimple}
                          onChange={(e) => setTerminalSimple(e.target.value)}
                        >
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
                      <label className="form-label mb-0">Recibió</label>
                      <input
                        type="text"
                        className="form-control"
                        value={reciboRecibio}
                        onChange={(e) => setReciboRecibio(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className={formaPago === "COMBINADO" ? "col-md-4" : "col-md-6"}>
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
                          title={formaPago === "COMBINADO" ? "Se calcula solo con el Efectivo en dólares del desglose combinado" : undefined}
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

                    {saldoClienteDisponible > 0 && !esAnticipoSaldo && (
                      <div className="border rounded p-2 mb-2 bg-light">
                        <label className="form-label mb-0 fw-semibold">
                          Usar saldo a favor del cliente
                        </label>
                        <div className="text-muted small mb-1">
                          Disponible: <strong>{formatMoney(saldoClienteDisponible)}</strong>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max={maxSaldoAplicable}
                          className="form-control"
                          value={montoSaldoAplicado}
                          onChange={(e) => {
                            const v = e.target.value;
                            // No solo se topa el total (ver montoSaldo): el
                            // campo mismo no debe poder quedarse mostrando
                            // más de lo que realmente se puede aplicar.
                            if (v === "" || Number.isNaN(Number(v))) {
                              setMontoSaldoAplicado(v);
                              return;
                            }
                            setMontoSaldoAplicado(
                              Number(v) > maxSaldoAplicable ? String(maxSaldoAplicable) : v
                            );
                          }}
                          placeholder="0.00"
                        />
                        <small className="text-muted">
                          Se puede combinar con efectivo/tarjeta, o cubrir todo el pago con saldo.
                        </small>
                      </div>
                    )}

                    <div className="border rounded p-2 mt-3">
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
                          No se da cambio: se registra como <strong>saldo a favor del cliente</strong> para
                          esta orden. Saldo del cliente:{" "}
                          <strong>{formatMoney(saldoClienteDisponible)}</strong> →{" "}
                          <strong>{formatMoney((Number(saldoClienteDisponible) || 0) + totalConSaldo)}</strong>
                        </div>
                      )}
                    </div>

                    {(generaProvisional || generaDolares) && (
                      <div className="border rounded p-2 mt-3">
                        <small className="text-muted">
                          Al registrar el pago se generará{generaProvisional ? " un Recibo Provisional" : ""}
                          {generaProvisional && generaDolares ? " y" : ""}
                          {generaDolares ? " un Recibo de Dólares" : ""}; podrás imprimirlo enseguida, sin cerrar
                          esta ventana.
                        </small>
                      </div>
                    )}
                  </>
                )}
              </div>

              {formaPago === "COMBINADO" && (
                <div className="col-md-4">
                  <div className="border rounded p-2 mb-2">
                    <label className="form-label mb-1 fw-semibold d-block">Desglose del pago combinado</label>
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
                </div>
              )}
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

                <small className="text-muted d-block mt-2">
                  El Vale de Salida se creará con este pago; podrás imprimirlo enseguida, sin cerrar esta ventana.
                </small>
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
