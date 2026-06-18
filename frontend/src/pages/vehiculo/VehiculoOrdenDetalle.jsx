// src/pages/vehiculo/VehiculoOrdenDetalle.jsx
import React, { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { getVehiculoById } from "../../api/vehiculos";
import VehiculoNuevoForm from "./VehiculoNuevoForm";
import ServicioReparacionTab from "./ServicioReparacionTab";
import VehiculoRequisicionDiagnostico from "./VehiculoRequisicionDiagnostico";
import VehiculoPresupuestoVenta from "./VehiculoPresupuestoVenta";
import VehiculoOrdenGeneral from "./VehiculoOrdenGeneral";
import VehiculoReparacionEnCurso from "./VehiculoReparacionEnCurso";

// PENDIENTE_AUTORIZACION_CLIENTE va al tab req (el asesor selecciona opciones),
// el tab de presupuesto solo se habilita al pulsar "Continuar a Presupuesto"
const ESTADO_TO_TAB = {
  PENDIENTE_CAPTURA:              "datos",
  PENDIENTE_REFACCIONARIA:        "req",
  PENDIENTE_AUTORIZACION_CLIENTE: "req",
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

// Estados donde el presupuesto siempre es accesible (sin necesitar el botón)
const ESTADOS_PRESUPUESTO_SIEMPRE = [
  "PENDIENTE_SURTIR",
  "PENDIENTE_CIERRE",
  "PENDIENTE_CERRAR",
  "REPARACION_EN_CURSO",
];

export default function VehiculoOrdenDetalle() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [orden, setOrden] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const tabFromUrl = searchParams.get("tab");
  const [tab, setTab] = useState(tabFromUrl || "datos");

  // Cambia el tab y persiste en la URL para que el refresh restaure el tab correcto
  const changeTab = useCallback((newTab) => {
    setTab(newTab);
    navigate(`?tab=${newTab}`, { replace: true });
  }, [navigate]);

  // El tab de presupuesto se desbloquea cuando el asesor pulsa "Continuar a Presupuesto"
  // o cuando el presupuesto ya fue guardado anteriormente (orden.presupuesto.length > 0)
  const [presupuestoDesbloqueado, setPresupuestoDesbloqueado] = useState(false);

  const ordenIniciada = !!orden?.ordenIniciada;

  const presupuestoHabilitado =
    ordenIniciada &&
    (ESTADOS_PRESUPUESTO_SIEMPRE.includes(orden?.estadoOrden) || presupuestoDesbloqueado);

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

        // Si el presupuesto ya fue guardado, desbloquear el tab
        if ((v?.presupuesto?.length ?? 0) > 0) {
          setPresupuestoDesbloqueado(true);
        }

        if (!tabFromUrl && v?.estadoOrden && ESTADO_TO_TAB[v.estadoOrden]) {
          changeTab(ESTADO_TO_TAB[v.estadoOrden]);
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

  // Polling — refresca la orden cada 8 seg solo cuando el asesor está en el tab req
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

    return () => clearInterval(interval);
  }, [tab, id]);

  const handleServicioSaved = (vehiculoActualizado) => {
    setOrden(vehiculoActualizado);
    changeTab("req");
  };

  // Se llama desde VehiculoRequisicionDiagnostico al pulsar "Continuar a Presupuesto"
  const handleGoPresupuesto = () => {
    setPresupuestoDesbloqueado(true);
    changeTab("presupuesto");
  };

  const handleOrdenSaved = (vActualizado) => {
    setOrden(vActualizado);
    // Si al guardar presupuesto ya tiene datos, mantener desbloqueado
    if ((vActualizado?.presupuesto?.length ?? 0) > 0) {
      setPresupuestoDesbloqueado(true);
    }
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

      {/* Tabs */}
      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button
            className={"nav-link" + (tab === "datos" ? " active" : "")}
            style={tab !== "datos" && isPast("datos") ? { backgroundColor: "#e9ecef", color: "#6c757d" } : {}}
            type="button"
            onClick={() => changeTab("datos")}
          >
            Datos del Cliente
          </button>
        </li>

        <li className="nav-item">
          <button
            className={"nav-link" + (tab === "servicio" ? " active" : "")}
            style={tab !== "servicio" && isPast("servicio") ? { backgroundColor: "#e9ecef", color: "#6c757d" } : {}}
            type="button"
            onClick={() => changeTab("servicio")}
          >
            Servicio o Reparación
          </button>
        </li>

        {ordenIniciada && (
          <li className="nav-item">
            <button
              className={"nav-link" + (tab === "req" ? " active" : "")}
              style={tab !== "req" && isPast("req") && presupuestoDesbloqueado ? { backgroundColor: "#e9ecef", color: "#6c757d" } : {}}
              type="button"
              onClick={() => changeTab("req")}
            >
              Requisición y Diagnóstico
            </button>
          </li>
        )}

        {/* Presupuesto: solo visible tras pulsar "Continuar a Presupuesto" o si ya fue guardado */}
        {presupuestoHabilitado && (
          <li className="nav-item">
            <button
              className={"nav-link" + (tab === "presupuesto" ? " active" : "")}
              style={tab !== "presupuesto" && isPast("presupuesto") ? { backgroundColor: "#e9ecef", color: "#6c757d" } : {}}
              type="button"
              onClick={() => changeTab("presupuesto")}
            >
              Presupuesto y Venta al Cliente
            </button>
          </li>
        )}

        {reparacionHabilitada && (
          <li className="nav-item">
            <button
              className={"nav-link" + (tab === "reparacion" ? " active" : "")}
              style={tab !== "reparacion" && isPast("reparacion") ? { backgroundColor: "#e9ecef", color: "#6c757d" } : {}}
              type="button"
              onClick={() => changeTab("reparacion")}
            >
              Reparación en Curso
            </button>
          </li>
        )}

        {ordenIniciada && (
          <li className="nav-item ms-auto">
            <button
              className={"nav-link" + (tab === "general" ? " active" : "")}
              style={tab !== "general" && isPast("general") ? { backgroundColor: "#e9ecef", color: "#6c757d" } : {}}
              type="button"
              onClick={() => changeTab("general")}
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
          existingRefacciones={orden.refaccionesSolicitadas || []}
          onSaved={handleServicioSaved}
        />
      )}

      {tab === "req" && ordenIniciada && (
        orden.estadoOrden === "PENDIENTE_REFACCIONARIA" ? (
          <div className="card">
            <div className="card-body text-center py-5">
              <div className="spinner-border text-warning mb-3" role="status" style={{ width: "3rem", height: "3rem" }}>
                <span className="visually-hidden">Espera...</span>
              </div>
              <h4 className="fw-bold text-warning">EN ESPERA DE OPCIONES</h4>
              <p className="text-muted mb-1">
                La solicitud fue enviada al refaccionario. En cuanto cotice las opciones, podrás seleccionarlas aquí.
              </p>
              <p className="text-muted small">Esta pantalla se actualiza automáticamente cada 8 segundos.</p>
              <div className="mt-4">
                <h6 className="fw-semibold mb-2">Refacciones solicitadas:</h6>
                <ul className="list-group list-group-flush d-inline-block text-start" style={{ minWidth: 280 }}>
                  {(orden.refaccionesSolicitadas || []).map((r, i) => (
                    <li key={i} className="list-group-item d-flex justify-content-between align-items-center">
                      <span>{r.refaccion}</span>
                      <span className="badge bg-secondary ms-3">Cant: {r.cant}</span>
                    </li>
                  ))}
                  {(orden.refaccionesSolicitadas || []).length === 0 && (
                    <li className="list-group-item text-muted">Sin refacciones registradas.</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <VehiculoRequisicionDiagnostico
            orden={orden}
            onSaved={(vActualizado) => setOrden(vActualizado)}
            onGoPresupuesto={handleGoPresupuesto}
          />
        )
      )}

      {tab === "presupuesto" && presupuestoHabilitado && (
        <VehiculoPresupuestoVenta
          orden={orden}
          onSaved={handleOrdenSaved}
          onGoPreparacion={() => changeTab("reparacion")}
        />
      )}

      {tab === "reparacion" && reparacionHabilitada && (
        <VehiculoReparacionEnCurso
          orden={orden}
          onSaved={(vActualizado) => setOrden(vActualizado)}
          onGoGeneral={() => changeTab("general")}
        />
      )}

      {tab === "general" && ordenIniciada && (
        <VehiculoOrdenGeneral orden={orden} />
      )}
    </div>
  );
}
