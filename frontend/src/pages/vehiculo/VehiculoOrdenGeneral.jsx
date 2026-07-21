// src/pages/vehiculo/VehiculoOrdenGeneral.jsx
import React, { useState, useEffect } from "react";
import { closeOrden, openVentaClientePdf } from "../../api/vehiculos";
import http from "../../api/http";
import { formatFecha } from "../../utils/fechas";

function formatMoney(n) {
  if (n === "" || n === null || n === undefined) return "";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}

export default function VehiculoOrdenGeneral({ orden, onClosed }) {
  const [cerrando, setCerrando] = useState(false);
  const [mecMap, setMecMap] = useState({}); // id → nombre del mecánico

  // Cargar empleados mecánicos para resolver IDs en manoObra
  useEffect(() => {
    http.get("/empleados?puesto=mecanico&activo=true")
      .then((res) => {
        const lista = res.data?.data || res.data || [];
        const map = {};
        lista.forEach((e) => { map[String(e._id)] = e.nombre; });
        setMecMap(map);
      })
      .catch(() => {});
  }, []);

  if (!orden) return null;

  const yaCerrada = orden.estadoOrden === "CERRADA";
  const puedesCerrar = orden.estadoOrden === "PENDIENTE_CERRAR";

  const handleCerrarOrden = async () => {
    if (yaCerrada || !puedesCerrar) return;

    const ok = window.confirm(
      "¿Seguro que deseas CERRAR esta orden de servicio? Ya no podrás modificarla."
    );
    if (!ok) return;

    try {
      setCerrando(true);
      const res = await closeOrden(orden._id);
      const vAct = res.data.vehiculo;

      if (onClosed) onClosed(vAct);
    } catch (err) {
      console.error(err);
      alert("Error al cerrar la orden.");
    } finally {
      setCerrando(false);
    }
  };

  // --- DATOS DEL CLIENTE (desde populate) ---
  const c = orden.cliente || {};
  const tipo = c.tipoCliente || "Particular";
  const esParticular = tipo === "Particular";
  const esEmpresa = tipo === "Empresa Privada" || tipo === "Empresa Arrendadora";
  const esGobierno = tipo === "Empresa Gobierno";

  const gob = c.gobierno || {};
  const emp = c.empresa || {};
  const tel = (c.telefonos || [])[0] || {};
  const cel = (c.celulares || [])[0] || {};
  const dir = c.direccion || {};

  // Nombre principal por tipo de cliente
  const nombreCompleto = [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(" ");
  const nombrePrincipal = esParticular
    ? nombreCompleto
    : esEmpresa
    ? (emp.razonSocial || nombreCompleto)
    : (gob.nombreGobierno || nombreCompleto);
  const labelNombrePrincipal = esParticular ? "Nombre Cliente" : "Nombre / Razón Social";

  // Contacto por tipo de cliente
  const nombreContacto = esEmpresa
    ? (emp.contacto?.nombre || nombreCompleto)
    : esGobierno
    ? (gob.contactoGobierno?.nombre || gob.dependencia?.contacto?.nombre || "")
    : "";
  const labelNombreContacto = esParticular ? "Contacto" : "Nombre Contacto";

  const telefonoFijo = [tel.lada, tel.numero].filter(Boolean).join(" ");
  const celular = [cel.lada, cel.numero].filter(Boolean).join(" ");
  const direccionTexto = [
    dir.calle,
    dir.numeroExterior,
    dir.numeroInterior,
    dir.colonia,
    dir.ciudad,
    dir.estado,
    dir.codigoPostal,
  ]
    .filter(Boolean)
    .join(", ");
  const rfc = c.rfc || "";

  // Asesor: asesor asignado al cliente → quien creó la orden
  const asesorServicio = c.asesorResponsable || orden.asesorServicio || orden.creadoPor || "";
  // Si la orden es de un grupo, se muestran todos los asesores del equipo
  // (el que la creó va primero, sigue siendo el "principal" por ahora).
  const miembrosGrupo = Array.isArray(orden.grupoId?.miembros)
    ? orden.grupoId.miembros.map((m) => m.name)
    : [];
  const asesoresNombres = miembrosGrupo.length
    ? [...new Set([asesorServicio, ...miembrosGrupo].filter(Boolean))]
    : [asesorServicio].filter(Boolean);

  // Refaccionario: persona que respondió la solicitud de taller
  const refaccionario = orden.refaccionario || orden.devueltoPor || "";

  // Mecánico principal: resuelve el ID del empleado a nombre
  const mecanicoId = (orden.manoObra || []).find((m) => m.mecanico)?.mecanico || "";
  const mecanicoPrincipal = mecMap[mecanicoId] || mecanicoId || "";

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

        <div className="d-flex gap-2">
          {yaCerrada && (
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => openVentaClientePdf(orden._id)}
            >
              Imprimir Venta Cliente
            </button>
          )}

          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={handleCerrarOrden}
            disabled={cerrando || yaCerrada || !puedesCerrar}
            title={!puedesCerrar && !yaCerrada ? "La reparación aún no ha sido completada" : undefined}
          >
            {yaCerrada ? "Orden cerrada" : cerrando ? "Cerrando..." : "Cerrar orden"}
          </button>
        </div>
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
            <strong>{labelNombrePrincipal}:</strong> {nombrePrincipal}
          </div>
          <div className="mb-1">
            <strong>{labelNombreContacto}:</strong> {nombreContacto}
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
            <strong>RFC:</strong> {rfc}
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
          {orden.sinVehiculo ? (
            <div className="mb-1">
              <span className="badge bg-secondary">Sin vehículo registrado</span>
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* USUARIOS */}
      <h5 className="mt-3 mb-2 text-center">USUARIOS</h5>
      <div className="row mb-3">
        <div className="col-md-4">
          <strong>Asesor{asesoresNombres.length > 1 ? "es" : ""} de Servicio:</strong>{" "}
          {asesoresNombres.join(", ") || "—"}
        </div>
        <div className="col-md-4">
          <strong>Refaccionario:</strong> {refaccionario}
        </div>
        <div className="col-md-4">
          <strong>Mecánico principal:</strong> {mecanicoPrincipal}
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
            {refacciones.map((r, idx) => {
              const op = r.opciones?.[r.opcionSeleccionada] || {};
              return (
                <tr key={idx}>
                  <td>{r.cant ?? r.cantidad}</td>
                  <td>{op.unidad}</td>
                  <td>{r.refaccion}</td>
                  <td>{op.marca}</td>
                  <td>{op.proveedor}</td>
                  <td>{op.codigo}</td>
                  <td>{formatMoney(op.precioUnitario)}</td>
                  <td>{formatMoney(op.importeTotal)}</td>
                  <td>{op.moneda}</td>
                  <td>{r.estatus || ""}</td>
                  <td>{op.observaciones}</td>
                </tr>
              );
            })}
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
                <td>{m.mecanico?.nombre || mecMap[String(m.mecanico)] || m.mecanico}</td>
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
