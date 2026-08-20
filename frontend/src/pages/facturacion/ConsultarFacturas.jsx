import { useCallback, useEffect, useRef, useState } from "react";
import Dropdown from "../../components/Dropdown";
import usePdfModal from "../../hooks/usePdfModal";
import { listFacturasCfdi, getFacturaCfdiById, getFacturaCfdiPdf } from "../../api/facturasCfdi";

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

export default function ConsultarFacturas() {
  const [filtros, setFiltros] = useState({ q: "", desde: "", hasta: "", estatus: "todos" });
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
    const vacio = { q: "", desde: "", hasta: "", estatus: "todos" };
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
        </div>

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
                  <tr key={f._id}>
                    <td>{[f.serie, f.folio].filter(Boolean).join("-") || "—"}</td>
                    <td>{f.cliente?.nombre || "—"}</td>
                    <td>{f.cliente?.rfc || "—"}</td>
                    <td>{fecha(f.fecha)}</td>
                    <td>{ordenesDeFactura(f)}</td>
                    <td>{money(f.totales?.total)}</td>
                    <td>
                      <span className={`badge ${f.estatus === "cancelada" ? "bg-secondary" : "bg-success"}`}>
                        {f.estatus === "cancelada" ? "Cancelada" : "Generada"}
                      </span>
                    </td>
                    <td>
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

      {pdfModal}
    </div>
  );
}
