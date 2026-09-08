import { Fragment, useEffect, useMemo, useRef, useState, useCallback } from "react";
import Dropdown from "../../components/Dropdown";
import {
  getRegistroActividad,
  getRegistroActividadFiltros,
} from "../../api/auditoria";
import "../../styles/registroActividad.css";

// ─── Etiquetas legibles ──────────────────────────────────────────────────────
const ACCION_LABEL = {
  CREAR: "Creó",
  MODIFICAR: "Modificó",
  ELIMINAR: "Eliminó",
  CANCELAR: "Canceló",
  ACTIVAR: "Activó",
  DESACTIVAR: "Desactivó",
  // Eventos de dominio (origen 'manual')
  ORDEN_CERRAR: "Cerró orden",
  ORDEN_RESTABLECER: "Reabrió orden",
  ORDEN_REABRIR: "Reabrió orden",
  ORDEN_CAMBIO_ESTADO: "Cambió estado de orden",
  ORDEN_CAMBIAR_CLIENTE: "Cambió cliente de orden",
  ORDEN_EDICION_BLOQUEADA: "Intento bloqueado (orden)",
  // Sesión
  SESION_INICIAR: "Inició sesión",
  SESION_CERRAR: "Cerró sesión",
};

const ACCION_COLOR = {
  CREAR: "text-bg-success",
  MODIFICAR: "text-bg-primary",
  ELIMINAR: "text-bg-danger",
  CANCELAR: "text-bg-warning",
  ACTIVAR: "text-bg-success",
  DESACTIVAR: "text-bg-secondary",
  SESION_INICIAR: "text-bg-info",
  SESION_CERRAR: "text-bg-secondary",
};

const RECURSO_LABEL = {
  cajas: "Cajas",
  anticipos: "Anticipos de clientes",
  clientes: "Clientes",
  vehiculos: "Órdenes / Vehículos",
  Vehiculo: "Órdenes / Vehículos",
  garage: "Garaje",
  facturacion: "Facturación",
  "facturas-cfdi": "Facturas CFDI",
  "generar-xml": "Facturación (XML)",
  "fiscal-config": "Config. fiscal",
  grupos: "Grupos",
  users: "Usuarios",
  empleados: "Personal",
  proveedores: "Proveedores",
  inventario: "Inventario",
  entradas: "Entradas de inventario",
  salidas: "Salidas de inventario",
  devoluciones: "Devoluciones",
  vales: "Vales",
  garantias: "Garantías",
  tickets: "Soporte",
  configuracion: "Configuración",
  "conceptos-preset": "Conceptos preset",
  "claves-unidad": "Claves de unidad",
  "servicios-catalogo": "Catálogo de servicios",
  codigos: "BD de códigos",
  "ordenes-compra": "Órdenes de compra",
  sesion: "Sesión",
};

const accionLabel = (a) => ACCION_LABEL[a] || a || "—";
const recursoLabel = (e) => RECURSO_LABEL[e] || e || "—";
const accionColor = (a) => ACCION_COLOR[a] || "text-bg-dark";

function fechaHora(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("es-MX", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return String(d);
  }
}

// ─── Descripción legible de cada fila ────────────────────────────────────────
// Normaliza "/api/vehiculos/6aa0.../presupuesto-venta?x=1"
//        -> "/vehiculos/:id/presupuesto-venta"
function rutaNorm(ruta) {
  const limpia = String(ruta || "").split("?")[0].replace(/^\/api/, "");
  return (
    "/" +
    limpia
      .split("/")
      .filter(Boolean)
      .map((s) =>
        /^[a-f\d]{24}$/i.test(s)
          ? ":id"
          : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
          ? ":uuid"
          : /^\d+$/.test(s)
          ? ":n"
          : /^(OS|OC|VS|CP|NV|RM)[-\w]*$/i.test(s)
          ? ":folio"
          : s
      )
      .join("/")
  );
}

const VERBO = {
  CREAR: "Creó",
  MODIFICAR: "Modificó",
  ELIMINAR: "Eliminó",
  CANCELAR: "Canceló",
  ACTIVAR: "Activó",
  DESACTIVAR: "Desactivó",
};

