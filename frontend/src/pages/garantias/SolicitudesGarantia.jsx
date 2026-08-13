// src/pages/garantias/SolicitudesGarantia.jsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import Dropdown from "../../components/Dropdown";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { listGarantias, resolverGarantia, cancelarOrdenGarantia } from "../../api/garantias";
import { getUser } from "../../auth";
import http from "../../api/http";
import { TARIFA_HORA, calcImporteHoras } from "../../utils/manoObra";
import { formatFecha as formatFechaBase } from "../../utils/fechas";
import ModalCancelarGarantia from "./ModalCancelarGarantia";

const LIMIT = 10;

const ESTADO_BADGE = {
  PENDIENTE: "bg-warning text-dark",
  APROBADA: "bg-success",
  NEGADA: "bg-danger",
  NO_APLICA: "bg-secondary",
};

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

  // _id recibido al llegar desde la notificación "Garantía no aplica" (ver
  // Soporte/SoporteFlotante → /garantias?highlight=<id>): expande y resalta
  // esa fila para que el admin la revise (autorizar, marcar "No aplica" y
  // cancelar, o dejarla como está).
  const highlightParam = searchParams.get("highlight") || "";
  const [highlightedId, setHighlightedId] = useState(highlightParam);
  const highlightRef = useRef(null);

  const [solicitudes, setSolicitudes] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [filtroEstado, setFiltroEstado] = useState("");
  const [searchOs, setSearchOs] = useState(osParam);
  const [searchDebounced, setSearchDebounced] = useState(osParam.trim());

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchOs.trim()), 400);
    return () => clearTimeout(t);
  }, [searchOs]);

  // Edición local por solicitud: { [id]: { motivo, autorizaCarreon } }
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
      const res = await listGarantias({
        estado: filtroEstado,
        searchOs: searchDebounced,
        page,
        limit: LIMIT,
      });
      const data = Array.isArray(res.data?.data) ? res.data.data : [];
      setSolicitudes(data);
      setTotal(res.data?.total || 0);

      // Sincroniza el estado editable con lo que llegó del servidor
      setEdits((prev) => {
        const next = { ...prev };
        for (const v of data) {
          next[v._id] = {
            motivo: v.garantia?.motivo || "",
            autorizaCarreon: !!v.garantia?.autorizaCarreon,
          };
        }
        return next;
      });

      // Expande la solicitud cuando se llegó desde la consulta de garantías
      if (autoExpandRef.current && osParam) {
        const match = data.find(
          (v) =>
            String(v.ordenServicio || "").toUpperCase() ===
            osParam.trim().toUpperCase()
        );
        if (match) setExpandida(match._id);
        autoExpandRef.current = false;
      }

      // Expande la solicitud notificada por un asesor ("Garantía no aplica")
      if (highlightParam && data.some((v) => v._id === highlightParam)) {
        setExpandida(highlightParam);
      }
    } catch (err) {
      console.error("Error cargando solicitudes de garantía:", err);
      setError("No se pudieron cargar las solicitudes de garantía.");
    } finally {
      setLoading(false);
    }
  }, [filtroEstado, searchDebounced, page, osParam, highlightParam]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Lleva la vista hasta la fila resaltada una vez que se renderiza.
  useEffect(() => {
    if (!highlightedId || loading) return;
    highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightedId, loading, solicitudes]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const setEdit = (id, field, value) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  const reemplazarSolicitud = (vehiculoActualizado) => {
    setSolicitudes((prev) =>
      prev.map((v) => (v._id === vehiculoActualizado._id ? vehiculoActualizado : v))
    );
    setEdits((prev) => ({
      ...prev,
      [vehiculoActualizado._id]: {
        motivo: vehiculoActualizado.garantia?.motivo || "",
        autorizaCarreon: !!vehiculoActualizado.garantia?.autorizaCarreon,
      },
    }));
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
      const res = await resolverGarantia(v._id, {
        accion: "APROBAR",
        motivo: e.motivo.trim(),
        autorizaCarreon: true,
      });
      if (res.data?.vehiculo) reemplazarSolicitud(res.data.vehiculo);
      alert("Garantía autorizada.");
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.msg || "Error al autorizar la garantía.");
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
      `¿Marcar como "No aplica" la garantía de la orden ${v.ordenServicio}? Después podrás cancelar esa orden desde este mismo menú.`
    );
    if (!ok) return;

    try {
      setProcesando(v._id);
      const res = await resolverGarantia(v._id, {
        accion: "NO_APLICA",
        motivo: e.motivo.trim(),
      });
      if (res.data?.vehiculo) reemplazarSolicitud(res.data.vehiculo);
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
      if (vehiculoActualizado) reemplazarSolicitud(vehiculoActualizado);

      setCancelObjetivo(null);
      navigate("/vehiculo/entrada", {
        state: {
          prefillGarantiaNoAplica: buildPrefillNoAplica(
            vehiculoActualizado || cancelObjetivo,
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

  return (
    <div className="container-fluid">
      <h2 className="text-center fw-bold my-3" style={{ letterSpacing: "2px" }}>
        SOLICITUDES DE GARANTÍA
      </h2>

      {/* Filtros */}
      <div className="card shadow-sm mb-3">
        <div className="card-body py-2">
          <div className="row g-2 align-items-end">
            <div className="col-12 col-md-3">
              <label className="form-label mb-1 fw-semibold">Estado</label>
              <Dropdown
                className="form-select-sm"
                value={filtroEstado}
                onChange={(e) => {
                  setFiltroEstado(e.target.value);
                  setPage(1);
                }}
              >
                <Dropdown.Option value="">Todas</Dropdown.Option>
                <Dropdown.Option value="PENDIENTE">Pendientes</Dropdown.Option>
                <Dropdown.Option value="APROBADA">Autorizadas</Dropdown.Option>
                <Dropdown.Option value="NEGADA">Negadas</Dropdown.Option>
                <Dropdown.Option value="NO_APLICA">No aplica</Dropdown.Option>
              </Dropdown>
            </div>
            <div className="col-12 col-md-4">
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
                  setPage(1);
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
      </div>

      {error && <p className="text-danger">{error}</p>}

      <div className="card shadow-sm">
        <div className="card-body">
          <div className="table-responsive">
            <table className="table table-bordered table-sm align-middle">
              <thead className="table-light text-center">
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th>Nueva Orden</th>
                  <th>Orden Anterior</th>
                  <th>Cliente</th>
                  <th>Fecha Solicitud</th>
                  <th>Estado</th>
                  <th style={{ minWidth: 220 }}>Motivo</th>
                  <th style={{ width: 110 }}>Autorizar</th>
                  <th style={{ width: 210 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {!loading && solicitudes.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center text-muted py-4">
                      No hay solicitudes de garantía.
                    </td>
                  </tr>
                )}

                {solicitudes.map((v) => {
                  const g = v.garantia || {};
                  const e = edits[v._id] || {};
                  const pendiente = g.estado === "PENDIENTE";
                  const editable = pendiente && !loading;
                  const abierta = expandida === v._id;
                  const resaltada = highlightedId === v._id;
                  const ordenAnterior =
                    g.ordenAnterior && typeof g.ordenAnterior === "object"
                      ? g.ordenAnterior
                      : null;

                  return (
                    <React.Fragment key={v._id}>
                      <tr
                        ref={resaltada ? highlightRef : undefined}
                        className={resaltada ? "table-warning" : undefined}
                      >
                        <td className="text-center">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            title="Ver detalle de las órdenes"
                            onClick={() => {
                              setExpandida(abierta ? null : v._id);
                              if (resaltada) setHighlightedId("");
                            }}
                          >
                            {abierta ? "▾" : "▸"}
                          </button>
                        </td>
                        <td className="text-center">
                          <div className="fw-bold">
                            {v.ordenServicio}
                            {resaltada && (
                              <span className="badge bg-warning text-dark ms-1">Notificada</span>
                            )}
                          </div>
                          <small className="text-muted">
                            {(v.estadoOrden || "").replaceAll("_", " ")}
                          </small>
                        </td>
                        <td className="text-center fw-semibold">
                          {g.ordenAnteriorFolio || "—"}
                        </td>
                        <td>
                          {nombreCliente(v.cliente)}
                          {v.cliente?.esEmpleado && (
                            <div><span className="badge bg-warning text-dark">Empleado</span></div>
                          )}
                        </td>
                        <td className="text-center">{formatFecha(g.fechaSolicitud)}</td>
                        <td className="text-center">
                          <span className={`badge ${ESTADO_BADGE[g.estado] || "bg-secondary"}`}>
                            {ESTADO_LABEL[g.estado] || g.estado}
                          </span>
                        </td>
                        <td>
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            value={e.motivo ?? ""}
                            readOnly={!editable}
                            onChange={(ev) => setEdit(v._id, "motivo", ev.target.value)}
                          />
                        </td>
                        <td className="text-center">
                          <input
                            type="checkbox"
                            className="form-check-input"
                            checked={!!e.autorizaCarreon}
                            disabled={!editable}
                            onChange={(ev) =>
                              setEdit(v._id, "autorizaCarreon", ev.target.checked)
                            }
                          />
                        </td>
                        <td className="text-center">
                          {pendiente ? (
                            puedeResolver ? (
                              <div className="d-flex flex-column gap-1">
                                <button
                                  type="button"
                                  className="btn btn-success btn-sm py-0"
                                  style={{ fontSize: 12 }}
                                  disabled={procesando === v._id}
                                  onClick={() => handleAutorizar(v)}
                                >
                                  Autorizar
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-outline-danger btn-sm py-0"
                                  style={{ fontSize: 12 }}
                                  disabled={procesando === v._id}
                                  onClick={() => handleNoAplica(v)}
                                >
                                  No aplica
                                </button>
                              </div>
                            ) : (
                              <small className="text-muted">Pendiente de autorizar</small>
                            )
                          ) : g.estado === "NO_APLICA" && v.estadoOrden !== "CANCELADA" ? (
                            puedeCancelarOrden ? (
                              <button
                                type="button"
                                className="btn btn-danger btn-sm py-0"
                                style={{ fontSize: 12 }}
                                onClick={() => setCancelObjetivo(v)}
                              >
                                Cancelar
                              </button>
                            ) : (
                              <small className="text-muted">No aplica · pendiente de cancelar</small>
                            )
                          ) : (
                            <small className="text-muted">
                              {formatFecha(g.fechaResolucion)}
                              {g.resueltoPor ? ` · ${g.resueltoPor}` : ""}
                              {v.estadoOrden === "CANCELADA" && (
                                <>
                                  <br />
                                  <span className="badge bg-danger">Orden cancelada</span>
                                </>
                              )}
                            </small>
                          )}
                        </td>
                      </tr>

                      {abierta && (
                        <tr>
                          <td colSpan={9} className="bg-light">
                            <div className="row g-3 p-2">
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
                                          {[
                                            ordenAnterior.marca,
                                            ordenAnterior.modelo,
                                            ordenAnterior.anio,
                                          ]
                                            .filter(Boolean)
                                            .join(" ") || "—"}
                                          {ordenAnterior.placas
                                            ? ` · Placas: ${ordenAnterior.placas}`
                                            : ""}
                                          {ordenAnterior.creadoPor
                                            ? ` · Asesor: ${ordenAnterior.creadoPor}`
                                            : ""}
                                        </p>
                                        <div className="fw-semibold small mb-1">
                                          Venta al Cliente:
                                        </div>
                                        <TablaVenta
                                          ventaCliente={ordenAnterior.ventaCliente}
                                          iva={ordenAnterior.ivaVenta}
                                        />
                                        <div className="fw-semibold small mb-1 mt-3">
                                          Mano de Obra:
                                        </div>
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
                                  <div className="card-header fw-bold">
                                    Nueva Orden — {v.ordenServicio}
                                  </div>
                                  <div className="card-body">
                                    <p className="mb-1 small">
                                      <strong>Estatus actual:</strong>{" "}
                                      {(v.estadoOrden || "").replaceAll("_", " ")}
                                      {" · "}
                                      <strong>Recepción:</strong>{" "}
                                      {formatFecha(v.fechaRecepcion)}
                                    </p>
                                    <p className="mb-2 small">
                                      <strong>Vehículo:</strong>{" "}
                                      {[v.marca, v.modelo, v.anio].filter(Boolean).join(" ") || "—"}
                                      {v.placas ? ` · Placas: ${v.placas}` : ""}
                                      {" · "}
                                      <strong>Fecha devolución solicitud:</strong>{" "}
                                      {formatFecha(g.fechaResolucion)}
                                    </p>
                                    <div className="fw-semibold small mb-1">
                                      Venta al Cliente:
                                    </div>
                                    <TablaVenta ventaCliente={v.ventaCliente} iva={v.ivaVenta} />
                                    <div className="fw-semibold small mb-1 mt-3">
                                      Mano de Obra:
                                    </div>
                                    <TablaManoObra
                                      manoObra={v.manoObra}
                                      nombreManoObra={nombreManoObra}
                                    />
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
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          <div className="d-flex justify-content-between align-items-center">
            <small className="text-muted">
              {total} solicitud{total !== 1 ? "es" : ""}
            </small>
            <div className="btn-group">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </button>
              <span className="btn btn-sm btn-outline-secondary disabled">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </button>
            </div>
          </div>

          <p className="mt-2 text-muted mb-0" style={{ fontSize: 12 }}>
            * La información es solo de consulta. Al autorizar se confirma que la orden fue
            una garantía y se toma en cuenta para el Reporte de Garantías (auditoría).
          </p>
        </div>
      </div>

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
