import React, { useState, useEffect } from "react";
import { listOrdenesServicio, listVehiculosByCliente } from "../../api/vehiculos";
import { getGarantiasUsadas } from "../../api/garantias";
import { formatFecha as formatFechaBase } from "../../utils/fechas";

// Modal para solicitar una garantía sobre una orden anterior.
// Solo se puede aplicar garantía sobre órdenes CERRADAS: al abrir se listan las
// órdenes cerradas del cliente seleccionado; la búsqueda se hace por NÚMERO DE
// SERIE del vehículo, tanto para filtrar las órdenes del cliente como para
// buscar cualquier otra orden cerrada (p. ej. la misma persona registrada como
// otro cliente). Al confirmar se continúa el flujo de nueva orden con el
// vehículo prellenado.
export default function GarantiaModal({ show, cliente, onSolicitar, onClose }) {
  const [ordenesCliente, setOrdenesCliente] = useState([]);
  const [cargandoOrdenes, setCargandoOrdenes] = useState(false);

  const [serie, setSerie] = useState("");
  const [motivo, setMotivo] = useState("");
  const [ordenAnterior, setOrdenAnterior] = useState(null);
  const [resultadosBusqueda, setResultadosBusqueda] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!show) return;
    setSerie("");
    setMotivo("");
    setOrdenAnterior(null);
    setResultadosBusqueda([]);
    setError("");

    if (!cliente?._id) {
      setOrdenesCliente([]);
      return;
    }

    let cancelado = false;
    setCargandoOrdenes(true);
    listVehiculosByCliente(cliente._id)
      .then(async (res) => {
        if (cancelado) return;
        const data = Array.isArray(res.data?.data) ? res.data.data : [];
        // Solo órdenes cerradas pueden ser origen de una garantía
        const cerradas = data.filter((o) => o.estadoOrden === "CERRADA");

        // Una orden ya usada en una garantía no se vuelve a ofrecer
        let idsUsadas = new Set();
        if (cerradas.length) {
          try {
            const resU = await getGarantiasUsadas(cerradas.map((o) => o._id));
            idsUsadas = new Set(
              (resU.data?.usadas || []).map((u) => String(u.ordenAnterior))
            );
          } catch {
            // Si la consulta falla se muestran todas; el backend valida al crear
          }
        }
        if (cancelado) return;
        setOrdenesCliente(cerradas.filter((o) => !idsUsadas.has(String(o._id))));
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

  // Normaliza series y folios para comparar sin importar mayúsculas,
  // espacios ni guiones ("OS023" = "OS-023")
  const norm = (valor) =>
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

  const formatFecha = (value) =>
    formatFechaBase(value, { day: "2-digit", month: "short", year: "numeric" }) || "—";

  const descVehiculo = (o) =>
    [o.marca, o.modelo, o.anio].filter(Boolean).join(" ") || "Sin datos de vehículo";

  // Filtra la lista del cliente por número de serie o de orden mientras se escribe
  const termino = norm(serie);
  const ordenesFiltradas = termino
    ? ordenesCliente.filter(
        (o) =>
          norm(o.serie).includes(termino) ||
          norm(o.ordenServicio).includes(termino)
      )
    : ordenesCliente;

  // Lista mostrada: órdenes del cliente + resultados de la búsqueda global
  // (sin duplicar las que ya aparecen entre las del cliente)
  const idsCliente = new Set(ordenesFiltradas.map((o) => String(o._id)));
  const listaMostrada = [
    ...ordenesFiltradas,
    ...resultadosBusqueda.filter((o) => !idsCliente.has(String(o._id))),
  ];

  // Búsqueda global por número de serie o de orden (por si la orden está bajo
  // otro registro del cliente). Una serie puede tener varias órdenes cerradas,
  // así que se muestran todas las coincidencias disponibles para elegir.
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

      // Se busca en paralelo por serie (search) y por folio de orden (searchOs)
      const [resSerie, resFolio] = await Promise.all([
        listOrdenesServicio({ search: term, limit: 50 }),
        listOrdenesServicio({ searchOs: term, limit: 50 }),
      ]);

      // Combina ambos resultados quitando duplicados por _id
      const porId = new Map();
      for (const o of [
        ...(Array.isArray(resSerie.data?.data) ? resSerie.data.data : []),
        ...(Array.isArray(resFolio.data?.data) ? resFolio.data.data : []),
      ]) {
        porId.set(String(o._id), o);
      }

      const t = norm(term);
      // Solo órdenes cerradas cuya serie o folio coincide con lo buscado
      const cerradas = [...porId.values()].filter(
        (o) =>
          o.estadoOrden === "CERRADA" &&
          (norm(o.serie).includes(t) || norm(o.ordenServicio).includes(t))
      );

      if (!cerradas.length) {
        setError(`No se encontraron órdenes cerradas con "${term}".`);
        return;
      }

      // Excluir las órdenes ya usadas en una garantía
      let idsUsadas = new Set();
      try {
        const resU = await getGarantiasUsadas(cerradas.map((o) => o._id));
        idsUsadas = new Set(
          (resU.data?.usadas || []).map((u) => String(u.ordenAnterior))
        );
      } catch {
        // Si la consulta falla se muestran todas; el backend valida al crear
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
            <label className="form-label fw-semibold">
              Orden anterior (buscar por serie o número de orden)
            </label>
            <div className="input-group mb-2">
              <input
                type="text"
                className="form-control"
                placeholder="Filtrar por serie o número de orden (Ej. 3N1AB7... o P-123)"
                value={serie}
                autoFocus
                onChange={(e) => setSerie(e.target.value)}
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
                title="Busca la serie o el número de orden en todas las órdenes (por si es la misma persona con otro registro)"
              >
                {buscando ? "Buscando..." : "Buscar"}
              </button>
            </div>

            {/* Órdenes del cliente seleccionado */}
            <div className="mb-2">
              <small className="text-muted">
                Órdenes cerradas de <strong>{nombreCliente(cliente)}</strong>
                {cargandoOrdenes ? " — cargando..." : ` (${listaMostrada.length})`}
              </small>
            </div>

            <div
              className="list-group mb-3"
              style={{ maxHeight: 260, overflowY: "auto" }}
            >
              {!cargandoOrdenes && listaMostrada.length === 0 && ordenesCliente.length === 0 && (
                <div className="list-group-item text-muted">
                  Este cliente no tiene órdenes cerradas. Usa el buscador por serie
                  o número de orden (solo se aceptan órdenes cerradas).
                </div>
              )}

              {!cargandoOrdenes && ordenesCliente.length > 0 && listaMostrada.length === 0 && (
                <div className="list-group-item text-muted">
                  Ninguna orden del cliente coincide con "{serie.trim()}".
                  Usa el botón Buscar para consultar en todas las órdenes.
                </div>
              )}

              {listaMostrada.map((o) => {
                const activa = ordenAnterior?._id === o._id;
                return (
                  <button
                    type="button"
                    key={o._id}
                    className={`list-group-item list-group-item-action${activa ? " active" : ""}`}
                    onClick={() => handleSeleccionar(o)}
                  >
                    <div className="d-flex justify-content-between align-items-center">
                      <span className="fw-bold">
                        Serie: {o.serie || "—"}
                      </span>
                      <small>{formatFecha(o.fechaRecepcion || o.createdAt)}</small>
                    </div>
                    <small>
                      {o.ordenServicio ? `${o.ordenServicio} · ` : ""}
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
                  Serie: {ordenAnterior.serie || "—"}
                  {ordenAnterior.ordenServicio ? ` — ${ordenAnterior.ordenServicio}` : ""}
                </div>
                <div className="small">
                  {nombreCliente(ordenAnterior.cliente)}
                  {" · "}
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
