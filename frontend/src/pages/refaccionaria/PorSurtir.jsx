import { useEffect, useState } from "react";
import { listOrdenesServicio, marcarSurtidas, filtrosPorSurtir } from "../../api/vehiculos";
import { getUser } from "../../auth";
import ModalCotizarSurtido from "./components/ModalCotizarSurtido";

// Refacciones que vinieron de un Servicio de catálogo brincaron la cotización
// de refaccionaria, así que no traen marca/proveedor/precio de antemano
// (el código, igual que en esa cotización, es opcional).
const necesitaDetalle = (p) =>
  !!p.origenServicioCatalogo && (!p.marca || !p.proveedor || !(Number(p.precioCompra) > 0));

export default function PorSurtir() {
  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [lastUpdated, setLastUpdated] = useState(null);

  // { [ordenId]: Set<presupuestoIndex> } — selección local, no modifica el estado de la orden
  const [seleccion, setSeleccion] = useState({});

  // Fila en la que se está completando marca/proveedor/código antes de surtir
  const [modalDetalle, setModalDetalle] = useState(null); // { ordenId, presupuestoIndex } | null

  const usuario = getUser();
  const esRefaccionario = usuario?.role === "refaccionario";

  const cargar = async () => {
    try {
      setLoading(true);
      // El refaccionario solo ve las órdenes cuya solicitud de taller atendió él
      // mismo (devueltoPor). Las órdenes sin atendedor registrado se muestran a
      // todos para que no queden sin surtir. Los demás roles ven todo.
      const surtir = filtrosPorSurtir(esRefaccionario ? usuario?.name : null);
      const [r1, r2] = await Promise.all([
        listOrdenesServicio({ ...surtir, estado: "PENDIENTE_SURTIR", limit: 100 }),
        listOrdenesServicio({ ...surtir, estado: "REPARACION_EN_CURSO", limit: 100 }),
      ]);
      const todas = [...(r1.data?.data || []), ...(r2.data?.data || [])]
        .sort((a, b) => {
          const fa = new Date(a.fechaEnvioSurtir || a.updatedAt).getTime();
          const fb = new Date(b.fechaEnvioSurtir || b.updatedAt).getTime();
          return fb - fa; // más reciente arriba = menor tiempo transcurrido
        });

      setOrdenes(todas);
      setLastUpdated(Date.now());
    } catch (err) {
      console.error(err);
      alert("Error al cargar órdenes por surtir.");
    } finally {
      setLoading(false);
    }
  };

  // Sin refresco automático: solo se recarga al entrar a la página, al guardar
  // órdenes surtidas o al presionar el botón "Actualizar".
  useEffect(() => { cargar(); }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const nombreCliente = (orden) => {
    const c = orden.cliente || {};
    if (c.gobierno?.nombreGobierno) return c.gobierno.nombreGobierno;
    return [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(" ") || "Sin cliente";
  };

  const nombreAsesor = (orden) => {
    const asesor = orden.creadoPor || '';
    return asesor || "Sin asesor";
  }

  const toggleSeleccion = (ordenId, realIdx, row) => {
    if (row && necesitaDetalle(row)) {
      alert("Completa marca, proveedor y precio unitario antes de marcar esta partida como surtida.");
      return;
    }
    setSeleccion((prev) => {
      const current = new Set(prev[ordenId] || []);
      if (current.has(realIdx)) current.delete(realIdx);
      else current.add(realIdx);
      return { ...prev, [ordenId]: current };
    });
  };

  const aplicarDetalle = (ordenId, presupuestoIndex, detalle) => {
    setOrdenes((prev) =>
      prev.map((o) => {
        if (o._id !== ordenId) return o;
        const presupuesto = o.presupuesto.map((p, i) =>
          i !== presupuestoIndex ? p : { ...p, ...detalle }
        );
        return { ...o, presupuesto };
      })
    );
    setModalDetalle(null);
  };

  const cambiarCantidad = (ordenId, realIdx, value) => {
    const cant = Number(value);
    setOrdenes((prev) =>
      prev.map((o) => {
        if (o._id !== ordenId) return o;
        const presupuesto = o.presupuesto.map((p, i) =>
          i !== realIdx ? p : { ...p, cant: Number.isFinite(cant) ? cant : p.cant }
        );
        return { ...o, presupuesto };
      })
    );
  };

  const ordenModalDetalle = modalDetalle
    ? ordenes.find((o) => o._id === modalDetalle.ordenId)
    : null;
  const filaModalDetalle = ordenModalDetalle?.presupuesto?.[modalDetalle?.presupuestoIndex] ?? null;

  const handleGuardar = async (orden) => {
    const selected = seleccion[orden._id] || new Set();

    if (selected.size === 0) {
      alert("Selecciona al menos una refacción para marcar como surtida.");
      return;
    }

    const updatedPresupuesto = orden.presupuesto.map((p, i) =>
      selected.has(i) ? { ...p, surtida: true } : p
    );

    try {
      await marcarSurtidas(orden._id, updatedPresupuesto);
      // Limpiar selección de esta orden
      setSeleccion((prev) => ({ ...prev, [orden._id]: new Set() }));
      cargar();
    } catch (err) {
      console.error(err);
      alert("Error al guardar.");
    }
  };

  const calcularTiempo = (orden) => {
    const fechaBase = orden.fechaEnvioSurtir || orden.updatedAt;
    if (!fechaBase) return { texto: "-", className: "badge bg-secondary", rowClassName: "" };

    const diffMs = now - new Date(fechaBase).getTime();
    const totalMin = Math.max(0, Math.floor(diffMs / 60000));
    const horas = Math.floor(totalMin / 60);
    const minutos = totalMin % 60;
    const texto = horas > 0 ? `${horas}h ${minutos}m` : `${minutos}m`;

    if (totalMin >= 60) return { texto, className: "badge bg-danger",           rowClassName: "table-danger" };
    if (totalMin >= 30) return { texto, className: "badge bg-warning text-dark", rowClassName: "table-warning" };
    return               { texto, className: "badge bg-success",                 rowClassName: "table-success" };
  };

  const textoUltimaActualizacion = () => {
    if (!lastUpdated) return "";
    const minutos = Math.max(0, Math.floor((now - lastUpdated) / 60000));
    if (minutos <= 0) return "Actualizado hace instantes";
    return `Actualizado hace ${minutos} min`;
  };

  if (loading) return <p className="text-center mt-4">Cargando...</p>;

  return (
    <div className="container-fluid py-3">
      <div className="card">
        <div className="card-header fw-bold text-center position-relative">
          REFACCIONES POR SURTIR
          <div
            className="position-absolute d-flex align-items-center gap-2"
            style={{ right: 12, top: "50%", transform: "translateY(-50%)" }}
          >
            <small className="text-muted fw-normal">{textoUltimaActualizacion()}</small>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={cargar}
              disabled={loading}
            >
              {loading ? "Actualizando..." : "↻ Actualizar"}
            </button>
          </div>
        </div>
        <div className="card-body">
          {ordenes.length === 0 ? (
            <div className="alert alert-info text-center">
              No hay refacciones pendientes de surtir.
            </div>
          ) : (
            ordenes.map((orden) => {
              // Las partidas de servicio no requieren surtido
              const autorizadas = (orden.presupuesto || []).filter(
                (p) => p.autorizado && !p.surtida && !p.esServicio
              );

              if (autorizadas.length === 0) return null;

              const tiempo = calcularTiempo(orden);
              const selectedSet = seleccion[orden._id] || new Set();
              const haySel = selectedSet.size > 0;

              return (
                <div key={orden._id} className="card mb-3">
                  <div className="card-header d-flex justify-content-between align-items-center">
                    <div className="flex-grow-1 me-3">
                      <div className="inf-ord-surtir d-flex justify-content-between align-items-center">
                        <strong>{orden.ordenServicio}</strong>
                        <strong>{nombreAsesor(orden)}</strong>
                      </div>
                      <span className="ms-3 text-muted">{nombreCliente(orden)}</span>
                      <span className="ms-3 text-muted">
                        {[orden.marca, orden.modelo, orden.anio].filter(Boolean).join(" ") || "Sin vehículo"}
                      </span>
                      <span className="ms-3 badge bg-secondary">{orden.placas || "Sin placas"}</span>
                      <span className={`ms-3 ${tiempo.className}`}>⏱ {tiempo.texto}</span>
                      {orden.devueltoPor && (
                        <span className="ms-3 badge bg-info text-dark">
                          👤 Devuelto por: {orden.devueltoPor}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className={`btn btn-sm ${haySel ? "btn-success" : "btn-outline-secondary"}`}
                      onClick={() => handleGuardar(orden)}
                      disabled={!haySel}
                      title={haySel ? `Guardar ${selectedSet.size} refacción(es) surtida(s)` : "Selecciona al menos una refacción"}
                    >
                      {haySel ? `Guardar (${selectedSet.size})` : "Guardar"}
                    </button>
                  </div>

                  <div className="card-body p-0">
                    <table className="table table-bordered table-sm align-middle mb-0">
                      <thead className="table-light text-center">
                        <tr>
                          <th style={{ width: 60 }}>Surtida</th>
                          <th>Concepto / Refacción</th>
                          <th style={{ width: 80 }}>Cantidad</th>
                          <th>Tipo</th>
                          <th>Marca</th>
                          <th>Código</th>
                          <th>Proveedor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {autorizadas.map((p) => {
                          const realIdx = orden.presupuesto.indexOf(p);
                          const isSelected = selectedSet.has(realIdx);
                          const faltaDetalle = necesitaDetalle(p);
                          return (
                            <tr
                              key={realIdx}
                              className={isSelected ? "table-success" : tiempo.rowClassName}
                            >
                              <td className="text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={faltaDetalle}
                                  title={faltaDetalle ? "Completa marca, proveedor y precio unitario primero" : ""}
                                  onChange={() => toggleSeleccion(orden._id, realIdx, p)}
                                />
                              </td>
                              <td>{p.concepto || p.refaccion || "-"}</td>
                              <td className="text-center">
                                <input
                                  type="number"
                                  min="1"
                                  className="form-control form-control-sm text-center"
                                  style={{ width: 70, margin: "0 auto" }}
                                  value={p.cant}
                                  onChange={(e) => cambiarCantidad(orden._id, realIdx, e.target.value)}
                                />
                              </td>
                              <td className="text-center">{p.tipo || "-"}</td>
                              {faltaDetalle ? (
                                <td colSpan={3}>
                                  <span className="badge bg-warning text-dark me-2">⚠ Falta detalle</span>
                                  <button
                                    type="button"
                                    className="btn btn-outline-primary btn-sm"
                                    onClick={() => setModalDetalle({ ordenId: orden._id, presupuestoIndex: realIdx })}
                                  >
                                    Completar
                                  </button>
                                </td>
                              ) : (
                                <>
                                  <td>{p.marca || "-"}</td>
                                  <td>{p.codigo || "-"}</td>
                                  <td>{p.proveedor || "-"}</td>
                                </>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}

          <button
            type="button"
            className="btn btn-outline-secondary btn-sm mt-2"
            onClick={cargar}
            disabled={loading}
          >
            Actualizar
          </button>
        </div>
      </div>

      {modalDetalle && filaModalDetalle && (
        <ModalCotizarSurtido
          refaccionNombre={filaModalDetalle.concepto || filaModalDetalle.refaccion || ""}
          cant={filaModalDetalle.cant}
          vehiculo={{
            ordenServicio: ordenModalDetalle?.ordenServicio,
            cliente: ordenModalDetalle ? nombreCliente(ordenModalDetalle) : "",
            marca: ordenModalDetalle?.marca,
            modelo: ordenModalDetalle?.modelo,
            anio: ordenModalDetalle?.anio,
            placas: ordenModalDetalle?.placas,
            color: ordenModalDetalle?.color,
            serie: ordenModalDetalle?.serie,
            kmsMillas: ordenModalDetalle?.kmsMillas,
            motor: ordenModalDetalle?.motor,
            numeroEconomico: ordenModalDetalle?.numeroEconomico,
            traccion: ordenModalDetalle?.traccion,
          }}
          prefill={{
            unidad: filaModalDetalle.unidad || "",
            tipo: filaModalDetalle.tipo || "",
            marca: filaModalDetalle.marca || "",
            proveedor: filaModalDetalle.proveedor || "",
            codigo: filaModalDetalle.codigo || "",
            precioUnitario: filaModalDetalle.precioCompra || "",
            moneda: filaModalDetalle.moneda || "MN",
            tipoCambio: filaModalDetalle.tipoCambio || "",
            tiempoEntrega: filaModalDetalle.tiempoEntrega || "",
            core: filaModalDetalle.core || "",
            precioCore: filaModalDetalle.precioCore || "",
            observaciones: filaModalDetalle.observInt || "",
          }}
          onClose={() => setModalDetalle(null)}
          onGuardar={(detalle) =>
            aplicarDetalle(modalDetalle.ordenId, modalDetalle.presupuestoIndex, detalle)
          }
        />
      )}
    </div>
  );
}
