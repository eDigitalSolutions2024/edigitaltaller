// src/pages/vehiculo/ModalCambiarTipoOrden.jsx
import React, { useEffect, useState } from "react";
import { listVehiculosByCliente, listOrdenesServicio } from "../../api/vehiculos";
import { getGarantiasUsadas } from "../../api/garantias";
import { formatFecha as formatFechaBase } from "../../utils/fechas";

// Corrige el tipo de una orden ya creada: la marca como Garantía (ligándola a
// una orden anterior cerrada, igual que al crearla con garantiaSolicitud) o
// revierte una Garantía marcada por error de vuelta a orden normal. Reusa la
// misma búsqueda por serie/número de orden que GarantiaModal.
function norm(valor) {
  return String(valor || "").toUpperCase().replace(/[-\s]/g, "");
}

function descVehiculo(o) {
  return [o.marca, o.modelo, o.anio].filter(Boolean).join(" ") || "Sin datos de vehículo";
}

export default function ModalCambiarTipoOrden({ orden, guardando, onClose, onConfirm }) {
  const garantia = orden?.garantia || null;
  const esGarantia = !!garantia;
  const puedeRevertir =
    esGarantia &&
    garantia.estado === "PENDIENTE" &&
    !garantia.ticketPendiente &&
    !garantia.autorizacionSolicitada;

  const [ordenesCliente, setOrdenesCliente] = useState([]);
  const [cargandoOrdenes, setCargandoOrdenes] = useState(false);
  const [serie, setSerie] = useState("");
  const [motivo, setMotivo] = useState("");
  const [ordenAnterior, setOrdenAnterior] = useState(null);
  const [resultadosBusqueda, setResultadosBusqueda] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState("");
  const [motivoRevertir, setMotivoRevertir] = useState("");

  const clienteId = orden?.cliente?._id || orden?.cliente || null;

  useEffect(() => {
    if (esGarantia || !clienteId) {
      setOrdenesCliente([]);
      return;
    }

    let cancelado = false;
    setCargandoOrdenes(true);
    listVehiculosByCliente(clienteId)
      .then(async (res) => {
        if (cancelado) return;
        const data = Array.isArray(res.data?.data) ? res.data.data : [];
        const cerradas = data.filter(
          (o) => o.estadoOrden === "CERRADA" && String(o._id) !== String(orden._id)
        );

        let idsUsadas = new Set();
        if (cerradas.length) {
          try {
            const resU = await getGarantiasUsadas(cerradas.map((o) => o._id));
            idsUsadas = new Set((resU.data?.usadas || []).map((u) => String(u.ordenAnterior)));
          } catch {
            // Si la consulta falla se muestran todas; el backend valida al confirmar
          }
        }
        if (cancelado) return;
        setOrdenesCliente(cerradas.filter((o) => !idsUsadas.has(String(o._id))));
      })
      .catch(() => {
        if (!cancelado) setOrdenesCliente([]);
      })
      .finally(() => {
        if (!cancelado) setCargandoOrdenes(false);
      });

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esGarantia, clienteId, orden?._id]);

  const termino = norm(serie);
  const ordenesFiltradas = termino
    ? ordenesCliente.filter(
        (o) => norm(o.serie).includes(termino) || norm(o.ordenServicio).includes(termino)
      )
    : ordenesCliente;
  const idsListaCliente = new Set(ordenesFiltradas.map((o) => String(o._id)));
  const listaMostrada = [
    ...ordenesFiltradas,
    ...resultadosBusqueda.filter((o) => !idsListaCliente.has(String(o._id))),
  ];

  const handleBuscar = async () => {
    const term = serie.trim();
    if (!term) {
      setError("Captura el número de serie o de orden a buscar.");
      return;
    }
    try {
      setBuscando(true);
      setError("");
      setResultadosBusqueda([]);

      const [resSerie, resFolio] = await Promise.all([
        listOrdenesServicio({ search: term, limit: 50 }),
        listOrdenesServicio({ searchOs: term, limit: 50 }),
      ]);

      const porId = new Map();
      for (const o of [
        ...(Array.isArray(resSerie.data?.data) ? resSerie.data.data : []),
        ...(Array.isArray(resFolio.data?.data) ? resFolio.data.data : []),
      ]) {
        porId.set(String(o._id), o);
      }

      const t = norm(term);
      const cerradas = [...porId.values()].filter(
        (o) =>
          o.estadoOrden === "CERRADA" &&
          String(o._id) !== String(orden._id) &&
          (norm(o.serie).includes(t) || norm(o.ordenServicio).includes(t))
      );

      if (!cerradas.length) {
        setError(`No se encontraron órdenes cerradas con "${term}".`);
        return;
      }

      let idsUsadas = new Set();
      try {
        const resU = await getGarantiasUsadas(cerradas.map((o) => o._id));
        idsUsadas = new Set((resU.data?.usadas || []).map((u) => String(u.ordenAnterior)));
      } catch {
        // Si la consulta falla se muestran todas; el backend valida al confirmar
      }

      const disponibles = cerradas.filter((o) => !idsUsadas.has(String(o._id)));
      if (!disponibles.length) {
        setError(
          `Las órdenes cerradas que coinciden con "${term}" ya fueron utilizadas en una garantía.`
        );
        return;
      }

      setResultadosBusqueda(disponibles);
    } catch (err) {
      console.error("Error buscando por serie u orden:", err);
      setError("Error al buscar la orden. Intenta de nuevo.");
    } finally {
      setBuscando(false);
    }
  };

  const formatFecha = (value) =>
    formatFechaBase(value, { day: "2-digit", month: "short", year: "numeric" }) || "—";

  const handleConfirmarMarcar = () => {
    if (!ordenAnterior) {
      setError("Selecciona o busca primero la orden anterior.");
      return;
    }
    if (!motivo.trim()) {
      setError("El motivo de la garantía es obligatorio.");
      return;
    }
    onConfirm({ tipo: "GARANTIA", ordenAnteriorId: ordenAnterior._id, motivo: motivo.trim() });
  };

  const handleConfirmarRevertir = () => {
    onConfirm({ tipo: "NORMAL", motivo: motivoRevertir.trim() });
  };

  return (
    <>
      <div
        onClick={() => !guardando && onClose()}
        style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1040 }}
      />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          zIndex: 1050,
          width: "90%",
          maxWidth: 560,
          maxHeight: "85vh",
          background: "white",
          borderRadius: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div className="d-flex justify-content-between align-items-center p-3 border-bottom">
          <span className="fw-bold">Cambiar tipo de orden</span>
          <button
            onClick={onClose}
            disabled={guardando}
            style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer" }}
          >
            ×
          </button>
        </div>

        <div className="p-3" style={{ overflowY: "auto" }}>
          <div className="mb-3">
            <label className="form-label fw-semibold">Tipo actual</label>
            <div className="form-control-plaintext border rounded px-2 py-1 bg-light">
              {esGarantia
                ? `Garantía — orden anterior ${garantia.ordenAnteriorFolio || "—"} (${garantia.estado})`
                : "Orden normal"}
            </div>
          </div>

          {!esGarantia && (
            <>
              <label className="form-label fw-semibold">
                Orden anterior (buscar por serie o número de orden)
              </label>
              <div className="input-group mb-2">
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="Ej. 3N1AB7... o P-123"
                  value={serie}
                  autoFocus
                  onChange={(e) => setSerie(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleBuscar();
                    }
                  }}
                  disabled={guardando}
                />
                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm"
                  onClick={handleBuscar}
                  disabled={buscando || guardando}
                >
                  {buscando ? "Buscando..." : "Buscar"}
                </button>
              </div>

              <div className="border rounded mb-2" style={{ maxHeight: 200, overflowY: "auto" }}>
                {cargandoOrdenes && <div className="text-muted small p-2">Cargando...</div>}
                {!cargandoOrdenes && listaMostrada.length === 0 && (
                  <div className="text-muted small p-2">
                    Sin órdenes cerradas disponibles. Usa el buscador para consultar otra serie o
                    número de orden.
                  </div>
                )}
                {listaMostrada.map((o) => {
                  const activa = ordenAnterior?._id === o._id;
                  return (
                    <button
                      type="button"
                      key={o._id}
                      onClick={() => {
                        setOrdenAnterior(o);
                        setError("");
                      }}
                      disabled={guardando}
                      className={
                        "d-block w-100 text-start border-0 px-2 py-1 " +
                        (activa ? "bg-primary text-white" : "bg-white")
                      }
                    >
                      <div className="d-flex justify-content-between">
                        <span className="fw-semibold">{o.ordenServicio || "—"}</span>
                        <small>{formatFecha(o.fechaRecepcion || o.createdAt)}</small>
                      </div>
                      <div className={"small " + (activa ? "text-white-50" : "text-muted")}>
                        Serie: {o.serie || "—"} · {descVehiculo(o)}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mb-2">
                <label className="form-label fw-semibold">Motivo</label>
                <textarea
                  className="form-control form-control-sm"
                  rows={2}
                  placeholder="Describe el motivo de la garantía..."
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  disabled={guardando}
                />
              </div>

              <p className="text-muted small mb-0">
                Solo se puede aplicar garantía sobre órdenes cerradas que no hayan sido usadas ya
                en otra garantía.
              </p>

              {error && <p className="text-danger small mt-2 mb-0">{error}</p>}
            </>
          )}

          {esGarantia && (
            <>
              {puedeRevertir ? (
                <>
                  <p className="text-muted small">
                    Esta orden se marcó como garantía por error. Puedes revertirla a orden normal
                    mientras la solicitud siga pendiente de resolver.
                  </p>
                  <div className="mb-2">
                    <label className="form-label fw-semibold">Motivo (opcional)</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="Ej.: se marcó como garantía por error"
                      value={motivoRevertir}
                      onChange={(e) => setMotivoRevertir(e.target.value)}
                      disabled={guardando}
                    />
                  </div>
                </>
              ) : (
                <p className="text-muted small mb-0">
                  Esta solicitud de garantía ya fue resuelta o tiene un ticket/autorización en
                  curso; no se puede revertir desde aquí. Resuélvela primero desde «Solicitudes de
                  Garantía».
                </p>
              )}
            </>
          )}
        </div>

        <div className="d-flex justify-content-end gap-2 p-3 border-top">
          <button className="btn btn-outline-secondary btn-sm" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          {!esGarantia && (
            <button
              className="btn btn-primary btn-sm"
              onClick={handleConfirmarMarcar}
              disabled={!ordenAnterior || guardando}
            >
              {guardando ? "Guardando..." : "Cambiar como garantía"}
            </button>
          )}
          {esGarantia && puedeRevertir && (
            <button className="btn btn-primary btn-sm" onClick={handleConfirmarRevertir} disabled={guardando}>
              {guardando ? "Guardando..." : "Revertir a orden normal"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
