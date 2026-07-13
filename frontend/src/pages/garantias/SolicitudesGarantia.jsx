// src/pages/garantias/SolicitudesGarantia.jsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { listGarantias, resolverGarantia } from "../../api/garantias";
import { getUser } from "../../auth";
import http from "../../api/http";
import { TARIFA_HORA, calcImporteHoras } from "../../utils/manoObra";
import { formatFecha as formatFechaBase } from "../../utils/fechas";

const LIMIT = 10;

const ESTADO_BADGE = {
  PENDIENTE: "bg-warning text-dark",
  APROBADA: "bg-success",
  NEGADA: "bg-danger",
};

// En pantalla la garantía se maneja como Pendiente / Autorizada / Negada
// (en la base de datos se conserva APROBADA).
const ESTADO_LABEL = {
  PENDIENTE: "PENDIENTE",
  APROBADA: "AUTORIZADA",
  NEGADA: "NEGADA",
};

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
  return (
    c.gobierno?.nombreGobierno ||
    c.empresa?.razonSocial ||
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

  // Folio recibido desde la consulta de garantías (/garantias?os=OS-023):
  // prefiltra la lista y expande esa solicitud al cargar.
  const [searchParams] = useSearchParams();
  const osParam = searchParams.get("os") || "";
  const autoExpandRef = useRef(!!osParam);

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
    } catch (err) {
      console.error("Error cargando solicitudes de garantía:", err);
      setError("No se pudieron cargar las solicitudes de garantía.");
    } finally {
      setLoading(false);
    }
  }, [filtroEstado, searchDebounced, page, osParam]);

  useEffect(() => {
    cargar();
  }, [cargar]);

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
              <select
                className="form-select form-select-sm"
                value={filtroEstado}
                onChange={(e) => {
                  setFiltroEstado(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todas</option>
                <option value="PENDIENTE">Pendientes</option>
                <option value="APROBADA">Autorizadas</option>
                <option value="NEGADA">Negadas</option>
              </select>
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
                  const ordenAnterior =
                    g.ordenAnterior && typeof g.ordenAnterior === "object"
                      ? g.ordenAnterior
                      : null;

                  return (
                    <React.Fragment key={v._id}>
                      <tr>
                        <td className="text-center">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            title="Ver detalle de las órdenes"
                            onClick={() => setExpandida(abierta ? null : v._id)}
                          >
                            {abierta ? "▾" : "▸"}
                          </button>
                        </td>
                        <td className="text-center">
                          <div className="fw-bold">{v.ordenServicio}</div>
                          <small className="text-muted">
                            {(v.estadoOrden || "").replaceAll("_", " ")}
                          </small>
                        </td>
                        <td className="text-center fw-semibold">
                          {g.ordenAnteriorFolio || "—"}
                        </td>
                        <td>{nombreCliente(v.cliente)}</td>
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
                              <button
                                type="button"
                                className="btn btn-success btn-sm py-0"
                                style={{ fontSize: 12 }}
                                disabled={procesando === v._id}
                                onClick={() => handleAutorizar(v)}
                              >
                                Autorizar
                              </button>
                            ) : (
                              <small className="text-muted">Pendiente de autorizar</small>
                            )
                          ) : (
                            <small className="text-muted">
                              {formatFecha(g.fechaResolucion)}
                              {g.resueltoPor ? ` · ${g.resueltoPor}` : ""}
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
    </div>
  );
}
