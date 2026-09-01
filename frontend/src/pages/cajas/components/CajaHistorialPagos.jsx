import React, { useState } from "react";
import Dropdown from "../../../components/Dropdown";
import { FaPrint, FaBan, FaFlag, FaUndo } from "react-icons/fa";
import { formatFecha } from "../../../utils/fechas";

function formatMoney(n) {
  if (n === "" || n === null || n === undefined) return "-";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}

const TIPO_PAGO_LABELS = { COMPLETO: "Pago Completo", ABONO: "Abono", ANTICIPO: "Anticipo" };

// Una remisión a crédito se registra como Pago Completo (documenta la venta
// completa), pero no entró dinero: en el historial se lee como Crédito.
function tipoPagoLabel(p) {
  if (p.comprobante === "REMISION" && p.remision?.tipo === "Credito") return "Crédito";
  return TIPO_PAGO_LABELS[p.tipoPago] || p.tipoPago;
}

function comprobanteLabel(p) {
  if (p.comprobante === "NOTA_VENTA") return `Nota Venta N°${p.notaVenta?.numero ?? "-"}`;
  if (p.comprobante === "REMISION") return `Remisión N°${p.remision?.numero ?? "-"}`;
  if (p.comprobante === "RECIBO_PROVISIONAL") return `Recibo Provisional N°${p.reciboProvisional?.numero ?? "-"}`;
  return "-";
}

// Etiqueta y color del badge de una cancelación según su tipo.
function badgeCancelacion(p) {
  if (p.motivoCancelacionTipo === "PASA_A_FACTURA" || p.facturaId) {
    return { texto: "Pasó a factura", clase: "bg-secondary" };
  }
  return { texto: "Cancelado", clase: "bg-danger" };
}

