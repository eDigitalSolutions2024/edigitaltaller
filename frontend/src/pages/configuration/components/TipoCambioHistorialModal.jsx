import { useEffect, useState } from "react";
import { getHistorialComparadoTipoCambio } from "../../../api/configuracion";

function formatFecha(fechaISO) {
  // Las fechas se guardan como medianoche UTC; formatear con timeZone: "UTC"
  // evita que un navegador en un huso horario detrás de UTC (México, UTC-6)
  // la muestre un día antes.
  return new Date(fechaISO).toLocaleDateString("es-MX", { timeZone: "UTC" });
}

function formatMoney(n) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(Number(n));
}

export default function TipoCambioHistorialModal({ show, onClose }) {
  const [historial, setHistorial] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!show) return;

    (async () => {
      try {
        setCargando(true);
        setError("");
        const data = await getHistorialComparadoTipoCambio();
        setHistorial(data);
      } catch (err) {
        setError(err.message || "Error al cargar el historial de tipo de cambio");
      } finally {
        setCargando(false);
      }
    })();
  }, [show]);

  if (!show) return null;

  return (
    <div
      className="modal d-block"
      tabIndex="-1"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-dialog modal-dialog-centered modal-lg">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title fw-bold">Historial de tipo de cambio</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body">
            <p className="text-muted">
              Compara el tipo de cambio usado en el sistema contra la referencia
              publicada por el SIE de Banxico ese mismo día.
            </p>

            {cargando && <p>Cargando historial…</p>}
            {error && <p className="text-danger">{error}</p>}

            {!cargando && !error && (
              historial.length === 0 ? (
                <p className="text-muted">No hay tipos de cambio registrados todavía.</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm align-middle">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Usado en sistema</th>
                        <th>SIE Banxico</th>
                        <th>Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historial.map((item, index) => {
                        const tieneSie = item.valorSie !== null && item.valorSie !== undefined;
                        const diferencia = tieneSie ? item.valorSistema - item.valorSie : null;
                        const diferenciaSignificativa = diferencia !== null && Math.abs(diferencia) > 0.005;

                        return (
                          <tr key={`${item.fecha}-${index}`}>
                            <td>{formatFecha(item.fecha)}</td>
                            <td>{formatMoney(item.valorSistema)}</td>
                            <td>{tieneSie ? formatMoney(item.valorSie) : "—"}</td>
                            <td className={diferenciaSignificativa ? "text-warning fw-semibold" : ""}>
                              {diferencia !== null ? formatMoney(diferencia) : "—"}
                            </td>
                          </tr>
                        );
                      })}
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
  );
}
