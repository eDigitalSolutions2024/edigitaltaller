import React, { useState, useEffect } from "react";
import { listOrdenesServicio, listVehiculosByCliente } from "../../api/vehiculos";

// Modal para solicitar una garantía sobre una orden anterior.
// Al abrir se listan todas las órdenes del cliente seleccionado para elegir una;
// también se puede buscar por folio cualquier otra orden (p. ej. la misma persona
// registrada como otro cliente). Al confirmar se continúa el flujo de nueva orden
// con el vehículo prellenado.
export default function GarantiaModal({ show, cliente, onSolicitar, onClose }) {
  const [ordenesCliente, setOrdenesCliente] = useState([]);
  const [cargandoOrdenes, setCargandoOrdenes] = useState(false);

  const [folio, setFolio] = useState("");
  const [motivo, setMotivo] = useState("");
  const [ordenAnterior, setOrdenAnterior] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!show) return;
    setFolio("");
    setMotivo("");
    setOrdenAnterior(null);
    setError("");

    if (!cliente?._id) {
      setOrdenesCliente([]);
      return;
    }

    let cancelado = false;
    setCargandoOrdenes(true);
    listVehiculosByCliente(cliente._id)
      .then((res) => {
        if (cancelado) return;
        setOrdenesCliente(Array.isArray(res.data?.data) ? res.data.data : []);
      })
      .catch((err) => {
        console.error("Error cargando órdenes del cliente:", err);
        if (!cancelado) setOrdenesCliente([]);
      })
      .finally(() => {
        if (!cancelado) setCargandoOrdenes(false);
      });

    return () => { cancelado = true; };
  }, [show, cliente]);

  if (!show) return null;

  const normalizarFolio = (valor) => {
    const limpio = valor.trim().toUpperCase();
    if (!limpio) return "";
    // Si el asesor teclea solo dígitos, anteponemos el prefijo P-
    return /^\d+$/.test(limpio) ? `P-${limpio}` : limpio;
  };

  // Para comparar folios sin importar el guion: "OS023" = "OS-023"
  const folioSinGuiones = (valor) =>
    String(valor || "").toUpperCase().replace(/[-\s]/g, "");

  const nombreCliente = (c) => {
    // Las órdenes del cliente vienen sin populate: usamos el cliente seleccionado
    const obj = c && typeof c === "object" ? c : cliente;
    if (!obj) return "Sin cliente";
    return (
      obj.gobierno?.nombreGobierno ||
      obj.empresa?.razonSocial ||
      [obj.nombre, obj.apellidoPaterno, obj.apellidoMaterno].filter(Boolean).join(" ") ||
      "Sin nombre"
    );
  };

  const formatFecha = (value) => {
    if (!value) return "—";
    const fecha = new Date(value);
    if (Number.isNaN(fecha.getTime())) return "—";
    return fecha.toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const descVehiculo = (o) =>
    [o.marca, o.modelo, o.anio].filter(Boolean).join(" ") || "Sin datos de vehículo";

  // Filtra la lista del cliente mientras se escribe en el buscador
  // (ignorando guiones: "OS023" encuentra "OS-023")
  const termino = folioSinGuiones(folio);
  const ordenesFiltradas = termino
    ? ordenesCliente.filter((o) =>
        folioSinGuiones(o.ordenServicio).includes(termino)
      )
    : ordenesCliente;

  // Búsqueda global por folio (por si la orden está bajo otro registro del cliente)
  const handleBuscar = async () => {
    const folioNorm = normalizarFolio(folio);
    if (!folioNorm) {
      setError("Captura el número de la orden anterior.");
      return;
    }

    try {
      setBuscando(true);
      setError("");

      const res = await listOrdenesServicio({ searchOs: folioNorm, limit: 20 });
      const data = Array.isArray(res.data?.data) ? res.data.data : [];
      // searchOs es regex parcial (P-1 matchea P-10, P-100...): exigimos match
      // exacto, ignorando guiones ("OS023" = "OS-023")
      const exacta = data.find(
        (o) => folioSinGuiones(o.ordenServicio) === folioSinGuiones(folioNorm)
      );

      if (!exacta) {
        setError(`No se encontró la orden ${folioNorm}.`);
        return;
      }
      setOrdenAnterior(exacta);
    } catch (err) {
      console.error("Error buscando orden anterior:", err);
      setError("Error al buscar la orden. Intenta de nuevo.");
    } finally {
      setBuscando(false);
    }
  };

  const handleSeleccionar = (o) => {
    setOrdenAnterior(o);
    setError("");
  };

  const handleSolicitar = () => {
    if (!ordenAnterior) {
      setError("Selecciona o busca primero la orden anterior.");
      return;
    }
    if (!motivo.trim()) {
      setError("El motivo de la garantía es obligatorio.");
      return;
    }
    onSolicitar({ ordenAnterior, motivo: motivo.trim() });
  };

  return (
    <div
      className="modal d-block"
      tabIndex="-1"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-dialog modal-lg modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title fw-bold">Solicitud de Garantía</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body">
            <label className="form-label fw-semibold">Orden anterior</label>
            <div className="input-group mb-2">
              <input
                type="text"
                className="form-control"
                placeholder="Filtrar las órdenes del cliente o buscar otro folio (Ej. P-123)"
                value={folio}
                autoFocus
                onChange={(e) => setFolio(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleBuscar();
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-outline-primary"
                onClick={handleBuscar}
                disabled={buscando}
                title="Busca el folio en todas las órdenes (por si es la misma persona con otro registro)"
              >
                {buscando ? "Buscando..." : "Buscar"}
              </button>
            </div>

            {/* Órdenes del cliente seleccionado */}
            <div className="mb-2">
              <small className="text-muted">
                Órdenes de <strong>{nombreCliente(cliente)}</strong>
                {cargandoOrdenes ? " — cargando..." : ` (${ordenesFiltradas.length})`}
              </small>
            </div>

            <div
              className="list-group mb-3"
              style={{ maxHeight: 260, overflowY: "auto" }}
            >
              {!cargandoOrdenes && ordenesCliente.length === 0 && (
                <div className="list-group-item text-muted">
                  Este cliente no tiene órdenes registradas. Usa el buscador por folio.
                </div>
              )}

              {!cargandoOrdenes && ordenesCliente.length > 0 && ordenesFiltradas.length === 0 && (
                <div className="list-group-item text-muted">
                  Ninguna orden del cliente coincide con "{folio.trim()}". Usa el botón
                  Buscar para consultar el folio en todas las órdenes.
                </div>
              )}

              {ordenesFiltradas.map((o) => {
                const activa = ordenAnterior?._id === o._id;
                return (
                  <button
                    type="button"
                    key={o._id}
                    className={`list-group-item list-group-item-action${activa ? " active" : ""}`}
                    onClick={() => handleSeleccionar(o)}
                  >
                    <div className="d-flex justify-content-between align-items-center">
                      <span className="fw-bold">{o.ordenServicio}</span>
                      <small>{formatFecha(o.fechaRecepcion || o.createdAt)}</small>
                    </div>
                    <small>
                      {descVehiculo(o)}
                      {o.placas ? ` · Placas: ${o.placas}` : ""}
                      {" · "}
                      {(o.estadoOrden || "").replaceAll("_", " ")}
                    </small>
                  </button>
                );
              })}
            </div>

            {/* Orden seleccionada (de la lista o de la búsqueda global) */}
            {ordenAnterior && (
              <div className="alert alert-success py-2 mb-3">
                <div className="fw-bold">
                  {ordenAnterior.ordenServicio} — {nombreCliente(ordenAnterior.cliente)}
                </div>
                <div className="small">
                  {descVehiculo(ordenAnterior)}
                  {ordenAnterior.placas ? ` · Placas: ${ordenAnterior.placas}` : ""}
                  {" · Estatus: "}
                  {(ordenAnterior.estadoOrden || "").replaceAll("_", " ")}
                </div>
              </div>
            )}

            <label className="form-label fw-semibold">Motivo para aplicar la garantía</label>
            <textarea
              className="form-control"
              rows={3}
              placeholder="Describe el motivo de la garantía..."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />

            {error && <p className="text-danger mt-2 mb-0">{error}</p>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-warning fw-semibold"
              onClick={handleSolicitar}
              disabled={!ordenAnterior}
            >
              Solicitar Garantía
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
