import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getOrdenCaja,
  registrarPago,
  agregarDescuento,
  actualizarDescuento,
  eliminarDescuento,
  openNotaVentaPdf,
  openRemisionPdf,
} from "../../api/cajas";
import http from "../../api/http";
import { formatFecha } from "../../utils/fechas";
import { TARIFA_HORA, calcImporteHoras } from "../../utils/manoObra";
import { calcularTotalesOrden } from "../../utils/cajaTotales";
import CajaCostoVentaTable from "./components/CajaCostoVentaTable";
import CajaHistorialPagos from "./components/CajaHistorialPagos";
import CajaModalPago from "./components/CajaModalPago";
import CajaModalDescuento from "./components/CajaModalDescuento";

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

  const [orden, setOrden] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showManoObra, setShowManoObra] = useState(false);
  const [showModalDescuento, setShowModalDescuento] = useState(false);
  const [showModalPago, setShowModalPago] = useState(false);

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

  if (loading) return <p className="text-center mt-4">Cargando orden...</p>;
  if (!orden) return <p className="text-center mt-4">Orden no encontrada.</p>;

  const c = orden.cliente || {};
  const nombreCliente =
    c.tipoCliente === "Particular"
      ? [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(" ")
      : c.gobierno?.nombreGobierno || c.empresa?.razonSocial || c.nombre || "-";

  const manoObra = orden.manoObra || [];
  const ventaRows = orden.ventaCliente || [];

  return (
    <div>
      {/* ══════════════ SECCIÓN 1: NÚMERO DE ORDEN E INFORMACIÓN DEL VEHÍCULO ══════════════ */}
      <div className="border rounded p-3 mb-3">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <button className="btn btn-outline-secondary btn-sm" onClick={() => navigate(-1)}>
            ← Regresar
          </button>
          <h4 className="mb-0 fw-bold">Orden {orden.ordenServicio}</h4>
          <button
            className="btn btn-outline-primary btn-sm"
            onClick={() => navigate(`/vehiculo/orden/${orden._id}?tab=reparacion`)}
          >
            Ver Orden
          </button>
        </div>

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
                      <td>{orden.creadoPor || "-"}</td>
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
      </div>

      {/* ══════════════ SECCIÓN 2: SALDO PENDIENTE, TABLA Y BOTONES ══════════════ */}
      <div className="border rounded p-3 mb-3">
        <div className="row">
          <div className="col-md-9">
            {/* TOTALES */}
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

            {/* TABLA COSTO / VENTA (solo lectura) */}
            <h5 className="fw-semibold mb-2">Costo de Venta</h5>
            <CajaCostoVentaTable rows={ventaRows} descuentos={orden.descuentos || []} totales={totales} />

            {/* MANO DE OBRA (toggle) */}
            {showManoObra && (
              <>
                <h5 className="fw-semibold mt-4 mb-2">Mano de Obra</h5>
                <div className="table-responsive mb-4">
                  <table className="table table-sm table-bordered align-middle">
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
              </>
            )}
          </div>

          {/* BOTONES LATERALES */}
          <div className="col-md-3 d-flex flex-column gap-2">
            <button className="btn btn-outline-secondary" onClick={() => setShowManoObra((s) => !s)}>
              {showManoObra ? "Ocultar" : "Mostrar"} Mano de Obra
            </button>
            <button className="btn btn-danger" onClick={handleImprimirNotaVenta}>
              Imprimir Nota Venta
            </button>
            <button className="btn btn-danger" onClick={handleImprimirRemision}>
              Imprimir Remisión
            </button>
            <button className="btn btn-warning" onClick={() => setShowModalDescuento(true)}>
              Agregar Descuento
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════ SECCIÓN 3: HISTORIAL DE PAGOS / ABONOS ══════════════ */}
      <div className="border rounded p-3">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <h5 className="fw-semibold mb-0">Historial de Pagos / Abonos</h5>
          <button className="btn btn-success btn-sm" onClick={() => setShowModalPago(true)}>
            Registrar Pago / Abono
          </button>
        </div>
        <CajaHistorialPagos pagos={orden.pagos || []} onImprimir={handleImprimirPago} />
      </div>

      <CajaModalPago
        show={showModalPago}
        saldoPendiente={totales.saldoPendiente}
        onClose={() => setShowModalPago(false)}
        onSubmit={handleRegistrarPago}
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
    </div>
  );
}
