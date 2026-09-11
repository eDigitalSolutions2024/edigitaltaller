// src/pages/garantias/SolicitudesGarantia.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Dropdown from "../../components/Dropdown";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { listGarantias, resolverGarantia, cancelarOrdenGarantia } from "../../api/garantias";
import { getUser } from "../../auth";
import http from "../../api/http";
import { TARIFA_HORA, calcImporteHoras } from "../../utils/manoObra";
import { formatFecha as formatFechaBase } from "../../utils/fechas";
import ModalCancelarGarantia from "./ModalCancelarGarantia";
import "../../styles/garantias.css";

const LIMIT = 10;

// En pantalla la garantía se maneja como Pendiente / Autorizada / Negada /
// No aplica (en la base de datos se conserva APROBADA).
const ESTADO_LABEL = {
  PENDIENTE: "PENDIENTE",
  APROBADA: "AUTORIZADA",
  NEGADA: "NEGADA",
  NO_APLICA: "NO APLICA",
};

// Prepara los datos para prellenar una nueva orden de servicio a partir de
// una solicitud de garantía cancelada por "No aplica": mismos datos del
// cliente y del vehículo, y las fallas capturadas en Servicio o Reparación.
// Se excluyen a propósito los servicios y las refacciones ya solicitados.
function buildPrefillNoAplica(v, asesor, nuevaOrdenServicio) {
  const sr = v.servicioReparacion || {};
  return {
    cliente: v.cliente,
    ordenOrigenFolio: v.ordenServicio,
    ordenServicioPrefill: nuevaOrdenServicio || "",
    vehiculo: {
      marca: v.marca || "",
      modelo: v.modelo || "",
      anio: v.anio || "",
      color: v.color || "",
      serie: v.serie || "",
      placas: v.placas || "",
      kmsMillas: v.kmsMillas || "",
      nacionalidad: v.nacionalidad || "",
      motor: v.motor || "",
      numeroEconomico: v.numeroEconomico || "",
      traccion: v.traccion || "",
      nombreUsuarioDejaVehiculo: v.nombreUsuarioDejaVehiculo || "",
    },
    servicioReparacion: {
      fallasReportadasCliente: sr.fallasReportadasCliente || "",
      infoLlantas: sr.infoLlantas || "",
      revisionFallas: sr.revisionFallas || "",
      fallasMotorOtros: sr.fallasMotorOtros || "",
      sistemaElectricoAire: sr.sistemaElectricoAire || "",
      suspensionDireccionFrenos: sr.suspensionDireccionFrenos || "",
      sistemaEnfriamiento: sr.sistemaEnfriamiento || "",
    },
    // Accesorios, daños e indicadores del tablero capturados en la
    // inspección física de la orden que se cancela.
    inspeccionFisica: v.inspeccionFisica || {},
    asesor: asesor ? { id: asesor._id, name: asesor.name } : null,
  };
}

function formatMoney(n) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}

function formatFecha(value) {
  return (
    formatFechaBase(value, { day: "2-digit", month: "short", year: "numeric" }) || "—"
  );
}

