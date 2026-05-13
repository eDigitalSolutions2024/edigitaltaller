// src/pages/vehiculo/VehiculoEntrada.jsx
import React, { useState, useEffect, useRef } from "react";
import { getClientes } from "../../api/customers"; // 👈 obtiene clientes del backend
import VehiculoNuevoForm from "./VehiculoNuevoForm";
import { listVehiculosByCliente } from "../../api/vehiculos"; // 👈 vehículos por cliente
import { useNavigate } from "react-router-dom";

export default function VehiculoEntrada() {
  const [q, setQ] = useState("");
  const [clientes, setClientes] = useState([]);
  const [filtrados, setFiltrados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [mostrarAcciones, setMostrarAcciones] = useState(false);
  const [mostrarFormNuevoCarro, setMostrarFormNuevoCarro] = useState(false);

  const [vehiculosCliente, setVehiculosCliente] = useState([]);
  const [loadingVehiculos, setLoadingVehiculos] = useState(false);
  const [errorVehiculos, setErrorVehiculos] = useState("");

  const navigate = useNavigate();
  const tabsRef = useRef(null);

  // 1) Cargar clientes al montar
  useEffect(() => {
    const cargarClientes = async () => {
      try {
        setLoading(true);
        setError("");

        const res = await getClientes();
        console.log("BACKEND RESPUESTA:", res.data);
        const data = Array.isArray(res.data?.data) ? res.data.data : [];

        setClientes(data);
        setFiltrados(data);
      } catch (err) {
        console.error("Error al obtener clientes:", err);
        setError("No se pudieron cargar los clientes.");
      } finally {
        setLoading(false);
      }
    };

    cargarClientes();
  }, []);

  // 2) Filtrar lista mientras escribes
  useEffect(() => {
    const term = q.toLowerCase();
    if (!term) {
      setFiltrados(clientes);
      return;
    }

    const resultado = clientes.filter((c) =>
      (c.nombre || c.nombre_cliente || "").toLowerCase().includes(term)
    );
    setFiltrados(resultado);
  }, [q, clientes]);

  const handleSeleccion = async (cliente) => {
    setClienteSeleccionado(cliente);

    // mostrar acciones automáticamente
    setMostrarAcciones(true);

    // reset
    setMostrarFormNuevoCarro(false);
    setVehiculosCliente([]);
    setErrorVehiculos("");

    const nombre =
      cliente.nombre ||
      cliente.nombre_cliente ||
      `${cliente.nombre_cliente} ${cliente.apellidos || ""}`.trim();

    setQ(nombre);

    // cargar vehículos automáticamente
    await cargarVehiculosCliente(cliente._id);
  };

  const cargarVehiculosCliente = async (clienteId) => {
    try {
      setLoadingVehiculos(true);
      setErrorVehiculos("");

      const res = await listVehiculosByCliente(clienteId);
      // el backend responde { ok: true, data: [...] }
      setVehiculosCliente(res.data.data || []);
    } catch (err) {
      console.error("Error cargando vehículos del cliente:", err);
      setErrorVehiculos("No se pudieron cargar los vehículos del cliente.");
      setVehiculosCliente([]);
    } finally {
      setLoadingVehiculos(false);
    }
  };

  const handleNuevoCarro = () => {
    console.log("Nuevo carro para cliente:", clienteSeleccionado);
    setMostrarFormNuevoCarro(true); // 👈 mostrar el formulario
  };

  const handleSinCarro = () => {
    console.log("Orden sin carro para cliente:", clienteSeleccionado);
    // aquí luego harás el flujo de orden sin carro
  };

  const handleVehiculoCreado = (vehiculo) => {
    if (!vehiculo?._id) return;

    navigate(`/vehiculo/orden/${vehiculo._id}?tab=servicio`);
  };

  return (
    <div className="container-fluid">
      {/* Título */}
      <h2
        className="text-center fw-bold my-3"
        style={{ letterSpacing: "2px" }}
      >
        NUEVA ORDEN DE SERVICIO
      </h2>

      {/* Card principal */}
      <div className="card shadow-sm">
        <div className="card-body">
          <div className="row g-2 align-items-center">
            {/* Etiqueta */}
            <div className="col-12 col-md-3">
              <label className="fw-semibold mb-0">Nombre Cliente:</label>
            </div>

            {/* Input */}
            <div className="col-12">
              <input
                type="text"
                className="form-control"
                placeholder="Buscar un Nombre..."
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setClienteSeleccionado(null);
                  setMostrarAcciones(false);
                  setMostrarFormNuevoCarro(false);
                  setVehiculosCliente([]);
                }}
              />
            </div>

            {/* Botón Buscar 
            <div className="col-12 col-md-3 d-grid">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleBuscar}
              >
                Buscar
              </button>
            </div>*/}
          </div>

          {/* Estado de carga / error */}
          {loading && (
            <p className="text-muted mt-2 mb-0">Cargando clientes...</p>
          )}
          {error && <p className="text-danger mt-2 mb-0">{error}</p>}

          {/* Lista de clientes */}
          {!loading && filtrados.length > 0 && (
            <div className="mt-3">
              <ul
                className="list-group"
                style={{ maxHeight: "260px", overflowY: "auto" }}
              >
                {filtrados.map((c) => {
                  const nombre =
                    c.nombre ||
                    c.nombre_cliente ||
                    `${c.nombre_cliente} ${c.apellidos || ""}`.trim();

                  const isActive =
                    clienteSeleccionado &&
                    (clienteSeleccionado._id === c._id ||
                      clienteSeleccionado.id === c.id);

                  return (
                    <li
                      key={c._id || c.id}
                      className={
                        "list-group-item list-group-item-action" +
                        (isActive ? " active" : "")
                      }
                      style={{ cursor: "pointer" }}
                      onClick={() => handleSeleccion(c)}
                    >
                      {nombre}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {!loading && !error && filtrados.length === 0 && (
            <p className="text-muted mt-3 mb-0">
              No se encontraron clientes con ese nombre.
            </p>
          )}

          {/* 4) Después de dar Buscar → mostrar vehículos del cliente + acciones */}
          {mostrarAcciones && clienteSeleccionado && (
            <div className="mt-3">
              {/* Lista de vehículos del cliente */}
              <div className="mb-2">
                {loadingVehiculos && (
                  <p className="text-muted mb-1">Cargando vehículos...</p>
                )}

                {errorVehiculos && (
                  <p className="text-danger mb-1">{errorVehiculos}</p>
                )}

                {!loadingVehiculos &&
                  !errorVehiculos &&
                  vehiculosCliente.length > 0 && (
                    <div className="d-flex flex-wrap gap-2 mb-2">
                      {vehiculosCliente.map((v) => {
                        const label = `${v.marca || ""} ${v.modelo || ""} - ${
                          v.anio || ""
                        } - ${v.color || ""}`.trim();

                        return (
                          <button
                            key={v._id}
                            type="button"
                            className="btn btn-outline-primary btn-sm"
                            onClick={() => navigate(`/vehiculo/orden/${v._id}`)} // 👈 ir al detalle
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                {!loadingVehiculos &&
                  !errorVehiculos &&
                  vehiculosCliente.length === 0 && (
                    <p className="text-muted mb-2">
                      Este cliente aún no tiene vehículos registrados.
                    </p>
                  )}
              </div>

              {/* Cliente seleccionado + botones de acción */}
              <p className="mb-2">
                <strong>Cliente Seleccionado: </strong>
                {clienteSeleccionado.nombre || clienteSeleccionado.nombre_cliente}
              </p>

              <button
                type="button"
                className="btn btn-primary me-2"
                onClick={handleNuevoCarro}
              >
                Nuevo Carro
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleSinCarro}
              >
                Sin Carro
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 👇 AQUÍ APARECE EL FORMULARIO GRANDE CUANDO DAN "Nuevo Carro" */}
      {mostrarFormNuevoCarro && clienteSeleccionado && (
        <VehiculoNuevoForm
          cliente={clienteSeleccionado}
          onCreated={handleVehiculoCreado}
        />
      )}

      <small className="text-muted d-block mt-2">
        * Selecciona un cliente de la lista para continuar.
        para continuar con el registro del vehículo o de la orden sin carro.
      </small>
    </div>
  );
}
