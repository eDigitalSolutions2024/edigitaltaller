// src/pages/vehiculo/VehiculoOrdenDetalle.jsx
import React, { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { getVehiculoById } from "../../api/vehiculos";
import VehiculoNuevoForm from "./VehiculoNuevoForm";
import ServicioReparacionTab from "./ServicioReparacionTab";
import VehiculoRequisicionDiagnostico from "./VehiculoRequisicionDiagnostico";
import VehiculoPresupuestoVenta from "./VehiculoPresupuestoVenta"; // 👈 NUEVO
import VehiculoOrdenGeneral from "./VehiculoOrdenGeneral";
import VehiculoReparacionEnCurso from "./VehiculoReparacionEnCurso";




const ESTADO_TO_TAB = {
  PENDIENTE_CAPTURA:              "datos",
  PENDIENTE_REFACCIONARIA:        "req",
  PENDIENTE_AUTORIZACION_CLIENTE: "presupuesto",
  PENDIENTE_SURTIR:               "presupuesto",
  REPARACION_EN_CURSO:            "reparacion",
  PENDIENTE_CIERRE:               "general",
  PENDIENTE_CERRAR:               "general",
  CERRADA:                        "general",
};

const TAB_STEP = { datos: 0, servicio: 1, req: 2, presupuesto: 3, reparacion: 4, general: 5 };
const ESTADO_STEP = {
  PENDIENTE_CAPTURA:              0,
  PENDIENTE_REFACCIONARIA:        2,
  PENDIENTE_AUTORIZACION_CLIENTE: 3,
  PENDIENTE_SURTIR:               3,
  REPARACION_EN_CURSO:            4,
  PENDIENTE_CIERRE:               5,
  PENDIENTE_CERRAR:               5,
  CERRADA:                        5,
};

export default function VehiculoOrdenDetalle() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [orden, setOrden] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const tabFromUrl = searchParams.get("tab");
  const [tab, setTab] = useState(tabFromUrl || "datos"); // 'datos' | 'servicio' | 'req' | 'presupuesto' | 'general'
  const ordenIniciada = !!orden?.ordenIniciada;

  const ESTADOS_PRESUPUESTO = [
    "PENDIENTE_AUTORIZACION_CLIENTE",
    "PENDIENTE_SURTIR",
    "PENDIENTE_CIERRE",
    "PENDIENTE_CERRAR",
    "REPARACION_EN_CURSO",
  ];
  const presupuestoHabilitado =
    ordenIniciada && ESTADOS_PRESUPUESTO.includes(orden?.estadoOrden);

  const ESTADOS_PREPARACION = ["REPARACION_EN_CURSO", "PENDIENTE_CIERRE", "PENDIENTE_CERRAR", "CERRADA"];
  const reparacionHabilitada = ESTADOS_PREPARACION.includes(orden?.estadoOrden);

  const currentStep = ESTADO_STEP[orden?.estadoOrden] ?? 0;
  const isPast = (tabKey) => !orden ? false : TAB_STEP[tabKey] < currentStep;

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const res = await getVehiculoById(id);
        const v = res.data.vehiculo;
        setOrden(v);
        if (!tabFromUrl && v?.estadoOrden && ESTADO_TO_TAB[v.estadoOrden]) {
          setTab(ESTADO_TO_TAB[v.estadoOrden]);
        }
      } catch (err) {
        console.error(err);
        setError("No se pudo cargar la orden.");
      } finally {
        setLoading(false);
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 👇 NUEVO: Polling — refresca la orden cada 8 seg solo cuando el asesor
  // está en el tab de Requisición y Diagnóstico.
  useEffect(() => {
    if (tab !== "req") return;

    const interval = setInterval(async () => {
      try {
        const res = await getVehiculoById(id);
        setOrden(res.data.vehiculo);
      } catch (err) {
        console.error("Error al refrescar la orden:", err);
      }
    }, 8000);

    return () => clearInterval(interval); // limpia al salir del tab
  }, [tab, id]);

  // cuando guardas en "Servicio o Reparación"
  const handleServicioSaved = (vehiculoActualizado) => {
    setOrden(vehiculoActualizado);
    setTab("req");
  };

  if (loading) {
    return <p className="text-center mt-4">Cargando orden...</p>;
  }

  if (error) {
    return <p className="text-center text-danger mt-4">{error}</p>;
  }

  if (!orden) {
    return <p className="text-center mt-4">Orden no encontrada.</p>;
  }

  return (
    <div className="container-fluid">
      <h2
        className="text-center fw-bold my-3"
        style={{ letterSpacing: "2px" }}
      >
        NUEVA ORDEN DE SERVICIO
      </h2>

      {/* Tabs estilo clásico */}
      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button
            className={"nav-link" + (tab === "datos" ? " active" : "")}
            style={tab !== "datos" && isPast("datos") ? { backgroundColor: "#e9ecef", color: "#6c757d" } : {}}
            type="button"
            onClick={() => setTab("datos")}
          >
            Datos del Cliente
          </button>
        </li>

        <li className="nav-item">
          <button
            className={"nav-link" + (tab === "servicio" ? " active" : "")}
            style={tab !== "servicio" && isPast("servicio") ? { backgroundColor: "#e9ecef", color: "#6c757d" } : {}}
            type="button"
            onClick={() => setTab("servicio")}
          >
            Servicio o Reparación
          </button>
        </li>

        {/* Requisición y Diagnóstico: solo visible cuando ya está iniciada */}
        {ordenIniciada && (
          <li className="nav-item">
            <button
              className={"nav-link" + (tab === "req" ? " active" : "")}
              style={tab !== "req" && isPast("req") ? { backgroundColor: "#e9ecef", color: "#6c757d" } : {}}
              type="button"
              onClick={() => setTab("req")}
            >
              Requisición y Diagnóstico
            </button>
          </li>
        )}

        {/* Presupuesto y Venta al Cliente: solo después de pulsar "Continuar a Presupuesto" */}
        {presupuestoHabilitado && (
          <li className="nav-item">
            <button
              className={"nav-link" + (tab === "presupuesto" ? " active" : "")}
              style={tab !== "presupuesto" && isPast("presupuesto") ? { backgroundColor: "#e9ecef", color: "#6c757d" } : {}}
              type="button"
              onClick={() => setTab("presupuesto")}
            >
              Presupuesto y Venta al Cliente
            </button>
          </li>
        )}

        {/* Reparación en Curso: visible una vez impresa la venta al cliente */}
        {reparacionHabilitada && (
          <li className="nav-item">
            <button
              className={"nav-link" + (tab === "reparacion" ? " active" : "")}
              style={tab !== "reparacion" && isPast("reparacion") ? { backgroundColor: "#e9ecef", color: "#6c757d" } : {}}
              type="button"
              onClick={() => setTab("reparacion")}
            >
              Reparación en Curso
            </button>
          </li>
        )}

        {/* General: separado a la derecha para no confundir con los pasos */}
        {ordenIniciada && (
          <li className="nav-item ms-auto">
            <button
              className={"nav-link" + (tab === "general" ? " active" : "")}
              style={tab !== "general" && isPast("general") ? { backgroundColor: "#e9ecef", color: "#6c757d" } : {}}
              type="button"
              onClick={() => setTab("general")}
            >
              General
            </button>
          </li>
        )}
      </ul>

      {/* Contenido de tabs */}
      {tab === "datos" && (
        <VehiculoNuevoForm cliente={null} initialData={orden} readOnly />
      )}

      {tab === "servicio" && (
        <ServicioReparacionTab
          ordenId={orden._id}
          initialData={orden.servicioReparacion}
          onSaved={handleServicioSaved}
        />
      )}

      {tab === "req" && ordenIniciada && (
        <VehiculoRequisicionDiagnostico
          orden={orden}
          onSaved={(vActualizado) => setOrden(vActualizado)}
          onGoPresupuesto={() => setTab("presupuesto")}
        />
      )}

      {tab === "presupuesto" && ordenIniciada && (
        <VehiculoPresupuestoVenta
          orden={orden}
          onSaved={(vActualizado) => setOrden(vActualizado)}
          onGoPreparacion={() => setTab("reparacion")}
        />
      )}

      {tab === "reparacion" && reparacionHabilitada && (
        <VehiculoReparacionEnCurso
          orden={orden}
          onSaved={(vActualizado) => setOrden(vActualizado)}
          onGoGeneral={() => setTab("general")}
        />
      )}

      {tab === "general" && ordenIniciada && (
        <VehiculoOrdenGeneral orden={orden} />
      )}


    </div>
  );
}
