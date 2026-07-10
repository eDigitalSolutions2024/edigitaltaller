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
  getOrdenServicioContador,
  actualizarOrdenServicioContador,
  getValeContador,
  actualizarValeContador,
  getDevolucionRefaccionContador,
  actualizarDevolucionRefaccionContador,
} from "../../api/configuracion";

import "../../styles/configuracion.css";

export default function Configuracion() {
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const [tiposCambio, setTiposCambio] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [mecanicos, setMecanicos] = useState([]);
  const [ordenServicioContador, setOrdenServicioContador] = useState(0);
  const [valeContador, setValeContador] = useState(0);
  const [devolucionRefaccionContador, setDevolucionRefaccionContador] = useState(0);

  const [tipoCambioForm, setTipoCambioForm] = useState({
    valor: "",
    fecha: new Date().toISOString().slice(0, 10),
  });

  const [ordenServicioForm, setOrdenServicioForm] = useState("");
  const [valeForm, setValeForm] = useState("");
  const [devolucionRefaccionForm, setDevolucionRefaccionForm] = useState("");

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

      const [tipos, unidadesData, mecanicosData, ordenServicioData, valeData, devolucionData] = await Promise.all([
        getTiposCambio(),
        getUnidadesMedida(),
        getMecanicos(),
        getOrdenServicioContador(),
        getValeContador(),
        getDevolucionRefaccionContador(),
      ]);

      setTiposCambio(tipos);
      setUnidades(unidadesData);
      setMecanicos(mecanicosData);
      setOrdenServicioContador(ordenServicioData?.valor || 0);
      setValeContador(valeData?.valor || 0);
      setDevolucionRefaccionContador(devolucionData?.valor || 0);
    } catch (err) {
      setError(err.message || "Error al cargar configuración");
    } finally {
      setLoading(false);
    }
  };

  // Refresca solo el contador de Orden de Servicio (sin tocar el resto de
  // la pantalla) — se usa al montar y al recuperar el foco de la pestaña.
  const refrescarOrdenServicioContador = async () => {
    try {
      const data = await getOrdenServicioContador();
      setOrdenServicioContador(data?.valor || 0);
    } catch {
      // Falla silenciosa: no interrumpe la vista si el refresco en segundo
      // plano no se pudo completar.
    }
  };

  const refrescarValeContador = async () => {
    try {
      const data = await getValeContador();
      setValeContador(data?.valor || 0);
    } catch {
      // Falla silenciosa: no interrumpe la vista si el refresco en segundo
      // plano no se pudo completar.
    }
  };

  const refrescarDevolucionRefaccionContador = async () => {
    try {
      const data = await getDevolucionRefaccionContador();
      setDevolucionRefaccionContador(data?.valor || 0);
    } catch {
      // Falla silenciosa: no interrumpe la vista si el refresco en segundo
      // plano no se pudo completar.
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  // Al volver a enfocar la pestaña, los contadores pueden haber cambiado
  // (ej. otro usuario emitió una orden o un vale mientras tanto) — se refrescan.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refrescarOrdenServicioContador();
        refrescarValeContador();
        refrescarDevolucionRefaccionContador();
      }
    };

    const handleFocus = () => {
      refrescarOrdenServicioContador();
      refrescarValeContador();
      refrescarDevolucionRefaccionContador();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
    };
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

  const handleGuardarOrdenServicioContador = async (e) => {
    e.preventDefault();

    try {
      setError("");

      const res = await actualizarOrdenServicioContador(ordenServicioForm);
      setOrdenServicioContador(res?.valor || 0);
      setOrdenServicioForm("");

      mostrarMensaje("Número actual de Orden de Servicio actualizado correctamente");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGuardarValeContador = async (e) => {
    e.preventDefault();

    try {
      setError("");

      const res = await actualizarValeContador(valeForm);
      setValeContador(res?.valor || 0);
      setValeForm("");

      mostrarMensaje("Número actual de Vale de Salida actualizado correctamente");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGuardarDevolucionRefaccionContador = async (e) => {
    e.preventDefault();

    try {
      setError("");

      const res = await actualizarDevolucionRefaccionContador(devolucionRefaccionForm);
      setDevolucionRefaccionContador(res?.valor || 0);
      setDevolucionRefaccionForm("");

      mostrarMensaje("Número actual de Devolución de Refacción actualizado correctamente");
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

          {/* Contador de Orden de Servicio */}
          <section className="config-card">
            <div className="config-card-header">
              <div>
                <h2>Folio de Orden de Servicio</h2>
              </div>
              <div className="config-icon">🔢</div>
            </div>

            <div className="config-current">
              <span>Número actual</span>
              <strong>{ordenServicioContador}</strong>
            </div>

            <p className="text-muted small mb-2">
              La próxima orden de servicio se creará como{" "}
              <strong>P-{Number(ordenServicioContador) + 1}</strong>.
            </p>

            <form onSubmit={handleGuardarOrdenServicioContador} className="config-form">
              <label>
                Redefinir número actual
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={ordenServicioForm}
                  onChange={(e) => setOrdenServicioForm(e.target.value)}
                  placeholder={`Ej. ${ordenServicioContador}`}
                  required
                />
              </label>

              <button type="submit">Guardar</button>
            </form>
          </section>

          {/* Contador de Vale de Salida */}
          <section className="config-card">
            <div className="config-card-header">
              <div>
                <h2>Folio de Vale de Salida</h2>
              </div>
              <div className="config-icon">🎫</div>
            </div>

            <div className="config-current">
              <span>Número actual</span>
              <strong>{valeContador}</strong>
            </div>

            <p className="text-muted small mb-2">
              El próximo vale de salida se creará como{" "}
              <strong>{Number(valeContador) + 1}</strong>.
            </p>

            <form onSubmit={handleGuardarValeContador} className="config-form">
              <label>
                Redefinir número actual
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={valeForm}
                  onChange={(e) => setValeForm(e.target.value)}
                  placeholder={`Ej. ${valeContador}`}
                  required
                />
              </label>

              <button type="submit">Guardar</button>
            </form>
          </section>

          {/* Contador de Devolución de Refacción */}
          <section className="config-card">
            <div className="config-card-header">
              <div>
                <h2>Número de Devolución de Refacción</h2>
              </div>
              <div className="config-icon">↩️</div>
            </div>

            <div className="config-current">
              <span>Número actual</span>
              <strong>{devolucionRefaccionContador}</strong>
            </div>

            <p className="text-muted small mb-2">
              La próxima devolución de refacción se imprimirá con el número{" "}
              <strong>{Number(devolucionRefaccionContador) + 1}</strong>.
            </p>

            <form onSubmit={handleGuardarDevolucionRefaccionContador} className="config-form">
              <label>
                Redefinir número actual
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={devolucionRefaccionForm}
                  onChange={(e) => setDevolucionRefaccionForm(e.target.value)}
                  placeholder={`Ej. ${devolucionRefaccionContador}`}
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
        </div>
      )}
    </div>
  );
}