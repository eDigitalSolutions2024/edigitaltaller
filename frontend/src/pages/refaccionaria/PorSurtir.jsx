import { useEffect, useState } from "react";
import { listOrdenesServicio, marcarSurtidas } from "../../api/vehiculos";
import { getUser } from "../../auth";

export default function PorSurtir() {
  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [hayPendientes, setHayPendientes] = useState(false);

  // { [ordenId]: Set<presupuestoIndex> } — selección local, no modifica el estado de la orden
  const [seleccion, setSeleccion] = useState({});

  const usuario = getUser();
  const esRefaccionario = usuario?.role === "refaccionario";

  const cargar = async () => {
    try {
      setLoading(true);
      const [r1, r2] = await Promise.all([
        listOrdenesServicio({ estado: "PENDIENTE_SURTIR", limit: 100 }),
        listOrdenesServicio({ estado: "REPARACION_EN_CURSO", limit: 100 }),
      ]);
      let todas = [...(r1.data?.data || []), ...(r2.data?.data || [])]
        .sort((a, b) => {
          const fa = new Date(a.fechaEnvioSurtir || a.updatedAt).getTime();
          const fb = new Date(b.fechaEnvioSurtir || b.updatedAt).getTime();
          return fb - fa; // más reciente arriba = menor tiempo transcurrido
        });

      // El refaccionario solo ve las órdenes cuya solicitud de taller atendió él
      // mismo (devueltoPor). Las órdenes sin atendedor registrado se muestran a
      // todos para que no queden sin surtir. Los demás roles ven todo.
      if (esRefaccionario) {
        todas = todas.filter(
          (o) => !o.devueltoPor || o.devueltoPor === usuario?.name
        );
      }

      setOrdenes(todas);
    } catch (err) {
      console.error(err);
      alert("Error al cargar órdenes por surtir.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!hayPendientes) cargar();
    }, 15000);
    return () => clearInterval(interval);
  }, [hayPendientes]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const nombreCliente = (orden) => {
    const c = orden.cliente || {};
    if (c.gobierno?.nombreGobierno) return c.gobierno.nombreGobierno;
    return [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(" ") || "Sin cliente";
  };

  const toggleSeleccion = (ordenId, realIdx) => {
    setSeleccion((prev) => {
      const current = new Set(prev[ordenId] || []);
      if (current.has(realIdx)) current.delete(realIdx);
      else current.add(realIdx);
      const hayAlgo = current.size > 0;
      setHayPendientes(hayAlgo);
      return { ...prev, [ordenId]: current };
    });
  };

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
      setHayPendientes(false);
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

  if (loading) return <p className="text-center mt-4">Cargando...</p>;

  return (
    <div className="container-fluid py-3">
      <div className="card">
        <div className="card-header fw-bold text-center">
          REFACCIONES POR SURTIR
        </div>
        <div className="card-body">
          {ordenes.length === 0 ? (
            <div className="alert alert-info text-center">
              No hay refacciones pendientes de surtir.
            </div>
          ) : (
            ordenes.map((orden) => {
              const autorizadas = (orden.presupuesto || []).filter(
                (p) => p.autorizado && !p.surtida
              );

              if (autorizadas.length === 0) return null;

              const tiempo = calcularTiempo(orden);
              const selectedSet = seleccion[orden._id] || new Set();
              const haySel = selectedSet.size > 0;

              return (
                <div key={orden._id} className="card mb-3">
                  <div className="card-header d-flex justify-content-between align-items-center">
                    <div>
                      <strong>{orden.ordenServicio}</strong>
                      <span className="ms-3 text-muted">{nombreCliente(orden)}</span>
                      <span className="ms-3 text-muted">
                        {[orden.marca, orden.modelo, orden.anio].filter(Boolean).join(" ")}
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
                          return (
                            <tr
                              key={realIdx}
                              className={isSelected ? "table-success" : tiempo.rowClassName}
                            >
                              <td className="text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSeleccion(orden._id, realIdx)}
                                />
                              </td>
                              <td>{p.concepto || p.refaccion || "-"}</td>
                              <td className="text-center">{p.cant}</td>
                              <td className="text-center">{p.tipo || "-"}</td>
                              <td>{p.marca || "-"}</td>
                              <td>{p.codigo || "-"}</td>
                              <td>{p.proveedor || "-"}</td>
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
    </div>
  );
}
