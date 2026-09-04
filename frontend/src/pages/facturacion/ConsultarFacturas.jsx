import { useCallback, useEffect, useRef, useState } from "react";
import Dropdown from "../../components/Dropdown";
import usePdfModal from "../../hooks/usePdfModal";
import {
  listFacturasCfdi,
  getFacturaCfdiById,
  getFacturaCfdiPdf,
  exportFacturasCfdiZip,
} from "../../api/facturasCfdi";

function money(n) {
  const x = Number(n || 0);
  return x.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function fecha(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-MX", { year: "numeric", month: "2-digit", day: "2-digit" });
}

// Una factura puede agrupar varias órdenes de servicio; las facturas viejas
// solo guardaron la principal en `orden`.
function ordenesDeFactura(f) {
  const folios = (f.ordenes?.length ? f.ordenes : f.orden ? [f.orden] : [])
    .map((o) => o?.ordenServicio)
    .filter(Boolean);
  return folios.length ? folios.join(", ") : "—";
}

function nombreZipExport() {
  return `facturas_${Date.now()}.zip`;
}

const METODO_PAGO_LABEL = {
  PUE: "PUE - Pago en una sola exhibición",
  PPD: "PPD - Pago en parcialidades o diferido",
};
const FORMA_PAGO_LABEL = {
  "01": "01 - Efectivo",
  "02": "02 - Cheque nominativo",
  "03": "03 - Transferencia electrónica de fondos",
  "04": "04 - Tarjeta de crédito",
  "15": "15 - Condonación",
  "28": "28 - Tarjeta de débito",
  "30": "30 - Aplicación de anticipos",
  "99": "99 - Por definir",
};
const TIPO_FACTURA_LABEL = {
  factura: "Factura (Ingreso)",
  notaCredito: "Nota de crédito (Egreso)",
  complementoPago: "Complemento de pago",
  facturaGlobal: "Factura global (Público en general)",
};

function CampoDetalle({ label, children }) {
  return (
    <div className="col-12 col-md-4 mb-2">
      <div className="text-muted small">{label}</div>
      <div className="fw-semibold" style={{ wordBreak: "break-word" }}>
        {children == null || children === "" ? "—" : children}
      </div>
    </div>
  );
}

/* Vista de solo lectura de una factura ya emitida: re-arma el formulario de
   facturación a partir del snapshot guardado (sin editar, sin vista previa). */
function FacturaDetalleModal({ factura: f, onClose }) {
  if (!f) return null;
  const c = f.cfdi || {};
  const cli = f.cliente || {};
  const t = f.totales || {};
  const dir = cli.direccion || {};
  const folio = [f.serie, f.folio].filter(Boolean).join("-") || "—";
  const condicion = c.metodoPago === "PPD" ? "Crédito" : "Contado";
  const ivaPct = c.ivaRate != null ? `${Math.round(Number(c.ivaRate) * 100)}%` : "—";
  const dirTxt = [
    dir.calle,
    dir.numeroExterior && `#${dir.numeroExterior}`,
    dir.numeroInterior && `int. ${dir.numeroInterior}`,
    dir.colonia,
    dir.codigoPostal,
    dir.ciudad,
    dir.estado,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100"
      style={{ background: "rgba(0,0,0,.45)", zIndex: 9999 }}
      onClick={onClose}
    >
      <div
        className="bg-white shadow"
        style={{
          width: "94%",
          maxWidth: 980,
          maxHeight: "92%",
          margin: "3% auto",
          borderRadius: 10,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="d-flex justify-content-between align-items-center p-2 border-bottom">
          <b>
            Detalle de facturación — Folio {folio}{" "}
            <span className="badge bg-light text-dark ms-1">solo consulta</span>
          </b>
          <button className="btn btn-sm btn-outline-danger" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <div className="p-3" style={{ overflow: "auto" }}>
          <h6 className="text-uppercase text-muted small">Comprobante</h6>
          <div className="row">
            <CampoDetalle label="Tipo">{TIPO_FACTURA_LABEL[f.tipoFactura] || f.tipoFactura}</CampoDetalle>
            <CampoDetalle label="Folio">{folio}</CampoDetalle>
            <CampoDetalle label="Fecha">{fecha(f.fecha)}</CampoDetalle>
            <CampoDetalle label="Uso CFDI">{c.usoCfdi}</CampoDetalle>
            <CampoDetalle label="Método de pago">{METODO_PAGO_LABEL[c.metodoPago] || c.metodoPago}</CampoDetalle>
            <CampoDetalle label="Forma de pago">{FORMA_PAGO_LABEL[c.formaPago] || c.formaPago}</CampoDetalle>
            <CampoDetalle label="Condición">{condicion}</CampoDetalle>
            <CampoDetalle label="Moneda">
              {c.moneda}
              {c.moneda === "USD" && c.tipoCambio ? ` · TC ${c.tipoCambio}` : ""}
            </CampoDetalle>
            <CampoDetalle label="IVA">{ivaPct}</CampoDetalle>
            <CampoDetalle label="Orden de compra">{c.oc}</CampoDetalle>
            <CampoDetalle label="Retención ISR">{c.aplicarRetencionIsr ? "Sí (1.25%)" : "No"}</CampoDetalle>
            <CampoDetalle label="Estatus">{f.estatus === "cancelada" ? "Cancelada" : "Generada"}</CampoDetalle>
          </div>
          {c.comentarios ? (
            <div className="mb-2">
              <div className="text-muted small">Comentarios</div>
              <div>{c.comentarios}</div>
            </div>
          ) : null}

          <h6 className="text-uppercase text-muted small mt-3">Receptor</h6>
          <div className="row">
            <CampoDetalle label="Nombre (facturado)">{cli.nombre}</CampoDetalle>
            <CampoDetalle label="RFC">{cli.rfc}</CampoDetalle>
            <CampoDetalle label="Régimen fiscal">{cli.regimenFiscal}</CampoDetalle>
            <CampoDetalle label="CP fiscal">{cli.codigoPostalFiscal}</CampoDetalle>
            <CampoDetalle label="Domicilio">{dirTxt}</CampoDetalle>
          </div>
          {f.notaFacturacion ? (
            <div className="alert alert-warning py-2 px-3 small mb-2">{f.notaFacturacion}</div>
          ) : null}

          <h6 className="text-uppercase text-muted small mt-3">Conceptos</h6>
          <div className="table-responsive">
            <table className="table table-sm table-bordered align-middle mb-2">
              <thead className="table-light">
                <tr>
                  <th>Cant.</th>
                  <th>Unidad</th>
                  <th>ClaveProdServ</th>
                  <th>ClaveUnidad</th>
                  <th>Descripción</th>
                  <th>No. Ident.</th>
                  <th className="text-end">Valor unit.</th>
                  <th className="text-end">Importe</th>
                </tr>
              </thead>
              <tbody>
                {(f.conceptos || []).map((x, i) => (
                  <tr key={i}>
                    <td>{x.cantidad}</td>
                    <td>{x.unidad}</td>
                    <td>{x.cProdServ}</td>
                    <td>{x.cUnidad}</td>
                    <td>{x.descripcion}</td>
                    <td>{x.noIdentificacion || "—"}</td>
                    <td className="text-end">{money(x.valorUnitario)}</td>
                    <td className="text-end">
                      {money(Number(x.cantidad || 0) * Number(x.valorUnitario || 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {f.tipoFactura === "facturaGlobal" && (f.notasVenta?.length ?? 0) > 0 && (
            <>
              <h6 className="text-uppercase text-muted small mt-2">Notas de venta agrupadas</h6>
              <div className="table-responsive">
                <table className="table table-sm table-bordered mb-2">
                  <thead className="table-light">
                    <tr>
                      <th>Nota</th>
                      <th>Orden</th>
                      <th className="text-end">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.notasVenta.map((n, i) => (
                      <tr key={i}>
                        <td>#{n.numero ?? "—"}</td>
                        <td>{n.ordenServicio || "—"}</td>
                        <td className="text-end">{money(n.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="d-flex justify-content-end">
            <div style={{ minWidth: 280 }}>
              <div className="d-flex justify-content-between">
                <span>Subtotal</span>
                <span>{money(t.subtotal)}</span>
              </div>
              {Number(t.descuento) > 0 && (
                <div className="d-flex justify-content-between">
                  <span>Descuento</span>
                  <span>- {money(t.descuento)}</span>
                </div>
              )}
              <div className="d-flex justify-content-between">
                <span>IVA</span>
                <span>{money(t.iva)}</span>
              </div>
              {Number(t.isr) > 0 && (
                <div className="d-flex justify-content-between">
                  <span>Retención ISR</span>
                  <span>- {money(t.isr)}</span>
                </div>
              )}
              <hr className="my-1" />
              <div className="d-flex justify-content-between fw-bold fs-5">
                <span>Total</span>
                <span>{money(t.total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function descargarZipBlob(data, nombre) {
  const blob = new Blob([data], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ConsultarFacturas() {
  const [filtros, setFiltros] = useState({ q: "", desde: "", hasta: "", estatus: "todos", condicion: "todos" });
  const [docs, setDocs] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalDocs, setTotalDocs] = useState(0);
  const [cargando, setCargando] = useState(false);

  const debounceRef = useRef(null);

  const buscar = useCallback(async (nuevosFiltros = filtros, nuevaPagina = 1) => {
    setCargando(true);
    try {
      const res = await listFacturasCfdi({ ...nuevosFiltros, page: nuevaPagina, limit: 10 });
      setDocs(res.data?.docs || []);
      setPage(res.data?.page || 1);
      setTotalPages(res.data?.totalPages || 1);
      setTotalDocs(res.data?.totalDocs || 0);
    } catch (e) {
      setDocs([]);
    } finally {
      setCargando(false);
    }
  }, [filtros]);

  useEffect(() => {
    buscar(filtros, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFiltro = (campo, valor) => {
    const nuevos = { ...filtros, [campo]: valor };
    setFiltros(nuevos);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (campo === "q") {
      debounceRef.current = setTimeout(() => buscar(nuevos, 1), 400);
    } else {
      buscar(nuevos, 1);
    }
  };

  const limpiar = () => {
    const vacio = { q: "", desde: "", hasta: "", estatus: "todos", condicion: "todos" };
    setFiltros(vacio);
    buscar(vacio, 1);
  };

  /* ==========
     VER XML
  ========== */
  const [xmlLoading, setXmlLoading] = useState(false);
  const [xmlModal, setXmlModal] = useState(null); // { folio, xml }

  const verXml = async (id) => {
    setXmlLoading(true);
    try {
      const res = await getFacturaCfdiById(id);
      const data = res.data?.data;
      setXmlModal({ folio: data?.folio, xml: data?.xml || "" });
    } catch (e) {
      alert("No se pudo cargar el XML de esta factura.");
    } finally {
      setXmlLoading(false);
    }
  };

  const cerrarXmlModal = () => setXmlModal(null);

  /* ==========
     DETALLE (solo consulta) — clic en la fila fuera del modo selección
  ========== */
  const [detalle, setDetalle] = useState(null);
  const abrirDetalle = (f) => setDetalle(f);
  const cerrarDetalle = () => setDetalle(null);

  /* ==========
     VER PDF
  ========== */
  const [pdfLoadingId, setPdfLoadingId] = useState(null);
  const { pdfModal, abrirPdf } = usePdfModal();

  const verPdf = async (f) => {
    setPdfLoadingId(f._id);
    try {
      const res = await getFacturaCfdiPdf(f._id);
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const folio = [f.serie, f.folio].filter(Boolean).join("-");
      abrirPdf(
        url,
        `factura_${folio.replace(/[^\w-]/g, "") || "cfdi"}.pdf`,
        `PDF — Folio ${folio || "—"}`,
        () => URL.revokeObjectURL(url)
      );
    } catch (e) {
      console.error(e);
      alert("No se pudo generar el PDF de esta factura.");
    } finally {
      setPdfLoadingId(null);
    }
  };

  /* ==========
     SELECCIÓN / EXPORTAR
  ========== */
  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [seleccionadas, setSeleccionadas] = useState({}); // { [id]: folioLabel }
  const [exportMenuAbierto, setExportMenuAbierto] = useState(false);
  const [exportando, setExportando] = useState(false);

  const idsSeleccionados = Object.keys(seleccionadas);

  const toggleModoSeleccion = () => {
    setModoSeleccion((activo) => {
      if (activo) {
        setSeleccionadas({});
        setExportMenuAbierto(false);
      }
      return !activo;
    });
  };

  const toggleFactura = (f) => {
    setSeleccionadas((prev) => {
      const next = { ...prev };
      if (next[f._id]) {
        delete next[f._id];
      } else {
        next[f._id] = [f.serie, f.folio].filter(Boolean).join("-") || "—";
      }
      return next;
    });
  };

  const exportarZip = async () => {
    setExportMenuAbierto(false);
    setExportando(true);
    try {
      const res = await exportFacturasCfdiZip(idsSeleccionados);
      descargarZipBlob(res.data, nombreZipExport());
      setSeleccionadas({});
    } catch (e) {
      console.error(e);
      alert("No se pudo generar el ZIP de las facturas seleccionadas.");
    } finally {
      setExportando(false);
    }
  };

  // Abre el cliente de correo predeterminado con los archivos ya cargados.
  // Un enlace mailto: nunca puede llevar adjuntos reales (restricción del
  // navegador), así que primero intentamos el panel de "compartir" nativo
  // del sistema (adjunta el ZIP de verdad si el usuario elige su app de
  // correo); si el navegador no lo soporta, descargamos el ZIP y abrimos
  // el correo con destinatario y asunto vacíos, avisando que hay que
  // adjuntarlo a mano.
  const enviarPorCorreo = async () => {
    setExportMenuAbierto(false);
    setExportando(true);
    try {
      const res = await exportFacturasCfdiZip(idsSeleccionados);
      const nombre = nombreZipExport();
      const folios = Object.values(seleccionadas).join(", ");
      let compartido = false;

      if (navigator.share) {
        try {
          const archivo = new File([res.data], nombre, { type: "application/zip" });
          if (navigator.canShare?.({ files: [archivo] })) {
            await navigator.share({ files: [archivo] });
            compartido = true;
          }
        } catch (shareErr) {
          if (shareErr?.name === "AbortError") {
            // El usuario canceló el diálogo de compartir; dejamos la
            // selección intacta para que pueda intentarlo de nuevo.
            return;
          }
          console.warn("No se pudo usar el panel de compartir, se usará el respaldo de correo:", shareErr);
        }
      }

      if (!compartido) {
        descargarZipBlob(res.data, nombre);
        const cuerpo = encodeURIComponent(
          `Se descargó el archivo "${nombre}" con las facturas seleccionadas (folios: ${folios}).\n\nAdjunta ese archivo antes de enviar este correo.`
        );
        window.location.href = `mailto:?subject=&body=${cuerpo}`;
      }

      setSeleccionadas({});
    } catch (e) {
      console.error(e);
      alert("No se pudieron preparar las facturas para enviar por correo.");
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="container-fluid py-3" style={{ maxWidth: 1400 }}>
      <h2 className="mb-3">Historial de facturas</h2>

      {/* Filtros */}
      <div className="card p-3 mb-3">
        <div className="row g-3">
          <div className="col-12 col-md-4">
            <label className="form-label">Buscar</label>
            <input
              className="form-control"
              placeholder="Folio, cliente, RFC u orden de servicio…"
              value={filtros.q}
              onChange={(e) => onFiltro("q", e.target.value)}
            />
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label">Desde</label>
            <input
              type="date"
              className="form-control"
              value={filtros.desde}
              onChange={(e) => onFiltro("desde", e.target.value)}
            />
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label">Hasta</label>
            <input
              type="date"
              className="form-control"
              value={filtros.hasta}
              onChange={(e) => onFiltro("hasta", e.target.value)}
            />
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label">Estatus</label>
            <Dropdown
              className="form-select"
              value={filtros.estatus}
              onChange={(e) => onFiltro("estatus", e.target.value)}
            >
              <Dropdown.Option value="todos">Todos</Dropdown.Option>
              <Dropdown.Option value="generada">Generada</Dropdown.Option>
              <Dropdown.Option value="cancelada">Cancelada</Dropdown.Option>
            </Dropdown>
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label">Tipo</label>
            <Dropdown
              className="form-select"
              value={filtros.condicion}
              onChange={(e) => onFiltro("condicion", e.target.value)}
            >
              <Dropdown.Option value="todos">Todos</Dropdown.Option>
              <Dropdown.Option value="contado">Contado</Dropdown.Option>
              <Dropdown.Option value="credito">Crédito</Dropdown.Option>
            </Dropdown>
          </div>
          <div className="col-6 col-md-2 d-flex align-items-end">
            <button className="btn btn-outline-secondary w-100" onClick={limpiar}>
              Limpiar
            </button>
          </div>
        </div>
      </div>

      {/* Resultados */}
      <div className="card p-3">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <span className="text-muted small">
            {cargando ? "Buscando…" : `${totalDocs} factura(s) encontrada(s)`}
          </span>
          <button
            className={`btn btn-sm ${modoSeleccion ? "btn-primary" : "btn-outline-secondary"}`}
            onClick={toggleModoSeleccion}
          >
            Seleccionar Facturas
          </button>
        </div>

        {modoSeleccion && idsSeleccionados.length === 0 && (
          <div className="alert alert-info d-flex align-items-center gap-2 py-2 mb-2" role="status">
            <span className="small">
              Modo selección activo: haz clic sobre una factura de la tabla para seleccionarla.
            </span>
          </div>
        )}

        {modoSeleccion && idsSeleccionados.length > 0 && (
          <div className="d-flex justify-content-between align-items-start gap-3 p-2 mb-2 rounded border" style={{ background: "#eaf3ff" }}>
            <div>
              <div className="fw-semibold small">
                {idsSeleccionados.length} factura(s) seleccionada(s)
              </div>
              <div className="d-flex flex-wrap gap-1 mt-1">
                {Object.values(seleccionadas).map((folio, i) => (
                  <span key={i} className="badge bg-primary-subtle text-primary border">
                    {folio}
                  </span>
                ))}
              </div>
            </div>

            <div className="position-relative">
              <button
                className="btn btn-sm btn-primary"
                onClick={() => setExportMenuAbierto((v) => !v)}
                disabled={exportando}
              >
                {exportando ? "Procesando…" : "Exportar ▾"}
              </button>

              {exportMenuAbierto && (
                <>
                  <div
                    className="position-fixed top-0 start-0 w-100 h-100"
                    style={{ zIndex: 20 }}
                    onClick={() => setExportMenuAbierto(false)}
                  />
                  <div
                    className="position-absolute bg-white border rounded shadow-sm py-1"
                    style={{ top: "100%", right: 0, marginTop: 4, minWidth: 260, zIndex: 21 }}
                  >
                    <button
                      className="btn btn-sm btn-light w-100 text-start rounded-0"
                      style={{ whiteSpace: "nowrap" }}
                      onClick={exportarZip}
                      disabled={exportando}
                    >
                      Descargar como ZIP
                    </button>
                    <button
                      className="btn btn-sm btn-light w-100 text-start rounded-0"
                      style={{ whiteSpace: "nowrap" }}
                      onClick={enviarPorCorreo}
                      disabled={exportando}
                    >
                      Enviar por correo
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div className="table-responsive">
          <table className="table table-sm table-bordered table-hover align-middle">
            <thead>
              <tr>
                <th>Folio</th>
                <th>Cliente</th>
                <th>RFC</th>
                <th>Fecha</th>
                <th>Orden de servicio</th>
                <th>Total</th>
                <th>Estatus</th>
                <th style={{ width: 280 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-muted">
                    {cargando ? "Buscando…" : "Sin facturas para mostrar"}
                  </td>
                </tr>
              ) : (
                docs.map((f) => (
                  <tr
                    key={f._id}
                    className={seleccionadas[f._id] ? "table-primary" : ""}
                    style={{ cursor: "pointer" }}
                    onClick={() => (modoSeleccion ? toggleFactura(f) : abrirDetalle(f))}
                  >
                    <td>{[f.serie, f.folio].filter(Boolean).join("-") || "—"}</td>
                    <td>
                      {f.cliente?.nombre || "—"}
                      {f.notaFacturacion && (
                        <span
                          className="badge bg-warning text-dark ms-1"
                          title={f.notaFacturacion}
                        >
                          nota
                        </span>
                      )}
                    </td>
                    <td>{f.cliente?.rfc || "—"}</td>
                    <td>{fecha(f.fecha)}</td>
                    <td>{ordenesDeFactura(f)}</td>
                    <td>{money(f.totales?.total)}</td>
                    <td>
                      <span className={`badge ${f.estatus === "cancelada" ? "bg-secondary" : "bg-success"}`}>
                        {f.estatus === "cancelada" ? "Cancelada" : "Generada"}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="d-flex gap-2">
                        <button
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => verXml(f._id)}
                          disabled={xmlLoading}
                        >
                          Ver XML
                        </button>
                        <button
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => verPdf(f)}
                          disabled={pdfLoadingId === f._id}
                        >
                          {pdfLoadingId === f._id ? "Generando…" : "Ver PDF"}
                        </button>
                        <span className="btn btn-sm btn-outline-secondary disabled">Cancelar</span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="d-flex justify-content-between align-items-center mt-2">
          <button
            className="btn btn-sm btn-outline-secondary"
            disabled={page <= 1}
            onClick={() => buscar(filtros, page - 1)}
          >
            « Anterior
          </button>
          <span className="text-muted small">
            Página {page} de {totalPages}
          </span>
          <button
            className="btn btn-sm btn-outline-secondary"
            disabled={page >= totalPages}
            onClick={() => buscar(filtros, page + 1)}
          >
            Siguiente »
          </button>
        </div>
      </div>

      {/* Modal Ver XML */}
      {xmlModal && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100"
          style={{ background: "rgba(0,0,0,.45)", zIndex: 9999 }}
          onClick={cerrarXmlModal}
        >
          <div
            className="bg-white shadow"
            style={{
              width: "92%",
              maxWidth: 900,
              maxHeight: "90%",
              margin: "3% auto",
              borderRadius: 10,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="d-flex justify-content-between align-items-center p-2 border-bottom">
              <b>XML — Folio {xmlModal.folio || "—"}</b>
              <button className="btn btn-sm btn-outline-danger" onClick={cerrarXmlModal}>
                Cerrar
              </button>
            </div>
            <div className="p-3" style={{ overflow: "auto" }}>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: 0 }}>{xmlModal.xml}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Modal detalle (solo consulta) */}
      <FacturaDetalleModal factura={detalle} onClose={cerrarDetalle} />

      {pdfModal}
    </div>
  );
}
