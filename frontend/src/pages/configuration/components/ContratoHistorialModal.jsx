import { useEffect, useState } from "react";
import {
  getHistorialContratoOrdenServicio,
  getContratoOrdenServicioPdfUrl,
} from "../../../api/configuracion";
import usePdfModal from "../../../hooks/usePdfModal";

function formatFecha(fechaISO) {
  return new Date(fechaISO).toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function ContratoHistorialModal({ show, onClose }) {
  const [historial, setHistorial] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const { pdfModal, abrirPdf } = usePdfModal();

  useEffect(() => {
    if (!show) return;

    (async () => {
      try {
        setCargando(true);
        setError("");
        const data = await getHistorialContratoOrdenServicio();
        setHistorial(data);
      } catch (err) {
        setError(err.message || "Error al cargar el historial del contrato");
      } finally {
        setCargando(false);
      }
    })();
  }, [show]);

  if (!show) return null;

  const verVersion = (version) => {
    const url = getContratoOrdenServicioPdfUrl(version._id);
    abrirPdf(url, `contrato_orden_servicio.pdf`, `Contrato — ${formatFecha(version.createdAt)}`);
  };

  return (
    <>
      <div
        className="modal d-block"
        tabIndex="-1"
        style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="modal-dialog modal-dialog-centered modal-lg">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title fw-bold">Historial del contrato de orden de servicio</h5>
              <button type="button" className="btn-close" onClick={onClose} />
            </div>

            <div className="modal-body">
              <p className="text-muted">
                Cada vez que se guarda el contrato se conserva la versión anterior.
                Las órdenes ya creadas siguen imprimiendo el contrato que estaba
                vigente cuando se crearon; solo las nuevas usan la versión más reciente.
              </p>

              {cargando && <p>Cargando historial…</p>}
              {error && <p className="text-danger">{error}</p>}

              {!cargando && !error && (
                historial.length === 0 ? (
                  <p className="text-muted">No hay versiones registradas todavía.</p>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-sm align-middle">
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Título</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {historial.map((version, index) => (
                          <tr key={version._id}>
                            <td>{formatFecha(version.createdAt)}</td>
                            <td>
                              {version.titulo}
                              {index === 0 && (
                                <span className="badge bg-success ms-2">Vigente</span>
                              )}
                            </td>
                            <td className="text-end">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-primary"
                                onClick={() => verVersion(version)}
                              >
                                Ver / Descargar PDF
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      </div>
      {pdfModal}
    </>
  );
}
