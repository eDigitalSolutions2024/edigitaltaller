import { useEffect, useMemo, useState } from "react";
import {
  getTiposCambio,
  crearTipoCambio,
  getTipoCambioSie,
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
  getNotaVentaContador,
  actualizarNotaVentaContador,
  getRemisionContador,
  actualizarRemisionContador,
  getValeCajaContador,
  actualizarValeCajaContador,
  getOrdenCompraContador,
  actualizarOrdenCompraContador,
  getNotaCreditoContador,
  actualizarNotaCreditoContador,
  getCuentasBancarias,
  actualizarCuentasBancarias,
  getFondoCaja,
  actualizarFondoCaja,
  getExigirUuid,
  actualizarExigirUuid,
  getContratoOrdenServicio,
  actualizarContratoOrdenServicio,
  getSitioConfig,
  actualizarSitioConfig,
} from "../../api/configuracion";
import TipoCambioHistorialModal from "./components/TipoCambioHistorialModal";
import { recargarBancos } from "../../hooks/useBancos";
import CuentasBancariasModal from "./components/CuentasBancariasModal";
import ContratoHistorialModal from "./components/ContratoHistorialModal";

import "../../styles/configuracion.css";

export default function Configuracion() {
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const [tiposCambio, setTiposCambio] = useState([]);
  const [tipoCambioSie, setTipoCambioSie] = useState(null);
  const [cargandoSie, setCargandoSie] = useState(true);
  const [mostrarHistorialSie, setMostrarHistorialSie] = useState(false);
  const [unidades, setUnidades] = useState([]);
  const [mecanicos, setMecanicos] = useState([]);
  const [ordenServicioContador, setOrdenServicioContador] = useState(0);
  const [valeContador, setValeContador] = useState(0);
  const [valeCajaContador, setValeCajaContador] = useState(0);
  const [devolucionRefaccionContador, setDevolucionRefaccionContador] = useState(0);
  const [notaVentaContador, setNotaVentaContador] = useState(0);
  const [remisionContador, setRemisionContador] = useState(0);
  const [ordenCompraContador, setOrdenCompraContador] = useState(0);
  const [notaCreditoContador, setNotaCreditoContador] = useState(0);
  const [cuentasBancarias, setCuentasBancarias] = useState([]);
  const [guardandoCuentasBancarias, setGuardandoCuentasBancarias] = useState(false);
  const [showCuentasModal, setShowCuentasModal] = useState(false);
  const [fondoCaja, setFondoCaja] = useState(0);
  // Facturación: ¿se exige el UUID real al relacionar facturas? (default sí; ver hooks/useExigirUuid)
  const [exigirUuid, setExigirUuid] = useState(true);
  const [guardandoUuid, setGuardandoUuid] = useState(false);

  const [tipoCambioForm, setTipoCambioForm] = useState({
    valor: "",
    fecha: new Date().toISOString().slice(0, 10),
  });

  const [ordenServicioForm, setOrdenServicioForm] = useState("");
  const [valeForm, setValeForm] = useState("");
  const [valeCajaForm, setValeCajaForm] = useState("");
  const [devolucionRefaccionForm, setDevolucionRefaccionForm] = useState("");
  const [notaVentaForm, setNotaVentaForm] = useState("");
  const [remisionForm, setRemisionForm] = useState("");
  const [ordenCompraForm, setOrdenCompraForm] = useState("");
  const [notaCreditoForm, setNotaCreditoForm] = useState("");
  const [fondoCajaForm, setFondoCajaForm] = useState("");

  const [unidadForm, setUnidadForm] = useState({
    nombre: "",
  });

  const [cargandoSitio, setCargandoSitio] = useState(true);
  const [sitioForm, setSitioForm] = useState({
    nombre: "",
    direccionCorta: "",
    direccionLinea1: "",
    direccionLinea2: "",
    telefono: "",
    esMatriz: true,
  });

  const [cargandoContrato, setCargandoContrato] = useState(true);
  const [contratoTitulo, setContratoTitulo] = useState("");
  const [contratoClausulasText, setContratoClausulasText] = useState("");
  const [contratoPiePaginaText, setContratoPiePaginaText] = useState("");
  const [mostrarHistorialContrato, setMostrarHistorialContrato] = useState(false);

  const [mecanicoForm, setMecanicoForm] = useState({
    nombre: "",
    telefono: "",
  });

  const cargarDatos = async () => {
    try {
      setLoading(true);
      setError("");

      const [tipos, unidadesData, mecanicosData, ordenServicioData, valeData, valeCajaData, devolucionData, notaVentaData, remisionData, ordenCompraData, notaCreditoData, fondoCajaData] = await Promise.all([
        getTiposCambio(),
        getUnidadesMedida(),
        getMecanicos(),
        getOrdenServicioContador(),
        getValeContador(),
        getValeCajaContador(),
        getDevolucionRefaccionContador(),
        getNotaVentaContador(),
        getRemisionContador(),
        getOrdenCompraContador(),
        getNotaCreditoContador(),
        getFondoCaja(),
      ]);

      setTiposCambio(tipos);
      setUnidades(unidadesData);
      setMecanicos(mecanicosData);
      setOrdenServicioContador(ordenServicioData?.valor || 0);
      setValeContador(valeData?.valor || 0);
      setValeCajaContador(valeCajaData?.valor || 0);
      setDevolucionRefaccionContador(devolucionData?.valor || 0);
      setNotaVentaContador(notaVentaData?.valor || 0);
      setRemisionContador(remisionData?.valor || 0);
      setOrdenCompraContador(ordenCompraData?.valor || 0);
      setNotaCreditoContador(notaCreditoData?.valor || 0);
      setFondoCaja(fondoCajaData?.valor || 0);
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

  const refrescarValeCajaContador = async () => {
    try {
      const data = await getValeCajaContador();
      setValeCajaContador(data?.valor || 0);
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

  const refrescarNotaVentaContador = async () => {
    try {
      const data = await getNotaVentaContador();
      setNotaVentaContador(data?.valor || 0);
    } catch {
      // Falla silenciosa: no interrumpe la vista si el refresco en segundo
      // plano no se pudo completar.
    }
  };

  const refrescarRemisionContador = async () => {
    try {
      const data = await getRemisionContador();
      setRemisionContador(data?.valor || 0);
    } catch {
      // Falla silenciosa: no interrumpe la vista si el refresco en segundo
      // plano no se pudo completar.
    }
  };

  const refrescarOrdenCompraContador = async () => {
    try {
      const data = await getOrdenCompraContador();
      setOrdenCompraContador(data?.valor || 0);
    } catch {
      // Falla silenciosa: no interrumpe la vista si el refresco en segundo
      // plano no se pudo completar.
    }
  };

  const refrescarFondoCaja = async () => {
    try {
      const data = await getFondoCaja();
      setFondoCaja(data?.valor || 0);
    } catch {
      // Falla silenciosa: no interrumpe la vista si el refresco en segundo
      // plano no se pudo completar.
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  // Se carga aparte de cargarDatos: si Banxico está lento o caído, no debe
  // retrasar ni romper el resto de la pantalla de Configuración.
  useEffect(() => {
    (async () => {
      try {
        setCargandoSie(true);
        const data = await getTipoCambioSie();
        setTipoCambioSie(data);
      } catch {
        setTipoCambioSie(null);
      } finally {
        setCargandoSie(false);
      }
    })();
  }, []);

  // Se carga aparte de cargarDatos, mismo motivo que el contrato: no pisar
  // lo que el admin esté escribiendo en este formulario.
  useEffect(() => {
    (async () => {
      try {
        setCargandoSitio(true);
        const data = await getSitioConfig();
        setSitioForm({
          nombre: data?.nombre || "",
          direccionCorta: data?.direccionCorta || "",
          direccionLinea1: data?.direccionLinea1 || "",
          direccionLinea2: data?.direccionLinea2 || "",
          telefono: data?.telefono || "",
          esMatriz: data?.esMatriz !== false,
        });
      } catch (err) {
        setError(err.message || "Error al cargar la configuración del sitio");
      } finally {
        setCargandoSitio(false);
      }
    })();
  }, []);

  // Se carga aparte de cargarDatos: así los saves de otras tarjetas (que
  // vuelven a llamar cargarDatos) no pisan lo que el admin esté escribiendo
  // en el contrato.
  useEffect(() => {
    (async () => {
      try {
        setCargandoContrato(true);
        const data = await getContratoOrdenServicio();
        setContratoTitulo(data?.titulo || "");
        setContratoClausulasText((data?.clausulas || []).join("\n\n"));
        setContratoPiePaginaText((data?.piePagina || []).join("\n"));
      } catch (err) {
        setError(err.message || "Error al cargar el contrato de orden de servicio");
      } finally {
        setCargandoContrato(false);
      }
    })();
  }, []);

  // Al volver a enfocar la pestaña, los contadores pueden haber cambiado
  // (ej. otro usuario emitió una orden o un vale mientras tanto) — se refrescan.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refrescarOrdenServicioContador();
        refrescarValeContador();
        refrescarValeCajaContador();
        refrescarDevolucionRefaccionContador();
        refrescarNotaVentaContador();
        refrescarRemisionContador();
        refrescarOrdenCompraContador();
        refrescarFondoCaja();
      }
    };

    const handleFocus = () => {
      refrescarOrdenServicioContador();
      refrescarValeContador();
      refrescarValeCajaContador();
      refrescarDevolucionRefaccionContador();
      refrescarNotaVentaContador();
      refrescarRemisionContador();
      refrescarOrdenCompraContador();
      refrescarFondoCaja();
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

  const handleGuardarValeCajaContador = async (e) => {
    e.preventDefault();

    try {
      setError("");

      const res = await actualizarValeCajaContador(valeCajaForm);
      setValeCajaContador(res?.valor || 0);
      setValeCajaForm("");

      mostrarMensaje("Número actual de Vale de Caja actualizado correctamente");
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

  const handleGuardarNotaVentaContador = async (e) => {
    e.preventDefault();

    try {
      setError("");

      const res = await actualizarNotaVentaContador(notaVentaForm);
      setNotaVentaContador(res?.valor || 0);
      setNotaVentaForm("");

      mostrarMensaje("Número actual de Nota de Venta actualizado correctamente");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGuardarRemisionContador = async (e) => {
    e.preventDefault();

    try {
      setError("");

      const res = await actualizarRemisionContador(remisionForm);
      setRemisionContador(res?.valor || 0);
      setRemisionForm("");

      mostrarMensaje("Número actual de Remisión actualizado correctamente");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGuardarOrdenCompraContador = async (e) => {
    e.preventDefault();

    try {
      setError("");

      const res = await actualizarOrdenCompraContador(ordenCompraForm);
      setOrdenCompraContador(res?.valor || 0);
      setOrdenCompraForm("");

      mostrarMensaje("Número actual de Orden de Compra actualizado correctamente");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGuardarNotaCreditoContador = async (e) => {
    e.preventDefault();

    try {
      setError("");

      const res = await actualizarNotaCreditoContador(notaCreditoForm);
      setNotaCreditoContador(res?.valor || 0);
      setNotaCreditoForm("");

      mostrarMensaje("Número actual de Nota de Crédito actualizado correctamente");
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    getExigirUuid()
      .then((data) => setExigirUuid(data?.valor !== false))
      .catch(() => {
        // sin dato: se deja en "se exige" (lo seguro)
      });
  }, []);

  useEffect(() => {
    getCuentasBancarias()
      .then((data) => setCuentasBancarias(data?.cuentas || []))
      .catch(() => {
        // sin dato: la sección queda vacía, el PDF muestra "Num Cuenta" en blanco
      });
  }, []);

  const handleGuardarCuentasBancarias = async (cuentas) => {
    try {
      setError("");
      setGuardandoCuentasBancarias(true);
      const res = await actualizarCuentasBancarias(
        cuentas.map((c) => ({ banco: c.banco, nuevo: c.nuevo, label: c.label, abrev: c.abrev, rfc: c.rfc, numeroCuenta: c.numeroCuenta }))
      );
      setCuentasBancarias(res?.cuentas || []);
      recargarBancos();
      setShowCuentasModal(false);
      mostrarMensaje("Cuentas bancarias actualizadas correctamente");
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoCuentasBancarias(false);
    }
  };

  const handleToggleExigirUuid = async (e) => {
    const nuevo = e.target.checked;
    try {
      setError("");
      setGuardandoUuid(true);
      const res = await actualizarExigirUuid(nuevo);
      setExigirUuid(res?.valor !== false);
      mostrarMensaje(
        nuevo
          ? "Ahora se exige el UUID real al relacionar facturas"
          : "Modo pruebas: ya no se exige el UUID al relacionar facturas"
      );
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    } finally {
      setGuardandoUuid(false);
    }
  };

  const handleGuardarFondoCaja = async (e) => {
    e.preventDefault();

    try {
      setError("");

      const res = await actualizarFondoCaja(fondoCajaForm);
      setFondoCaja(res?.valor || 0);
      setFondoCajaForm("");

      mostrarMensaje("Fondo de caja actualizado correctamente");
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

  // Cada cláusula es un párrafo separado por línea(s) en blanco; dentro de
  // una cláusula los saltos de línea se colapsan porque el HTML del PDF
  // (<li>) no respeta \n de todos modos.
  const clausulasFromText = (texto) =>
    texto
      .split(/\n\s*\n/)
      .map((c) => c.replace(/\s+/g, " ").trim())
      .filter(Boolean);

  const lineasFromText = (texto) =>
    texto
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

  const previewClausulas = useMemo(
    () => clausulasFromText(contratoClausulasText),
    [contratoClausulasText]
  );
  const previewPie = useMemo(
    () => lineasFromText(contratoPiePaginaText),
    [contratoPiePaginaText]
  );

  const handleGuardarContrato = async (e) => {
    e.preventDefault();

    try {
      setError("");

      if (!contratoTitulo.trim()) {
        setError("El título del contrato es obligatorio");
        return;
      }

      const clausulas = clausulasFromText(contratoClausulasText);
      if (!clausulas.length) {
        setError("El contrato debe tener al menos una cláusula");
        return;
      }

      const piePagina = lineasFromText(contratoPiePaginaText);

      const res = await actualizarContratoOrdenServicio({
        titulo: contratoTitulo,
        clausulas,
        piePagina,
      });

      setContratoTitulo(res.titulo);
      setContratoClausulasText((res.clausulas || []).join("\n\n"));
      setContratoPiePaginaText((res.piePagina || []).join("\n"));

      mostrarMensaje("Contrato actualizado. Las siguientes órdenes usarán este formato.");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGuardarSitio = async (e) => {
    e.preventDefault();

    try {
      setError("");

      if (!sitioForm.nombre.trim()) {
        setError("El nombre del sitio es obligatorio");
        return;
      }

      const res = await actualizarSitioConfig(sitioForm);
      setSitioForm({
        nombre: res?.nombre || "",
        direccionCorta: res?.direccionCorta || "",
        direccionLinea1: res?.direccionLinea1 || "",
        direccionLinea2: res?.direccionLinea2 || "",
        telefono: res?.telefono || "",
        esMatriz: res?.esMatriz !== false,
      });

      mostrarMensaje("Datos del sitio actualizados correctamente");
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
          {/* Datos del sitio */}
          <section className="config-card config-card-full">
            <div className="config-card-header">
              <div>
                <h2>Datos del sitio</h2>
                <span>
                  Nombre, dirección y teléfono que se imprimen en reportes y documentos. Al
                  manejar varias sucursales, cada instalación configura aquí sus propios datos.
                </span>
              </div>
              <div className="config-icon">🏢</div>
            </div>

            {cargandoSitio ? (
              <p className="text-muted small mb-2">Cargando datos del sitio...</p>
            ) : (
              <form onSubmit={handleGuardarSitio} className="config-form">
                <label>
                  Nombre del sitio
                  <input
                    type="text"
                    value={sitioForm.nombre}
                    onChange={(e) => setSitioForm({ ...sitioForm, nombre: e.target.value })}
                    placeholder="Ej. SERVICOMPACTOS DE JUAREZ"
                    required
                  />
                </label>

                <label>
                  Dirección corta (encabezado de reportes)
                  <input
                    type="text"
                    value={sitioForm.direccionCorta}
                    onChange={(e) => setSitioForm({ ...sitioForm, direccionCorta: e.target.value })}
                    placeholder="Ej. PASEO TRIUNFO DE LA REPÚBLICA #322, SAN LORENZO"
                  />
                </label>

                <label>
                  Dirección — calle y número
                  <input
                    type="text"
                    value={sitioForm.direccionLinea1}
                    onChange={(e) => setSitioForm({ ...sitioForm, direccionLinea1: e.target.value })}
                    placeholder="Ej. PASEO TRIUNFO DE LA REPÚBLICA #322-B"
                  />
                </label>

                <label>
                  Dirección — colonia, C.P., ciudad y estado
                  <input
                    type="text"
                    value={sitioForm.direccionLinea2}
                    onChange={(e) => setSitioForm({ ...sitioForm, direccionLinea2: e.target.value })}
                    placeholder="Ej. COL. SAN LORENZO, C.P. 32320, CD. JUÁREZ, CHIH."
                  />
                </label>

                <label>
                  Teléfono
                  <input
                    type="text"
                    value={sitioForm.telefono}
                    onChange={(e) => setSitioForm({ ...sitioForm, telefono: e.target.value })}
                    placeholder="Ej. (656) 626-5651 AL 54"
                  />
                </label>

                <div className="form-check form-switch mb-2">
                  <input
                    type="checkbox"
                    role="switch"
                    className="form-check-input"
                    id="sitioEsMatriz"
                    checked={sitioForm.esMatriz}
                    onChange={(e) => setSitioForm({ ...sitioForm, esMatriz: e.target.checked })}
                  />
                  <label className="form-check-label" htmlFor="sitioEsMatriz">
                    Es matriz (muestra "Matriz" en el reporte de Facturas y Remisiones del día)
                  </label>
                </div>

                <button type="submit">Guardar</button>
              </form>
            )}
          </section>

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

            <div className="config-current">
              <span>Referencia SIE (Banxico)</span>
              {cargandoSie ? (
                <strong>Cargando…</strong>
              ) : tipoCambioSie ? (
                <strong>
                  ${Number(tipoCambioSie.valor).toFixed(2)} el{" "}
                  {new Date(tipoCambioSie.fecha).toLocaleDateString("es-MX", { timeZone: "UTC" })}
                </strong>
              ) : (
                <strong>No disponible</strong>
              )}
              <small>Solo como referencia, no se usa en los cálculos del sistema.</small>
            </div>

            <button
              type="button"
              className="config-secondary-button"
              onClick={() => setMostrarHistorialSie(true)}
            >
              Ver historial de tipo de cambio
            </button>

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

          {/* Fondo de Caja */}
          <section className="config-card">
            <div className="config-card-header">
              <div>
                <h2>Fondo de Caja</h2>
                <span>Monto fijo que se deja en caja; lo usa Gestión de Caja para calcular la diferencia.</span>
              </div>
              <div className="config-icon">🏦</div>
            </div>

            <div className="config-current">
              <span>Valor actual</span>
              <strong>${Number(fondoCaja).toFixed(2)}</strong>
            </div>

            <form onSubmit={handleGuardarFondoCaja} className="config-form">
              <label>
                Redefinir valor
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={fondoCajaForm}
                  onChange={(e) => setFondoCajaForm(e.target.value)}
                  placeholder={`Ej. ${fondoCaja}`}
                  required
                />
              </label>

              <button type="submit">Guardar</button>
            </form>
          </section>

          {/* Facturación: exigir UUID (solo pruebas) */}
          <section className="config-card">
            <div className="config-card-header">
              <div>
                <h2>UUID en facturas</h2>
                <span>
                  El sistema aún no timbra, así que el UUID (folio fiscal) se captura a mano al relacionar
                  facturas (nota de crédito, complemento de pago, refacturación).
                </span>
              </div>
              <div className="config-icon">🧾</div>
            </div>

            <div className="config-current">
              <span>Estado</span>
              <strong>{exigirUuid ? "UUID obligatorio" : "UUID NO obligatorio (pruebas)"}</strong>
            </div>

            <div className="form-check form-switch mb-2">
              <input
                type="checkbox"
                role="switch"
                className="form-check-input"
                id="exigirUuidFacturas"
                checked={exigirUuid}
                disabled={guardandoUuid}
                onChange={handleToggleExigirUuid}
              />
              <label className="form-check-label" htmlFor="exigirUuidFacturas">
                Exigir el UUID real para generar el XML
              </label>
            </div>

            <p className="text-muted small mb-0">
              Desactívalo <strong>solo para pruebas</strong>: el XML se genera sin pedir el UUID y lleva uno en
              ceros donde falte. Vuelve a activarlo antes de subir a producción.
            </p>
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

          {/* Contador de Vale de Caja */}
          <section className="config-card">
            <div className="config-card-header">
              <div>
                <h2>Folio de Vale de Caja</h2>
              </div>
              <div className="config-icon">🧮</div>
            </div>

            <div className="config-current">
              <span>Número actual</span>
              <strong>{valeCajaContador}</strong>
            </div>

            <p className="text-muted small mb-2">
              El próximo vale de caja (Gestión de Caja) se generará con el folio{" "}
              <strong>{Number(valeCajaContador) + 1}</strong>.
            </p>

            <form onSubmit={handleGuardarValeCajaContador} className="config-form">
              <label>
                Redefinir número actual
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={valeCajaForm}
                  onChange={(e) => setValeCajaForm(e.target.value)}
                  placeholder={`Ej. ${valeCajaContador}`}
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

          {/* Contador de Nota de Venta */}
          <section className="config-card">
            <div className="config-card-header">
              <div>
                <h2>Folio de Nota de Venta</h2>
              </div>
              <div className="config-icon">🧾</div>
            </div>

            <div className="config-current">
              <span>Número actual</span>
              <strong>{notaVentaContador}</strong>
            </div>

            <p className="text-muted small mb-2">
              La próxima nota de venta se imprimirá con el número{" "}
              <strong>{Number(notaVentaContador) + 1}</strong>.
            </p>

            <form onSubmit={handleGuardarNotaVentaContador} className="config-form">
              <label>
                Redefinir número actual
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={notaVentaForm}
                  onChange={(e) => setNotaVentaForm(e.target.value)}
                  placeholder={`Ej. ${notaVentaContador}`}
                  required
                />
              </label>

              <button type="submit">Guardar</button>
            </form>
          </section>

          {/* Contador de Remisión */}
          <section className="config-card">
            <div className="config-card-header">
              <div>
                <h2>Folio de Remisión</h2>
              </div>
              <div className="config-icon">📄</div>
            </div>

            <div className="config-current">
              <span>Número actual</span>
              <strong>{remisionContador}</strong>
            </div>

            <p className="text-muted small mb-2">
              La próxima remisión se imprimirá con el número{" "}
              <strong>{Number(remisionContador) + 1}</strong>.
            </p>

            <form onSubmit={handleGuardarRemisionContador} className="config-form">
              <label>
                Redefinir número actual
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={remisionForm}
                  onChange={(e) => setRemisionForm(e.target.value)}
                  placeholder={`Ej. ${remisionContador}`}
                  required
                />
              </label>

              <button type="submit">Guardar</button>
            </form>
          </section>

          {/* Contador de Orden de Compra */}
          <section className="config-card">
            <div className="config-card-header">
              <div>
                <h2>Folio de Orden de Compra</h2>
              </div>
              <div className="config-icon">🛒</div>
            </div>

            <div className="config-current">
              <span>Número actual</span>
              <strong>{ordenCompraContador}</strong>
            </div>

            <p className="text-muted small mb-2">
              La próxima orden de compra se creará como{" "}
              <strong>
                OC-{String(Number(ordenCompraContador) + 1).padStart(5, "0")}
              </strong>
              .
            </p>

            <form onSubmit={handleGuardarOrdenCompraContador} className="config-form">
              <label>
                Redefinir número actual
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={ordenCompraForm}
                  onChange={(e) => setOrdenCompraForm(e.target.value)}
                  placeholder={`Ej. ${ordenCompraContador}`}
                  required
                />
              </label>

              <button type="submit">Guardar</button>
            </form>
          </section>

          {/* Contador de Nota de Crédito (CFDI) — folio propio, no comparte
              numeración con Factura/Complemento/Global. */}
          <section className="config-card">
            <div className="config-card-header">
              <div>
                <h2>Folio de Nota de Crédito</h2>
                <span>Serie fija "NC"; independiente del folio de las demás facturas.</span>
              </div>
              <div className="config-icon">🧾</div>
            </div>

            <div className="config-current">
              <span>Número actual</span>
              <strong>{notaCreditoContador}</strong>
            </div>

            <p className="text-muted small mb-2">
              La próxima nota de crédito se emitirá con folio{" "}
              <strong>NC{Number(notaCreditoContador) + 1}</strong>.
            </p>

            <form onSubmit={handleGuardarNotaCreditoContador} className="config-form">
              <label>
                Redefinir número actual
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={notaCreditoForm}
                  onChange={(e) => setNotaCreditoForm(e.target.value)}
                  placeholder={`Ej. ${notaCreditoContador}`}
                  required
                />
              </label>

              <button type="submit">Guardar</button>
            </form>
          </section>

          {/* Cuentas bancarias del taller: RFC fijo por banco (catálogo), número de
              cuenta editable — para el "RFC Banco Emisor"/"Num Cuenta" del PDF de un
              Complemento de pago pagado por transferencia. */}
          <section className="config-card">
            <div className="config-card-header">
              <div>
                <h2>Cuentas bancarias</h2>
                <span>Número de cuenta del taller en cada banco, para el Complemento de pago.</span>
              </div>
              <div className="config-icon">🏦</div>
            </div>

            {/* <p className="text-muted small mb-2">
              Pulsa Editar para capturar el RFC y el número de cuenta del taller en los
              bancos donde reciben transferencias — el PDF del Complemento de pago lo toma de
              aquí automático, según el banco usado al cobrar.
            </p> */}

            <div className="config-list">
              {cuentasBancarias.length > 0 && !cuentasBancarias.some((c) => c.numeroCuenta) && (
                <div className="config-empty">Aún no hay cuentas capturadas</div>
              )}
              {cuentasBancarias.length === 0 && <div className="config-loading">Cargando bancos…</div>}
              {cuentasBancarias.filter((c) => c.numeroCuenta).map((c) => (
                <div key={c.banco} className="config-list-item">
                  <div>
                    <strong>{c.label || c.banco}</strong>
                    <span>RFC: {c.rfc || "— sin capturar —"}</span>
                  </div>
                  <span className="cuentas-card-cuenta">{c.numeroCuenta}</span>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="config-secondary-button"
              disabled={cuentasBancarias.length === 0}
              onClick={() => setShowCuentasModal(true)}
            >
              Ver y editar cuentas
            </button>
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

          {/* Contrato de Orden de Servicio */}
          <section className="config-card config-card-full">
            <div className="config-card-header">
              <div>
                <h2>Contrato de Orden de Servicio</h2>
                <span>
                  Texto legal impreso en el Formato Operativo. Al guardar se crea una
                  nueva versión: las órdenes que ya existen conservan el contrato con el
                  que se crearon y solo las órdenes nuevas usan la versión recién guardada.
                </span>
              </div>
              <div className="config-icon">📜</div>
            </div>

            <button
              type="button"
              className="config-secondary-button"
              onClick={() => setMostrarHistorialContrato(true)}
              style={{ alignSelf: "flex-start" }}
            >
              Ver historial de versiones
            </button>

            {cargandoContrato ? (
              <div className="config-loading">Cargando contrato...</div>
            ) : (
              <form onSubmit={handleGuardarContrato} className="config-form">
                <div className="contrato-editor">
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <label>
                      Título del contrato
                      <input
                        type="text"
                        value={contratoTitulo}
                        onChange={(e) => setContratoTitulo(e.target.value)}
                        required
                      />
                    </label>

                    <label>
                      Cláusulas
                      <small className="field-hint">
                        Una cláusula por párrafo; sepáralas dejando una línea en blanco. Se numeran automáticamente.
                      </small>
                      <textarea
                        rows={16}
                        value={contratoClausulasText}
                        onChange={(e) => setContratoClausulasText(e.target.value)}
                        required
                      />
                    </label>

                    <label>
                      Pie de página / notas legales
                      <small className="field-hint">Una nota por línea (opcional).</small>
                      <textarea
                        rows={3}
                        value={contratoPiePaginaText}
                        onChange={(e) => setContratoPiePaginaText(e.target.value)}
                      />
                    </label>

                    <button type="submit">Guardar contrato</button>
                  </div>

                  <div className="contrato-preview-wrap">
                    <span className="contrato-preview-label">Vista previa</span>
                    <div className="contrato-preview">
                      <div className="contrato-preview-titulo">{contratoTitulo}</div>
                      <ol className="contrato-preview-lista">
                        {previewClausulas.map((clausula, i) => (
                          <li key={i}>{clausula}</li>
                        ))}
                      </ol>
                      <div className="contrato-preview-firma">
                        Firma o rúbrica de autorización del consumidor: _______________________________
                      </div>
                      <div className="contrato-preview-pie">
                        {previewPie.map((linea, i) => (
                          <p key={i}>{linea}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </form>
            )}
          </section>
        </div>
      )}

      <TipoCambioHistorialModal
        show={mostrarHistorialSie}
        onClose={() => setMostrarHistorialSie(false)}
      />

      <CuentasBancariasModal
        show={showCuentasModal}
        onClose={() => setShowCuentasModal(false)}
        cuentas={cuentasBancarias}
        guardando={guardandoCuentasBancarias}
        onGuardar={handleGuardarCuentasBancarias}
      />
      <ContratoHistorialModal
        show={mostrarHistorialContrato}
        onClose={() => setMostrarHistorialContrato(false)}
      />
    </div>
  );
}