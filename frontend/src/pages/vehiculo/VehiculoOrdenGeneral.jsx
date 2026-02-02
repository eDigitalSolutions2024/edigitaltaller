// src/pages/vehiculo/VehiculoOrdenGeneral.jsx
import React, { useState } from "react";
import { closeOrden } from "../../api/vehiculos";

function formatFecha(fechaIso) {
  if (!fechaIso) return "";
  const d = new Date(fechaIso);
  if (isNaN(d.getTime())) return fechaIso;
  return d.toLocaleDateString("es-MX");
}

function formatMoney(n) {
  if (n === "" || n === null || n === undefined) return "";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}

export default function VehiculoOrdenGeneral({ orden, onClosed }) {
  // 👇 hooks SIEMPRE al inicio, sin if antes
  const [cerrando, setCerrando] = useState(false);

  // si no hay orden, ya después puedes salir
  if (!orden) return null;

  const yaCerrada = orden.estadoOrden === "CERRADA";

  const handleCerrarOrden = async () => {
    if (yaCerrada) return;

    const ok = window.confirm(
      "¿Seguro que deseas CERRAR esta orden de servicio? Ya no podrás modificarla."
    );
    if (!ok) return;

    try {
      setCerrando(true);
      const res = await closeOrden(orden._id);
      const vAct = res.data.vehiculo;

      if (onClosed) onClosed(vAct);
      else alert("Orden cerrada correctamente.");
    } catch (err) {
      console.error(err);
      alert("Error al cerrar la orden.");
    } finally {
      setCerrando(false);
    }
  };

  // --- TELÉFONOS ---
  const telefonoFijo =
    (orden.telefonoFijoLada ? orden.telefonoFijoLada + " " : "") +
    (orden.telefonoFijo || "");

  let celular = "";
  if (typeof orden.celular === "string") {
    celular = orden.celular;
  } else if (orden.celular) {
    celular = [orden.celular.lada, orden.celular.numero]
      .filter(Boolean)
      .join(" ");
  }

  // --- DIRECCIÓN ---
  let direccionTexto = "";
  if (typeof orden.direccion === "string") {
    direccionTexto = orden.direccion;
  } else if (orden.direccion && typeof orden.direccion === "object") {
    direccionTexto = [
      orden.direccion.calle,
      orden.direccion.colonia,
      orden.direccion.ciudad,
      orden.direccion.estado,
      orden.direccion.cp,
    ]
      .filter(Boolean)
      .join(", ");
  } else {
    direccionTexto = [
      orden.direccionCalle,
      orden.colonia,
      orden.ciudad,
      orden.estado,
      orden.codigoPostal,
    ]
      .filter(Boolean)
      .join(", ");
  }

  // --- LISTAS (amarradas al modelo actual) ---
  const refacciones = orden.refaccionesSolicitadas || [];

  const ventaItems =
    (Array.isArray(orden.ventaCliente) && orden.ventaCliente.length > 0
      ? orden.ventaCliente
      : orden.cargosEnOrden) || [];

  const manoObra = orden.manoObra || [];
  const pagos = orden.pagos || [];

  // --- TOTALES ---
  const totalConIva = orden.totalConIva || "";
  const iva = orden.iva || "";

  const totalPagado = pagos.reduce(
    (acc, p) => acc + Number(p.monto || p.amount || 0),
    0
  );

  const restante =
    totalConIva && !isNaN(totalConIva)
      ? Number(totalConIva) - totalPagado
      : "";

  return (
    <div className="card card-body mb-4">
      {/* TÍTULO + BOTÓN CERRAR */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">VISTA GENERAL DE LA ORDEN DE SERVICIO</h4>

        <button
          type="button"
          className="btn btn-danger btn-sm"
          onClick={handleCerrarOrden}
          disabled={cerrando || yaCerrada}
        >
          {yaCerrada ? "Orden cerrada" : cerrando ? "Cerrando..." : "Cerrar orden"}
        </button>
      </div>

      {/* ESTATUS */}
      <div className="text-center mb-3">
        <span className="badge bg-warning text-dark px-4 py-2">
          Estatus de la Orden de Servicio:{" "}
          <strong>{orden.estadoOrden || "En proceso"}</strong>
        </span>
      </div>

      {/* DATOS GENERALES */}
      <h5 className="mt-3 mb-2">Datos generales</h5>
      <div className="row g-2 mb-3">
        <div className="col-md-6">
          <div className="mb-1">
            <strong>Orden de Servicio:</strong>{" "}
            {orden.ordenServicio || orden._id}
          </div>
          <div className="mb-1">
            <strong>Nombre Empresa:</strong> {orden.nombreGobierno || ""}
          </div>
          <div className="mb-1">
            <strong>Nombre Contacto Empresa:</strong>{" "}
            {orden.nombreContactoGobierno || ""}
          </div>
          <div className="mb-1">
            <strong>Teléfono fijo:</strong> {telefonoFijo}
          </div>
          <div className="mb-1">
            <strong>Celular:</strong> {celular}
          </div>
          <div className="mb-1">
            <strong>Dirección:</strong> {direccionTexto}
          </div>
          <div className="mb-1">
            <strong>RFC:</strong> {orden.rfc || ""}
          </div>
        </div>

        <div className="col-md-6">
          <div className="mb-1">
            <strong>Fecha recepción:</strong>{" "}
            {formatFecha(orden.fechaRecepcion)}
          </div>
          <div className="mb-1">
            <strong>Hora:</strong> {orden.horaRecepcion || ""}
          </div>
          <div className="mb-1">
            <strong>Marca:</strong> {orden.marca || ""}
          </div>
          <div className="mb-1">
            <strong>Modelo:</strong> {orden.modelo || ""}
          </div>
          <div className="mb-1">
            <strong>Año:</strong> {orden.anio || ""}
          </div>
          <div className="mb-1">
            <strong>Color:</strong> {orden.color || ""}
          </div>
          <div className="mb-1">
            <strong>Serie:</strong> {orden.serie || ""}
          </div>
          <div className="mb-1">
            <strong>Placas:</strong> {orden.placas || ""}
          </div>
          <div className="mb-1">
            <strong>KMS/Millas:</strong> {orden.kmsMillas || ""}
          </div>
        </div>
      </div>

      {/* USUARIOS */}
      <h5 className="mt-3 mb-2 text-center">USUARIOS</h5>
      <div className="row mb-3">
        <div className="col-md-4">
          <strong>Asesor de Servicio:</strong> {orden.asesorServicio || ""}
        </div>
        <div className="col-md-4">
          <strong>Refaccionario:</strong> {orden.refaccionario || ""}
        </div>
        <div className="col-md-4">
          <strong>Mecánico principal:</strong>{" "}
          {orden.mecanicoPrincipal || ""}
        </div>
      </div>

      {/* COMPRAS */}
      <h5 className="mt-3 mb-2 text-center">COMPRAS (REFACCIONES)</h5>
      <div className="table-responsive mb-3">
        <table className="table table-sm table-bordered align-middle">
          <thead className="table-light">
            <tr>
              <th>Cant</th>
              <th>Unidad</th>
              <th>Refacción</th>
              <th>Marca</th>
              <th>Proveedor</th>
              <th>Código</th>
              <th>Precio Unitario</th>
              <th>Importe Total</th>
              <th>Moneda</th>
              <th>Estatus</th>
              <th>Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {refacciones.length === 0 && (
              <tr>
                <td colSpan={11} className="text-center">
                  No hay refacciones registradas.
                </td>
              </tr>
            )}
            {refacciones.map((r, idx) => (
              <tr key={idx}>
                <td>{r.cant ?? r.cantidad}</td>
                <td>{r.unidad}</td>
                <td>{r.refaccion}</td>
                <td>{r.marca}</td>
                <td>{r.proveedor}</td>
                <td>{r.codigo}</td>
                <td>{formatMoney(r.precioUnitario)}</td>
                <td>{formatMoney(r.importeTotal)}</td>
                <td>{r.moneda}</td>
                <td>{r.estatus || ""}</td>
                <td>{r.observaciones}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* VENTA */}
      <h5 className="mt-3 mb-2 text-center">VENTA AL CLIENTE</h5>
      <div className="table-responsive mb-3">
        <table className="table table-sm table-bordered align-middle">
          <thead className="table-light">
            <tr>
              <th>Cantidad</th>
              <th>Concepto / Servicio</th>
              <th>Refacción</th>
              <th>Código</th>
              <th>M.O. (Hrs)</th>
              <th>Precio Venta (Sin IVA)</th>
              <th>Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {ventaItems.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center">
                  No hay partidas de venta registradas.
                </td>
              </tr>
            )}
            {ventaItems.map((v, idx) => (
              <tr key={idx}>
                <td>{v.cant ?? v.cantidad}</td>
                <td>{v.concepto}</td>
                <td>{v.refaccion || ""}</td>
                <td>{v.codigo || ""}</td>
                <td>{v.horasMO ?? v.horas ?? ""}</td>
                <td>
                  {formatMoney(
                    v.precioVenta ?? v.precioSinIva ?? v.precioUnitario
                  )}
                </td>
                <td>{v.observaciones || v.observInt || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MANO DE OBRA */}
      <h5 className="mt-4 mb-2 text-center">MANO DE OBRA</h5>
      <div className="table-responsive mb-3">
        <table className="table table-sm table-bordered align-middle">
          <thead className="table-light">
            <tr>
              <th>Reparación / Servicio</th>
              <th>Mecánico</th>
              <th>Horas</th>
              <th>Fecha de Pago</th>
              <th>Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {manoObra.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center">
                  No hay mano de obra registrada.
                </td>
              </tr>
            )}
            {manoObra.map((m, idx) => (
              <tr key={idx}>
                <td>{m.servicio || m.concepto}</td>
                <td>{m.mecanico?.nombre || m.mecanico}</td>
                <td>{m.horas}</td>
                <td>{formatFecha(m.fechaPago)}</td>
                <td>{m.observaciones}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* TIPO DE CIERRE */}
      <h5 className="mt-4 mb-2 text-center">TIPO DE CIERRE</h5>
      <div className="row mb-3">
        <div className="col-md-4">
          <strong>Comprobante:</strong>{" "}
          {orden.comprobante || orden.tipoComprobante || ""}
        </div>
        <div className="col-md-4">
          <strong>Acción:</strong> {orden.accionCierre || ""}
        </div>
        <div className="col-md-4">
          <strong>CxC:</strong>{" "}
          {orden.cxcValorActual || orden.cxc || ""}
        </div>
      </div>

      {/* PAGOS / ABONOS / ANTICIPOS */}
      <h5 className="mt-3 mb-2 text-center">PAGOS / ABONOS / ANTICIPOS</h5>
      <div className="row mb-2">
        <div className="col-md-4">
          <strong>Total a Pagar con IVA:</strong>{" "}
          {formatMoney(totalConIva)}
        </div>
        <div className="col-md-4">
          <strong>IVA:</strong> {formatMoney(iva)}
        </div>
        <div className="col-md-4">
          <strong>Cantidad Restante:</strong>{" "}
          {restante !== "" ? formatMoney(restante) : ""}
        </div>
      </div>

      {/* DESGLOSE DEL PAGO */}
      <h6 className="mt-3 mb-2">Desglose del pago</h6>
      <div className="row g-2 mb-3">
        <div className="col-md-4">
          <strong>Cantidad en Pesos:</strong>{" "}
          {formatMoney(orden.pagoPesos)}
        </div>
        <div className="col-md-4">
          <strong>Transferencia:</strong>{" "}
          {formatMoney(orden.pagoTransferencia)}
        </div>
        <div className="col-md-4">
          <strong>Cantidad Dólares (Si aplica):</strong>{" "}
          {orden.pagoDolares || ""}
        </div>

        <div className="col-md-4">
          <strong>Cheque:</strong> {formatMoney(orden.pagoCheque)}
        </div>
        <div className="col-md-4">
          <strong>Referencia Cuenta de Pago:</strong>{" "}
          {orden.referenciaCuentaPago || ""}
        </div>
        <div className="col-md-4">
          <strong>Dólares a Pesos Referencia:</strong>{" "}
          {orden.tipoCambio || ""}
        </div>

        <div className="col-md-4">
          <strong>T. Débito:</strong> {formatMoney(orden.pagoDebito)}
        </div>
        <div className="col-md-4">
          <strong>T. Crédito:</strong> {formatMoney(orden.pagoCredito)}
        </div>
        <div className="col-md-4">
          <strong>Aplicar Varias Formas de Pago:</strong>{" "}
          {orden.aplicaVariasFormasPago ? "SÍ" : "NO"}
        </div>

        <div className="col-md-4">
          <strong>Fecha Cierre (Si aplica):</strong>{" "}
          {formatFecha(orden.fechaCierre)}
        </div>
        <div className="col-md-4">
          <strong>Descuento:</strong> {formatMoney(orden.descuento)}
        </div>
        <div className="col-md-4">
          <strong>Cambio:</strong> {formatMoney(orden.cambio)}
        </div>

        <div className="col-md-12">
          <strong>Notas:</strong>{" "}
          {orden.notasPago || ""}
        </div>

        <div className="col-md-12 mt-2">
          <strong>Total:</strong> {formatMoney(orden.totalPago)}
        </div>
      </div>

      {/* LISTA DE PAGOS */}
      <h6 className="mt-3 mb-2">Pagos ingresados</h6>
      <div className="table-responsive mb-3">
        <table className="table table-sm table-bordered align-middle">
          <thead className="table-light">
            <tr>
              <th>Fecha</th>
              <th>Forma de pago</th>
              <th>Monto</th>
              <th>Referencia</th>
              <th>Notas</th>
            </tr>
          </thead>
          <tbody>
            {pagos.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center">
                  No hay pagos registrados.
                </td>
              </tr>
            )}
            {pagos.map((p, idx) => (
              <tr key={idx}>
                <td>{formatFecha(p.fecha)}</td>
                <td>{p.formaPago}</td>
                <td>{formatMoney(p.monto || p.amount)}</td>
                <td>{p.referencia}</td>
                <td>{p.notas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ABONOS / ANTICIPOS / DESCUENTOS (placeholder) */}
      <h6 className="mt-3 mb-2 text-center">ABONOS DE CRÉDITO</h6>
      <p className="text-center text-muted">
        (A implementar más adelante, según la definición de abonos en el sistema.)
      </p>

      <h6 className="mt-3 mb-2 text-center">ANTICIPOS</h6>
      <p className="text-center text-muted">
        (A implementar más adelante.)
      </p>

      <h6 className="mt-3 mb-2 text-center">DESCUENTOS</h6>
      <p className="text-center text-muted">
        (A implementar más adelante.)
      </p>

      {/* OBSERVACIONES */}
      <h5 className="mt-4 mb-2 text-center">OBSERVACIONES</h5>
      <div className="row">
        <div className="col-md-6 mb-2">
          <strong>Observaciones externas:</strong>
          <div className="border rounded p-2" style={{ minHeight: "60px" }}>
            {orden.observacionesExternas || ""}
          </div>
        </div>
        <div className="col-md-6 mb-2">
          <strong>Observaciones internas:</strong>
          <div className="border rounded p-2" style={{ minHeight: "60px" }}>
            {orden.observacionesInternas || orden.observaciones || ""}
          </div>
        </div>
      </div>
    </div>
  );
}