// [RegExp sobre "<METODO> <rutaNorm>", texto]. Gana la primera que coincide.
const REGLAS_DESC = [
  // ── Órdenes / Vehículos ──
  [/^POST \/vehiculos$/, "Creó una orden de servicio"],
  [/^PUT \/vehiculos\/:id\/servicio$/, "Editó el servicio / reparación de la orden"],
  [/^PUT \/vehiculos\/:id\/requisicion-diagnostico$/, "Editó la requisición de diagnóstico de la orden"],
  [/^PUT \/vehiculos\/:id\/omitir-refacciones$/, "Cambió la opción de omitir refacciones de la orden"],
  [/^PUT \/vehiculos\/:id\/presupuesto-venta$/, "Editó el presupuesto de venta de la orden"],
  [/^PUT \/vehiculos\/:id\/firma-operativo$/, "Registró la firma del operativo en la orden"],
  [/^PUT \/vehiculos\/:id\/datos$/, "Editó los datos generales de la orden"],
  [/^POST \/vehiculos\/:id\/imagenes$/, "Agregó fotos a la orden"],
  [/^DELETE \/vehiculos\/:id\/imagenes\/:id$/, "Eliminó una foto de la orden"],
  [/^POST \/vehiculos\/imagenes\/temp\/:uuid$/, "Subió una foto a una orden nueva (aún sin guardar)"],
  [/^DELETE \/vehiculos\/imagenes\/temp\/:uuid\/.+$/, "Eliminó una foto de una orden nueva (aún sin guardar)"],
  [/^DELETE \/vehiculos\/imagenes\/temp\/:uuid$/, "Descartó las fotos de una orden nueva (aún sin guardar)"],
  [/^PUT \/vehiculos\/:id\/cerrar$/, "Cerró la orden"],
  [/^PUT \/vehiculos\/:id\/restablecer$/, "Reabrió una orden cerrada"],
  [/^PUT \/vehiculos\/:id\/cambiar-asesor$/, "Cambió el asesor asignado a la orden"],
  [/^PUT \/vehiculos\/:id\/cambiar-cliente$/, "Cambió el cliente de la orden"],
  [/^PUT \/vehiculos\/:id\/surtir$/, "Marcó refacciones como surtidas en la orden"],
  [/^POST \/vehiculos\/backfill-creado-por-id$/, "Ejecutó un ajuste masivo de órdenes (backfill)"],
  // ── Cajas ──
  [/^POST \/cajas\/:id\/pagos$/, "Registró un pago en caja"],
  [/^POST \/cajas\/:id\/pagos\/:id\/cancelar$/, "Canceló un pago de caja"],
  [/^POST \/cajas\/:id\/pagos\/:id\/deshacer-cancelacion$/, "Revirtió la cancelación de un pago de caja"],
  [/^POST \/cajas\/:id\/descuentos$/, "Aplicó un descuento en caja"],
  [/^PUT \/cajas\/:id\/descuentos\/:id$/, "Editó un descuento en caja"],
  [/^DELETE \/cajas\/:id\/descuentos\/:id$/, "Quitó un descuento en caja"],
  [/^PATCH \/cajas\/:id\/pendiente-factura$/, "Cambió la marca de 'pendiente de factura' de la orden"],
  // ── Anticipos ──
  [/^POST \/anticipos$/, "Registró un anticipo de cliente"],
  [/^POST \/anticipos\/:id\/cancelar$/, "Canceló un anticipo de cliente"],
  // ── Cierre de caja ──
  [/^POST \/reportes\/cierre-caja$/, "Guardó una captura de cierre de caja"],
  [/^POST \/reportes\/cierre-caja\/cerrar$/, "Cerró la sesión de caja"],
  [/^POST \/reportes\/cierre-caja\/restablecer$/, "Reabrió una sesión de caja ya cerrada"],
  [/^POST \/reportes\/cierre-caja\/captura\/:id\/cancelar$/, "Canceló una captura de cierre de caja"],
  // ── Clientes ──
  [/^POST \/clientes$/, "Dio de alta un cliente"],
  [/^PUT \/clientes\/:id\/codigos-servicio$/, "Editó los códigos de servicio del cliente"],
  [/^PUT \/clientes\/:id$/, "Editó los datos de un cliente"],
  [/^DELETE \/clientes\/:id$/, "Eliminó un cliente"],
  // ── Facturación ──
  [/^POST \/facturacion\/preview$/, "Generó una vista previa de factura"],
  [/^POST \/facturacion\/facturas\/export-zip$/, "Exportó facturas en ZIP"],
  [/^POST \/generar-xml\/xml$/, "Timbró / generó el XML de una factura"],
  // ── Grupos ──
  [/^POST \/grupos$/, "Creó un grupo de trabajo"],
  [/^PUT \/grupos\/:id$/, "Editó un grupo de trabajo"],
  [/^PATCH \/grupos\/:id\/status$/, "Activó o desactivó un grupo de trabajo"],
  // ── Usuarios / Personal ──
  [/^POST \/users$/, "Creó un usuario del sistema"],
  [/^PUT \/users\/:id$/, "Editó un usuario del sistema"],
  [/^PATCH \/users\/:id\/password$/, "Cambió la contraseña de un usuario"],
  [/^PATCH \/users\/:id\/status$/, "Activó o desactivó un usuario"],
  [/^POST \/empleados$/, "Dio de alta personal del taller"],
  [/^(PUT|PATCH) \/empleados\/:id$/, "Editó personal del taller"],
  // ── Inventario / Refaccionaria ──
  [/^POST \/devoluciones\/dinero$/, "Registró una devolución de dinero"],
  [/^POST \/devoluciones\/refaccion$/, "Registró una devolución de refacción"],
  [/^POST \/entradas$/, "Creó una entrada de inventario"],
  [/^POST \/entradas\/:id\/captura$/, "Capturó renglones en una entrada de inventario"],
  [/^PATCH \/entradas\/:id\/finalizar$/, "Finalizó una entrada de inventario"],
  [/^PATCH \/entradas\/:id\/foto$/, "Adjuntó la foto de una entrada de inventario"],
  [/^PUT \/entradas\/:id$/, "Editó una entrada de inventario"],
  [/^DELETE \/entradas\/:id$/, "Eliminó una entrada de inventario"],
  [/^POST \/salidas$/, "Registró una salida de inventario"],
  [/^POST \/inventario\/ajuste$/, "Hizo un ajuste de inventario"],
  // ── Vales ──
  [/^POST \/vales$/, "Creó un vale de salida"],
  [/^PUT \/vales\/:id$/, "Editó un vale de salida"],
  // ── Garantías ──
  [/^PUT \/garantias\/:id\/resolver$/, "Resolvió una solicitud de garantía"],
  [/^PUT \/garantias\/:id\/cancelar$/, "Canceló una solicitud de garantía"],
  [/^PUT \/garantias\/:id$/, "Editó una solicitud de garantía"],
  // ── Soporte ──
  [/^POST \/tickets$/, "Creó un ticket de soporte"],
  [/^PUT \/tickets\/:id\/estado$/, "Cambió el estado de un ticket de soporte"],
  [/^PUT \/tickets\/:id\/resolver-cambio-asesor$/, "Atendió un ticket de cambio de asesor"],
  [/^PUT \/tickets\/:id\/resolver-restablecer-caja$/, "Atendió un ticket para reabrir caja"],
  [/^PUT \/tickets\/:id\/resolver-garantia$/, "Atendió un ticket de garantía"],
  // ── Configuración ──
  [/^POST \/configuracion\/tipo-cambio$/, "Registró un tipo de cambio"],
  [/^POST \/configuracion\/unidades-medida$/, "Agregó una unidad de medida"],
  [/^PATCH \/configuracion\/unidades-medida\/:id\/status$/, "Activó o desactivó una unidad de medida"],
  [/^PUT \/configuracion\/.+-contador$/, "Ajustó un folio consecutivo"],
  [/^PUT \/configuracion\/fondo-caja$/, "Cambió el fondo de caja"],
  [/^POST \/configuracion\/mecanicos$/, "Dio de alta un mecánico"],
  [/^PATCH \/configuracion\/mecanicos\/:id\/status$/, "Activó o desactivó un mecánico"],
  [/^PUT \/configuracion\/contrato-orden-servicio$/, "Editó el texto del contrato de orden de servicio"],
  // ── Proveedores ──
  [/^POST \/proveedores$/, "Dio de alta un proveedor"],
  [/^PUT \/proveedores\/:id$/, "Editó un proveedor"],
  [/^DELETE \/proveedores\/:id$/, "Eliminó un proveedor"],
  // ── Órdenes de compra ──
  [/^POST \/ordenes-compra/, "Creó una orden de compra"],
  // ── Catálogos ──
  [/^POST \/conceptos-preset$/, "Creó un concepto predefinido"],
  [/^PUT \/conceptos-preset\/:id$/, "Editó un concepto predefinido"],
  [/^DELETE \/conceptos-preset\/:id$/, "Eliminó un concepto predefinido"],
  [/^POST \/claves-unidad$/, "Creó una clave de unidad (SAT)"],
  [/^PUT \/claves-unidad\/:id$/, "Editó una clave de unidad (SAT)"],
  [/^DELETE \/claves-unidad\/:id$/, "Eliminó una clave de unidad (SAT)"],
  [/^POST \/servicios-catalogo$/, "Creó un paquete de servicio"],
  [/^PUT \/servicios-catalogo\/:id$/, "Editó un paquete de servicio"],
  [/^DELETE \/servicios-catalogo\/:id$/, "Eliminó un paquete de servicio"],
  [/^POST \/codigos$/, "Creó un código en la BD de códigos"],
  [/^PUT \/codigos\/:id$/, "Editó un código de la BD de códigos"],
  [/^DELETE \/codigos\/:id$/, "Eliminó un código de la BD de códigos"],
  // ── Config. fiscal ──
  [/^POST \/fiscal-config$/, "Guardó la configuración fiscal"],
  [/^POST \/fiscal-config\/cert$/, "Cargó el certificado (.cer) del sello digital"],
  [/^POST \/fiscal-config\/key$/, "Cargó la llave (.key) del sello digital"],
  // ── Garaje ──
  [/^POST \/garage$/, "Agregó un vehículo al garaje"],
  [/^POST \/garage\/importar-cerradas$/, "Importó órdenes cerradas al garaje"],
];

