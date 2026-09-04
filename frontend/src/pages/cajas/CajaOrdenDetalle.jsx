import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getOrdenCaja,
  registrarPago,
  deshacerCancelacionPago,
  agregarDescuento,
  actualizarDescuento,
  eliminarDescuento,
  marcarPendienteFactura,
  getNotaVentaPdfUrl,
  getRemisionPdfUrl,
  getReciboProvisionalPdfUrl,
  getReciboDolaresPdfUrl,
} from "../../api/cajas";
import { createTicket } from "../../api/tickets";
import { getAnticiposDisponibles } from "../../api/anticipos";
import { getValePdfUrl } from "../../api/vales";
import usePdfModal from "../../hooks/usePdfModal";
import { getUser } from "../../auth";
import { formatFecha } from "../../utils/fechas";
import { calcularTotalesOrden } from "../../utils/cajaTotales";
import CajaCostoVentaTable from "./components/CajaCostoVentaTable";
import CajaHistorialPagos from "./components/CajaHistorialPagos";
import CajaModalPago from "./components/CajaModalPago";
import CajaModalDescuento from "./components/CajaModalDescuento";
import CajaModalCancelarPago from "./components/CajaModalCancelarPago";
import CajaModalValeGarantia from "./components/CajaModalValeGarantia";

function formatMoney(n) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}

// El pago más reciente de un comprobante dado es el que se imprime.
function ultimoPago(pagos, comprobante) {
  return [...(pagos || [])]
    .filter((p) => p.comprobante === comprobante)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0] || null;
}