function nombreCliente(c) {
  if (!c) return "Sin cliente";
  // apellidoPaterno/apellidoMaterno son de "Particular"; en empresas no se
  // concatenan porque en registros migrados/viejos pueden quedar huérfanos.
  if (c.tipoCliente && c.tipoCliente !== "Particular") {
    return c.gobierno?.nombreGobierno || c.nombre || "Sin nombre";
  }
  return (
    c.gobierno?.nombreGobierno ||
    [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(" ") ||
    "Sin nombre"
  );
}

function EstadoPill({ estado }) {
  return (
    <span className={`gar-pill gar-pill--${estado || "NO_APLICA"}`}>
      {ESTADO_LABEL[estado] || estado}
    </span>
  );
}

// Tabla de venta al cliente de una orden (misma información que ve el asesor)
function TablaVenta({ ventaCliente, iva }) {
  const filas = Array.isArray(ventaCliente) ? ventaCliente : [];
  const subtotal = filas.reduce(
    (acc, r) => acc + Number(r.cant || 0) * Number(r.precioVenta || 0),
    0
  );
  const ivaPct = Number(iva ?? 8) || 0;
  const ivaMonto = subtotal * (ivaPct / 100);

  return (
    <div className="table-responsive">
      <table className="table table-bordered table-sm align-middle mb-0">
        <thead className="table-light text-center">
          <tr>
            <th style={{ width: 60 }}>Cant.</th>
            <th>Concepto</th>
            <th style={{ width: 140 }}>Precio Venta (Sin IVA)</th>
            <th>Observaciones</th>
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && (
            <tr>
              <td colSpan={4} className="text-center text-muted">
                Sin partidas de venta al cliente.
              </td>
            </tr>
          )}
          {filas.map((r, i) => (
            <tr key={i}>
              <td className="text-center">{r.cant}</td>
              <td>{r.concepto}</td>
              <td className="text-end">{formatMoney(r.precioVenta)}</td>
              <td>{r.observaciones}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} className="text-end fw-bold">Sub Total:</td>
            <td className="text-end fw-bold">{formatMoney(subtotal)}</td>
            <td></td>
          </tr>
          <tr>
            <td colSpan={2} className="text-end fw-bold">IVA {ivaPct}%:</td>
            <td className="text-end fw-bold">{formatMoney(ivaMonto)}</td>
            <td></td>
          </tr>
          <tr>
            <td colSpan={2} className="text-end fw-bold">Total:</td>
            <td className="text-end fw-bold">{formatMoney(subtotal + ivaMonto)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// Mano de obra de una orden (importe siempre recalculado con la tarifa vigente)
function TablaManoObra({ manoObra, nombreManoObra }) {
  const filas = Array.isArray(manoObra) ? manoObra : [];
  const total = filas.reduce((acc, m) => acc + calcImporteHoras(m.horas), 0);

  return (
    <div className="table-responsive">
      <table className="table table-bordered table-sm align-middle mb-0">
        <thead className="table-light text-center">
          <tr>
            <th>Reparación y/o Servicio</th>
            <th style={{ width: 160 }}>Mecánico / Carrocero</th>
            <th style={{ width: 70 }}>Horas</th>
            <th style={{ width: 140 }}>
              Importe ({formatMoney(TARIFA_HORA)} / hora)
            </th>
            <th>Observaciones</th>
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && (
            <tr>
              <td colSpan={5} className="text-center text-muted">
                Sin registros de mano de obra.
              </td>
            </tr>
          )}
          {filas.map((m, i) => (
            <tr key={i}>
              <td>{m.concepto}</td>
              <td className="text-center">{nombreManoObra(m)}</td>
              <td className="text-center">{m.horas}</td>
              <td className="text-end">{formatMoney(calcImporteHoras(m.horas))}</td>
              <td>{m.observaciones}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="text-end fw-bold">Total:</td>
            <td className="text-end fw-bold">{formatMoney(total)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// Detalle expandible: orden original + nueva orden, con su venta al cliente y
// mano de obra. Se reutiliza en la sección de pendientes y en el historial.
function DetalleOrdenes({ v, g, nombreManoObra }) {
  const ordenAnterior =
    g.ordenAnterior && typeof g.ordenAnterior === "object" ? g.ordenAnterior : null;

  return (
    <div className="row g-3">
      {/* Orden original */}
      <div className="col-12 col-lg-6">
        <div className="card h-100">
          <div className="card-header fw-bold">
            Orden Original — {g.ordenAnteriorFolio || "—"}
          </div>
          <div className="card-body">
            {ordenAnterior ? (
              <>
                <p className="mb-1 small">
                  <strong>Estatus:</strong>{" "}
                  {(ordenAnterior.estadoOrden || "").replaceAll("_", " ")}
                  {" · "}
                  <strong>Recepción:</strong>{" "}
                  {formatFecha(ordenAnterior.fechaRecepcion)}
                  {" · "}
                  <strong>Cierre:</strong>{" "}
                  {formatFecha(ordenAnterior.fechaCierre)}
                </p>
                <p className="mb-2 small">
                  <strong>Vehículo:</strong>{" "}
                  {[ordenAnterior.marca, ordenAnterior.modelo, ordenAnterior.anio]
                    .filter(Boolean)
                    .join(" ") || "—"}
                  {ordenAnterior.placas ? ` · Placas: ${ordenAnterior.placas}` : ""}
                  {ordenAnterior.creadoPor ? ` · Asesor: ${ordenAnterior.creadoPor}` : ""}
                </p>
                <div className="fw-semibold small mb-1">Venta al Cliente:</div>
                <TablaVenta
                  ventaCliente={ordenAnterior.ventaCliente}
                  iva={ordenAnterior.ivaVenta}
                />
                <div className="fw-semibold small mb-1 mt-3">Mano de Obra:</div>
                <TablaManoObra
                  manoObra={ordenAnterior.manoObra}
                  nombreManoObra={nombreManoObra}
                />
                <div className="mt-2">
                  <Link
                    to={`/vehiculo/orden/${ordenAnterior._id}?tab=general`}
                    className="btn btn-sm btn-outline-primary"
                  >
                    Ver orden original
                  </Link>
                </div>
              </>
            ) : (
              <p className="text-muted mb-0">
                No se encontró la información de la orden original.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Nueva orden */}
      <div className="col-12 col-lg-6">
        <div className="card h-100">
          <div className="card-header fw-bold">Nueva Orden — {v.ordenServicio}</div>
          <div className="card-body">
            <p className="mb-1 small">
              <strong>Estatus actual:</strong>{" "}
              {(v.estadoOrden || "").replaceAll("_", " ")}
              {" · "}
              <strong>Recepción:</strong> {formatFecha(v.fechaRecepcion)}
            </p>
            <p className="mb-2 small">
              <strong>Vehículo:</strong>{" "}
              {[v.marca, v.modelo, v.anio].filter(Boolean).join(" ") || "—"}
              {v.placas ? ` · Placas: ${v.placas}` : ""}
              {" · "}
              <strong>Fecha devolución solicitud:</strong>{" "}
              {formatFecha(g.fechaResolucion)}
            </p>
            <div className="fw-semibold small mb-1">Venta al Cliente:</div>
            <TablaVenta ventaCliente={v.ventaCliente} iva={v.ivaVenta} />
            <div className="fw-semibold small mb-1 mt-3">Mano de Obra:</div>
            <TablaManoObra manoObra={v.manoObra} nombreManoObra={nombreManoObra} />
            <div className="mt-2">
              <Link
                to={`/vehiculo/orden/${v._id}?tab=general`}
                className="btn btn-sm btn-outline-primary"
              >
                Ver nueva orden
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SolicitudesGarantia() {
  const user = getUser();
  const puedeResolver = ["admin", "jefe"].includes(user?.role);
  // Cancelar la orden reasigna el asesor de la orden de reemplazo, lo cual
  // solo puede hacer un admin (mismo permiso que PUT /vehiculos/:id/cambiar-asesor).
  const puedeCancelarOrden = user?.role === "admin";
  const navigate = useNavigate();

  // Folio recibido desde la consulta de garantías (/garantias?os=OS-023):
  // prefiltra la lista y expande esa solicitud al cargar.
  const [searchParams] = useSearchParams();
  const osParam = searchParams.get("os") || "";
  const autoExpandRef = useRef(!!osParam);

  // _id recibido al llegar desde la notificación de un ticket de garantía (ver
  // Soporte/SoporteFlotante → /garantias?highlight=<id>): expande y resalta esa
  // solicitud para que el admin la revise.
  const highlightParam = searchParams.get("highlight") || "";
  const [highlightedId, setHighlightedId] = useState(highlightParam);
  const highlightRef = useRef(null);

  // Sección 1: pendientes de autorización. Sección 2: historial (resueltas /
  // canceladas), este último paginado y con filtro por estado.
  const [pendientes, setPendientes] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [histTotal, setHistTotal] = useState(0);
  const [histPage, setHistPage] = useState(1);
  const [histFiltro, setHistFiltro] = useState(""); // "" = todas las resueltas
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [searchOs, setSearchOs] = useState(osParam);
  const [searchDebounced, setSearchDebounced] = useState(osParam.trim());

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchOs.trim()), 400);
    return () => clearTimeout(t);
  }, [searchOs]);

  // Edición local por solicitud pendiente: { [id]: { motivo, autorizaCarreon } }
  const [edits, setEdits] = useState({});
  const [expandida, setExpandida] = useState(null);
  const [procesando, setProcesando] = useState(null);

  // Solicitud sobre la que se muestra el modal de cancelar orden (ver "No aplica")
  const [cancelObjetivo, setCancelObjetivo] = useState(null);
  const [cancelando, setCancelando] = useState(false);

  // Para mostrar nombres en la mano de obra de las órdenes
  const [mecanicos, setMecanicos] = useState([]);
  const [carroceros, setCarroceros] = useState([]);

  useEffect(() => {
    const cargarEmpleados = async () => {
      try {
        const [resMec, resCar] = await Promise.all([
          http.get("/empleados?puesto=mecanico&activo=true"),
          http.get("/empleados?puesto=carrocero&activo=true"),
        ]);
        setMecanicos(resMec.data || []);
        setCarroceros(resCar.data || []);
      } catch (err) {
        console.error("Error cargando empleados:", err);
      }
    };
    cargarEmpleados();
  }, []);

  const nombreManoObra = (m) =>
    m.esCarroceria
      ? carroceros.find((x) => x._id === m.carrocero)?.nombre || m.carrocero || "—"
      : mecanicos.find((x) => x._id === m.mecanico)?.nombre || m.mecanico || "—";

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [resPend, resHist] = await Promise.all([
        listGarantias({
          estado: "PENDIENTE",
          searchOs: searchDebounced,
          page: 1,
          limit: 100,
        }),
        listGarantias({
          estado: histFiltro || "RESUELTAS",
          searchOs: searchDebounced,
          page: histPage,
          limit: LIMIT,
        }),
      ]);

      const pend = Array.isArray(resPend.data?.data) ? resPend.data.data : [];
      const hist = Array.isArray(resHist.data?.data) ? resHist.data.data : [];
      setPendientes(pend);
      setHistorial(hist);
      setHistTotal(resHist.data?.total || 0);

      // Solo las pendientes son editables (motivo + casilla Autorizar)
      setEdits((prev) => {
        const next = { ...prev };
        for (const v of pend) {
          next[v._id] = {
            motivo: v.garantia?.motivo || "",
            autorizaCarreon: !!v.garantia?.autorizaCarreon,
          };
        }
        return next;
      });

      const todos = [...pend, ...hist];

      // Expande la solicitud cuando se llegó desde la consulta de garantías
      if (autoExpandRef.current && osParam) {
        const match = todos.find(
          (v) =>
            String(v.ordenServicio || "").toUpperCase() ===
            osParam.trim().toUpperCase()
        );
        if (match) setExpandida(match._id);
        autoExpandRef.current = false;
      }

      // Expande la solicitud notificada por un ticket de garantía
      if (highlightParam && todos.some((v) => v._id === highlightParam)) {
        setExpandida(highlightParam);
      }
    } catch (err) {
      console.error("Error cargando solicitudes de garantía:", err);
      setError("No se pudieron cargar las solicitudes de garantía.");
    } finally {
      setLoading(false);
    }
  }, [searchDebounced, histPage, histFiltro, osParam, highlightParam]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Lleva la vista hasta la solicitud resaltada una vez que se renderiza.
  useEffect(() => {
    if (!highlightedId || loading) return;
    highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightedId, loading, pendientes, historial]);

  const histTotalPages = Math.max(1, Math.ceil(histTotal / LIMIT));

  // Las que ya pidieron autorización (asesor pulsó "Enviar a Venta") van primero.
  const pendientesOrdenadas = useMemo(() => {
    return [...pendientes].sort(
      (a, b) =>
        (b.garantia?.autorizacionSolicitada ? 1 : 0) -
        (a.garantia?.autorizacionSolicitada ? 1 : 0)
    );
  }, [pendientes]);

  const esperandoCount = useMemo(
    () => pendientes.filter((v) => v.garantia?.autorizacionSolicitada).length,
    [pendientes]
  );

  const setEdit = (id, field, value) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  const toggleExpand = (id) => {
    setExpandida((prev) => (prev === id ? null : id));
    if (highlightedId === id) setHighlightedId("");
  };

  const handleAutorizar = async (v) => {
    const e = edits[v._id] || {};

    // Para autorizar es obligatorio: checkbox + motivo (espejo del backend)
    if (!e.autorizaCarreon) {
      alert("Para autorizar es obligatorio marcar la casilla Autorizar.");
      return;
    }
    if (!String(e.motivo || "").trim()) {
      alert("Para autorizar es obligatorio capturar el motivo.");
      return;
    }

    const ok = window.confirm(
      `¿Autorizar la garantía de la orden ${v.ordenServicio} (sobre ${v.garantia?.ordenAnteriorFolio})?`
    );
    if (!ok) return;

    try {
      setProcesando(v._id);
      await resolverGarantia(v._id, {
        accion: "APROBAR",
        motivo: e.motivo.trim(),
        autorizaCarreon: true,
      });
      await cargar();
      alert("Garantía autorizada.");
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.msg || "Error al autorizar la garantía.");
    } finally {
      setProcesando(null);
    }
  };

  const handleNegar = async (v) => {
    const e = edits[v._id] || {};

    if (!String(e.motivo || "").trim()) {
      alert("Para negar la garantía es obligatorio capturar el motivo.");
      return;
    }

    const ok = window.confirm(
      `¿Negar la garantía de la orden ${v.ordenServicio}? La orden se cancelará automáticamente.`
    );
    if (!ok) return;

    try {
      setProcesando(v._id);
      await resolverGarantia(v._id, {
        accion: "NEGAR",
        motivo: e.motivo.trim(),
      });
      await cargar();
      alert("Garantía negada. La orden fue cancelada.");
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.msg || "Error al negar la garantía.");
    } finally {
      setProcesando(null);
    }
  };

  const handleNoAplica = async (v) => {
    const e = edits[v._id] || {};

    if (!String(e.motivo || "").trim()) {
      alert('Para marcar "No aplica" es obligatorio capturar el motivo.');
      return;
    }

    const ok = window.confirm(
      `¿Marcar como "No aplica" la garantía de la orden ${v.ordenServicio}? Después podrás cancelar esa orden desde la sección de resueltas.`
    );
    if (!ok) return;

    try {
      setProcesando(v._id);
      await resolverGarantia(v._id, {
        accion: "NO_APLICA",
        motivo: e.motivo.trim(),
      });
      await cargar();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.msg || 'Error al marcar la garantía como "No aplica".');
    } finally {
      setProcesando(null);
    }
  };

  const handleConfirmarCancelar = async (asesor, nuevaOrdenServicio) => {
    if (!cancelObjetivo) return;
    try {
      setCancelando(true);
      const res = await cancelarOrdenGarantia(cancelObjetivo._id);
      const vehiculoActualizado = res.data?.vehiculo;

      const objetivo = cancelObjetivo;
      setCancelObjetivo(null);
      navigate("/vehiculo/entrada", {
        state: {
          prefillGarantiaNoAplica: buildPrefillNoAplica(
            vehiculoActualizado || objetivo,
            asesor,
            nuevaOrdenServicio
          ),
        },
      });
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.msg || "Error al cancelar la orden.");
    } finally {
      setCancelando(false);
    }
  };

  // ===== RENDER =====
  const renderPendiente = (v) => {
    const g = v.garantia || {};
    const e = edits[v._id] || {};
    const editable = puedeResolver && !loading;
    const abierta = expandida === v._id;
    const resaltada = highlightedId === v._id;
    const esperando = !!g.autorizacionSolicitada;

    return (
      <article
        key={v._id}
        ref={resaltada ? highlightRef : undefined}
        className={`gar-card ${esperando ? "gar-card--wait" : ""}`}
        style={resaltada ? { boxShadow: "0 0 0 3px #fde68a" } : undefined}
      >
        <header className="gar-card__head">
          <div>
            <div className="gar-folio">{v.ordenServicio || "Sin folio"}</div>
            <div className="d-flex align-items-center gap-1 flex-wrap mt-1">
              <span className="gar-tag">
                {(v.estadoOrden || "").replaceAll("_", " ") || "—"}
              </span>
              {esperando && (
                <span className="badge bg-danger">Esperando autorización</span>
              )}
              {resaltada && (
                <span className="badge bg-warning text-dark">Notificada</span>
              )}
            </div>
          </div>
          <div className="gar-meta">
            <div>
              <span className="gar-meta__k">Garantía sobre</span>{" "}
              <strong>{g.ordenAnteriorFolio || "—"}</strong>
            </div>
            <div>
              <span className="gar-meta__k">Solicitada</span>{" "}
              {formatFecha(g.fechaSolicitud)}
            </div>
          </div>
        </header>

        <div className="gar-card__body">
          <div className="gar-grid">
            <div>
              <span className="gar-field__label">Cliente</span>
              <div>
                {nombreCliente(v.cliente)}
                {v.cliente?.esEmpleado && (
                  <span className="badge bg-warning text-dark ms-1">Empleado</span>
                )}
              </div>
            </div>
            <div>
              <span className="gar-field__label">Asesor</span>
              <div>{v.creadoPor || "—"}</div>
            </div>
            <div>
              <span className="gar-field__label">Vehículo</span>
              <div>
                {[v.marca, v.modelo, v.anio].filter(Boolean).join(" ") || "—"}
              </div>
            </div>
          </div>

          <div className="mt-3">
            <label className="gar-field__label" htmlFor={`motivo-${v._id}`}>
              Motivo de la garantía
            </label>
            <textarea
              id={`motivo-${v._id}`}
              className="form-control form-control-sm"
              rows={2}
              placeholder="¿Por qué se abrió esta orden como garantía?"
              value={e.motivo ?? ""}
              readOnly={!editable}
              onChange={(ev) => setEdit(v._id, "motivo", ev.target.value)}
            />
          </div>

          <div className="form-check mt-2">
            <input
              className="form-check-input"
              type="checkbox"
              id={`aut-${v._id}`}
              checked={!!e.autorizaCarreon}
              disabled={!editable}
              onChange={(ev) => setEdit(v._id, "autorizaCarreon", ev.target.checked)}
            />
            <label className="form-check-label" htmlFor={`aut-${v._id}`}>
              Confirmo que esta orden es una garantía (obligatorio para autorizar)
            </label>
          </div>
        </div>

        <footer className="gar-card__foot">
          {puedeResolver ? (
            <div className="d-flex gap-2 flex-wrap">
              <button
                type="button"
                className="btn btn-success btn-sm"
                disabled={procesando === v._id}
                onClick={() => handleAutorizar(v)}
              >
                Autorizar
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                disabled={procesando === v._id}
                onClick={() => handleNegar(v)}
              >
                Negar y cancelar
              </button>
              <button
                type="button"
                className="btn btn-outline-danger btn-sm"
                disabled={procesando === v._id}
                onClick={() => handleNoAplica(v)}
              >
                No aplica
              </button>
            </div>
          ) : (
            <small className="text-muted">
              Pendiente de autorización por un administrador.
            </small>
          )}
          <button
            type="button"
            className="btn btn-link btn-sm ms-auto text-decoration-none"
            onClick={() => toggleExpand(v._id)}
          >
            {abierta ? "Ocultar detalle ▲" : "Ver detalle ▼"}
          </button>
        </footer>

        {abierta && (
          <div className="gar-detail">
            <DetalleOrdenes v={v} g={g} nombreManoObra={nombreManoObra} />
          </div>
        )}
      </article>
    );
  };

  const renderHistorial = (v) => {
    const g = v.garantia || {};
    const abierta = expandida === v._id;
    const resaltada = highlightedId === v._id;
    const cancelada = v.estadoOrden === "CANCELADA";
    const pendienteCancelar = g.estado === "NO_APLICA" && !cancelada;

    return (
      <div
        key={v._id}
        ref={resaltada ? highlightRef : undefined}
        className={`gar-hist-item ${cancelada ? "gar-hist-item--cancel" : ""}`}
        style={resaltada ? { boxShadow: "0 0 0 3px #fde68a" } : undefined}
      >
        <div className="gar-hist-row">
          <EstadoPill estado={g.estado} />
          <div className="gar-hist__main">
            <strong>{v.ordenServicio || "Sin folio"}</strong>
            <span className="text-muted">
              {" "}· garantía sobre {g.ordenAnteriorFolio || "—"}
            </span>
            <div className="small text-muted">
              {nombreCliente(v.cliente)}
              {v.cliente?.esEmpleado && (
                <span className="badge bg-warning text-dark ms-1">Empleado</span>
              )}
            </div>
          </div>
          <div className="gar-hist__meta small text-muted">
            <div>Resuelta: {formatFecha(g.fechaResolucion)}</div>
            {g.resueltoPor && <div>por {g.resueltoPor}</div>}
            {cancelada && (
              <div>
                <span className="badge bg-danger">Orden cancelada</span>
              </div>
            )}
          </div>
          <div className="gar-hist__act">
            {pendienteCancelar &&
              (puedeCancelarOrden ? (
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => setCancelObjetivo(v)}
                >
                  Cancelar orden
                </button>
              ) : (
                <small className="text-muted">Pendiente de cancelar</small>
              ))}
            <button
              type="button"
              className="btn btn-link btn-sm text-decoration-none"
              onClick={() => toggleExpand(v._id)}
            >
              {abierta ? "Ocultar ▲" : "Detalle ▼"}
            </button>
          </div>
        </div>

        {abierta && (
          <div className="gar-hist-detail">
            <DetalleOrdenes v={v} g={g} nombreManoObra={nombreManoObra} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="container-fluid gar">
      <h2 className="text-center fw-bold gar-title">SOLICITUDES DE GARANTÍA</h2>
      <p className="gar-lead">
        Autoriza o rechaza las garantías que el taller envía a venta. Al autorizar
        se confirma la garantía para el Reporte de Garantías (auditoría).
      </p>

      {/* KPIs */}
      <div className="gar-kpis">
        <div className="gar-kpi gar-kpi--pend">
          <div className="gar-kpi__num">{pendientes.length}</div>
          <div className="gar-kpi__label">Pendientes de autorización</div>
        </div>
        <div className="gar-kpi gar-kpi--wait">
          <div className="gar-kpi__num">{esperandoCount}</div>
          <div className="gar-kpi__label">Bloqueadas esperando autorización</div>
        </div>
        <div className="gar-kpi">
          <div className="gar-kpi__num">{histTotal}</div>
          <div className="gar-kpi__label">Resueltas / canceladas</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="gar-filtros">
        <div className="row g-2 align-items-end">
          <div className="col-12 col-md-5">
            <label className="form-label mb-1 fw-semibold">
              Buscar por orden (nueva o anterior)
            </label>
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Ej. P-123"
              value={searchOs}
              onChange={(e) => {
                setSearchOs(e.target.value);
                setHistPage(1);
              }}
            />
          </div>
          <div className="col-12 col-md-2">
            <button
              type="button"
              className="btn btn-outline-primary btn-sm w-100"
              onClick={cargar}
              disabled={loading}
            >
              {loading ? "Cargando..." : "Actualizar"}
            </button>
          </div>
        </div>
      </div>

      {error && <p className="text-danger">{error}</p>}

      {/* ===== SECCIÓN 1 — PENDIENTES ===== */}
      <div className="gar-sec-head">
        <h5>Pendientes de autorización</h5>
        <span
          className={`gar-count ${esperandoCount > 0 ? "gar-count--wait" : ""}`}
        >
          {pendientes.length}
        </span>
      </div>

      {loading && pendientes.length === 0 ? (
        <div className="gar-empty">Cargando solicitudes…</div>
      ) : pendientes.length === 0 ? (
        <div className="gar-empty">
          No hay solicitudes de garantía pendientes de autorización.
        </div>
      ) : (
        pendientesOrdenadas.map(renderPendiente)
      )}

      {/* ===== SECCIÓN 2 — HISTORIAL ===== */}
      <div className="gar-sec-head">
        <h5>Resueltas y canceladas</h5>
        <span className="gar-count">{histTotal}</span>
        <div className="ms-auto" style={{ minWidth: 180 }}>
          <Dropdown
            className="form-select-sm"
            value={histFiltro}
            onChange={(e) => {
              setHistFiltro(e.target.value);
              setHistPage(1);
            }}
          >
            <Dropdown.Option value="">Todas las resueltas</Dropdown.Option>
            <Dropdown.Option value="APROBADA">Autorizadas</Dropdown.Option>
            <Dropdown.Option value="NEGADA">Negadas</Dropdown.Option>
            <Dropdown.Option value="NO_APLICA">No aplica</Dropdown.Option>
          </Dropdown>
        </div>
      </div>

      {loading && historial.length === 0 ? (
        <div className="gar-empty">Cargando historial…</div>
      ) : historial.length === 0 ? (
        <div className="gar-empty">Aún no hay garantías resueltas ni canceladas.</div>
      ) : (
        <>
          {historial.map(renderHistorial)}
          <div className="gar-pager">
            <small className="text-muted">
              {histTotal} registro{histTotal !== 1 ? "s" : ""}
            </small>
            <div className="btn-group">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={histPage <= 1 || loading}
                onClick={() => setHistPage((p) => p - 1)}
              >
                Anterior
              </button>
              <span className="btn btn-sm btn-outline-secondary disabled">
                {histPage} / {histTotalPages}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={histPage >= histTotalPages || loading}
                onClick={() => setHistPage((p) => p + 1)}
              >
                Siguiente
              </button>
            </div>
          </div>
        </>
      )}

      {cancelObjetivo && (
        <ModalCancelarGarantia
          solicitud={cancelObjetivo}
          guardando={cancelando}
          onClose={() => !cancelando && setCancelObjetivo(null)}
          onConfirm={handleConfirmarCancelar}
        />
      )}
    </div>
  );
}
