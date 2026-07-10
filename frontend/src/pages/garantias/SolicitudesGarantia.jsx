// src/pages/garantias/SolicitudesGarantia.jsx
import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listGarantias, updateGarantia, resolverGarantia } from "../../api/garantias";
import { getUser } from "../../auth";

const LIMIT = 10;

const ESTADO_BADGE = {
  PENDIENTE: "bg-warning text-dark",
  APROBADA: "bg-success",
  NEGADA: "bg-danger",
};

function formatMoney(n) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}

function formatFecha(value) {
  if (!value) return "—";
  const fecha = new Date(value);
  if (Number.isNaN(fecha.getTime())) return "—";
  return fecha.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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
function TablaVenta({ ventaCliente }) {
  const filas = Array.isArray(ventaCliente) ? ventaCliente : [];
  const total = filas.reduce(
    (acc, r) => acc + Number(r.cant || 0) * Number(r.precioVenta || 0),
    0
  );

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
            <tr key={i} className={r.esGarantia ? "table-warning" : ""}>
              <td className="text-center">{r.cant}</td>
              <td>
                {r.concepto}
                {r.esGarantia && (
                  <span className="badge bg-warning text-dark ms-2">GARANTÍA</span>
                )}
              </td>
              <td className="text-end">{formatMoney(r.precioVenta)}</td>
              <td>{r.observaciones}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} className="text-end fw-bold">Total:</td>
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

  const [solicitudes, setSolicitudes] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [filtroEstado, setFiltroEstado] = useState("");
  const [searchOs, setSearchOs] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchOs.trim()), 400);
    return () => clearTimeout(t);
  }, [searchOs]);

  // Edición local por solicitud: { [id]: { motivo, costoDiferencia, autorizaCarreon } }
  const [edits, setEdits] = useState({});
  const [expandida, setExpandida] = useState(null);
  const [procesando, setProcesando] = useState(null);

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
            costoDiferencia: v.garantia?.costoDiferencia ?? 0,
            autorizaCarreon: !!v.garantia?.autorizaCarreon,
          };
        }
        return next;
      });
    } catch (err) {
      console.error("Error cargando solicitudes de garantía:", err);
      setError("No se pudieron cargar las solicitudes de garantía.");
    } finally {
      setLoading(false);
    }
  }, [filtroEstado, searchDebounced, page]);

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
        costoDiferencia: vehiculoActualizado.garantia?.costoDiferencia ?? 0,
        autorizaCarreon: !!vehiculoActualizado.garantia?.autorizaCarreon,
      },
    }));
  };

  const handleGuardar = async (v) => {
    const e = edits[v._id] || {};
    try {
      setProcesando(v._id);
      await updateGarantia(v._id, {
        motivo: e.motivo,
        costoDiferencia: Number(e.costoDiferencia) || 0,
        autorizaCarreon: !!e.autorizaCarreon,
      });
      alert("Solicitud de garantía actualizada.");
      cargar();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.msg || "Error al guardar los cambios.");
    } finally {
      setProcesando(null);
    }
  };

  const handleAprobar = async (v) => {
    const e = edits[v._id] || {};
    const costo = Number(e.costoDiferencia);

    // Para aprobar es obligatorio: checkbox + motivo + costo (espejo del backend)
    if (!e.autorizaCarreon) {
      alert("Para aprobar es obligatorio marcar la autorización de SR. CARREON.");
      return;
    }
    if (!String(e.motivo || "").trim()) {
      alert("Para aprobar es obligatorio capturar el motivo.");
      return;
    }
    if (!Number.isFinite(costo)) {
      alert("Para aprobar es obligatorio capturar el costo-diferencia o descuento.");
      return;
    }

    const ok = window.confirm(
      `¿Aprobar la garantía de la orden ${v.ordenServicio} (sobre ${v.garantia?.ordenAnteriorFolio})?\n\n` +
        `Costo-diferencia: ${formatMoney(costo)}\n` +
        "Se agregará el servicio GARANTÍA en Venta al Cliente de la nueva orden."
    );
    if (!ok) return;

    try {
      setProcesando(v._id);
      const res = await resolverGarantia(v._id, {
        accion: "APROBAR",
        motivo: e.motivo.trim(),
        costoDiferencia: costo,
        autorizaCarreon: true,
      });
      if (res.data?.vehiculo) reemplazarSolicitud(res.data.vehiculo);
      alert("Garantía aprobada.");
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.msg || "Error al aprobar la garantía.");
    } finally {
      setProcesando(null);
    }
  };

  const handleNegar = async (v) => {
    const ok = window.confirm(
      `¿Negar la solicitud de garantía de la orden ${v.ordenServicio} (sobre ${v.garantia?.ordenAnteriorFolio})?`
    );
    if (!ok) return;

    try {
      setProcesando(v._id);
      const res = await resolverGarantia(v._id, {
        accion: "NEGAR",
        motivo: edits[v._id]?.motivo,
      });
      if (res.data?.vehiculo) reemplazarSolicitud(res.data.vehiculo);
      alert("Solicitud de garantía negada.");
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.msg || "Error al negar la garantía.");
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
                <option value="APROBADA">Aprobadas</option>
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
                  <th style={{ width: 130 }}>Costo-Diferencia</th>
                  <th style={{ width: 110 }}>Autoriza SR. CARREON</th>
                  <th style={{ width: 210 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {!loading && solicitudes.length === 0 && (
                  <tr>
                    <td colSpan={10} className="text-center text-muted py-4">
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
                            {g.estado}
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
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            className="form-control form-control-sm text-end"
                            title="Negativo = descuento; positivo = cargo adicional"
                            value={e.costoDiferencia ?? ""}
                            readOnly={!editable}
                            onChange={(ev) =>
                              setEdit(v._id, "costoDiferencia", ev.target.value)
                            }
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
                            <div className="d-flex gap-1 justify-content-center flex-wrap">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                disabled={procesando === v._id}
                                onClick={() => handleGuardar(v)}
                              >
                                Guardar
                              </button>
                              {puedeResolver && (
                                <>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-success"
                                    disabled={procesando === v._id}
                                    onClick={() => handleAprobar(v)}
                                  >
                                    Aprobar
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-danger"
                                    disabled={procesando === v._id}
                                    onClick={() => handleNegar(v)}
                                  >
                                    Negar
                                  </button>
                                </>
                              )}
                            </div>
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
                          <td colSpan={10} className="bg-light">
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
                                        <TablaVenta ventaCliente={ordenAnterior.ventaCliente} />
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
                                    <TablaVenta ventaCliente={v.ventaCliente} />
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
            * El costo-diferencia se aplica en Venta al Cliente de la nueva orden al aprobar
            (negativo = descuento). Al negar no es necesario llenar los campos.
          </p>
        </div>
      </div>
    </div>
  );
}