export default function CajaHistorialPagos({
  pagos = [],
  onImprimir,
  onImprimirReciboProvisional,
  onImprimirReciboDolares,
  puedeCancelar = false,
  onCancelar,
  puedeSolicitarCancelacion = false,
  onSolicitarCancelacion,
  esAdmin = false,
  onDeshacerCancelacion,
}) {
  const [filtro, setFiltro] = useState("TODOS");

  const ordenados = [...pagos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const visibles = filtro === "TODOS" ? ordenados : ordenados.filter((p) => p.comprobante === filtro);

  // Caja no puede cancelar directamente (solo el admin): abre un ticket de
  // Soporte (RESTABLECER_COBRO) describiendo cuál pago y por qué, para que un
  // admin lo revise y lo cancele desde este mismo historial.
  const handleSolicitar = (p) => {
    const confirmado = window.confirm(
      `¿Seguro que quieres solicitar la cancelación de ${comprobanteLabel(p)} (${tipoPagoLabel(p)})? Se enviará un ticket a un administrador.`
    );
    if (!confirmado) return;

    const sugerido = `Cancelar ${comprobanteLabel(p)} (${tipoPagoLabel(p)}) por ${formatMoney(p.monto)}`;
    const detalle = window.prompt(
      "Describe el motivo de la solicitud de cancelación (se enviará a un administrador):",
      sugerido
    );
    if (detalle === null) return; // canceló el prompt
    if (!detalle.trim()) {
      alert("Captura el motivo de la solicitud.");
      return;
    }
    onSolicitarCancelacion?.(p, detalle.trim());
  };

  return (
    <div>
      <div className="d-flex justify-content-end mb-2">
        <Dropdown
          className="form-select-sm"
          style={{ width: "auto" }}
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        >
          <Dropdown.Option value="TODOS">Todos los comprobantes</Dropdown.Option>
          <Dropdown.Option value="NOTA_VENTA">Nota de Venta</Dropdown.Option>
          <Dropdown.Option value="REMISION">Remisión</Dropdown.Option>
          <Dropdown.Option value="RECIBO_PROVISIONAL">Recibo Provisional</Dropdown.Option>
        </Dropdown>
      </div>

      <div className="table-responsive mb-3">
        <table className="table table-sm table-bordered align-middle">
          <thead className="table-light text-center">
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Comprobante</th>
              <th>Monto Pesos</th>
              <th>Monto Dólares</th>
              <th>T.C.</th>
              <th>Monto Total (MN)</th>
              <th>Observaciones</th>
              <th>Registrado por</th>
              <th>Acciones</th>
              {puedeSolicitarCancelacion && <th>Solicitar Cancelación</th>}
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={puedeSolicitarCancelacion ? 11 : 10} className="text-center text-muted">
                  No hay pagos registrados.
                </td>
              </tr>
            )}
            {visibles.map((p, idx) => (
              <tr key={p._id || idx} className={p.cancelado ? "table-secondary text-decoration-line-through" : ""}>
                <td className="text-center">{formatFecha(p.fecha)}</td>
                <td className="text-center">{tipoPagoLabel(p)}</td>
                <td className="text-center">
                  {comprobanteLabel(p)}
                  {p.aSaldoAFavor && (
                    <span
                      className="badge bg-info text-dark ms-1"
                      title="El dinero de este anticipo se guardó como saldo a favor del cliente; no bajó el saldo de la orden."
                    >
                      → Saldo a favor
                    </span>
                  )}
                  {p.cancelado && (() => {
                    const b = badgeCancelacion(p);
                    return (
                      <span className={`badge ms-1 ${b.clase}`} title={p.motivoCancelacion || "Cancelado"}>
                        {b.texto}
                      </span>
                    );
                  })()}
                </td>
                <td className="text-end">{formatMoney(p.montoPesos)}</td>
                <td className="text-end">{p.montoDolares ? formatMoney(p.montoDolares) : "-"}</td>
                <td className="text-end">{p.tipoCambio || "-"}</td>
                <td className="text-end fw-bold">
                  {formatMoney(p.monto)}
                  {p.saldoAplicado?.monto > 0 && (
                    <div className="small text-muted fw-normal">
                      (incluye {formatMoney(p.saldoAplicado.monto)} de saldo)
                    </div>
                  )}
                </td>
                <td>{p.observaciones}</td>
                <td>{p.registradoPor}</td>
                <td className="text-center">
                  <div className="d-flex gap-1 justify-content-center">
                    {(p.comprobante === "NOTA_VENTA" || p.comprobante === "REMISION") && (
                      <button
                        className="btn btn-outline-danger btn-sm"
                        title={`Imprimir ${comprobanteLabel(p)}`}
                        onClick={() => onImprimir?.(p)}
                      >
                        <FaPrint />
                      </button>
                    )}
                    {p.reciboProvisional?.numero && (
                      <button
                        className="btn btn-outline-secondary btn-sm"
                        title={`Imprimir Recibo Provisional N°${p.reciboProvisional.numero}`}
                        onClick={() => onImprimirReciboProvisional?.(p)}
                      >
                        <FaPrint /> Prov.
                      </button>
                    )}
                    {p.reciboDolares?.numero && (
                      <button
                        className="btn btn-outline-info btn-sm"
                        title={`Imprimir Recibo de Dólares N°${p.reciboDolares.numero}`}
                        onClick={() => onImprimirReciboDolares?.(p)}
                      >
                        <FaPrint /> USD
                      </button>
                    )}
                    {puedeCancelar && !p.cancelado && (
                      <button
                        className="btn btn-outline-dark btn-sm"
                        title="Cancelar este comprobante"
                        onClick={() => onCancelar?.(p)}
                      >
                        <FaBan />
                      </button>
                    )}
                    {p.cancelado &&
                      !p.facturaId &&
                      (p.motivoCancelacionTipo !== "ERROR" || esAdmin) &&
                      onDeshacerCancelacion && (
                        <button
                          className="btn btn-outline-success btn-sm text-nowrap"
                          title="Deshacer esta cancelación (mientras la factura real no exista)"
                          onClick={() => onDeshacerCancelacion(p)}
                        >
                          <FaUndo /> Deshacer
                        </button>
                      )}
                  </div>
                </td>
                {puedeSolicitarCancelacion && (
                  <td className="text-center">
                    {!p.cancelado && (
                      <button
                        className="btn btn-outline-warning btn-sm text-nowrap"
                        title="Pide a un administrador que cancele/restablezca este pago"
                        onClick={() => handleSolicitar(p)}
                      >
                        <FaFlag /> Solicitar cancelación
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
