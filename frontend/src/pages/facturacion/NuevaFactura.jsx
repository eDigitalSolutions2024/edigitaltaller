import { useEffect, useMemo, useState } from "react";
import { listOrdenesServicio, getVehiculoById } from "../../api/vehiculos";
import { updateCustomer } from "../../api/customers";
import { listConceptosPreset } from "../../api/conceptosPreset";
import { generarVistaPreviaPDF } from "../../api/facturacion";
import api from "../../api/http";
import useTipoCambioActual from "../../hooks/useTipoCambioActual";
import { REGIMEN_FISCAL_OPTIONS } from "../../utils/regimenFiscal";

/* =======================
   CATÁLOGOS
======================= */

const USO_CFDI = [
  { value: "G01", label: "G01 - Adquisición de mercancías." },
  { value: "G02", label: "G02 - Devoluciones, descuentos o bonificaciones." },
  { value: "G03", label: "G03 - Gastos en general." },
  { value: "I01", label: "I01 - Construcciones." },
  { value: "I02", label: "I02 - Mobiliario y equipo de oficina por inversiones." },
  { value: "I03", label: "I03 - Equipo de transporte." },
  { value: "I04", label: "I04 - Equipo de computo y accesorios." },
  { value: "I05", label: "I05 - Dados, troqueles, moldes, matrices y herramental." },
  { value: "I06", label: "I06 - Comunicaciones telefónicas." },
  { value: "I07", label: "I07 - Comunicaciones satelitales." },
  { value: "I08", label: "I08 - Otra maquinaria y equipo." },
  { value: "D01", label: "D01 - Honorarios médicos, dentales y gastos hospitalarios." },
  { value: "D02", label: "D02 - Gastos médicos por incapacidad o discapacidad." },
  { value: "D03", label: "D03 - Gastos funerales." },
  { value: "D04", label: "D04 - Donativos." },
  { value: "D05", label: "D05 - Intereses reales efectivamente pagados por créditos hipotecarios (casa habitación)." },
  { value: "D06", label: "D06 - Aportaciones voluntarias al SAR." },
  { value: "D07", label: "D07 - Primas por seguros de gastos médicos." },
  { value: "D08", label: "D08 - Gastos de transportación escolar obligatoria." },
  { value: "D09", label: "D09 - Depósitos en cuentas para el ahorro, primas con base en planes de pensiones." },
  { value: "D10", label: "D10 - Pagos por servicios educativos (colegiaturas)." },
  { value: "S01", label: "S01 - Sin efectos fiscales." },
  { value: "CP01", label: "CP01 - Pagos" },
  { value: "CN01", label: "CN01 - Nómina" },
];

const FORMA_PAGO = [
  { value: "01", label: "01 - Efectivo" },
  { value: "02", label: "02 - Cheque nominativo" },
  { value: "03", label: "03 - Transferencia electrónica de fondos" },
  { value: "04", label: "04 - Tarjeta de crédito" },
  { value: "05", label: "05 - Monedero electrónico" },
  { value: "06", label: "06 - Dinero electrónico" },
  { value: "08", label: "08 - Vales de despensa" },
  { value: "12", label: "12 - Dación en pago" },
  { value: "13", label: "13 - Pago por subrogación" },
  { value: "14", label: "14 - Pago por consignación" },
  { value: "15", label: "15 - Condonación" },
  { value: "17", label: "17 - Compensación" },
  { value: "23", label: "23 - Novación" },
  { value: "24", label: "24 - Confusión" },
  { value: "25", label: "25 - Remisión de deuda" },
  { value: "26", label: "26 - Prescripción o caducidad" },
  { value: "27", label: "27 - A satisfacción del acreedor" },
  { value: "28", label: "28 - Tarjeta de débito" },
  { value: "29", label: "29 - Tarjeta de servicios" },
  { value: "30", label: "30 - Aplicación de anticipos" },
  { value: "31", label: "31 - Intermediario pagos" },
  { value: "99", label: "99 - Por definir" },
];

const IVA_OPTS = [
  { value: 0, label: "0%" },
  { value: 0.08, label: "8%" },
  { value: 0.16, label: "16%" },
];

const METODO_PAGO = [
  { value: "PUE", label: "PUE - Pago en una sola exhibición" },
  { value: "PPD", label: "PPD - Pago en parcialidades o diferido" },
];

