import { useEffect, useMemo, useState } from "react";
import { buscarClientesFacturacion } from "../../api/customers";
import { generarVistaPreviaPDF } from "../../api/facturacion";
import api from "../../api/http";
import useTipoCambioActual from "../../hooks/useTipoCambioActual";

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
     1) CLIENTE
  ========== */
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [opts, setOpts] = useState([]);
  const [show, setShow] = useState(false);
  const [cliente, setCliente] = useState(null);

  const nombreCompleto = (c) =>
    [c?.nombre, c?.apellidoPaterno, c?.apellidoMaterno].filter(Boolean).join(" ");

  useEffect(() => {
    const t = setTimeout(async () => {
      const term = q.trim();

      if (cliente && term === cliente.nombre) {
        setShow(false);
        return;
      }

      if (term.length < 2) {
        setOpts([]);
        setShow(false);
        return;
      }

      try {
        setLoading(true);
        const res = await buscarClientesFacturacion(term);
        setOpts(res.data.data || []);
        setShow(true);
      } catch (e) {
        setOpts([]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line

  const onPick = (c) => {
    const full = nombreCompleto(c);
    setCliente({
      _id: c._id,
      nombre: full,
      email: c.email || "",
      rfc: c.rfc || "",
      regimenFiscal: c.regimenFiscal || c.facturacion?.regimenFiscal || "",
      codigoPostalFiscal:
        c.codigoPostalFiscal ||
        c.facturacion?.direccion?.codigoPostal ||
        "",
    });
    setQ(full);
    setShow(false);
    setOpts([]);
  };

  const faltanFiscales = useMemo(() => {
    if (!cliente) return true;
    return (
      !cliente.rfc ||
      !cliente.regimenFiscal ||
      !cliente.codigoPostalFiscal
    );
  }, [cliente]);

  const pasoClienteOk = useMemo(() => !!cliente && !faltanFiscales, [cliente, faltanFiscales]);

  /* ==========
     2) CONCEPTOS
  ========== */
  const [concepto, setConcepto] = useState({
    cantidad: 1,
    unidad: "Servicio",
    cProdServ: "78181508",
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
      cProdServ: "78181508",
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
    if (conceptos.length === 0) return false;
    if (moneda === "USD" && !Number(tipoCambio || 0)) return false;
    return true;
  }, [pasoClienteOk, conceptos, moneda, tipoCambio]);

  /* ==========
     4) PREVIEW PDF
  ========== */
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);

  const buildPayload = () => ({
    cliente,
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
    if (!puedePreview) return alert("Selecciona cliente válido y agrega conceptos.");
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
    if (!puedePreview) return alert("Selecciona cliente válido y agrega conceptos.");

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
      const folio = data?.cfdi?.folio || "sinfolo";
      const fname = `${rfc}_${folio}_cfdi.xml`;

      if (data.xmlSigned) {
        downloadTextFile(fname, data.xmlSigned, "application/xml");
        alert("✅ XML generado y descargado.");
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
          1) CLIENTE
      ====================== */}
      <div className="card p-3 mb-3">
        <div className="d-flex justify-content-between align-items-center">
          <h5 className="mb-0">1) Cliente</h5>

          {cliente && (
            <button
              className="btn btn-link"
              onClick={() => {
                setCliente(null);
                setQ("");
                setShow(false);
                setConceptos([]);
                cancelEdit();
                setXmlSigned("");
                setCadenaOriginal("");
                setSello("");
              }}
            >
              Cambiar cliente
            </button>
          )}
        </div>

        <div className="mt-3 position-relative" style={{ maxWidth: 720 }}>
          <label className="form-label">Buscar cliente</label>
          <input
            className="form-control"
            value={q}
            placeholder="Busca por nombre, correo o RFC…"
            onChange={(e) => {
              setQ(e.target.value);
              setCliente(null);
            }}
            onFocus={() => opts.length && setShow(true)}
          />

          {show && (
            <div
              className="list-group position-absolute w-100"
              style={{ zIndex: 20, maxHeight: 260, overflow: "auto" }}
            >
              {loading && <div className="list-group-item">Buscando…</div>}

              {!loading && opts.length === 0 && (
                <div className="list-group-item">Sin resultados</div>
              )}

              {!loading &&
                opts.map((c) => (
                  <button
                    type="button"
                    key={c._id}
                    className="list-group-item list-group-item-action"
                    onClick={() => onPick(c)}
                  >
                    <div className="fw-bold">{nombreCompleto(c)}</div>
                    <div style={{ fontSize: 13, opacity: 0.8 }}>
                      RFC: {c.rfc || "—"} · Régimen: {c.regimenFiscal || "—"} · CP:{" "}
                      {c.codigoPostalFiscal || "—"}
                    </div>
                  </button>
                ))}
            </div>
          )}
        </div>

        {cliente && (
          <div className="mt-3">
            <div><b>Cliente:</b> {cliente.nombre}</div>
            <div><b>RFC:</b> {cliente.rfc || "—"}</div>
            <div><b>Régimen Fiscal:</b> {cliente.regimenFiscal || "—"}</div>
            <div><b>Código Postal Fiscal:</b> {cliente.codigoPostalFiscal || "—"}</div>

            {faltanFiscales && (
              <div className="text-danger mt-2">
                ⚠️ Faltan datos fiscales (RFC/Régimen/CP). Completa en Clientes antes de facturar.
              </div>
            )}
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
            Selecciona un cliente con datos fiscales completos para continuar.
          </div>
        )}

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

          <div className="col-12 col-md-2">
            <label className="form-label">Unidad</label>
            <input
              className="form-control"
              value={concepto.unidad}
              disabled={disabledSteps}
              onChange={(e) => setConcepto((p) => ({ ...p, unidad: e.target.value }))}
            />
          </div>

          <div className="col-12 col-md-2">
            <label className="form-label">CProdServ</label>
            <input
              className="form-control"
              value={concepto.cProdServ}
              disabled={disabledSteps}
              onChange={(e) => setConcepto((p) => ({ ...p, cProdServ: e.target.value }))}
            />
          </div>

          <div className="col-12 col-md-2">
            <label className="form-label">CUnidad</label>
            <input
              className="form-control"
              value={concepto.cUnidad}
              disabled={disabledSteps}
              onChange={(e) => setConcepto((p) => ({ ...p, cUnidad: e.target.value }))}
            />
          </div>

          <div className="col-12 col-md-3">
            <label className="form-label">Descripción</label>
            <input
              className="form-control"
              value={concepto.descripcion}
              disabled={disabledSteps}
              onChange={(e) => setConcepto((p) => ({ ...p, descripcion: e.target.value }))}
            />
          </div>

          <div className="col-12 col-md-1">
            <label className="form-label">V. Unit</label>
            <input
              type="number"
              className="form-control"
              value={concepto.valorUnitario}
              disabled={disabledSteps}
              onChange={(e) => setConcepto((p) => ({ ...p, valorUnitario: e.target.value }))}
              min={0}
              style={{ minWidth: 110 }}
            />
          </div>
        </div>

        <div className="mt-3">
          <button className="btn btn-danger" onClick={addConcepto} disabled={disabledSteps}>
            Agregar concepto
          </button>
        </div>

        <div className="table-responsive mt-3">
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
