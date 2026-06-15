// src/pages/vehiculo/VehiculoReparacionEnCurso.jsx
import React, { useEffect, useState } from "react";
import { fetchServiciosTaller } from "../../api/codigos";
import { saveRequisicionDiagnostico } from "../../api/vehiculos";

function formatMoney(n) {
  if (n === "" || n === null || n === undefined) return "-";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}

export default function VehiculoReparacionEnCurso({ orden, onSaved, onGoGeneral }) {
  const [catalogo, setCatalogo] = useState([]);
  const [completando, setCompletando] = useState(false);

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

  if (!orden) return null;

  const c = orden.cliente || {};
  const nombreCliente =
    c.tipoCliente === "Particular"
      ? [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(" ")
      : c.gobierno?.nombreGobierno || c.empresa?.razonSocial || c.nombre || "-";

  // Servicios seleccionados en "Servicio o Reparación" del grupo "otros"
  const codigosSeleccionados = orden.servicioReparacion?.serviciosSeleccionados || [];
  const otrosServicios = catalogo.filter(
    (s) => (s.grupoServicio || "otros") === "otros" && codigosSeleccionados.includes(s.codigo)
  );

  const refacciones = (orden.presupuesto || []).filter((p) => p.autorizado);

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
                    <td>{nombreCliente}</td>
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
                <tbody>
                  <tr>
                    <th className="ps-2" style={{ width: "40%" }}>Asesor</th>
                    <td>{orden.asesorServicio || "-"}</td>
                  </tr>
                  <tr>
                    <th className="ps-2">Mecánico</th>
                    <td>{orden.mecanicoPrincipal || "-"}</td>
                  </tr>
                  <tr>
                    <th className="ps-2">Refaccionario</th>
                    <td>{orden.refaccionario || "-"}</td>
                  </tr>
                </tbody>
              </table>
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

      {/* ── OTROS SERVICIOS SELECCIONADOS (solo si hay alguno) ── */}
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
            </tr>
          </thead>
          <tbody>
            {refacciones.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-muted">
                  Sin refacciones autorizadas.
                </td>
              </tr>
            )}
            {refacciones.map((p, i) => (
              <tr key={i}>
                <td className="text-center">{p.cant ?? p.cantidad}</td>
                <td>{p.concepto || p.refaccion || ""}</td>
                <td>{p.tipo || ""}</td>
                <td>{p.marca || ""}</td>
                <td>{p.codigo || ""}</td>
                <td>{p.proveedor || ""}</td>
                <td className="text-end">{formatMoney(p.precioCompra)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── BOTÓN REPARACIÓN COMPLETADA ── */}
      <div className="d-flex justify-content-end mb-4">
        <button
          type="button"
          className="btn btn-success px-4"
          onClick={handleReparacionCompletada}
          disabled={completando}
        >
          {completando ? "Actualizando..." : "Reparación Completada"}
        </button>
      </div>
    </div>
  );
}