export default function CajaOrdenDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const rol = getUser()?.role;
  const esAdmin = rol === "admin";
  const esCajas = rol === "cajas";
  const { pdfModal, abrirPdf } = usePdfModal();

  const [orden, setOrden] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModalDescuento, setShowModalDescuento] = useState(false);
  const [showModalPago, setShowModalPago] = useState(false);
  const [pagoACancelar, setPagoACancelar] = useState(null);
  const [showModalValeGarantia, setShowModalValeGarantia] = useState(false);
  const [anticiposDisponibles, setAnticiposDisponibles] = useState([]);

  const cargar = async () => {
    try {
      setLoading(true);
      const res = await getOrdenCaja(id);
      setOrden(res.data.vehiculo);
    } catch (err) {
      console.error("Error cargando orden (cajas):", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Recibos de anticipo del cliente con saldo sin gastar, para poder elegir de
  // cuál aplicar en Registrar Pago. Se recarga cuando cambia el cliente o su
  // saldo a favor (p. ej. tras registrar un pago que consumió saldo).
  const clienteId = orden?.cliente?._id;
  const saldoAFavorCliente = orden?.cliente?.saldoAFavor || 0;
  useEffect(() => {
    let cancelado = false;
    if (!clienteId || saldoAFavorCliente <= 0) {
      setAnticiposDisponibles([]);
      return undefined;
    }
    getAnticiposDisponibles(clienteId)
      .then((res) => {
        if (!cancelado) setAnticiposDisponibles(res.data?.disponibles || []);
      })
      .catch(() => {
        if (!cancelado) setAnticiposDisponibles([]);
      });
    return () => {
      cancelado = true;
    };
  }, [clienteId, saldoAFavorCliente]);

  const totales = useMemo(() => (orden ? calcularTotalesOrden(orden) : null), [orden]);

  // No se cierra el modal aquí: tras registrar el pago, CajaModalPago se queda
  // abierto mostrando su panel de impresión (Vale, Nota/Remisión, recibos) y se
  // cierra solo cuando el cajero pulsa "Listo".
  const handleRegistrarPago = async (payload) => {
    const res = await registrarPago(orden._id, payload);
    setOrden(res.data.vehiculo);
    const pagos = res.data.vehiculo.pagos || [];
    return pagos[pagos.length - 1];
  };

  const handleAgregarDescuento = async (payload) => {
    const res = await agregarDescuento(orden._id, payload);
    setOrden(res.data.vehiculo);
  };

  const handleActualizarDescuento = async (descuentoId, payload) => {
    const res = await actualizarDescuento(orden._id, descuentoId, payload);
    setOrden(res.data.vehiculo);
  };

  const handleEliminarDescuento = async (descuentoId) => {
    const res = await eliminarDescuento(orden._id, descuentoId);
    setOrden(res.data.vehiculo);
  };

  const handleTogglePendienteFactura = async () => {
    const res = await marcarPendienteFactura(orden._id, !orden.pendienteFactura);
    setOrden(res.data.vehiculo);
  };

  // Atajo a Facturación: abre "Nueva Factura" con esta orden ya cargada. Si la
  // orden ya tiene factura(s), NuevaFactura ofrece Nota de crédito o Complemento
  // de pago sobre ellas en vez de volver a facturar.
  const irAFacturar = () => {
    navigate("/facturacion/nueva", {
      state: { ordenId: orden._id, ordenServicio: orden.ordenServicio },
    });
  };

  // El modal CajaModalCancelarPago llama a la API por sí mismo (3 modos:
  // pasa a factura existente / a la factura en curso / por error) y devuelve
  // la orden ya actualizada; aquí solo se refleja y se cierra el modal.
  const handlePagoActualizado = (vehiculo) => {
    setOrden(vehiculo);
    setPagoACancelar(null);
  };

  // Deshacer una cancelación mientras la factura real todavía no exista.
  const handleDeshacerCancelacion = async (pago) => {
    try {
      const res = await deshacerCancelacionPago(orden._id, pago._id);
      setOrden(res.data.vehiculo);
    } catch (err) {
      alert(err.response?.data?.msg || "No se pudo deshacer la cancelación.");
    }
  };

  // Para una cancelación POR ERROR (solo admin), un usuario no-admin abre un
  // ticket RESTABLECER_COBRO en Soporte con la orden ya ligada. Las
  // cancelaciones "pasa a factura" sí las hace Caja directo (ver el modal).
  const handleSolicitarCancelacion = async (pago, detalle) => {
    try {
      const res = await createTicket({
        tipoProblema: "RESTABLECER_COBRO",
        detalle,
        ordenServicio: orden._id,
        folioOrdenServicio: orden.ordenServicio,
      });
      alert(`Solicitud ${res.data.data.folio} enviada. Un administrador la revisará.`);
    } catch (err) {
      alert(err.response?.data?.msg || "Error al enviar la solicitud.");
    }
  };

  // Actualiza el "Último Vale" en memoria (sin volver a pedir toda la orden:
  // cargar() pasa por loading=true, que desmonta el modal y perdería su estado).
  const handleValeGuardado = (vale) => {
    setOrden((o) => (o ? { ...o, ultimoVale: { id: vale._id, noVale: vale.noVale, dig: vale.dig, fecha: vale.fecha } } : o));
  };

  const handleImprimirUltimoVale = () => {
    if (!orden.ultimoVale?.id) return;
    abrirPdf(getValePdfUrl(orden.ultimoVale.id), "vale.pdf", "Vale de Salida");
  };

  // Órdenes de garantía no se cobran (sin Registrar Pago), pero igual deben
  // poder salir del taller: CajaModalValeGarantia captura los datos y crea el
  // vale con estatus fijo "Garantia"; aquí solo se refleja el resultado.
  const handleValeGarantiaGuardado = (vale, imprimir) => {
    handleValeGuardado(vale);
    setShowModalValeGarantia(false);
    if (imprimir) abrirPdf(getValePdfUrl(vale._id), "vale.pdf", "Vale de Salida");
  };

  const handleImprimirNotaVenta = () => {
    const pago = ultimoPago(orden.pagos, "NOTA_VENTA");
    if (!pago) {
      alert("Esta orden no tiene ningún pago registrado con Nota de Venta.");
      return;
    }
    abrirPdf(getNotaVentaPdfUrl(orden._id, pago._id), "nota-venta.pdf", "Nota de Venta");
  };

  const handleImprimirRemision = () => {
    const pago = ultimoPago(orden.pagos, "REMISION");
    if (!pago) {
      alert("Esta orden no tiene ningún pago registrado con Remisión.");
      return;
    }
    abrirPdf(getRemisionPdfUrl(orden._id, pago._id), "remision.pdf", "Remisión");
  };

  // Imprime el comprobante de un pago específico desde el historial.
  const handleImprimirPago = (pago) => {
    if (pago.comprobante === "NOTA_VENTA") abrirPdf(getNotaVentaPdfUrl(orden._id, pago._id), "nota-venta.pdf", "Nota de Venta");
    else abrirPdf(getRemisionPdfUrl(orden._id, pago._id), "remision.pdf", "Remisión");
  };

  const handleImprimirReciboProvisional = (pago) =>
    abrirPdf(getReciboProvisionalPdfUrl(orden._id, pago._id), "recibo-provisional.pdf", "Recibo Provisional");

  const handleImprimirReciboDolares = (pago) =>
    abrirPdf(getReciboDolaresPdfUrl(orden._id, pago._id), "recibo-dolares.pdf", "Recibo en Dólares");

  if (loading) return <p className="text-center mt-4">Cargando orden...</p>;
  if (!orden) return <p className="text-center mt-4">Orden no encontrada.</p>;

  const c = orden.cliente || {};
  const nombreCliente =
    c.tipoCliente === "Particular"
      ? [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(" ")
      : c.gobierno?.nombreGobierno || c.nombre || "-";

  const ventaRows = orden.ventaCliente || [];
  const esGarantia = !!orden.garantia;

  return (
    <div>
      {/* ══════════════ SECCIÓN 1: NÚMERO DE ORDEN E INFORMACIÓN DEL VEHÍCULO ══════════════ */}
      <div className="border rounded p-3 mb-3">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <button className="btn btn-outline-secondary btn-sm" onClick={() => navigate(-1)}>
            ← Regresar
          </button>
          <h4 className="mb-0 fw-bold">
            Orden {orden.ordenServicio}
            {orden.pendienteFactura && (
              <span className="badge bg-warning text-dark ms-2">Pendiente de Factura</span>
            )}
          </h4>
          <div className="d-flex flex-column align-items-end gap-1">
            <button
              className="btn btn-outline-primary btn-sm"
              onClick={() => navigate(`/vehiculo/orden/${orden._id}?tab=reparacion`)}
            >
              Ver Orden
            </button>
            <div className="text-end">
              {orden.ultimoVale?.noVale ? (
                <>
                  <div className="fs-6">
                    Último Vale: <strong>{orden.ultimoVale.noVale}{orden.ultimoVale.dig ? `-${orden.ultimoVale.dig}` : ""}</strong>
                  </div>
                  {orden.ultimoVale.fecha && (
                    <div className="small text-muted">
                      {formatFecha(orden.ultimoVale.fecha, { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  )}
                </>
              ) : (
                <div className="small text-muted">Sin vale de salida</div>
              )}
            </div>
            {orden.ultimoVale?.id && (
              <button className="btn btn-outline-danger btn-sm" onClick={handleImprimirUltimoVale}>
                Imprimir Último Vale
              </button>
            )}
          </div>
        </div>

        {esGarantia && (
          <div className="alert alert-info py-2 mb-3">
            <strong>Orden de Garantía</strong> — no se cobra al cliente; solo se registra para el Reporte de Garantías.
          </div>
        )}

        <div className="row g-3">
          <div className="col-md-6">
            <div className="card h-100">
              <div className="card-header fw-semibold bg-light">Datos del Vehículo y Cliente</div>
              <div className="card-body p-0">
                <table className="table table-sm table-bordered mb-0">
                  <tbody>
                    <tr>
                      <th className="ps-2" style={{ width: "40%" }}>Cliente</th>
                      <td>
                        {nombreCliente || "-"}
                        {c.esEmpleado && (
                          <div><span className="badge bg-warning text-dark">Empleado</span></div>
                        )}
                      </td>
                    </tr>
                    {c.saldoAFavor > 0 && (
                      <tr>
                        <th className="ps-2">Saldo a Favor</th>
                        <td className="text-success fw-bold">{formatMoney(c.saldoAFavor)}</td>
                      </tr>
                    )}
                    <tr>
                      <th className="ps-2">Marca / Modelo</th>
                      <td>{(orden.marca || "") + (orden.modelo ? " / " + orden.modelo : "") || "-"}</td>
                    </tr>
                    <tr>
                      <th className="ps-2">Año / Color</th>
                      <td>{(orden.anio || "-") + " / " + (orden.color || "-")}</td>
                    </tr>
                    <tr>
                      <th className="ps-2">Serie</th>
                      <td>{orden.serie || "-"}</td>
                    </tr>
                    <tr>
                      <th className="ps-2">Placas</th>
                      <td>{orden.placas || "-"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="col-md-6">
            <div className="card h-100">
              <div className="card-header fw-semibold bg-light">Asesor y Refaccionario</div>
              <div className="card-body p-0">
                <table className="table table-sm table-bordered mb-0">
                  <tbody>
                    <tr>
                      <th className="ps-2" style={{ width: "40%" }}>Asesor de Servicio</th>
                      <td>
                        {orden.creadoPor || "-"}
                        {orden.grupoId?.nombre && (
                          <div className="small text-muted">
                            Grupo: {orden.grupoId.nombre}
                            {Array.isArray(orden.grupoId.miembros) && orden.grupoId.miembros.length > 0 && (
                              <> ({orden.grupoId.miembros.map((m) => m.name).join(", ")})</>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <th className="ps-2">Refaccionario</th>
                      <td>{orden.devueltoPor || "-"}</td>
                    </tr>
                    <tr>
                      <th className="ps-2">Fecha Recepción</th>
                      <td>{formatFecha(orden.fechaRecepcion) || "-"}</td>
                    </tr>
                    <tr>
                      <th className="ps-2">Fecha de Cierre</th>
                      <td>{formatFecha(orden.fechaCierre) || "-"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════ SECCIÓN 2: SALDO PENDIENTE, TABLA Y BOTONES ══════════════ */}
      <div className="border rounded p-3 mb-3">
        <div className="row">
          <div className="col-md-9">
            {/* TOTALES: visibles en cualquier estado de la orden para poder
                consultar el saldo pendiente aunque todavía no esté cerrada
                (nunca en garantías, que no se cobran) */}
            {!esGarantia && (
              <div className="row text-center mb-4">
                <div className="col-md-4">
                  <div className="card card-body">
                    <span className="fw-bold">Total de la Orden</span>
                    <span className="fs-5">{formatMoney(totales.totalOrden)}</span>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="card card-body">
                    <span className="fw-bold text-success">Total Abonado</span>
                    <span className="fs-5 text-success">{formatMoney(totales.totalAbonado)}</span>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="card card-body">
                    <span className="fw-bold text-danger">Saldo Pendiente</span>
                    <span className="fs-5 text-danger">{formatMoney(totales.saldoPendiente)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* TABLA COSTO / VENTA (solo lectura) */}
            <h5 className="fw-semibold mb-2">Costo de Venta</h5>
            <CajaCostoVentaTable
              rows={ventaRows}
              descuentos={orden.descuentos || []}
              totales={totales}
              ocultarPrecios={esGarantia}
            />

          </div>

          {/* BOTONES LATERALES */}
          <div className="col-md-3 d-flex flex-column gap-2">
            {esGarantia && (
              <button className="btn btn-success" onClick={() => setShowModalValeGarantia(true)}>
                Generar Vale de Salida
              </button>
            )}
            {!esGarantia && (
              <button className="btn btn-success" onClick={() => setShowModalPago(true)}>
                Registrar Pago / Abono
              </button>
            )}
            {!esGarantia && (
              <>
                <button className="btn btn-danger" onClick={handleImprimirNotaVenta}>
                  Imprimir Nota Venta
                </button>
                <button className="btn btn-danger" onClick={handleImprimirRemision}>
                  Imprimir Remisión
                </button>
              </>
            )}
            {!esGarantia && (
              <button className="btn btn-primary" onClick={irAFacturar}>
                Facturar
              </button>
            )}
            {!esGarantia && (
              <button className="btn btn-warning" onClick={() => setShowModalDescuento(true)}>
                Agregar Descuento
              </button>
            )}
            {!esGarantia && (
              <button
                className={`btn ${orden.pendienteFactura ? "btn-outline-warning" : "btn-outline-dark"}`}
                onClick={handleTogglePendienteFactura}
              >
                {orden.pendienteFactura ? "Quitar de Pendientes de Factura" : "Marcar Pendiente de Factura"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════ SECCIÓN 3: HISTORIAL DE PAGOS / ABONOS ══════════════ */}
      <div className="border rounded p-3">
        <h5 className="fw-semibold mb-2">Historial de Pagos / Abonos</h5>
        <CajaHistorialPagos
          pagos={orden.pagos || []}
          onImprimir={handleImprimirPago}
          onImprimirReciboProvisional={handleImprimirReciboProvisional}
          onImprimirReciboDolares={handleImprimirReciboDolares}
          puedeCancelar={esAdmin || esCajas}
          onCancelar={setPagoACancelar}
          esAdmin={esAdmin}
          onDeshacerCancelacion={handleDeshacerCancelacion}
          puedeSolicitarCancelacion={!esAdmin}
          onSolicitarCancelacion={handleSolicitarCancelacion}
        />
      </div>

      <CajaModalPago
        show={showModalPago}
        orden={orden}
        saldoPendiente={totales.saldoPendiente}
        saldoClienteDisponible={orden.cliente?.saldoAFavor || 0}
        anticiposDisponibles={anticiposDisponibles}
        onClose={() => setShowModalPago(false)}
        onSubmit={handleRegistrarPago}
        onValeGuardado={handleValeGuardado}
      />
      <CajaModalDescuento
        show={showModalDescuento}
        descuentos={orden.descuentos || []}
        ventaRows={ventaRows}
        onClose={() => setShowModalDescuento(false)}
        onAdd={handleAgregarDescuento}
        onUpdate={handleActualizarDescuento}
        onDelete={handleEliminarDescuento}
      />
      <CajaModalCancelarPago
        show={!!pagoACancelar}
        pago={pagoACancelar}
        orden={orden}
        esAdmin={esAdmin}
        onClose={() => setPagoACancelar(null)}
        onConfirmado={handlePagoActualizado}
      />
      <CajaModalValeGarantia
        show={showModalValeGarantia}
        orden={orden}
        onClose={() => setShowModalValeGarantia(false)}
        onGuardado={handleValeGarantiaGuardado}
      />
      {pdfModal}
    </div>
  );
}