function describir(row) {
  const a = row.accion || "";
  // Sesión
  if (a === "SESION_INICIAR") {
    const m = row.detalle?.motivo;
    return row.ok === false
      ? `Intento de inicio de sesión fallido${m ? ` — ${m}` : ""}`
      : "Inició sesión";
  }
  if (a === "SESION_CERRAR") return "Cerró sesión";
  // Eventos de dominio (órdenes) ya traen un código propio y legible
  if (!VERBO[a]) return accionLabel(a);

  const clave = `${(row.metodo || "").toUpperCase()} ${rutaNorm(row.ruta)}`;
  for (const [rx, texto] of REGLAS_DESC) {
    if (rx.test(clave)) return texto;
  }
  // Genérico: verbo + recurso + los tramos de ruta que no son ids
  const extra = rutaNorm(row.ruta)
    .split("/")
    .filter((s) => s && ![":id", ":uuid", ":n", ":folio"].includes(s))
    .slice(1)
    .join(" / ");
  return `${VERBO[a]} en ${recursoLabel(row.entidad)}${extra ? `: ${extra}` : ""}`;
}

const emptyFiltros = {
  q: "",
  usuario: "",
  accion: "",
  entidad: "",
  origen: "",
  ok: "",
  desde: "",
  hasta: "",
};

