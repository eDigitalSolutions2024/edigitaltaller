import React from "react";
import { FaBan } from "react-icons/fa";

function formatMoney(n) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);
}

// La captura es un timestamp real (no una fecha "solo día"): se muestra en
// hora local del taller.
function formatHora(fecha) {
  if (!fecha) return "—";
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function totalConteo(list) {
  return (list || []).reduce((s, x) => s + Number(x.denominacion || 0) * Number(x.cantidad || 0), 0);
}

// Mismo criterio que calcularTotalCaptura en GestionCaja.jsx: efectivo +
// cheques + transferencias + dólares. No incluye vales.
function totalCaptura(c) {
  const dolares = (Number(c.dolares?.cantidad) || 0) * (Number(c.dolares?.tipoCambio) || 0);
  return (
    totalConteo(c.billetes) +
    totalConteo(c.monedas) +
    (Number(c.cheques) || 0) +
    (Number(c.transferencias) || 0) +
    dolares
  );
}

// Desglose compacto: solo las partes con monto.
function detalleCaptura(c) {
  const partes = [];
  const bil = totalConteo(c.billetes);
  const mon = totalConteo(c.monedas);
  if (bil) partes.push(`Billetes ${formatMoney(bil)}`);
  if (mon) partes.push(`Monedas ${formatMoney(mon)}`);
  if (Number(c.cheques) > 0) partes.push(`Cheques ${formatMoney(c.cheques)}`);
  if (Number(c.transferencias) > 0) partes.push(`Transferencias ${formatMoney(c.transferencias)}`);
  if (Number(c.dolares?.cantidad) > 0) partes.push(`USD ${Number(c.dolares.cantidad)} @ ${Number(c.dolares.tipoCambio) || 0}`);
  if ((c.vales || []).length > 0) {
    const totVales = c.vales.reduce((s, v) => s + (Number(v.monto) || 0), 0);
    partes.push(`${c.vales.length} vale(s) ${formatMoney(totVales)}`);
  }
  return partes.length ? partes.join(" · ") : "Sin montos";
}

// Historial de las rondas de "Guardar" del formulario de Captura del día. Cada
// renglón es una captura que un admin puede cancelar (se resta del total del
// día) mientras la caja siga abierta.
export default function CajaHistorialCapturas({
  capturas = [],
  esAdmin = false,
  cerrada = false,
  onCancelar,
  cancelandoId = null,
}) {
  const ordenadas = [...capturas].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const totalActivo = ordenadas
    .filter((c) => !c.cancelada)
    .reduce((s, c) => s + totalCaptura(c), 0);

  return (
    <div>
      {esAdmin && (
        <div className="small text-muted mb-2">
          Cada renglón es un “Guardar” del formulario. Cancelar uno lo resta del total del día.
        </div>
      )}

      <div className="table-responsive">
        <table className="table table-sm table-bordered align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>Hora</th>
              <th>Capturado por</th>
              <th>Detalle</th>
              <th className="text-end">Total</th>
              <th className="text-center">Estatus</th>
              {esAdmin && <th className="text-center">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {ordenadas.length === 0 && (
              <tr>
                <td colSpan={esAdmin ? 6 : 5} className="text-center text-muted">
                  Sin capturas registradas hoy.
                </td>
              </tr>
            )}
            {ordenadas.map((c) => (
              <tr
                key={c._id}
                className={c.cancelada ? "table-secondary text-decoration-line-through" : ""}
              >
                <td className="text-nowrap">{formatHora(c.fecha)}</td>
                <td>{c.capturadoPor || "—"}</td>
                <td className="small">{detalleCaptura(c)}</td>
                <td className="text-end fw-bold">{formatMoney(totalCaptura(c))}</td>
                <td className="text-center">
                  {c.sintetica && !c.cancelada && (
                    <span
                      className="badge bg-info text-dark"
                      title="Movimiento inicial: total que ya estaba capturado antes de que existiera este historial."
                    >
                      Inicial
                    </span>
                  )}
                  {c.cancelada && (
                    <span
                      className="badge bg-danger"
                      title={
                        [c.motivoCancelacion, c.canceladaPor && `por ${c.canceladaPor}`]
                          .filter(Boolean)
                          .join(" — ") || "Cancelada"
                      }
                    >
                      Cancelada
                    </span>
                  )}
                  {!c.sintetica && !c.cancelada && <span className="text-muted">—</span>}
                </td>
                {esAdmin && (
                  <td className="text-center">
                    {!c.cancelada && (
                      <button
                        type="button"
                        className="btn btn-outline-dark btn-sm"
                        title={
                          cerrada
                            ? "La caja está cerrada; restablécela para poder cancelar"
                            : "Cancelar esta captura"
                        }
                        disabled={cerrada || cancelandoId === c._id}
                        onClick={() => onCancelar?.(c)}
                      >
                        {cancelandoId === c._id ? "…" : <FaBan />}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {ordenadas.length > 0 && (
            <tfoot>
              <tr className="table-light">
                <td colSpan={3} className="fw-bold">
                  Total capturado (sin canceladas)
                </td>
                <td className="text-end fw-bold">{formatMoney(totalActivo)}</td>
                <td colSpan={esAdmin ? 2 : 1} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {esAdmin && cerrada && (
        <div className="small text-muted mt-2">
          La caja de hoy está cerrada. Restablécela para poder cancelar una captura.
        </div>
      )}
    </div>
  );
}
