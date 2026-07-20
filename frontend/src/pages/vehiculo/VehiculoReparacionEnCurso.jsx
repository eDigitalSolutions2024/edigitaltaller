// src/pages/vehiculo/VehiculoReparacionEnCurso.jsx
import React, { useEffect, useState } from "react";
import { fetchServiciosTaller } from "../../api/codigos";
import { saveRequisicionDiagnostico } from "../../api/vehiculos";
import http from "../../api/http";
import { TARIFA_HORA, calcImporteHoras } from "../../utils/manoObra";

function formatMoney(n) {
  if (n === "" || n === null || n === undefined) return "-";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}

export default function VehiculoReparacionEnCurso({ orden, onSaved, onGoGeneral, readOnly = false }) {
  const [catalogo, setCatalogo] = useState([]);
  const [completando, setCompletando] = useState(false);
  const [mecanicos, setMecanicos] = useState([]);
  const [carroceros, setCarroceros] = useState([]);

  // Si la orden es de un grupo, se muestran todos los asesores del equipo
  // (el que la creó va primero, sigue siendo el "principal" por ahora).
  const miembrosGrupo = Array.isArray(orden?.grupoId?.miembros)
    ? orden.grupoId.miembros.map((m) => m.name)
    : [];
  const asesoresNombres = miembrosGrupo.length
    ? [...new Set([orden?.creadoPor, ...miembrosGrupo].filter(Boolean))]
    : [orden?.creadoPor].filter(Boolean);

  const handleReparacionCompletada = async () => {
    if (!window.confirm("¿Confirmar que la reparación está completada?")) return;
    try {
      setCompletando(true);
      const res = await saveRequisicionDiagnostico(orden._id, {
        estadoOrden: "PENDIENTE_CERRAR",
      });
      if (onSaved) onSaved(res.data.vehiculo);
      if (onGoGeneral) onGoGeneral();
    } catch (err) {
      console.error(err);
      alert("Error al actualizar el estado de la orden.");
    } finally {
      setCompletando(false);
    }
  };

  useEffect(() => {
    fetchServiciosTaller()
      .then(setCatalogo)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const cargarEmpleados = async () => {
      try {
        const [resMec, resCar] = await Promise.all([
          http.get("/empleados?puesto=mecanico&activo=true"),
          http.get("/empleados?puesto=carrocero&activo=true"),
        ]);
        setMecanicos(resMec.data || []);
        setCarroceros(resCar.data || []);
      } catch (err) {
        console.error("Error cargando empleados:", err);
      }
    };
    cargarEmpleados();
  }, []);

  if (!orden) return null;

  const c = orden.cliente || {};
  const nombreCliente =
    c.tipoCliente === "Particular"
      ? [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(" ")
      : c.gobierno?.nombreGobierno || c.empresa?.razonSocial || c.nombre || "-";

  const codigosSeleccionados = orden.servicioReparacion?.serviciosSeleccionados || [];
  const otrosServicios = catalogo.filter(
    (s) => (s.grupoServicio || "otros") === "otros" && codigosSeleccionados.includes(s.codigo)
  );

  const refacciones = (orden.presupuesto || []).filter((p) => p.autorizado);
  const todasSurtidas = refacciones.length === 0 || refacciones.every((p) => p.surtida);

  const manoObra = orden.manoObra || [];

  // Costo de venta (misma información que Venta al Cliente en el cierre; solo consulta)
  const ventaCliente = orden.ventaCliente || [];
  const subtotalVenta = ventaCliente.reduce(
    (s, r) => s + Number(r.cant || 0) * Number(r.precioVenta || 0),
    0
  );
  const ivaVentaPct = Number(orden.ivaVenta ?? 8) || 0;
  const ivaVentaMonto = subtotalVenta * (ivaVentaPct / 100);

  // Grúa capturada en la inspección física (se muestra como línea aparte
  // encima del Costo de Venta solo si aún no quedó capturada como partida
  // dentro de Venta al Cliente, para no duplicar el importe visualmente)
  const tieneGrua = orden.inspeccionFisica?.grua === "SI";
  const precioGrua = Number(orden.inspeccionFisica?.precioGrua || 0);
  const gruaEnVenta = ventaCliente.some((r) => r.esGrua);

  const getNombreMecanico = (id) =>
    mecanicos.find((m) => m._id === id)?.nombre || id || "—";

  const getNombreCarrocero = (id) =>
    carroceros.find((c) => c._id === id)?.nombre || id || "—";

  const nombreManoObra = (m) =>
    m.esCarroceria ? getNombreCarrocero(m.carrocero) : getNombreMecanico(m.mecanico);

  const personalRows = manoObra
    .map((m) => ({
      rol: m.esCarroceria ? "Carrocero" : "Mecánico",
      nombre: nombreManoObra(m),
      concepto: m.concepto || "—",
      horas: Number(m.horas || 0),
      importe: calcImporteHoras(m.horas),
    }))
    .sort((a, b) => (a.rol === b.rol ? 0 : a.rol === "Mecánico" ? -1 : 1));

  return (
    <div className="card card-body mb-4">
      <h4 className="text-center fw-bold mb-4" style={{ letterSpacing: "1px" }}>
        REPARACIÓN EN CURSO
      </h4>

      {/* ── DATOS DEL VEHÍCULO ── */}
      <div className="row g-3 mb-4">
        <div className="col-md-6">
          <div className="card h-100">
            <div className="card-header fw-semibold bg-light">Datos del Vehículo</div>
            <div className="card-body p-0">
              <table className="table table-sm table-bordered mb-0">
                <tbody>
                  <tr>
                    <th className="ps-2" style={{ width: "40%" }}>Orden de Servicio</th>
                    <td>{orden.ordenServicio || "-"}</td>
                  </tr>
                  <tr>
                    <th className="ps-2">Cliente</th>
                    <td>{nombreCliente || "-"}</td>
                  </tr>
                  <tr>
                    <th className="ps-2">Marca</th>
                    <td>{orden.marca || "-"}</td>
                  </tr>
                  <tr>
                    <th className="ps-2">Modelo</th>
                    <td>{orden.modelo || "-"}</td>
                  </tr>
                  <tr>
                    <th className="ps-2">Año</th>
                    <td>{orden.anio || "-"}</td>
                  </tr>
                  <tr>
                    <th className="ps-2">Color</th>
                    <td>{orden.color || "-"}</td>
                  </tr>
                  <tr>
                    <th className="ps-2">Serie</th>
                    <td>{orden.serie || "-"}</td>
                  </tr>
                  <tr>
                    <th className="ps-2">Placas</th>
                    <td>{orden.placas || "-"}</td>
                  </tr>
                  <tr>
                    <th className="ps-2">KMS / Millas</th>
                    <td>{orden.kmsMillas || "-"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="col-md-6">
          <div className="card h-100">
            <div className="card-header fw-semibold bg-light">Personal Asignado</div>
            <div className="card-body p-0">
              <table className="table table-sm table-bordered mb-0">
                {/* <thead className="table-light">
                  <tr>
                    <th className="ps-2">Rol</th>
                    <th>Nombre</th>
                  </tr>
                </thead> */}
                <tbody>
                  {asesoresNombres.length > 0 && (
                    <tr>
                      <td className="ps-2 fw-semibold">Asesor{asesoresNombres.length > 1 ? "es" : ""}</td>
                      <td>{asesoresNombres.join(", ")}</td>
                    </tr>
                  )}
                  {orden.devueltoPor && (
                    <tr>
                      <td className="ps-2 fw-semibold">Refaccionario</td>
                      <td>{orden.devueltoPor}</td>
                    </tr>
                  )}
                  {!orden.creadoPor && !orden.devueltoPor && personalRows.length === 0 && (
                    <tr>
                      <td colSpan={2} className="text-center text-muted">Sin personal asignado.</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {personalRows.length > 0 && (
                <table className="table table-sm table-bordered mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="ps-2">Reparación y/o Servicio</th>
                      <th>Mecánico/Carrocero</th>
                      <th className="text-center">Horas</th>
                      <th className="text-end pe-2">
                        Total x Horas ({formatMoney(TARIFA_HORA)} / hora)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {personalRows.map((p, i) => (
                      <tr key={i}>
                        <td className="ps-2">{p.concepto}</td>
                        <td>{p.nombre}</td>
                        <td className="text-center">{p.horas}</td>
                        <td className="text-end pe-2 fw-bold">{formatMoney(p.importe)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── DIAGNÓSTICO DEL TÉCNICO ── */}
      <h5 className="fw-semibold mt-2 mb-2">Diagnóstico del Técnico</h5>
      <div
        className="border rounded p-3 mb-4 bg-light"
        style={{ minHeight: "60px", whiteSpace: "pre-wrap" }}
      >
        {orden.diagnosticoTecnico
          ? orden.diagnosticoTecnico
          : <span className="text-muted">Sin diagnóstico registrado.</span>}
      </div>

      {/* ── OTROS SERVICIOS SELECCIONADOS ── */}
      {otrosServicios.length > 0 && (
        <>
          <h5 className="fw-semibold mt-2 mb-2">Servicios a Realizar</h5>
          <div className="table-responsive mb-4">
            <table className="table table-sm table-bordered align-middle">
              <thead className="table-light text-center">
                <tr>
                  <th style={{ width: "110px" }}>Código</th>
                  <th>Descripción del Servicio</th>
                </tr>
              </thead>
              <tbody>
                {otrosServicios.map((s) => (
                  <tr key={s._id || s.codigo}>
                    <td className="text-center fw-semibold">{s.codigo}</td>
                    <td>{s.descripcion || s.label || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── REFACCIONES A UTILIZAR ── */}
      <h5 className="fw-semibold mt-2 mb-2">Refacciones a Utilizar</h5>
      <div className="table-responsive">
        <table className="table table-sm table-bordered align-middle">
          <thead className="table-light text-center">
            <tr>
              <th style={{ width: "70px" }}>Cant.</th>
              <th>Concepto / Refacción</th>
              <th>Tipo</th>
              <th>Marca</th>
              <th>Código</th>
              <th>Proveedor</th>
              <th style={{ width: "120px" }}>Precio Compra</th>
              <th style={{ width: "110px" }}>Surtida</th>
            </tr>
          </thead>
          <tbody>
            {refacciones.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-muted">
                  Sin refacciones autorizadas.
                </td>
              </tr>
            )}
            {refacciones.map((p, i) => (
              <tr key={i} className={p.surtida ? "table-success" : ""}>
                <td className="text-center">{p.cant ?? p.cantidad}</td>
                <td>{p.concepto || p.refaccion || ""}</td>
                <td>{p.tipo || ""}</td>
                <td>{p.marca || ""}</td>
                <td>{p.codigo || ""}</td>
                <td>{p.proveedor || ""}</td>
                <td className="text-end">{formatMoney(p.precioCompra)}</td>
                <td className="text-center">
                  {p.esServicio
                    ? <span className="badge bg-info text-dark">Servicio</span>
                    : p.surtida
                      ? <span className="badge bg-success">Surtida</span>
                      : <span className="badge bg-secondary">Pendiente</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── GRÚA (capturada en la entrada, línea aparte encima del costo) ── */}
      {tieneGrua && precioGrua > 0 && !gruaEnVenta && (
        <div
          className="d-flex justify-content-between align-items-center border rounded bg-light px-3 py-2 mt-4 mb-2"
          style={{ maxWidth: 360 }}
        >
          <span className="fw-semibold">Grúa</span>
          <span className="fw-bold">{formatMoney(precioGrua)}</span>
        </div>
      )}

      {/* ── COSTO DE VENTA (Venta al Cliente, solo consulta) ── */}
      <h5 className="fw-semibold mt-4 mb-2">Costo de Venta</h5>
      <div className="table-responsive mb-4">
        <table className="table table-sm table-bordered align-middle">
          <thead className="table-light text-center">
            <tr>
              <th style={{ width: "70px" }}>Cant.</th>
              <th>Concepto, Servicio y/o Reparación</th>
              <th style={{ width: "150px" }}>Precio Venta (Sin IVA)</th>
              <th>Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {ventaCliente.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-muted">
                  Sin partidas de venta al cliente.
                </td>
              </tr>
            )}
            {ventaCliente.map((r, i) => (
              <tr key={i}>
                <td className="text-center">{r.cant}</td>
                <td>{r.concepto}</td>
                <td className="text-end">{formatMoney(r.precioVenta)}</td>
                <td>{r.observaciones}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="text-end fw-bold">Sub Total:</td>
              <td className="text-end fw-bold">{formatMoney(subtotalVenta)}</td>
              <td></td>
            </tr>
            <tr>
              <td colSpan={2} className="text-end fw-bold">IVA {ivaVentaPct}%:</td>
              <td className="text-end fw-bold">{formatMoney(ivaVentaMonto)}</td>
              <td></td>
            </tr>
            <tr>
              <td colSpan={2} className="text-end fw-bold">Total:</td>
              <td className="text-end fw-bold">{formatMoney(subtotalVenta + ivaVentaMonto)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── BOTÓN REPARACIÓN COMPLETADA ── */}
      {!readOnly && (
        <div className="d-flex justify-content-end align-items-center gap-3 mb-4">
          {!todasSurtidas && (
            <span className="text-danger small fw-semibold">
              Hay refacciones pendientes de surtir
            </span>
          )}
          <button
            type="button"
            className="btn btn-success px-4"
            onClick={handleReparacionCompletada}
            disabled={completando || !todasSurtidas}
          >
            {completando ? "Actualizando..." : "Reparación Completada"}
          </button>
        </div>
      )}
    </div>
  );
}
