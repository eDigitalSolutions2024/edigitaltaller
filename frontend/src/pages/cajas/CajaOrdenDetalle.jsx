import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getOrdenCaja,
  registrarPago,
  cancelarPagoCaja,
  agregarDescuento,
  actualizarDescuento,
  eliminarDescuento,
  openNotaVentaPdf,
  openRemisionPdf,
  openReciboProvisionalPdf,
  openReciboDolaresPdf,
} from "../../api/cajas";
import { createTicket } from "../../api/tickets";
import { openValePdf } from "../../api/vales";
import http from "../../api/http";
import { getUser } from "../../auth";
import { formatFecha } from "../../utils/fechas";
import { TARIFA_HORA, calcImporteHoras } from "../../utils/manoObra";
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
  const esAdmin = getUser()?.role === "admin";

  const [orden, setOrden] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModalDescuento, setShowModalDescuento] = useState(false);
  const [showModalPago, setShowModalPago] = useState(false);
  const [pagoACancelar, setPagoACancelar] = useState(null);
  const [showModalValeGarantia, setShowModalValeGarantia] = useState(false);

  const [mecanicos, setMecanicos] = useState([]);
  const [carroceros, setCarroceros] = useState([]);

  useEffect(() => {
    Promise.all([
      http.get("/empleados?puesto=mecanico&activo=true"),
      http.get("/empleados?puesto=carrocero&activo=true"),
    ])
      .then(([resMec, resCar]) => {
        setMecanicos(resMec.data?.data || resMec.data || []);
        setCarroceros(resCar.data?.data || resCar.data || []);
      })
      .catch((err) => console.error("Error cargando empleados:", err));
  }, []);

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

  const totales = useMemo(() => (orden ? calcularTotalesOrden(orden) : null), [orden]);

  const getNombreMecanico = (idEmpleado) =>
    mecanicos.find((m) => m._id === idEmpleado)?.nombre || idEmpleado || "—";

  const getNombreCarrocero = (idEmpleado) =>
    carroceros.find((c) => c._id === idEmpleado)?.nombre || idEmpleado || "—";

  const nombreManoObra = (m) =>
    m.esCarroceria ? getNombreCarrocero(m.carrocero) : getNombreMecanico(m.mecanico);

  const handleRegistrarPago = async (payload) => {
    const res = await registrarPago(orden._id, payload);
    setOrden(res.data.vehiculo);
    setShowModalPago(false);
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

  // Restablecer un abono/anticipo/remisión/nota de venta: solo admin (botón
  // en el historial, resuelto en el modal CajaModalCancelarPago). El pago
  // conserva su folio, queda marcado "cancelado" y el PDF del comprobante
  // muestra la marca de agua "CANCELADO".
  const handleConfirmarCancelarPago = async (motivo) => {
    const res = await cancelarPagoCaja(orden._id, pagoACancelar._id, { motivo });
    setOrden(res.data.vehiculo);
    setPagoACancelar(null);
  };

  // Caja no puede cancelar directamente: abre un ticket RESTABLECER_COBRO en
  // Soporte con la orden ya ligada, para que un admin lo revise y lo cancele
  // desde este mismo historial (ver handleConfirmarCancelarPago arriba).
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
    openValePdf(orden.ultimoVale.id);
  };

  // Órdenes de garantía no se cobran (sin Registrar Pago), pero igual deben
  // poder salir del taller: CajaModalValeGarantia captura los datos y crea el
  // vale con estatus fijo "Garantia"; aquí solo se refleja el resultado.
  const handleValeGarantiaGuardado = (vale, imprimir) => {
    handleValeGuardado(vale);
    setShowModalValeGarantia(false);
    if (imprimir) openValePdf(vale._id);
  };

  const handleImprimirNotaVenta = () => {
    const pago = ultimoPago(orden.pagos, "NOTA_VENTA");
    if (!pago) {
      alert("Esta orden no tiene ningún pago registrado con Nota de Venta.");
      return;
    }
    openNotaVentaPdf(orden._id, pago._id);
  };

  const handleImprimirRemision = () => {
    const pago = ultimoPago(orden.pagos, "REMISION");
    if (!pago) {
      alert("Esta orden no tiene ningún pago registrado con Remisión.");
      return;
    }
    openRemisionPdf(orden._id, pago._id);
  };

  // Imprime el comprobante de un pago específico desde el historial.
  const handleImprimirPago = (pago) => {
    if (pago.comprobante === "NOTA_VENTA") openNotaVentaPdf(orden._id, pago._id);
    else openRemisionPdf(orden._id, pago._id);
  };

  const handleImprimirReciboProvisional = (pago) => openReciboProvisionalPdf(orden._id, pago._id);

  const handleImprimirReciboDolares = (pago) => openReciboDolaresPdf(orden._id, pago._id);

  if (loading) return <p className="text-center mt-4">Cargando orden...</p>;
  if (!orden) return <p className="text-center mt-4">Orden no encontrada.</p>;

  const c = orden.cliente || {};
  const nombreCliente =
    c.tipoCliente === "Particular"
      ? [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(" ")
      : c.gobierno?.nombreGobierno || c.nombre || "-";

  const manoObra = orden.manoObra || [];
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
          <h4 className="mb-0 fw-bold">Orden {orden.ordenServicio}</h4>
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
                      <td>{nombreCliente || "-"}</td>
                    </tr>
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
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* MANO DE OBRA: informativa, siempre visible */}
        <div className="card mt-3">
          <div className="card-header fw-semibold bg-light">Mano de Obra</div>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-sm table-bordered align-middle mb-0">
                <thead className="table-light text-center">
                  <tr>
                    <th>Reparación / Servicio</th>
                    <th>Mecánico/Carrocero</th>
                    <th>Horas</th>
                    <th>Total x Horas ({formatMoney(TARIFA_HORA)} / hora)</th>
                    <th>Fecha de Pago</th>
                    <th>Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {manoObra.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center text-muted">
                        No hay mano de obra registrada.
                      </td>
                    </tr>
                  )}
                  {manoObra.map((m, idx) => (
                    <tr key={idx}>
                      <td>{m.concepto}</td>
                      <td>{nombreManoObra(m)}</td>
                      <td className="text-center">{m.horas}</td>
                      <td className="text-end fw-bold">{formatMoney(calcImporteHoras(m.horas))}</td>
                      <td className="text-center">{formatFecha(m.fechaPago)}</td>
                      <td>{m.observaciones}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════ SECCIÓN 2: SALDO PENDIENTE, TABLA Y BOTONES ══════════════ */}
      <div className="border rounded p-3 mb-3">
        <div className="row">
          <div className="col-md-9">
            {/* TOTALES: solo relevantes una vez que la orden está Cerrada (y nunca en garantías, que no se cobran) */}
            {!esGarantia && orden.estadoOrden === "CERRADA" && (
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
              <button className="btn btn-warning" onClick={() => setShowModalDescuento(true)}>
                Agregar Descuento
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
          puedeCancelar={esAdmin}
          onCancelar={setPagoACancelar}
          puedeSolicitarCancelacion={!esAdmin}
          onSolicitarCancelacion={handleSolicitarCancelacion}
        />
      </div>

      <CajaModalPago
        show={showModalPago}
        orden={orden}
        saldoPendiente={totales.saldoPendiente}
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
        onClose={() => setPagoACancelar(null)}
        onConfirm={handleConfirmarCancelarPago}
      />
      <CajaModalValeGarantia
        show={showModalValeGarantia}
        orden={orden}
        onClose={() => setShowModalValeGarantia(false)}
        onGuardado={handleValeGarantiaGuardado}
      />
    </div>
  );
}