function money(n) {
  const x = Number(n || 0);
  return x.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function downloadTextFile(filename, text, mime = "application/xml") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* =======================
   COMPONENTE
======================= */

export default function NuevaFactura() {
  /* ==========
     1) ORDEN DE SERVICIO / CLIENTE
  ========== */
  const [qOrden, setQOrden] = useState("");
  const [loadingOrden, setLoadingOrden] = useState(false);
  const [optsOrdenes, setOptsOrdenes] = useState([]);
  const [showOrdenes, setShowOrdenes] = useState(false);
  const [orden, setOrden] = useState(null);
  const [cliente, setCliente] = useState(null);

  const [fiscalDraft, setFiscalDraft] = useState({
    rfc: "",
    regimenFiscal: "",
    codigoPostalFiscal: "",
  });
  const [guardandoFiscal, setGuardandoFiscal] = useState(false);

  const nombreCompleto = (c) =>
    [c?.nombre, c?.apellidoPaterno, c?.apellidoMaterno].filter(Boolean).join(" ");

  const nombreFiscalCliente = (c) => {
    if (!c) return "";
    if (c.tipoCliente === "Empresa Privada" || c.tipoCliente === "Empresa Arrendadora") {
      return c.empresa?.razonSocial || nombreCompleto(c);
    }
    if (c.tipoCliente === "Empresa Gobierno") {
      return c.gobierno?.nombreGobierno || nombreCompleto(c);
    }
    return nombreCompleto(c);
  };

  const resetTodo = () => {
    setOrden(null);
    setCliente(null);
    setQOrden("");
    setShowOrdenes(false);
    setOptsOrdenes([]);
    setFiscalDraft({ rfc: "", regimenFiscal: "", codigoPostalFiscal: "" });
    setConceptos([]);
    cancelEdit();
    setXmlSigned("");
    setCadenaOriginal("");
    setSello("");
  };

  useEffect(() => {
    const t = setTimeout(async () => {
      const term = qOrden.trim();

      if (orden && term === orden.ordenServicio) {
        setShowOrdenes(false);
        return;
      }

      if (term.length < 2) {
        setOptsOrdenes([]);
        setShowOrdenes(false);
        return;
      }

      try {
        setLoadingOrden(true);
        const res = await listOrdenesServicio({ search: term, limit: 15 });
        setOptsOrdenes(res.data?.data || []);
        setShowOrdenes(true);
      } catch (e) {
        setOptsOrdenes([]);
      } finally {
        setLoadingOrden(false);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [qOrden]); // eslint-disable-line

  const onPickOrden = async (o) => {
    setQOrden(o.ordenServicio || "");
    setShowOrdenes(false);
    setOptsOrdenes([]);

    setLoadingOrden(true);
    try {
      const res = await getVehiculoById(o._id);
      const v = res.data?.vehiculo;
      setOrden(v);

      const c = v?.cliente || null;
      const clienteInfo = c
        ? {
            _id: c._id,
            tipoCliente: c.tipoCliente,
            nombre: nombreFiscalCliente(c),
            rfc: c.rfc || "",
            regimenFiscal: c.regimenFiscal || c.facturacion?.regimenFiscal || "",
            codigoPostalFiscal:
              c.codigoPostalFiscal || c.facturacion?.direccion?.codigoPostal || "",
          }
        : null;

      setCliente(clienteInfo);
      setFiscalDraft({
        rfc: clienteInfo?.rfc || "",
        regimenFiscal: clienteInfo?.regimenFiscal || "",
        codigoPostalFiscal: clienteInfo?.codigoPostalFiscal || "",
      });

      setConceptos([]);
      cancelEdit();
      setXmlSigned("");
      setCadenaOriginal("");
      setSello("");
    } catch (e) {
      alert("No se pudo cargar la orden de servicio.");
    } finally {
      setLoadingOrden(false);
    }
  };

  const faltanFiscales = useMemo(() => {
    if (!cliente) return true;
    return !cliente.rfc || !cliente.regimenFiscal || !cliente.codigoPostalFiscal;
  }, [cliente]);

  const pasoClienteOk = useMemo(
    () => !!orden && !!cliente && !faltanFiscales,
    [orden, cliente, faltanFiscales]
  );

  const guardarFiscalCliente = async () => {
    if (!cliente?._id) return;

    const rfc = String(fiscalDraft.rfc || "").trim().toUpperCase();
    const regimenFiscal = String(fiscalDraft.regimenFiscal || "").trim();
    const codigoPostalFiscal = String(fiscalDraft.codigoPostalFiscal || "").trim();

    if (!rfc || !regimenFiscal || !codigoPostalFiscal) {
      return alert("Completa RFC, régimen fiscal y CP fiscal.");
    }

    setGuardandoFiscal(true);
    try {
      await updateCustomer(cliente._id, { rfc, regimenFiscal, codigoPostalFiscal });
      setCliente((p) => ({ ...p, rfc, regimenFiscal, codigoPostalFiscal }));
    } catch (e) {
      alert(
        e?.response?.data?.error || "No se pudo guardar la información fiscal del cliente."
      );
    } finally {
      setGuardandoFiscal(false);
    }
  };

  /* ==========
     2) CONCEPTOS
  ========== */
  const [concepto, setConcepto] = useState({
    cantidad: 1,
    unidad: "Servicio",
    cProdServ: "",
    cUnidad: "E48",
    descripcion: "",
    valorUnitario: "",
  });

  const [conceptos, setConceptos] = useState([]);

  const addConcepto = () => {
    if (!pasoClienteOk) return;
    if (!String(concepto.descripcion || "").trim()) return alert("Pon una descripción.");
    if (Number(concepto.cantidad) <= 0) return alert("Cantidad inválida.");
    if (Number(concepto.valorUnitario) <= 0) return alert("V. Unit inválido.");

    const clean = {
      cantidad: Number(concepto.cantidad),
      unidad: String(concepto.unidad || "").trim(),
      cProdServ: String(concepto.cProdServ || "").trim(),
      cUnidad: String(concepto.cUnidad || "").trim(),
      descripcion: String(concepto.descripcion || "").trim(),
      valorUnitario: Number(concepto.valorUnitario),
    };

    setConceptos((prev) => [...prev, clean]);

    setConcepto({
      cantidad: 1,
      unidad: "Servicio",
      cProdServ: "",
      cUnidad: "E48",
      descripcion: "",
      valorUnitario: "",
    });
  };

  const delConcepto = (idx) => {
    setConceptos((prev) => prev.filter((_, i) => i !== idx));
    if (editRow === idx) {
      setEditRow(-1);
      setEditDraft(null);
    }
  };

  const importeConcepto = (c) => Number(c.cantidad || 0) * Number(c.valorUnitario || 0);

  /* ==========
     INLINE EDIT (tabla)
  ========== */
  const [editRow, setEditRow] = useState(-1);
  const [editDraft, setEditDraft] = useState(null);

  const startEdit = (idx) => {
    setEditRow(idx);
    setEditDraft({ ...conceptos[idx] });
  };

  const cancelEdit = () => {
    setEditRow(-1);
    setEditDraft(null);
  };

  const saveEdit = () => {
    if (!editDraft) return;

    if (!String(editDraft.descripcion || "").trim()) return alert("Pon descripción.");
    if (Number(editDraft.cantidad) <= 0) return alert("Cantidad inválida.");
    if (Number(editDraft.valorUnitario) <= 0) return alert("V. Unit inválido.");

    const clean = {
      cantidad: Number(editDraft.cantidad),
      unidad: String(editDraft.unidad || "").trim(),
      cProdServ: String(editDraft.cProdServ || "").trim(),
      cUnidad: String(editDraft.cUnidad || "").trim(),
      descripcion: String(editDraft.descripcion || "").trim(),
      valorUnitario: Number(editDraft.valorUnitario),
    };

    setConceptos((prev) => prev.map((x, i) => (i === editRow ? clean : x)));
    cancelEdit();
  };

  /* ==========
     OPCIONES DE SERVICIOS (orden + presets)
  ========== */
  const [presets, setPresets] = useState([]);

  useEffect(() => {
    listConceptosPreset()
      .then((r) => setPresets(r.data?.data || []))
      .catch(() => setPresets([]));
  }, []);

  const opcionesOrden = useMemo(() => {
    return (orden?.ventaCliente || []).map((v, i) => ({
      key: `orden-${i}`,
      cantidad: Number(v.cant || 1),
      unidad: "Servicio",
      cProdServ: v.codigoSat || "",
      cUnidad: "E48",
      descripcion: v.descripcionSat || v.concepto || v.descripcionServicio || "",
      valorUnitario: Number(v.precioVenta || 0),
    }));
  }, [orden]);

  const opcionesPreset = useMemo(() => {
    return presets.map((p) => ({
      key: `preset-${p._id}`,
      cantidad: 1,
      unidad: p.unidad,
      cProdServ: p.cProdServ,
      cUnidad: p.cUnidad,
      descripcion: p.descripcion,
      valorUnitario: Number(p.valorUnitario || 0),
    }));
  }, [presets]);

  const pickOpcion = (o) => {
    setConcepto({
      cantidad: o.cantidad || 1,
      unidad: o.unidad || "Servicio",
      cProdServ: o.cProdServ || "",
      cUnidad: o.cUnidad || "E48",
      descripcion: o.descripcion || "",
      valorUnitario: o.valorUnitario || "",
    });
  };

  /* ==========
     3) DATOS CFDI
  ========== */
  const [usoCfdi, setUsoCfdi] = useState("G03");
  const [ivaRate, setIvaRate] = useState(0.16);
  const [metodoPago, setMetodoPago] = useState("PUE");
  const [formaPago, setFormaPago] = useState("03");
  const [moneda, setMoneda] = useState("MXN");
  const [tipoCambio, setTipoCambio] = useState("");
  const { tipoCambio: tipoCambioConfig, loading: cargandoTipoCambio } = useTipoCambioActual();
  const [oc, setOc] = useState("");
  const [comentarios, setComentarios] = useState("");

  const [aplicarRetencionIsr, setAplicarRetencionIsr] = useState(false);
  const isrRate = 0.0125;

  const subtotal = useMemo(
    () => conceptos.reduce((sum, c) => sum + importeConcepto(c), 0),
    [conceptos]
  );
  const iva = useMemo(() => subtotal * Number(ivaRate || 0), [subtotal, ivaRate]);
  const isr = useMemo(
    () => (aplicarRetencionIsr ? subtotal * isrRate : 0),
    [subtotal, aplicarRetencionIsr]
  );
  const total = useMemo(() => subtotal + iva - isr, [subtotal, iva, isr]);

  useEffect(() => {
    if (moneda === "USD") {
      setTipoCambio(tipoCambioConfig ? String(tipoCambioConfig) : "");
    } else {
      setTipoCambio("");
    }
  }, [moneda, tipoCambioConfig]);

  const puedePreview = useMemo(() => {
    if (!pasoClienteOk) return false;
    if (!orden) return false;
    if (conceptos.length === 0) return false;
    if (moneda === "USD" && !Number(tipoCambio || 0)) return false;
    return true;
  }, [pasoClienteOk, orden, conceptos, moneda, tipoCambio]);

  /* ==========
     4) PREVIEW PDF
  ========== */
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);

  const buildPayload = () => ({
    cliente,
    orden: orden ? { _id: orden._id, ordenServicio: orden.ordenServicio } : null,
    conceptos,
    cfdi: {
      usoCfdi,
      ivaRate: Number(ivaRate),
      metodoPago,
      formaPago,
      moneda,
      tipoCambio: moneda === "USD" ? Number(tipoCambio || 0) : null,
      oc,
      comentarios,
      aplicarRetencionIsr,
      isrRate,
    },
  });

  const onPreviewPDF = async () => {
    if (!puedePreview) return alert("Selecciona una orden de servicio válida y agrega conceptos.");
    try {
      setPdfLoading(true);
      const res = await generarVistaPreviaPDF(buildPayload());
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (e) {
      console.error(e);
      alert("No se pudo generar la vista previa.");
    } finally {
      setPdfLoading(false);
    }
  };

  const closePdf = () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl("");
  };

  /* ==========
     5) GENERAR XML
  ========== */
  const [xmlLoading, setXmlLoading] = useState(false);
  const [xmlSigned, setXmlSigned] = useState("");
  const [cadenaOriginal, setCadenaOriginal] = useState("");
  const [sello, setSello] = useState("");

  const onGenerarXML = async () => {
    if (!puedePreview) return alert("Selecciona una orden de servicio válida y agrega conceptos.");

    try {
      setXmlLoading(true);

      // ✅ OJO: NO pongas "/api/..." aquí.
      // Tu api (axios) YA trae baseURL con /api.
      const res = await api.post("/generar-xml/xml", buildPayload());

      if (!res?.data?.ok) {
        return alert(res?.data?.error || "No se pudo generar XML.");
      }

      const data = res.data.data;
      setXmlSigned(data.xmlSigned || "");
      setCadenaOriginal(data.cadenaOriginal || "");
      setSello(data.sello || "");

      const rfc = data?.emisor?.rfc || "EMISOR";
      const folio = data?.cfdi?.folio || "sinfolio";
      const fname = `${rfc}_${folio}_cfdi.xml`;

      if (data.xmlSigned) {
        downloadTextFile(fname, data.xmlSigned, "application/xml");
        alert("✅ XML generado y descargado.");
        if (data.persistWarning) alert(data.persistWarning);
      } else {
        alert("XML generado, pero no llegó el xmlSigned.");
      }
    } catch (e) {
      console.error(e);

      // errores típicos:
      // - 404: ruta mal
      // - 500: falta emisor.key.pem o error XSLT
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        e?.message ||
        "Error al generar XML.";

      alert(msg);
    } finally {
      setXmlLoading(false);
    }
  };

  /* ==========
     UI helpers
  ========== */
  const disabledSteps = !pasoClienteOk;

  return (
    <div className="container-fluid py-3" style={{ maxWidth: 1400 }}>
      <h2>Nueva Factura</h2>

      {/* ======================
          1) ORDEN DE SERVICIO / CLIENTE
      ====================== */}
      <div className="card p-3 mb-3">
        <div className="d-flex justify-content-between align-items-center">
          <h5 className="mb-0">1) Orden de servicio</h5>

          {orden && (
            <button className="btn btn-link" onClick={resetTodo}>
              Cambiar orden
            </button>
          )}
        </div>

        {!orden && (
          <div className="mt-3 position-relative" style={{ maxWidth: 720 }}>
            <label className="form-label">Ingresar orden de servicio</label>
            <input
              className="form-control"
              value={qOrden}
              placeholder="Busca por folio de orden, placas, serie o nombre del cliente…"
              onChange={(e) => setQOrden(e.target.value)}
              onFocus={() => optsOrdenes.length && setShowOrdenes(true)}
            />

            {showOrdenes && (
              <div
                className="list-group position-absolute w-100"
                style={{ zIndex: 20, maxHeight: 300, overflow: "auto" }}
              >
                {loadingOrden && <div className="list-group-item">Buscando…</div>}

                {!loadingOrden && optsOrdenes.length === 0 && (
                  <div className="list-group-item">Sin resultados</div>
                )}

                {!loadingOrden &&
                  optsOrdenes.map((o) => (
                    <button
                      type="button"
                      key={o._id}
                      className="list-group-item list-group-item-action"
                      onClick={() => onPickOrden(o)}
                    >
                      <div className="fw-bold">{o.ordenServicio}</div>
                      <div style={{ fontSize: 13, opacity: 0.8 }}>
                        {nombreFiscalCliente(o.cliente) || "Sin cliente"} · {o.marca || "—"}{" "}
                        {o.modelo || ""} · Placas: {o.placas || "—"} · {o.estadoOrden}
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}

        {loadingOrden && !orden && <div className="mt-2 text-muted">Cargando orden…</div>}

        {orden && (
          <div className="mt-3 row g-4">
            <div className="col-12 col-md-6">
              <h6>Datos del cliente</h6>
              <div><b>Cliente:</b> {cliente?.nombre || "—"}</div>
              <div><b>RFC:</b> {cliente?.rfc || "—"}</div>
              <div>
                <b>Régimen Fiscal:</b>{" "}
                {REGIMEN_FISCAL_OPTIONS.find((r) => r.value === cliente?.regimenFiscal)?.label ||
                  cliente?.regimenFiscal ||
                  "—"}
              </div>
              <div><b>Código Postal Fiscal:</b> {cliente?.codigoPostalFiscal || "—"}</div>

              {faltanFiscales && (
                <div className="mt-3 p-2 border rounded">
                  <div className="text-danger mb-2">
                    ⚠️ Faltan datos fiscales del cliente. Captúralos para continuar.
                  </div>

                  <div className="row g-2">
                    <div className="col-12 col-md-4">
                      <label className="form-label small mb-1">RFC</label>
                      <input
                        className="form-control form-control-sm"
                        value={fiscalDraft.rfc}
                        onChange={(e) =>
                          setFiscalDraft((p) => ({ ...p, rfc: e.target.value.toUpperCase() }))
                        }
                      />
                    </div>
                    <div className="col-12 col-md-4">
                      <label className="form-label small mb-1">Régimen fiscal</label>
                      <select
                        className="form-select form-select-sm"
                        value={fiscalDraft.regimenFiscal}
                        onChange={(e) =>
                          setFiscalDraft((p) => ({ ...p, regimenFiscal: e.target.value }))
                        }
                      >
                        <option value="">-- Seleccionar --</option>
                        {REGIMEN_FISCAL_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-12 col-md-4">
                      <label className="form-label small mb-1">CP fiscal</label>
                      <input
                        className="form-control form-control-sm"
                        value={fiscalDraft.codigoPostalFiscal}
                        onChange={(e) =>
                          setFiscalDraft((p) => ({ ...p, codigoPostalFiscal: e.target.value }))
                        }
                      />
                    </div>
                  </div>

                  <button
                    className="btn btn-sm btn-danger mt-2"
                    onClick={guardarFiscalCliente}
                    disabled={guardandoFiscal}
                  >
                    {guardandoFiscal ? "Guardando..." : "Guardar datos fiscales del cliente"}
                  </button>
                </div>
              )}
            </div>

            <div className="col-12 col-md-6">
              <h6>Datos de la orden de servicio</h6>
              <div><b>Orden de servicio:</b> {orden.ordenServicio || "—"}</div>
              <div><b>Vehículo:</b> {orden.marca || "—"} {orden.modelo || ""}</div>
              <div><b>Placas:</b> {orden.placas || "—"}</div>
              <div><b>Estado:</b> {orden.estadoOrden || "—"}</div>
            </div>
          </div>
        )}
      </div>

      {/* ======================
          2) CONCEPTOS
      ====================== */}
      <div className={`card p-3 mb-3 ${disabledSteps ? "opacity-50" : ""}`}>
        <h5>2) Conceptos</h5>

        {!pasoClienteOk && (
          <div className="alert alert-warning mt-2">
            Selecciona una orden de servicio con datos fiscales completos para continuar.
          </div>
        )}

        <div className="row g-3">
          <div className="col-12 col-md-4">
            <h6>Opciones de servicios</h6>

            <div className="mb-3">
              <div className="text-muted small mb-1">De esta orden</div>
              {opcionesOrden.length === 0 ? (
                <div className="text-muted small">Sin servicios registrados en la orden.</div>
              ) : (
                <div className="list-group">
                  {opcionesOrden.map((o) => (
                    <button
                      type="button"
                      key={o.key}
                      className="list-group-item list-group-item-action py-2"
                      disabled={disabledSteps}
                      onClick={() => pickOpcion(o)}
                    >
                      <div className="fw-bold" style={{ fontSize: 13 }}>{o.descripcion || "(sin descripción)"}</div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>
                        SAT: {o.cProdServ || "—"} · {money(o.valorUnitario)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="text-muted small mb-1">Catálogo guardado</div>
              {opcionesPreset.length === 0 ? (
                <div className="text-muted small">
                  Sin conceptos guardados (agrégalos en Configuración fiscal).
                </div>
              ) : (
                <div className="list-group">
                  {opcionesPreset.map((o) => (
                    <button
                      type="button"
                      key={o.key}
                      className="list-group-item list-group-item-action py-2"
                      disabled={disabledSteps}
                      onClick={() => pickOpcion(o)}
                    >
                      <div className="fw-bold" style={{ fontSize: 13 }}>{o.descripcion}</div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>
                        SAT: {o.cProdServ || "—"} · {money(o.valorUnitario)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="col-12 col-md-8">
            <h6>Formulario con información de los conceptos</h6>

            <div className="row g-3 align-items-end">
              <div className="col-12 col-md-2">
                <label className="form-label">Cantidad</label>
                <input
                  type="number"
                  className="form-control"
                  value={concepto.cantidad}
                  disabled={disabledSteps}
                  onChange={(e) => setConcepto((p) => ({ ...p, cantidad: e.target.value }))}
                  min={1}
                />
              </div>

              <div className="col-12 col-md-3">
                <label className="form-label">Unidad</label>
                <input
                  className="form-control"
                  value={concepto.unidad}
                  disabled={disabledSteps}
                  onChange={(e) => setConcepto((p) => ({ ...p, unidad: e.target.value }))}
                />
              </div>

              <div className="col-12 col-md-3">
                <label className="form-label">CProdServ</label>
                <input
                  className="form-control"
                  list="cprodserv-catalogo"
                  value={concepto.cProdServ}
                  disabled={disabledSteps}
                  onChange={(e) => setConcepto((p) => ({ ...p, cProdServ: e.target.value }))}
                />
                <datalist id="cprodserv-catalogo">
                  {presets.map((p) => (
                    <option key={p._id} value={p.cProdServ}>
                      {p.cProdServDescripcion || p.descripcion}
                    </option>
                  ))}
                </datalist>
              </div>

              <div className="col-12 col-md-4">
                <label className="form-label">CUnidad</label>
                <input
                  className="form-control"
                  value={concepto.cUnidad}
                  disabled={disabledSteps}
                  onChange={(e) => setConcepto((p) => ({ ...p, cUnidad: e.target.value }))}
                />
              </div>

              <div className="col-12 col-md-8">
                <label className="form-label">Descripción</label>
                <input
                  className="form-control"
                  value={concepto.descripcion}
                  disabled={disabledSteps}
                  onChange={(e) => setConcepto((p) => ({ ...p, descripcion: e.target.value }))}
                />
              </div>

              <div className="col-12 col-md-4">
                <label className="form-label">V. Unit</label>
                <input
                  type="number"
                  className="form-control"
                  value={concepto.valorUnitario}
                  disabled={disabledSteps}
                  onChange={(e) => setConcepto((p) => ({ ...p, valorUnitario: e.target.value }))}
                  min={0}
                />
              </div>
            </div>

            <div className="mt-3">
              <button className="btn btn-danger" onClick={addConcepto} disabled={disabledSteps}>
                Agregar concepto
              </button>
            </div>
          </div>
        </div>

        <div className="table-responsive mt-3">
          <h6>Servicios agregados</h6>
          <table className="table table-bordered align-middle">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Cant.</th>
                <th style={{ width: 130 }}>Unidad</th>
                <th style={{ width: 140 }}>CProdServ</th>
                <th style={{ width: 120 }}>CUnidad</th>
                <th>Descripción</th>
                <th style={{ width: 150 }}>V. Unit</th>
                <th style={{ width: 150 }}>Importe</th>
                <th style={{ width: 220 }}>Acción</th>
              </tr>
            </thead>

            <tbody>
              {conceptos.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-muted">
                    Agrega al menos 1 concepto
                  </td>
                </tr>
              ) : (
                conceptos.map((c, idx) => {
                  const editing = editRow === idx;
                  const row = editing ? editDraft : c;
                  const imp = editing
                    ? Number(row?.cantidad || 0) * Number(row?.valorUnitario || 0)
                    : importeConcepto(c);

                  return (
                    <tr key={idx}>
                      <td>
                        {editing ? (
                          <input
                            type="number"
                            className="form-control"
                            value={row.cantidad}
                            min={1}
                            onChange={(e) =>
                              setEditDraft((p) => ({ ...p, cantidad: e.target.value }))
                            }
                          />
                        ) : (
                          c.cantidad
                        )}
                      </td>

                      <td>
                        {editing ? (
                          <input
                            className="form-control"
                            value={row.unidad}
                            onChange={(e) =>
                              setEditDraft((p) => ({ ...p, unidad: e.target.value }))
                            }
                          />
                        ) : (
                          c.unidad
                        )}
                      </td>

                      <td>
                        {editing ? (
                          <input
                            className="form-control"
                            value={row.cProdServ}
                            onChange={(e) =>
                              setEditDraft((p) => ({ ...p, cProdServ: e.target.value }))
                            }
                          />
                        ) : (
                          c.cProdServ
                        )}
                      </td>

                      <td>
                        {editing ? (
                          <input
                            className="form-control"
                            value={row.cUnidad}
                            onChange={(e) =>
                              setEditDraft((p) => ({ ...p, cUnidad: e.target.value }))
                            }
                          />
                        ) : (
                          c.cUnidad
                        )}
                      </td>

                      <td>
                        {editing ? (
                          <input
                            className="form-control"
                            value={row.descripcion}
                            onChange={(e) =>
                              setEditDraft((p) => ({ ...p, descripcion: e.target.value }))
                            }
                          />
                        ) : (
                          c.descripcion
                        )}
                      </td>

                      <td>
                        {editing ? (
                          <input
                            type="number"
                            className="form-control"
                            value={row.valorUnitario}
                            min={0}
                            onChange={(e) =>
                              setEditDraft((p) => ({ ...p, valorUnitario: e.target.value }))
                            }
                          />
                        ) : (
                          money(c.valorUnitario)
                        )}
                      </td>

                      <td>{money(imp)}</td>

                      <td>
                        {!editing ? (
                          <div className="d-flex gap-2">
                            <button
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => startEdit(idx)}
                            >
                              Editar
                            </button>
                            <button
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => delConcepto(idx)}
                            >
                              Eliminar
                            </button>
                          </div>
                        ) : (
                          <div className="d-flex gap-2">
                            <button className="btn btn-sm btn-success" onClick={saveEdit}>
                              Guardar
                            </button>
                            <button className="btn btn-sm btn-secondary" onClick={cancelEdit}>
                              Cancelar
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ======================
          3) DATOS CFDI
      ====================== */}
      <div className={`card p-3 mb-3 ${disabledSteps ? "opacity-50" : ""}`}>
        <h5>3) Datos de comprobante</h5>

        <div className="row g-3">
          <div className="col-12 col-md-5">
            <label className="form-label">Uso CFDI</label>
            <select
              className="form-select"
              value={usoCfdi}
              disabled={disabledSteps}
              onChange={(e) => setUsoCfdi(e.target.value)}
            >
              {USO_CFDI.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
          </div>

          <div className="col-12 col-md-2">
            <label className="form-label">IVA</label>
            <select
              className="form-select"
              value={ivaRate}
              disabled={disabledSteps}
              onChange={(e) => setIvaRate(Number(e.target.value))}
            >
              {IVA_OPTS.map((x) => (
                <option key={String(x.value)} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
          </div>

          <div className="col-12 col-md-2">
            <label className="form-label">Moneda</label>
            <select
              className="form-select"
              value={moneda}
              disabled={disabledSteps}
              onChange={(e) => setMoneda(e.target.value)}
            >
              <option value="MXN">MXN</option>
              <option value="USD">USD</option>
            </select>
          </div>

          <div className="col-12 col-md-3">
            <label className="form-label">Tipo de cambio (si USD)</label>
            <input
              className="form-control"
              value={tipoCambio}
              disabled
              readOnly
              placeholder="Ej. 17.23"
              title="Se toma del tipo de cambio definido en Configuración"
            />
            {moneda === "USD" && !cargandoTipoCambio && !tipoCambioConfig && (
              <small className="text-danger">
                No hay un tipo de cambio configurado. Regístralo en Configuración.
              </small>
            )}
          </div>

          <div className="col-12 col-md-4">
            <label className="form-label">Método de pago</label>
            <select
              className="form-select"
              value={metodoPago}
              disabled={disabledSteps}
              onChange={(e) => setMetodoPago(e.target.value)}
            >
              {METODO_PAGO.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
          </div>

          <div className="col-12 col-md-4">
            <label className="form-label">Forma de pago</label>
            <select
              className="form-select"
              value={formaPago}
              disabled={disabledSteps}
              onChange={(e) => setFormaPago(e.target.value)}
            >
              {FORMA_PAGO.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
          </div>

          <div className="col-12 col-md-4">
            <label className="form-label">Orden de compra</label>
            <input
              className="form-control"
              value={oc}
              disabled={disabledSteps}
              onChange={(e) => setOc(e.target.value)}
            />
          </div>

          <div className="col-12">
            <label className="form-label">Información extra / comentarios</label>
            <textarea
              className="form-control"
              rows={2}
              value={comentarios}
              disabled={disabledSteps}
              onChange={(e) => setComentarios(e.target.value)}
            />
          </div>

          <div className="col-12">
            <div className="form-check">
              <input
                className="form-check-input"
                type="checkbox"
                checked={aplicarRetencionIsr}
                disabled={disabledSteps}
                onChange={(e) => setAplicarRetencionIsr(e.target.checked)}
                id="isr"
              />
              <label className="form-check-label" htmlFor="isr">
                Aplicar retención ISR 1.25%
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* ======================
          TOTALES + ACCIONES
      ====================== */}
      <div className="card p-3 mb-4">
        <div className="d-flex justify-content-end">
          <div style={{ minWidth: 360 }}>
            <div className="d-flex justify-content-between">
              <b>SUBTOTAL</b>
              <span>{money(subtotal)}</span>
            </div>
            <div className="d-flex justify-content-between">
              <b>IVA</b>
              <span>{money(iva)}</span>
            </div>

            {aplicarRetencionIsr && (
              <div className="d-flex justify-content-between">
                <b>Retención ISR 1.25%</b>
                <span>- {money(isr)}</span>
              </div>
            )}

            <hr />
            <div className="d-flex justify-content-between fs-5">
              <b>TOTAL</b>
              <b>{money(total)}</b>
            </div>
          </div>
        </div>

        <div className="mt-3 d-flex gap-2 justify-content-end">
          <button
            className="btn btn-outline-secondary"
            onClick={onPreviewPDF}
            disabled={!puedePreview || pdfLoading}
          >
            {pdfLoading ? "Generando PDF..." : "Vista previa PDF"}
          </button>

          <button
            className="btn btn-primary"
            onClick={onGenerarXML}
            disabled={!puedePreview || xmlLoading}
          >
            {xmlLoading ? "Generando XML..." : "Generar XML"}
          </button>
        </div>

        {/* Debug (opcional) */}
        {(cadenaOriginal || sello) && (
          <div className="mt-3">
            <div className="alert alert-info mb-2">
              ✅ XML generado. (Abajo te dejo cadena/sello para debug si lo necesitas)
            </div>
            {cadenaOriginal && (
              <div className="mb-2">
                <b>Cadena Original:</b>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, marginTop: 6 }}>
                  {cadenaOriginal}
                </pre>
              </div>
            )}
            {sello && (
              <div className="mb-2">
                <b>Sello (base64):</b>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, marginTop: 6 }}>
                  {sello}
                </pre>
              </div>
            )}
            {xmlSigned && (
              <div>
                <b>XML firmado:</b>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, marginTop: 6, maxHeight: 240, overflow: "auto" }}>
                  {xmlSigned}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ======================
          MODAL PDF
      ====================== */}
      {pdfUrl && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100"
          style={{ background: "rgba(0,0,0,.45)", zIndex: 9999 }}
          onClick={closePdf}
        >
          <div
            className="bg-white shadow"
            style={{
              width: "92%",
              height: "92%",
              margin: "2% auto",
              borderRadius: 10,
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="d-flex justify-content-between align-items-center p-2 border-bottom">
              <b>Vista previa — Factura (sin timbrado)</b>
              <button className="btn btn-sm btn-outline-danger" onClick={closePdf}>
                Cerrar
              </button>
            </div>

            <iframe title="pdf" src={pdfUrl} style={{ width: "100%", height: "100%", border: 0 }} />
          </div>
        </div>
      )}
    </div>
  );
}
