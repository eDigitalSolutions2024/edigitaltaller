import { useEffect, useState } from "react";
import {
  getTiposCambio,
  crearTipoCambio,
  getUnidadesMedida,
  crearUnidadMedida,
  cambiarEstadoUnidad,
  getMecanicos,
  crearMecanico,
  cambiarEstadoMecanico,
} from "../../api/configuracion";

import "../../styles/configuracion.css";

export default function Configuracion() {
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const [tiposCambio, setTiposCambio] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [mecanicos, setMecanicos] = useState([]);

  const [tipoCambioForm, setTipoCambioForm] = useState({
    valor: "",
    fecha: new Date().toISOString().slice(0, 10),
  });

  const [unidadForm, setUnidadForm] = useState({
    nombre: "",
  });

  const [mecanicoForm, setMecanicoForm] = useState({
    nombre: "",
    telefono: "",
  });

  const cargarDatos = async () => {
    try {
      setLoading(true);
      setError("");

      const [tipos, unidadesData, mecanicosData] = await Promise.all([
        getTiposCambio(),
        getUnidadesMedida(),
        getMecanicos(),
      ]);

      setTiposCambio(tipos);
      setUnidades(unidadesData);
      setMecanicos(mecanicosData);
    } catch (err) {
      setError(err.message || "Error al cargar configuración");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  const mostrarMensaje = (texto) => {
    setMensaje(texto);
    setTimeout(() => setMensaje(""), 2500);
  };

  const handleGuardarTipoCambio = async (e) => {
    e.preventDefault();

    try {
      setError("");

      await crearTipoCambio({
        valor: tipoCambioForm.valor,
        fecha: tipoCambioForm.fecha,
      });

      setTipoCambioForm({
        valor: "",
        fecha: new Date().toISOString().slice(0, 10),
      });

      await cargarDatos();
      mostrarMensaje("Tipo de cambio guardado correctamente");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGuardarUnidad = async (e) => {
    e.preventDefault();

    try {
      setError("");

      await crearUnidadMedida({
        nombre: unidadForm.nombre,
      });

      setUnidadForm({ nombre: "" });

      await cargarDatos();
      mostrarMensaje("Unidad de medida guardada correctamente");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGuardarMecanico = async (e) => {
    e.preventDefault();

    try {
      setError("");

      await crearMecanico({
        nombre: mecanicoForm.nombre,
        telefono: mecanicoForm.telefono,
      });

      setMecanicoForm({
        nombre: "",
        telefono: "",
      });

      await cargarDatos();
      mostrarMensaje("Mecánico guardado correctamente");
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleUnidad = async (unidad) => {
    try {
      await cambiarEstadoUnidad(unidad._id, !unidad.activo);
      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleMecanico = async (mecanico) => {
    try {
      await cambiarEstadoMecanico(mecanico._id, !mecanico.activo);
      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  };

  const ultimoTipoCambio = tiposCambio[0];

  return (
    <div className="config-page">
      <div className="config-header">
        <div>
          <h1>Configuración</h1>
          <p>Administra datos generales del sistema.</p>
        </div>
      </div>

      {mensaje && <div className="config-alert success">{mensaje}</div>}
      {error && <div className="config-alert error">{error}</div>}

      {loading ? (
        <div className="config-loading">Cargando configuración...</div>
      ) : (
        <div className="config-grid">
          {/* Tipo de cambio */}
          <section className="config-card">
            <div className="config-card-header">
              <div>
                <h2>Tipo de cambio</h2>
                <span>Registra el valor actual del dólar.</span>
              </div>
              <div className="config-icon">💵</div>
            </div>

            {ultimoTipoCambio && (
              <div className="config-current">
                <span>Último registrado</span>
                <strong>${Number(ultimoTipoCambio.valor).toFixed(2)}</strong>
              </div>
            )}

            <form onSubmit={handleGuardarTipoCambio} className="config-form">
              <label>
                Valor
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={tipoCambioForm.valor}
                  onChange={(e) =>
                    setTipoCambioForm({
                      ...tipoCambioForm,
                      valor: e.target.value,
                    })
                  }
                  placeholder="Ej. 17.25"
                  required
                />
              </label>

              <label>
                Fecha
                <input
                  type="date"
                  value={tipoCambioForm.fecha}
                  onChange={(e) =>
                    setTipoCambioForm({
                      ...tipoCambioForm,
                      fecha: e.target.value,
                    })
                  }
                  required
                />
              </label>

              <button type="submit">Guardar</button>
            </form>
          </section>

          {/* Unidades */}
          <section className="config-card">
            <div className="config-card-header">
              <div>
                <h2>Unidades de medida</h2>
                <span>Agrega unidades para inventario.</span>
              </div>
              <div className="config-icon">📏</div>
            </div>

            <form onSubmit={handleGuardarUnidad} className="config-form">
              <label>
                Nombre
                <input
                  type="text"
                  value={unidadForm.nombre}
                  onChange={(e) =>
                    setUnidadForm({ ...unidadForm, nombre: e.target.value })
                  }
                  placeholder="Ej. Pieza, Litro, Caja"
                  required
                />
              </label>

              <button type="submit">Agregar unidad</button>
            </form>

            <hr className="config-divider" />

            <div className="config-list">
              {unidades.map((unidad) => (
                <div key={unidad._id} className="config-list-item">
                  <div>
                    <strong>{unidad.nombre}</strong>
                    <span>{unidad.activo ? "Activa" : "Inactiva"}</span>
                  </div>

                  <button
                    type="button"
                    className={unidad.activo ? "btn-status off" : "btn-status on"}
                    onClick={() => toggleUnidad(unidad)}
                  >
                    {unidad.activo ? "Desactivar" : "Activar"}
                  </button>
                </div>
              ))}

              {!unidades.length && (
                <p className="config-empty">No hay unidades registradas.</p>
              )}
            </div>
          </section>

          {/* Mecánicos */}
          <section className="config-card">
            <div className="config-card-header">
              <div>
                <h2>Mecánicos</h2>
                <span>Registra mecánicos disponibles.</span>
              </div>
              <div className="config-icon">👨‍🔧</div>
            </div>

            <form onSubmit={handleGuardarMecanico} className="config-form">
              <label>
                Nombre
                <input
                  type="text"
                  value={mecanicoForm.nombre}
                  onChange={(e) =>
                    setMecanicoForm({
                      ...mecanicoForm,
                      nombre: e.target.value,
                    })
                  }
                  placeholder="Nombre del mecánico"
                  required
                />
              </label>

              {/*<label>
                Teléfono
                <input
                  type="text"
                  value={mecanicoForm.telefono}
                  onChange={(e) =>
                    setMecanicoForm({
                      ...mecanicoForm,
                      telefono: e.target.value,
                    })
                  }
                  placeholder="Opcional"
                />
              </label>*/}

              <button type="submit">Agregar mecánico</button>
            </form>

            <div className="config-list">
              {mecanicos.map((mecanico) => (
                <div key={mecanico._id} className="config-list-item">
                  <div>
                    <strong>{mecanico.nombre}</strong>
                    <span>
                      {mecanico.telefono || "Sin teléfono"} ·{" "}
                      {mecanico.activo ? "Activo" : "Inactivo"}
                    </span>
                  </div>

                  <button
                    type="button"
                    className={mecanico.activo ? "btn-status off" : "btn-status on"}
                    onClick={() => toggleMecanico(mecanico)}
                  >
                    {mecanico.activo ? "Desactivar" : "Activar"}
                  </button>
                </div>
              ))}

              {!mecanicos.length && (
                <p className="config-empty">No hay mecánicos registrados.</p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}