// src/pages/vehiculo/VehiculoEntrada.jsx
import React, { useState, useEffect, useRef } from "react";
import { getClientes } from "../../api/customers";
import VehiculoNuevoForm from "./VehiculoNuevoForm";
import { useNavigate } from "react-router-dom";
import ModalAltaCliente from "../../components/ModalAltaCliente";
import GarageModal from "./GarageModal";
import GarantiaModal from "./GarantiaModal";
import { getUser } from "../../auth";

export default function VehiculoEntrada() {
  // Garantías aún en ajustes: el botón solo está disponible para admins
  const esAdmin = getUser()?.role === "admin";
  const [q, setQ] = useState("");
  const [clientes, setClientes] = useState([]);
  const [filtrados, setFiltrados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [mostrarModalAlta, setMostrarModalAlta] = useState(false);

  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [mostrarAcciones, setMostrarAcciones] = useState(false);
  const [mostrarFormNuevoCarro, setMostrarFormNuevoCarro] = useState(false);

  const [showGarageModal, setShowGarageModal] = useState(false);
  const [vehiculoGarage, setVehiculoGarage] = useState(null);

  const [showGarantiaModal, setShowGarantiaModal] = useState(false);
  const [garantiaInfo, setGarantiaInfo] = useState(null); // { ordenAnterior, motivo }

  const navigate = useNavigate();
  const tabsRef = useRef(null);

  // 1) Cargar clientes al montar
  useEffect(() => {
    const cargarClientes = async () => {
      try {
        setLoading(true);
        setError("");

        const res = await getClientes({ limit: 9999 });
        // console.log("BACKEND RESPUESTA:", res.data);
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
    const term = q.toLowerCase().trim();
    if (!term) {
      setFiltrados(clientes);
      return;
    }

    const resultado = clientes.filter((c) => {
      const nombreCompleto = [
        c.nombre,
        c.apellidoPaterno,
        c.apellidoMaterno,
      ].filter(Boolean).join(" ");

      const nombreFiltro =
        c.gobierno?.nombreGobierno ||
        c.empresa?.razonSocial ||
        nombreCompleto ||
        "";

      return nombreFiltro.toLowerCase().includes(term);
    });
    setFiltrados(resultado);
  }, [q, clientes]);

  const handleSeleccion = async (cliente) => {
    setClienteSeleccionado(cliente);
    setMostrarAcciones(true);
    setMostrarFormNuevoCarro(false);
    setVehiculoGarage(null);
    setGarantiaInfo(null);

    const nombre =
      cliente.gobierno?.nombreGobierno ||
      cliente.empresa?.razonSocial ||
      [cliente.nombre, cliente.apellidoPaterno, cliente.apellidoMaterno].filter(Boolean).join(" ") ||
      "Sin nombre";

    setQ(nombre);
  };

  const handleNuevoCarro = () => {
    setVehiculoGarage(null);
    setGarantiaInfo(null);
    setMostrarFormNuevoCarro(true);
  };

  const handleSinCarro = () => {
    console.log("Orden sin carro para cliente:", clienteSeleccionado);
  };

  const handleGaraje = () => {
    setShowGarageModal(true);
  };

  const handleVehiculoDesdeGarage = (v) => {
    setVehiculoGarage(v);
    setGarantiaInfo(null);
    setMostrarFormNuevoCarro(true);
    setShowGarageModal(false);
  };

  const handleGarantia = () => {
    setShowGarantiaModal(true);
  };

  // La orden anterior es un doc Vehiculo completo: sirve como prefill
  // del vehículo (mismo mecanismo que el flujo del garaje).
  const handleGarantiaSolicitada = ({ ordenAnterior, motivo }) => {
    setGarantiaInfo({ ordenAnterior, motivo });
    setVehiculoGarage(ordenAnterior);
    setMostrarFormNuevoCarro(true);
    setShowGarantiaModal(false);
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
                  setVehiculoGarage(null);
                  setGarantiaInfo(null);
                }}
              />
            </div>
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
                    c.gobierno?.nombreGobierno ||
                    c.empresa?.razonSocial ||
                    [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(" ") ||
                    "Sin nombre";

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

          {!loading && !error && q.trim().length > 0 && filtrados.length === 0 && (
            <div className="mt-3 d-flex align-items-center gap-3">
              <p className="text-muted mb-0">
                No se encontraron clientes con ese nombre.
              </p>
              <button
                type="button"
                className="btn btn-outline-primary btn-sm"
                onClick={() => setMostrarModalAlta(true)}
              >
                + Crear nuevo cliente
              </button>
            </div>
          )}

          {/* Después de seleccionar cliente → botones de acción */}
          {mostrarAcciones && clienteSeleccionado && (
            <div className="mt-3">
              <p className="mb-2">
                <strong>Cliente Seleccionado: </strong>
                {clienteSeleccionado.gobierno?.nombreGobierno ||
                  clienteSeleccionado.empresa?.razonSocial ||
                  [clienteSeleccionado.nombre, clienteSeleccionado.apellidoPaterno].filter(Boolean).join(" ") ||
                  "Sin nombre"}
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
                className="btn btn-secondary me-2"
                onClick={handleSinCarro}
              >
                Sin Carro
              </button>
              <button
                type="button"
                className="btn btn-success me-2"
                onClick={handleGaraje}
              >
                Garaje
              </button>
              {esAdmin && (
                <button
                  type="button"
                  className="btn btn-warning"
                  onClick={handleGarantia}
                >
                  Garantía
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Aviso de orden con solicitud de garantía */}
      {mostrarFormNuevoCarro && clienteSeleccionado && garantiaInfo && (
        <div className="alert alert-warning mt-3 mb-0">
          <strong>Solicitud de garantía</strong> sobre la orden{" "}
          <strong>{garantiaInfo.ordenAnterior?.ordenServicio}</strong>.
          {" "}Motivo: {garantiaInfo.motivo}
        </div>
      )}

      {/* Formulario de nuevo vehículo */}
      {mostrarFormNuevoCarro && clienteSeleccionado && (
        <VehiculoNuevoForm
          cliente={clienteSeleccionado}
          vehiculoGarage={vehiculoGarage}
          garantia={garantiaInfo}
          onCreated={handleVehiculoCreado}
        />
      )}

      <small className="text-muted d-block mt-2">
        * Selecciona un cliente de la lista para continuar
        con el registro del vehículo o de la orden sin carro.
      </small>

      {mostrarModalAlta && (
        <ModalAltaCliente
          nombreInicial={q}
          onCerrar={() => setMostrarModalAlta(false)}
          onClienteCreado={(clienteNuevo) => {
            setMostrarModalAlta(false);
            if (clienteNuevo?._id) {
              setClientes((prev) => [clienteNuevo, ...prev]);
              handleSeleccion(clienteNuevo);
            }
          }}
        />
      )}

      <GarageModal
        show={showGarageModal}
        onSelect={handleVehiculoDesdeGarage}
        onClose={() => setShowGarageModal(false)}
      />

      <GarantiaModal
        show={showGarantiaModal}
        cliente={clienteSeleccionado}
        onSolicitar={handleGarantiaSolicitada}
        onClose={() => setShowGarantiaModal(false)}
      />
    </div>
  );
}
