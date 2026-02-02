// src/pages/vehiculo/VehiculoOrdenDetalle.jsx
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getVehiculoById,
  openOperativoPdf,
  openImprimirPdf,
} from "../../api/vehiculos";
import VehiculoNuevoForm from "./VehiculoNuevoForm";
import ServicioReparacionTab from "./ServicioReparacionTab";
import VehiculoRequisicionDiagnostico from "./VehiculoRequisicionDiagnostico";
import VehiculoPresupuestoVenta from "./VehiculoPresupuestoVenta"; // 👈 NUEVO
import VehiculoOrdenGeneral from "./VehiculoOrdenGeneral";


export default function VehiculoOrdenDetalle() {
  const { id } = useParams();
  const [orden, setOrden] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("datos"); // 'datos' | 'servicio' | 'req' | 'presupuesto' | 'general'
  const [ordenIniciada, setOrdenIniciada] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const res = await getVehiculoById(id);
        const v = res.data.vehiculo;
        setOrden(v);
        setOrdenIniciada(!!v.ordenIniciada);
      } catch (err) {
        console.error(err);
        setError("No se pudo cargar la orden.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  // cuando guardas en "Servicio o Reparación"
  const handleServicioSaved = (vehiculoActualizado) => {
    setOrden(vehiculoActualizado);
    setOrdenIniciada(true); // ya está iniciada
    // si quieres mandarlo directo a Requisición al guardar:
    // setTab("req");
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
            type="button"
            onClick={() => setTab("datos")}
          >
            Datos del Cliente
          </button>
        </li>

        <li className="nav-item">
          <button
            className={"nav-link" + (tab === "servicio" ? " active" : "")}
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
              type="button"
              onClick={() => setTab("req")}
            >
              Requisición y Diagnóstico
            </button>
          </li>
        )}

        {/* Presupuesto y Venta al Cliente: también solo si está iniciada */}
        {ordenIniciada && (
          <li className="nav-item">
            <button
              className={"nav-link" + (tab === "presupuesto" ? " active" : "")}
              type="button"
              onClick={() => setTab("presupuesto")}
            >
              Presupuesto y Venta al Cliente
            </button>
          </li>
        )}

        {/* General: habilitada, Calidad escondida */}
        {ordenIniciada && (
          <li className="nav-item">
            <button
              className={"nav-link" + (tab === "general" ? " active" : "")}
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
        />
      )}

      {tab === "presupuesto" && ordenIniciada && (
          <VehiculoPresupuestoVenta
            orden={orden}
            onSaved={(vActualizado) => setOrden(vActualizado)}
          />
        )}

      {/* Tab General (por ahora solo placeholder, luego lo llenamos) */}
      {tab === "general" && ordenIniciada && (
        <VehiculoOrdenGeneral orden={orden} />
      )}


      {/* Botones debajo: Imprimir y Operativo */}
      <div className="text-center my-3">
        <button
          type="button"
          className="btn btn-secondary me-2"
          onClick={() => openImprimirPdf(orden._id)}
        >
          Imprimir
        </button>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => openOperativoPdf(orden._id)}
        >
          Operativo
        </button>
      </div>
    </div>
  );
}
