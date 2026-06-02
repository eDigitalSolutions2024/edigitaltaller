import { useEffect, useState } from "react";
import { listOrdenesServicio, marcarSurtidas } from "../../api/vehiculos";

export default function PorSurtir() {
  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [hayPendientes, setHayPendientes] = useState(false);

  const cargar = async () => {
    try {
      setLoading(true);
      const res = await listOrdenesServicio({
        estado: "PENDIENTE_SURTIR",
        limit: 100,
      });
      setOrdenes(res.data?.data || []);
    } catch (err) {
      console.error(err);
      alert("Error al cargar órdenes por surtir.");
    } finally {
      setLoading(false);
    }
  };

    useEffect(() => {
    const interval = setInterval(() => {
        if (!hayPendientes) cargar();
    }, 15000);
    return () => clearInterval(interval);
    }, [hayPendientes]);

    useEffect(() => {
    const timer = setInterval(() => {
        setNow(Date.now());
    }, 60000);
    return () => clearInterval(timer);
    }, []);


  const nombreCliente = (orden) =>
    [orden.cliente?.nombre, orden.apellidoPaterno, orden.apellidoMaterno]
      .filter(Boolean)
      .join(" ") || orden.nombreGobierno || "Sin cliente";

  const toggleSurtida = (ordenId, presIdx) => {
    setOrdenes((prev) =>
        prev.map((o) => {
        if (String(o._id) !== String(ordenId)) return o;
        const nuevoPres = o.presupuesto.map((p, i) =>
            i === presIdx ? { ...p, surtida: !p.surtida } : p
        );
        return { ...o, presupuesto: nuevoPres };
        })
    );
    setHayPendientes(true); // ← pausa el polling
    };

  const handleGuardar = async (orden) => {
    try {
      await marcarSurtidas(orden._id, orden.presupuesto);
      setHayPendientes(false);
      //alert("Guardado correctamente.");
      cargar(); // refresca — si todas surtidas desaparece de la lista
    } catch (err) {
      console.error(err);
      alert("Error al guardar.");
    }
  };

  if (loading) return <p className="text-center mt-4">Cargando...</p>;

  const calcularTiempo = (orden) => {
    const fechaBase = orden.fechaEnvioSurtir || orden.updatedAt;
    if (!fechaBase) return { texto: "-", className: "badge bg-secondary", rowClassName: "" };

    const diffMs = now - new Date(fechaBase).getTime();
    const totalMin = Math.max(0, Math.floor(diffMs / 60000));
    const horas = Math.floor(totalMin / 60);
    const minutos = totalMin % 60;
    const texto = horas > 0 ? `${horas}h ${minutos}m` : `${minutos}m`;

    if (totalMin >= 60)  return { texto, className: "badge bg-danger",        rowClassName: "table-danger" };
    if (totalMin >= 30)  return { texto, className: "badge bg-warning text-dark", rowClassName: "table-warning" };
    return               { texto, className: "badge bg-success",       rowClassName: "table-success" };
  };

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
                (p) => p.autorizado
                );

                if (autorizadas.length === 0) return null;

                const tiempo = calcularTiempo(orden);

                return (
                <div key={orden._id} className="card mb-3">
                    <div className="card-header d-flex justify-content-between align-items-center">
                    <div>
                        <strong>{orden.ordenServicio}</strong>
                        <span className="ms-3 text-muted">
                        {nombreCliente(orden)}
                        </span>
                        <span className="ms-3 text-muted">
                        {[orden.marca, orden.modelo, orden.anio]
                            .filter(Boolean)
                            .join(" ")}
                        </span>
                        <span className="ms-3 badge bg-secondary">
                        {orden.placas || "Sin placas"}
                        </span>
                        <span className={`ms-3 ${tiempo.className}`}>
                        ⏱ {tiempo.texto}
                        </span>

                        {orden.devueltoPor && (
                        <span className="ms-3 badge bg-info text-dark">
                            👤 Devuelto por: {orden.devueltoPor}
                        </span>
                        )}
                    </div>
                    <button
                        type="button"
                        className="btn btn-success btn-sm"
                        onClick={() => handleGuardar(orden)}
                    >
                        Guardar
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
                        {autorizadas.map((p, presIdx) => (
                            <tr
                            key={presIdx}
                            className={p.surtida ? "table-success" : tiempo.rowClassName}
                            >
                            <td className="text-center">
                                <input
                                type="checkbox"
                                checked={!!p.surtida}
                                onChange={() =>
                                    toggleSurtida(
                                    orden._id,
                                    (orden.presupuesto || []).indexOf(p)
                                    )
                                }
                                />
                            </td>
                            <td>{p.concepto || p.refaccion || "-"}</td>
                            <td className="text-center">{p.cant}</td>
                            <td className="text-center">{p.tipo || "-"}</td>
                            <td>{p.marca || "-"}</td>
                            <td>{p.codigo || "-"}</td>
                            <td>{p.proveedor || "-"}</td>
                            </tr>
                        ))}
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