export default function RegistroActividad() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [retencionDias, setRetencionDias] = useState(15);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [filtros, setFiltros] = useState(emptyFiltros);
  const [opciones, setOpciones] = useState({
    usuarios: [],
    acciones: [],
    entidades: [],
    roles: [],
  });

  const [expandida, setExpandida] = useState(null); // _id de la fila con detalle abierto
  const debounceRef = useRef(null);

  // Carga inicial de las opciones de los filtros
  useEffect(() => {
    getRegistroActividadFiltros()
      .then((data) => {
        setOpciones({
          usuarios: data.usuarios || [],
          acciones: data.acciones || [],
          entidades: data.entidades || [],
          roles: data.roles || [],
        });
        if (data.retencionDias) setRetencionDias(data.retencionDias);
      })
      .catch(() => {
        /* los selects quedan vacíos, el filtro de texto sigue sirviendo */
      });
  }, []);

  const cargar = useCallback(
    async (paginaActual, filtrosActuales) => {
      setLoading(true);
      setError("");
      try {
        const params = { ...filtrosActuales, page: paginaActual, limit: 50 };
        if (params.desde) params.desde = `${params.desde}T00:00:00`;
        if (params.hasta) params.hasta = `${params.hasta}T23:59:59`;
        const data = await getRegistroActividad(params);
        setRows(data.rows || []);
        setTotal(data.total || 0);
        setPages(data.pages || 1);
        setPage(data.page || 1);
        if (data.retencionDias) setRetencionDias(data.retencionDias);
      } catch (err) {
        setError(
          err?.response?.data?.message ||
            err?.message ||
            "No se pudo cargar el registro de actividad"
        );
        setRows([]);
        setTotal(0);
        setPages(1);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Recarga cuando cambian los filtros (el texto va con debounce) → vuelve a pág. 1
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setExpandida(null);
      cargar(1, filtros);
    }, 350);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros]);

  const setF = (campo) => (e) => {
    const value = e?.target ? e.target.value : e;
    setFiltros((f) => ({ ...f, [campo]: value }));
  };

  const limpiar = () => setFiltros(emptyFiltros);

  const irPagina = (p) => {
    const destino = Math.min(Math.max(1, p), pages);
    if (destino === page) return;
    setExpandida(null);
    cargar(destino, filtros);
  };

  const hayFiltros = useMemo(
    () => Object.values(filtros).some((v) => v !== ""),
    [filtros]
  );

  return (
    <div className="container-fluid py-4 reg-actividad">
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <h1 className="h3 mb-0">Registro de Actividad</h1>
        <span className="text-muted small">Solo administradores</span>
      </div>

      {/* <div className="alert alert-info py-2 small mb-3">
        Muestra lo que hace cada usuario en el sistema:{" "}
        <strong>creaciones, modificaciones y cancelaciones</strong>, inicios y
        cierres de sesión (incluidos los intentos fallidos) y las peticiones que
        terminaron <strong>con error o rechazadas</strong>. Se conservan los
        últimos <strong>{retencionDias} días</strong>; los registros más
        antiguos se eliminan solos.
      </div> */}

      {/* ─── Filtros ─────────────────────────────────────────────────────── */}
      <div className="card mb-3">
        <div className="card-body">
          <div className="reg-filtros">
            <div>
              <label className="form-label mb-1 small fw-semibold">Buscar</label>
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="usuario, folio (con o sin guiones), ruta…"
                value={filtros.q}
                onChange={setF("q")}
              />
            </div>

            <div>
              <label className="form-label mb-1 small fw-semibold">Usuario</label>
              <Dropdown
                name="usuario"
                className="form-select form-select-sm"
                value={filtros.usuario}
                onChange={setF("usuario")}
              >
                <option value="">Todos</option>
                {opciones.usuarios.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Dropdown>
            </div>

            <div>
              <label className="form-label mb-1 small fw-semibold">Acción</label>
              <Dropdown
                name="accion"
                className="form-select form-select-sm"
                value={filtros.accion}
                onChange={setF("accion")}
              >
                <option value="">Todas</option>
                {opciones.acciones.map((a) => (
                  <option key={a} value={a}>
                    {accionLabel(a)}
                  </option>
                ))}
              </Dropdown>
            </div>

            <div>
              <label className="form-label mb-1 small fw-semibold">Recurso</label>
              <Dropdown
                name="entidad"
                className="form-select form-select-sm"
                value={filtros.entidad}
                onChange={setF("entidad")}
              >
                <option value="">Todos</option>
                {opciones.entidades.map((en) => (
                  <option key={en} value={en}>
                    {recursoLabel(en)}
                  </option>
                ))}
              </Dropdown>
            </div>

            <div>
              <label className="form-label mb-1 small fw-semibold">Tipo</label>
              <Dropdown
                name="origen"
                className="form-select form-select-sm"
                value={filtros.origen}
                onChange={setF("origen")}
              >
                <option value="">Todos</option>
                <option value="auto">Automático</option>
                <option value="manual">Evento de dominio</option>
              </Dropdown>
            </div>

            <div>
              <label className="form-label mb-1 small fw-semibold">
                Resultado
              </label>
              <Dropdown
                name="ok"
                className="form-select form-select-sm"
                value={filtros.ok}
                onChange={setF("ok")}
              >
                <option value="">Todos</option>
                <option value="true">Aplicado</option>
                <option value="false">Con error o rechazado</option>
              </Dropdown>
            </div>

            <div>
              <label className="form-label mb-1 small fw-semibold">Desde</label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={filtros.desde}
                onChange={setF("desde")}
              />
            </div>

            <div>
              <label className="form-label mb-1 small fw-semibold">Hasta</label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={filtros.hasta}
                onChange={setF("hasta")}
              />
            </div>

            <div>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm w-100"
                onClick={limpiar}
                disabled={!hayFiltros}
              >
                Limpiar filtros
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger py-2">{error}</div>}

      {/* ─── Tabla ───────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-body p-0 reg-tabla-wrap">
          <table className="table table-hover table-sm mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th style={{ whiteSpace: "nowrap" }}>Fecha y hora</th>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Acción</th>
                <th>Recurso</th>
                <th>Referencia</th>
                <th className="text-end">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="text-center py-4 text-muted">
                    Cargando…
                  </td>
                </tr>
              )}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-4 text-muted">
                    Sin actividad para los filtros seleccionados.
                  </td>
                </tr>
              )}

              {!loading &&
                rows.map((r) => {
                  const abierta = expandida === r._id;
                  return (
                    <Fragment key={r._id}>
                      <tr className={r.ok === false ? "table-warning" : ""}>
                        <td style={{ whiteSpace: "nowrap" }}>{fechaHora(r.createdAt)}</td>
                        <td>{r.usuario || "—"}</td>
                        <td className="text-muted">{r.rol || "—"}</td>
                        <td>
                          <span className={`badge reg-badge ${accionColor(r.accion)}`}>
                            {accionLabel(r.accion)}
                          </span>
                          {r.ok === false && (
                            <span className="badge reg-badge text-bg-danger ms-1">
                              {r.detalle?.status
                                ? `error ${r.detalle.status}`
                                : "rechazado"}
                            </span>
                          )}
                          <div className="reg-desc">{describir(r)}</div>
                        </td>
                        <td>{recursoLabel(r.entidad)}</td>
                        <td className="text-break">{r.referencia || "—"}</td>
                        <td className="text-end">
                          <button
                            type="button"
                            className="btn btn-outline-secondary reg-btn-detalle"
                            onClick={() =>
                              setExpandida(abierta ? null : r._id)
                            }
                          >
                            {abierta ? "Ocultar" : "Ver"}
                          </button>
                        </td>
                      </tr>
                      {abierta && (
                        <tr className="reg-detalle-row">
                          <td colSpan={7}>
                            <div className="row g-2 mb-2 small">
                              <div className="col-sm-6 col-lg-3">
                                <span className="text-muted">Método:</span>{" "}
                                <strong>{r.metodo || "—"}</strong>
                              </div>
                              <div className="col-sm-6 col-lg-3">
                                <span className="text-muted">IP:</span>{" "}
                                <strong>{r.ip || "—"}</strong>
                              </div>
                              <div className="col-sm-6 col-lg-3">
                                <span className="text-muted">Tipo:</span>{" "}
                                <strong>
                                  {r.origen === "auto"
                                    ? "Automático"
                                    : "Evento de dominio"}
                                </strong>
                              </div>
                              <div className="col-sm-6 col-lg-3">
                                <span className="text-muted">Resultado:</span>{" "}
                                <strong>
                                  {r.detalle?.status
                                    ? `HTTP ${r.detalle.status}`
                                    : r.ok === false
                                    ? "Rechazado"
                                    : "OK"}
                                  {typeof r.detalle?.duracionMs === "number"
                                    ? ` · ${r.detalle.duracionMs} ms`
                                    : ""}
                                </strong>
                              </div>
                              <div className="col-sm-6 col-lg-3">
                                <span className="text-muted">ID registro:</span>{" "}
                                <code>{r._id}</code>
                              </div>
                              <div className="col-12">
                                <span className="text-muted">Ruta:</span>{" "}
                                <span className="reg-ruta">{r.ruta || "—"}</span>
                              </div>
                              {r.detalle?.error && (
                                <div className="col-12 text-danger">
                                  <span className="text-muted">Error:</span>{" "}
                                  {r.detalle.error}
                                </div>
                              )}
                              {r.detalle?.ua && (
                                <div className="col-12">
                                  <span className="text-muted">Navegador:</span>{" "}
                                  <span className="reg-ruta">{r.detalle.ua}</span>
                                </div>
                              )}
                            </div>
                            <pre className="reg-detalle-pre">
                              {JSON.stringify(r.detalle ?? {}, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Paginación ──────────────────────────────────────────────────── */}
      <div className="reg-paginacion mt-3">
        <span className="text-muted small">
          {total.toLocaleString("es-MX")} registro{total === 1 ? "" : "s"} · página{" "}
          {page} de {pages} · se conservan {retencionDias} días
        </span>
        <div className="btn-group">
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={() => irPagina(page - 1)}
            disabled={loading || page <= 1}
          >
            ◀ Anterior
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={() => irPagina(page + 1)}
            disabled={loading || page >= pages}
          >
            Siguiente ▶
          </button>
        </div>
      </div>
    </div>
  );
}
