import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listOrdenesServicio } from "../../api/vehiculos";

export default function SolicitudesTaller() {
  const navigate = useNavigate();
  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());


  const cargarSolicitudes = async () => {
    try {
      setLoading(true);
      const res = await listOrdenesServicio({
        estado: "PENDIENTE_REFACCIONARIA",
        limit: 100,
      });

      setOrdenes(res.data?.data || []);
    } catch (err) {
      console.error("Error cargando solicitudes de taller:", err);
      alert("Error al cargar solicitudes de taller.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarSolicitudes();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 60000);

    return () => clearInterval(timer);
  }, []);


  const nombreCliente = (orden) => {
    if (orden.cliente?.nombre) return orden.cliente.nombre;

    return (
      [
        orden.nombreCliente,
        orden.apellidoPaterno,
        orden.apellidoMaterno,
      ]
        .filter(Boolean)
        .join(" ") ||
      orden.nombreGobierno ||
      "Sin cliente"
    );
  };

  const descripcionVehiculo = (orden) =>
    [orden.marca, orden.modelo, orden.anio].filter(Boolean).join(" ") ||
    "Sin vehículo";

  const calcularTiempoSolicitud = (orden) => {
    const fechaBase =
      orden.fechaSolicitudRefacciones || orden.updatedAt || orden.createdAt;

    if (!fechaBase) {
      return {
        texto: "-",
        className: "badge bg-secondary",
        rowClassName: "",
      };
    }

    const diffMs = now - new Date(fechaBase).getTime();
    const totalMin = Math.max(0, Math.floor(diffMs / 60000));

    const horas = Math.floor(totalMin / 60);
    const minutos = totalMin % 60;

    const texto = horas > 0 ? `${horas}h ${minutos}m` : `${minutos}m`;

    if (totalMin >= 120) {
      return {
        texto,
        className: "badge bg-danger",
        rowClassName: "table-danger",
      };
    }

    if (totalMin >= 60) {
      return {
        texto,
        className: "badge bg-warning text-dark",
        rowClassName: "table-warning",
      };
    }

    return {
      texto,
      className: "badge bg-success",
      rowClassName: "table-success",
    };
  };

  

  return (
    <div className="container-fluid py-3">
      <div className="card">
        <div className="card-header fw-bold text-center">
          SOLICITUDES DE REFACCIONES DEL TALLER
        </div>

        <div className="card-body">
          {loading ? (
            <div className="text-muted">Cargando solicitudes...</div>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm table-bordered align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Orden</th>
                    <th>Cliente</th>
                    <th>Vehículo</th>
                    <th>Placas</th>
                    <th>Refacciones</th>
                    <th>Fecha Solicitud</th>
                    <th>Tiempo</th>
                    <th style={{ width: "120px" }}>Acción</th>
                  </tr>
                </thead>

                <tbody>
                  {ordenes.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center text-muted">
                        No hay solicitudes pendientes de refaccionaria.
                      </td>
                    </tr>
                  )}

                  {ordenes.map((orden) => {
                  const tiempo = calcularTiempoSolicitud(orden);

                  return (
                    <tr key={orden._id} className={tiempo.rowClassName}>
                      <td>{orden.ordenServicio || "-"}</td>
                      <td>{nombreCliente(orden)}</td>
                      <td>{descripcionVehiculo(orden)}</td>
                      <td>{orden.placas || "-"}</td>
                      <td>{orden.refaccionesSolicitadas?.length || 0}</td>
                      <td>
                        {orden.fechaSolicitudRefacciones
                          ? new Date(orden.fechaSolicitudRefacciones).toLocaleString()
                          : "-"}
                      </td>
                      <td className="text-center">
                        {(() => {
                          const tiempo = calcularTiempoSolicitud(orden);
                          return <span className={tiempo.className}>{tiempo.texto}</span>;
                        })()}
                      </td>

                      <td>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm w-100"
                          onClick={() =>
                            navigate(`/refaccionaria/solicitudes-taller/${orden._id}`)
                          }
                        >
                          Atender
                        </button>   
                      </td>
                    </tr>
                  );
                })}
                </tbody>
              </table>
            </div>
          )}

          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={cargarSolicitudes}
            disabled={loading}
          >
            Actualizar
          </button>
        </div>
      </div>
    </div>
  );
}
