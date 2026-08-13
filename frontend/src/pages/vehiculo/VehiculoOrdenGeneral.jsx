// src/pages/vehiculo/VehiculoOrdenGeneral.jsx
import React, { useState, useEffect } from "react";
import { closeOrden, openVentaClientePdf } from "../../api/vehiculos";
import http from "../../api/http";
import { formatFecha } from "../../utils/fechas";
import { createTicket } from "../../api/tickets";
import { calcularTotalesOrden } from "../../utils/cajaTotales";

function formatMoney(n) {
  if (n === "" || n === null || n === undefined) return "";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}

const TIPO_PAGO_LABELS = {
  COMPLETO: "Liquida",
  ABONO: "Abono",
  ANTICIPO: "Anticipo",
};

// Descripción del comprobante de un pago con su folio (cada pago trae uno:
// Nota de Venta, Remisión o Recibo Provisional; ver backend/routes/cajas.js).
function comprobantePago(p) {
  if (p.comprobante === "NOTA_VENTA" && p.notaVenta?.numero) {
    return `Nota de Venta #${p.notaVenta.numero}`;
  }
  if (p.comprobante === "REMISION" && p.remision?.numero) {
    return `Remisión #${p.remision.numero}`;
  }
  if (p.reciboProvisional?.numero) {
    return `Recibo Provisional #${p.reciboProvisional.numero}`;
  }
  return "";
}

function formaPagoDePago(p) {
  if (p.reciboProvisional?.numero) {
    const fp = p.reciboProvisional.formaPago || "";
    return fp === "CHEQUE" && p.reciboProvisional.chequeNumero
      ? `Cheque #${p.reciboProvisional.chequeNumero}`
      : fp;
  }
  if (p.comprobante === "NOTA_VENTA") {
    return [p.notaVenta?.tipo, p.notaVenta?.banco].filter(Boolean).join(" - ");
  }
  if (p.comprobante === "REMISION") {
    return p.remision?.tipo || "";
  }
  return "";
}

