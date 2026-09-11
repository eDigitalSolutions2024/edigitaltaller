import React, { useState } from "react";
import Dropdown from "../../../components/Dropdown";
import { FaPrint, FaBan, FaUndo, FaRegCalendarAlt } from "react-icons/fa";
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
  if (p.comprobante === "SIN_COMPROBANTE") return "Sin comprobante";
  return "-";
}

// Etiqueta y color del badge de una cancelación según su tipo.
function badgeCancelacion(p) {
  if (p.motivoCancelacionTipo === "PASA_A_FACTURA" || p.facturaId) {
    return { texto: "Pasó a factura", clase: "bg-secondary" };
  }
  return { texto: "Cancelado", clase: "bg-danger" };
}

// Facturas (CFDI) ya generadas para la orden: se muestran como filas de solo
// lectura en el mismo historial (sin botón de cancelar por ahora).
const TIPO_FACTURA_LABEL = {
  factura: "Factura",
  notaCredito: "Nota de Crédito",
  complementoPago: "Complemento de Pago",
  facturaGlobal: "Factura Global",
};

function facturaFolioLabel(f) {
  return [f.serie, f.folio].filter(Boolean).join("-") || "-";
}

export default function CajaHistorialPagos({
  pagos = [],
  facturas = [],
  onImprimir,
  onImprimirReciboProvisional,
  onImprimirReciboDolares,
  puedeCancelar = false,
  onCancelar,
  esAdmin = false,
  onDeshacerCancelacion,
  onEditarFecha,
}) {
  const [filtro, setFiltro] = useState("TODOS");

  // Los pagos cancelados se van SIEMPRE al final (aunque su fecha sea mayor);
  // dentro de cada grupo, del más reciente al más antiguo.
  const ordenados = [...pagos].sort((a, b) => {
    if (!!a.cancelado !== !!b.cancelado) return a.cancelado ? 1 : -1;
    return new Date(b.fecha) - new Date(a.fecha);
  });
  const pagosVisibles = filtro === "TODOS" ? ordenados : ordenados.filter((p) => p.comprobante === filtro);

  // Las facturas son un tipo de comprobante aparte (no un `pago`): siempre se
  // muestran, sin importar el filtro de comprobantes de arriba.
  const filasFacturas = facturas.map((f) => ({ ...f, _esFactura: true }));

  // Igual que los pagos: las canceladas se van al final; el resto, más
  // reciente primero.
  const visibles = [...pagosVisibles, ...filasFacturas].sort((a, b) => {
    const aCancelado = a._esFactura ? a.estatus === "cancelada" : !!a.cancelado;
    const bCancelado = b._esFactura ? b.estatus === "cancelada" : !!b.cancelado;
    if (aCancelado !== bCancelado) return aCancelado ? 1 : -1;
    return new Date(b.fecha) - new Date(a.fecha);
  });

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
          <Dropdown.Option value="SIN_COMPROBANTE">Sin comprobante</Dropdown.Option>
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
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center text-muted">
                  No hay pagos registrados.
                </td>
              </tr>
            )}
            {visibles.map((p, idx) => {
              if (p._esFactura) {
                const cancelada = p.estatus === "cancelada";
                return (
                  <tr key={p._id || idx} className={cancelada ? "table-secondary text-decoration-line-through" : ""}>
                    <td className="text-center text-nowrap">{formatFecha(p.fecha)}</td>
                    <td className="text-center">{TIPO_FACTURA_LABEL[p.tipoFactura] || "Factura"}</td>
                    <td className="text-center">
                      {facturaFolioLabel(p)}
                      {cancelada && (
                        <span className="badge ms-1 bg-danger" title="Factura cancelada">
                          Cancelada
                        </span>
                      )}
                    </td>
                    <td className="text-end">{formatMoney(p.totales?.total)}</td>
                    <td className="text-end">-</td>
                    <td className="text-end">-</td>
                    <td className="text-end fw-bold">{formatMoney(p.totales?.total)}</td>
                    <td>{p.notaFacturacion}</td>
                    <td>{p.generadoPor}</td>
                    <td className="text-center"></td>
                  </tr>
                );
              }
              return (
              <tr key={p._id || idx} className={p.cancelado ? "table-secondary text-decoration-line-through" : ""}>
                <td className="text-center text-nowrap">
                  {onEditarFecha && !p.cancelado ? (
                    <button
                      className="btn btn-link btn-sm p-0 text-decoration-none"
                      title="Corregir la fecha de este pago"
                      onClick={() => onEditarFecha(p)}
                    >
                      {formatFecha(p.fecha)} <FaRegCalendarAlt className="ms-1" />
                    </button>
                  ) : (
                    formatFecha(p.fecha)
                  )}
                  {p.motivoCambioFecha && (
                    <span
                      className="badge bg-warning text-dark ms-1"
                      title={`Fecha corregida${p.fechaEditadaPor ? ` por ${p.fechaEditadaPor}` : ""}: ${p.motivoCambioFecha}`}
                    >
                      fecha editada
                    </span>
                  )}
                </td>
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
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