export default function VehiculoOrdenGeneral({ orden, onClosed, esAsesor }) {
  const [cerrando, setCerrando] = useState(false);
  const [solicitandoRestablecer, setSolicitandoRestablecer] = useState(false);
  const [solicitudEnviada, setSolicitudEnviada] = useState(false);
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
  const yaCancelada = orden.estadoOrden === "CANCELADA";
  const puedesCerrar = orden.estadoOrden === "PENDIENTE_CERRAR";
  const puedeSolicitarRestablecer = esAsesor && (yaCerrada || yaCancelada);

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

  const handleSolicitarRestablecerOS = async () => {
    if (!puedeSolicitarRestablecer) return;

    const ok = window.confirm(
      `¿Solicitar restablecer esta orden ${yaCerrada ? "cerrada" : "cancelada"}? Se abrirá un ticket de soporte para que un administrador la revise.`
    );
    if (!ok) return;

    try {
      setSolicitandoRestablecer(true);
      const res = await createTicket({
        tipoProblema: "RESTABLECER_OS",
        detalle: `Solicitud de restablecer la orden ${orden.ordenServicio || orden._id} (actualmente ${yaCerrada ? "cerrada" : "cancelada"}).`,
        ordenServicio: orden._id,
        folioOrdenServicio: orden.ordenServicio || "",
      });
      setSolicitudEnviada(true);
      alert(`Ticket ${res.data.data.folio} creado. Un administrador revisará tu solicitud.`);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.msg || "Error al solicitar el restablecimiento de la orden.");
    } finally {
      setSolicitandoRestablecer(false);
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

  // Nombre principal por tipo de cliente. apellidoPaterno/apellidoMaterno son
  // campos exclusivos de "Particular": en clientes de empresa/gobierno no se
  // usan como respaldo porque en registros migrados o editados antes del fix
  // en clientes.js pueden traer datos viejos huérfanos (p. ej. el apellido de
  // un contacto que ya no aplica), y mostrarían basura junto al nombre.
  const nombreCompleto = [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(" ");
  const nombrePrincipal = esParticular
    ? nombreCompleto
    : esEmpresa
    ? (emp.razonSocial || c.nombre || "")
    : (gob.nombreGobierno || c.nombre || "");
  const labelNombrePrincipal = esParticular ? "Nombre Cliente" : "Nombre / Razón Social";

  // Contacto por tipo de cliente
  const nombreContacto = esEmpresa
    ? (emp.contacto?.nombre || c.nombre || "")
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

  // Asesor: el asesor asignado a ESTA orden (creadoPor, reasignable desde
  // el tab "Configurar" por un admin) tiene prioridad sobre el asesor por
  // defecto del cliente.
  const asesorServicio = orden.creadoPor || c.asesorResponsable || "";
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
  const descuentos = orden.descuentos || [];

  // --- TOTALES (mismos cálculos que Cajas: nunca se persisten) ---
  const totales = calcularTotalesOrden(orden);
  const liquidada = totales.saldoPendiente <= 0;
  const hayVenta = ventaItems.length > 0;

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

          {puedeSolicitarRestablecer && (
            <button
              type="button"
              className="btn btn-outline-primary"
              style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
              onClick={handleSolicitarRestablecerOS}
              disabled={solicitandoRestablecer || solicitudEnviada}
              title="Abre un ticket de soporte para pedirle a un administrador que restablezca esta orden"
            >
              {solicitudEnviada
                ? "Solicitud enviada"
                : solicitandoRestablecer
                ? "Enviando..."
                : "Solicitar restablecer OS"}
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
            {c.esEmpleado && (
              <div><span className="badge bg-warning text-dark">Empleado</span></div>
            )}
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
              <th>Importe</th>
              <th>Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {ventaItems.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center">
                  No hay partidas de venta registradas.
                </td>
              </tr>
            )}
            {ventaItems.map((v, idx) => {
              const precio = v.precioVenta ?? v.precioSinIva ?? v.precioUnitario;
              const importe = Number(v.cant ?? v.cantidad ?? 0) * Number(precio || 0);
              return (
                <tr key={idx}>
                  <td>{v.cant ?? v.cantidad}</td>
                  <td>{v.concepto}</td>
                  <td>{v.refaccion || ""}</td>
                  <td>{v.codigo || ""}</td>
                  <td>{v.horasMO ?? v.horas ?? ""}</td>
                  <td>{formatMoney(precio)}</td>
                  <td>{formatMoney(importe)}</td>
                  <td>{v.observaciones || v.observInt || ""}</td>
                </tr>
              );
            })}
          </tbody>
          {hayVenta && (
            <tfoot>
              <tr>
                <th colSpan={6} className="text-end">Subtotal</th>
                <th>{formatMoney(totales.subtotal)}</th>
                <td />
              </tr>
              <tr>
                <th colSpan={6} className="text-end">IVA ({totales.ivaPct}%)</th>
                <th>{formatMoney(totales.ivaMonto)}</th>
                <td />
              </tr>
              {totales.descuentoMonto > 0 && (
                <tr>
                  <th colSpan={6} className="text-end">Descuentos</th>
                  <th className="text-danger">- {formatMoney(totales.descuentoMonto)}</th>
                  <td />
                </tr>
              )}
              <tr className="table-light">
                <th colSpan={6} className="text-end">Total de la Orden</th>
                <th>{formatMoney(totales.totalOrden)}</th>
                <td />
              </tr>
            </tfoot>
          )}
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

      {/* CUENTA DE LA ORDEN */}
      <h5 className="mt-4 mb-2 text-center">
        CUENTA DE LA ORDEN{" "}
        {hayVenta && (
          <span className={`badge ${liquidada ? "bg-success" : "bg-danger"}`}>
            {liquidada ? "Liquidada" : "Pendiente de Pago"}
          </span>
        )}
      </h5>
      <div className="row g-2 mb-3 text-center">
        <div className="col-md-3">
          <div className="border rounded p-2 h-100">
            <div className="text-muted small">Total de la Orden</div>
            <div className="fw-bold fs-5">{formatMoney(totales.totalOrden)}</div>
            {totales.descuentoMonto > 0 && (
              <div className="small text-danger">
                Incluye descuento de {formatMoney(totales.descuentoMonto)}
              </div>
            )}
          </div>
        </div>
        <div className="col-md-3">
          <div className="border rounded p-2 h-100">
            <div className="text-muted small">Total Abonado</div>
            <div className="fw-bold fs-5">{formatMoney(totales.totalAbonado)}</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="border rounded p-2 h-100">
            <div className="text-muted small">Saldo Pendiente</div>
            <div className={`fw-bold fs-5 ${liquidada ? "text-success" : "text-danger"}`}>
              {formatMoney(Math.max(0, totales.saldoPendiente))}
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="border rounded p-2 h-100">
            <div className="text-muted small">Fecha de Cierre</div>
            <div className="fw-bold fs-5">{formatFecha(orden.fechaCierre) || "—"}</div>
          </div>
        </div>
      </div>

      {/* PAGOS / ABONOS / ANTICIPOS */}
      <h5 className="mt-3 mb-2 text-center">PAGOS / ABONOS / ANTICIPOS</h5>
      <div className="table-responsive mb-3">
        <table className="table table-sm table-bordered align-middle">
          <thead className="table-light">
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Comprobante</th>
              <th>Forma de Pago</th>
              <th>Monto</th>
              <th>Referencia</th>
              <th>Notas</th>
              <th>Registró</th>
              <th>Estatus</th>
            </tr>
          </thead>
          <tbody>
            {pagos.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center">
                  No hay pagos registrados.
                </td>
              </tr>
            )}
            {pagos.map((p, idx) => (
              <tr key={p._id || idx} className={p.cancelado ? "table-danger" : ""}>
                <td>{formatFecha(p.fecha)}</td>
                <td>{TIPO_PAGO_LABELS[p.tipoPago] || p.tipoPago || ""}</td>
                <td>
                  {comprobantePago(p)}
                  {p.reciboDolares?.numero && (
                    <div className="small text-muted">
                      Recibo de Dólares #{p.reciboDolares.numero}
                    </div>
                  )}
                </td>
                <td>{formaPagoDePago(p)}</td>
                <td>
                  {formatMoney(p.monto)}
                  {Number(p.montoDolares) > 0 && (
                    <div className="small text-muted">
                      USD {Number(p.montoDolares).toFixed(2)} @ {p.tipoCambio}
                    </div>
                  )}
                </td>
                <td>{p.referencia || ""}</td>
                <td>{p.notas || p.observaciones || ""}</td>
                <td>{p.registradoPor || ""}</td>
                <td>
                  {p.cancelado ? (
                    <>
                      <span className="badge bg-danger">Cancelado</span>
                      {p.motivoCancelacion && (
                        <div className="small text-muted">{p.motivoCancelacion}</div>
                      )}
                    </>
                  ) : (
                    <span className="badge bg-success">Vigente</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* DESCUENTOS */}
      <h5 className="mt-3 mb-2 text-center">DESCUENTOS</h5>
      <div className="table-responsive mb-3">
        <table className="table table-sm table-bordered align-middle">
          <thead className="table-light">
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Valor</th>
              <th>Motivo</th>
              <th>Aplicado por</th>
              <th>Estatus</th>
            </tr>
          </thead>
          <tbody>
            {descuentos.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center">
                  No hay descuentos registrados.
                </td>
              </tr>
            )}
            {descuentos.map((d, idx) => (
              <tr key={d._id || idx}>
                <td>{formatFecha(d.fecha)}</td>
                <td>{d.tipo === "PORCENTAJE" ? "Porcentaje" : "Monto"}</td>
                <td>
                  {d.tipo === "PORCENTAJE"
                    ? `${Number(d.valor || 0)}%`
                    : formatMoney(d.valor)}
                </td>
                <td>{d.motivo || ""}</td>
                <td>{d.aplicadoPor || ""}</td>
                <td>
                  <span className={`badge ${d.activo !== false ? "bg-success" : "bg-secondary"}`}>
                    {d.activo !== false ? "Activo" : "Inactivo"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
