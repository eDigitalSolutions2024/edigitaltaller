// src/pages/vehiculo/VehiculoPresupuestoVenta.jsx
import "../../styles/presupuestoVenta.css";
import "../../styles/requisicion.css";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { useNavigate } from "react-router-dom";
import ModalManoObra, { ModalPreguntaManoObra, PUESTO_LABEL } from "./ModalManoObra";
import {
  savePresupuestoVenta,
  getVehiculoById,
  getPresupuestoPdfUrl,
  getVentaClientePdfUrl,
} from "../../api/vehiculos";
import usePdfModal from "../../hooks/usePdfModal";
import { fetchServiciosTaller } from "../../api/codigos";
import http from "../../api/http";
import { TARIFA_HORA, calcImporteHoras } from "../../utils/manoObra";
import { getUser } from "../../auth";
import { createTicket } from "../../api/tickets";
import ModalCancelarOrden from "./ModalCancelarOrden";

import { isAdminLike } from "../../utils/roles";
// Una vez que la orden tiene Remisión o Nota de Venta vigente ya se considera
// vendida fiscalmente; no se debe poder anticipar más dinero (en horas) fuera
// de los comprobantes oficiales de Caja. Mismo criterio que cajas.js:210-212.
function tieneComprobanteFiscal(pagos) {
  return (pagos || []).some(
    (p) => !p.cancelado && (p.comprobante === "REMISION" || p.comprobante === "NOTA_VENTA")
  );
}

export default function VehiculoPresupuestoVenta({ orden, onSaved, onGoPreparacion, readOnly = false }) {
  const navigate = useNavigate();
  const esAdmin = isAdminLike(getUser()?.role);
  const { pdfModal, abrirPdf } = usePdfModal();

  // Encabezado
  const [dirigidoA, setDirigidoA] = useState("");
  const [departamento, setDepartamento] = useState("");
  const [observCotizacion, setObservCotizacion] = useState("");

  // Factura
  const [requiereFactura, setRequiereFactura] = useState(false);

  //Mano de obra
  const [tecnicos, setTecnicos] = useState([]); // todo el personal (el modal filtra los puestos técnicos activos)

  // Servicios SAT (para factura)
  const [serviciosTaller, setServiciosTaller] = useState([]);
  const [servicioSearch, setServicioSearch] = useState("");
  const [showServiciosDropdown, setShowServiciosDropdown] = useState(false);
  const serviciosDropdownRef = useRef(null);
  const ventaSectionRef = useRef(null);
  const manoObraSectionRef = useRef(null);

  // ===== PRESUPUESTO =====
  const [presRows, setPresRows] = useState([]);
  // Filas de refacciones incluidas en un Servicio de catálogo, colapsadas bajo
  // su fila esServicio (mismo servicioGrupoId); se expanden solo para consulta.
  const [expandedGroups, setExpandedGroups] = useState({}); // detalle abierto por partida (idx)
  const [ventaMas, setVentaMas] = useState(false);
  const [ventaObsAbierta, setVentaObsAbierta] = useState({});

  // ===== VENTA AL CLIENTE =====
  const [ventaRows, setVentaRows] = useState([]);
  const [ventaLine, setVentaLine] = useState({
    cant: "",
    concepto: "",
    precioVenta: "",
    observaciones: "",
    codigoServicio: "",
    descripcionServicio: "",
    codigoSat: "",
    descripcionSat: "",
  });

  // ===== MANO DE OBRA =====
  const [moRows, setMoRows] = useState([]);
  const [llevaMO, setLlevaMO] = useState(null); // decisión general: true | false | null (sin definir)
  const [moModal, setMoModal] = useState(null); // null | { idx: number|null } (alta o edición)
  const [preguntaMo, setPreguntaMo] = useState(false); // modal "¿lleva mano de obra?"
  const [guardandoMo, setGuardandoMo] = useState(false);

  // ===== OBSERVACIONES =====
  const [obsExternas, setObsExternas] = useState("");
  const [obsInternas, setObsInternas] = useState("");

  // ===== IVA (editable, normalmente 8%) =====
  const [ivaPresupuesto, setIvaPresupuesto] = useState(8);
  const [ivaVenta, setIvaVenta] = useState(8);

  // ===== CARGA INICIAL =====
  useEffect(() => {
    if (!orden) return;

    setDirigidoA(orden.dirigidoA || "");
    setDepartamento(orden.departamento || "");
    setObservCotizacion(orden.observCotizacion || "");
    setRequiereFactura(!!orden.requiereFactura);
    setMoRows(orden.manoObra || []);
    // Decisión general de mano de obra; en órdenes anteriores se infiere de lo capturado
    if (typeof orden.ordenLlevaManoObra === "boolean") {
      setLlevaMO(orden.ordenLlevaManoObra);
    } else if ((orden.manoObra || []).length > 0) {
      setLlevaMO(true);
    } else {
      const vc = orden.ventaCliente || [];
      setLlevaMO(vc.length > 0 && vc.every((r) => r.llevaManoObra === false) ? false : null);
    }
    setObsExternas(orden.observacionesExternas || "");
    setObsInternas(orden.observacionesInternas || "");
    setIvaPresupuesto(orden.ivaPresupuesto ?? 8);
    setIvaVenta(orden.ivaVenta ?? 8);

    // ===== PRESUPUESTO: reconciliar lo guardado con lo recién aprobado =====
    const presupuestoGuardado = Array.isArray(orden.presupuesto)
      ? orden.presupuesto
      : [];

    const refAprobadas = (orden.refaccionesSolicitadas || []).filter((r) => {
      const op = r.opciones?.[r.opcionSeleccionada] || {};
      return (
        r.estatus === "APROBADA" &&
        r.opcionSeleccionada !== null &&
        r.opcionSeleccionada !== undefined &&
        Number(op.precioUnitario || 0) > 0
      );
    });

    // IDs de refacciones que YA tienen su línea en el presupuesto guardado
    const idsYaEnPresupuesto = new Set(
      presupuestoGuardado.map((p) => p.origenRefId).filter(Boolean)
    );

    // Refacciones aprobadas agrupadas en un servicio (Requisición y Diagnóstico):
    // viajan como "hijas" de la fila esServicio con servicioGrupoId = id del servicio.
    const serviciosReq = orden.serviciosRequisicion || [];
    const idsServiciosReq = new Set(serviciosReq.map((sv) => String(sv._id)));
    const refPorId = new Map(
      (orden.refaccionesSolicitadas || []).map((r) => [String(r._id), r])
    );
    const aprobadaIds = new Set(refAprobadas.map((r) => String(r._id)));

    // Sincroniza lo ya guardado con cambios posteriores en la requisición
    // (el cliente cambió/canceló una refacción o la movió de servicio).
    let guardadoSync = presupuestoGuardado
      .filter((p) => {
        // Refacción de requisición sin servicio y sin autorizar/surtir: no se
        // presupuesta suelta (debe agruparse en Requisición y Diagnóstico).
        if (p.origenRefId && !p.servicioGrupoId && !p.autorizado && !p.surtida) {
          const ref = refPorId.get(String(p.origenRefId));
          if (ref && (!ref.servicioId || !idsServiciosReq.has(String(ref.servicioId)))) return false;
        }
        if (!p.origenRefId || !p.servicioGrupoId) return true;
        // Hija de servicio cuya refacción ya no está aprobada: se quita (si no se surtió)
        return aprobadaIds.has(String(p.origenRefId)) || p.surtida;
      })
      .map((p) => {
        const ref = p.origenRefId ? refPorId.get(String(p.origenRefId)) : null;
        if (!ref || p.surtida) return p;
        return { ...p, servicioGrupoId: ref.servicioId || null };
      });

    // Solo agregamos las aprobadas que todavía no están representadas
    const nuevasDesdeAprobadas = refAprobadas
      .filter((r) => !idsYaEnPresupuesto.has(String(r._id)))
      .filter((r) => !!r.servicioId && idsServiciosReq.has(String(r.servicioId)))
      .map((r) => {
        const op = r.opciones?.[r.opcionSeleccionada] || {};
        const cant = Number(r.cant || 0);
        const precioUnitario = Number(op.precioUnitario || 0);
        const importeTotal = Number(op.importeTotal || 0);
        const moneda = op.moneda || "MN";
        const tipoCambio = moneda === "USD" ? Number(op.tipoCambio || 0) : 0;
        const precioCompraMXN =
          moneda === "USD" ? importeTotal / (cant || 1) : precioUnitario;
        const agrupada = !!r.servicioId && idsServiciosReq.has(String(r.servicioId));

        return {
          origenRefId: String(r._id), // 👈 clave para no duplicar después
          cant,
          concepto: r.refaccion || "",
          refaccion: r.refaccion || "",
          tipo: op.tipo || "",
          marca: op.marca || "",
          proveedor: op.proveedor || "",
          codigo: op.codigo || "",
          precioOriginal: precioUnitario,
          moneda,
          tipoCambio,
          precioCompra: precioCompraMXN,
          tiempoEntrega: op.tiempoEntrega ?? "",
          horasMO: 0,
          // Agrupada: se cobra en la línea del servicio, no por pieza
          precioVenta: agrupada ? 0 : precioCompraMXN,
          observInt: op.observaciones ?? "",
          autorizado: false,
          servicioGrupoId: agrupada ? String(r.servicioId) : null,
        };
      });

    let filas = [
      ...guardadoSync.map((p) => ({ ...p, autorizado: !!p.autorizado })),
      ...nuevasDesdeAprobadas,
    ];

    // Una fila de servicio por cada servicio con refacciones; la que se quedó
    // sin refacciones (y no está autorizada) se retira.
    for (const sv of serviciosReq) {
      const gid = String(sv._id);
      const hijas = filas.filter((p) => !p.esServicio && String(p.servicioGrupoId) === gid);
      const idxPadre = filas.findIndex((p) => p.esServicio && String(p.servicioGrupoId) === gid);
      if (hijas.length > 0 && idxPadre === -1) {
        filas.push({
          cant: 1,
          concepto: sv.nombre || "SERVICIO",
          refaccion: "",
          tipo: "",
          marca: "",
          proveedor: "",
          codigo: "",
          precioCompra: 0,
          moneda: "MN",
          tipoCambio: 0,
          tiempoEntrega: "",
          horasMO: 0,
          precioVenta: 0,
          observInt: "",
          autorizado: false,
          esServicio: true,
          servicioGrupoId: gid,
        });
      } else if (hijas.length === 0 && idxPadre !== -1 && !filas[idxPadre].autorizado) {
        filas.splice(idxPadre, 1);
      }
    }

    // Hijas nuevas heredan la autorización de su servicio
    filas = filas.map((p) => {
      if (p.esServicio || !p.servicioGrupoId || !idsServiciosReq.has(String(p.servicioGrupoId))) return p;
      const padre = filas.find((x) => x.esServicio && String(x.servicioGrupoId) === String(p.servicioGrupoId));
      return padre && padre.autorizado && !p.autorizado ? { ...p, autorizado: true } : p;
    });

    setPresRows(ensureGruaEnPresupuesto(filas, orden));

    // Venta al cliente ya guardada
    setVentaRows(orden.ventaCliente || []);
  }, [orden]);

  // Servicios SAT
  useEffect(() => {
    fetchServiciosTaller()
      .then(setServiciosTaller)
      .catch(() => setServiciosTaller([]));
  }, []);

  useEffect(() => {
    const cargarEmpleados = async () => {
      try {
        const res = await http.get("/empleados");
        setTecnicos(res.data || []);
      } catch (err) {
        console.error("Error cargando empleados:", err);
      }
    };
    cargarEmpleados();
  }, []);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handler = (e) => {
      if (
        serviciosDropdownRef.current &&
        !serviciosDropdownRef.current.contains(e.target)
      )
        setShowServiciosDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ===== HELPERS =====
  const formatMoney = (n) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 2,
    }).format(Number(n) || 0);

  const formatFecha = (value) => {
    if (!value) return "";
    const [year, month, day] = String(value).split("-");
    if (!year || !month || !day) return value;
    const meses = [
      "Enero","Febrero","Marzo","Abril","Mayo","Junio",
      "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
    ];
    return `${day}-${meses[Number(month) - 1]}-${year}`;
  };

  // Si la orden tiene grúa con precio capturado en la inspección física,
  // asegura que exista su línea en Presupuesto, ya autorizada y sin
  // duplicarla. Solo un admin puede desautorizarla o eliminarla (ver
  // toggleAutorizado/removePresRow); no pasa por refaccionaria (ver backend).
  const ensureGruaEnPresupuesto = (rows, ordenObj) => {
    const precioGrua =
      ordenObj?.inspeccionFisica?.grua === "SI"
        ? Number(ordenObj.inspeccionFisica.precioGrua || 0)
        : 0;
    if (precioGrua <= 0) return rows;
    if (rows.some((r) => r.esGrua)) return rows;

    return [
      ...rows,
      {
        cant: 1,
        concepto: "GRÚA",
        refaccion: "",
        tipo: "",
        marca: "",
        proveedor: "",
        codigo: "",
        precioCompra: 0,
        moneda: "MN",
        tipoCambio: 0,
        tiempoEntrega: "",
        horasMO: 0,
        precioVenta: precioGrua,
        observInt: "",
        autorizado: true,
        esServicio: false,
        esGrua: true,
        surtida: false,
      },
    ];
  };

  const serviciosFiltrados = useMemo(() => {
    const q = servicioSearch.trim().toLowerCase();
    if (!q) return serviciosTaller;
    return serviciosTaller.filter((s) =>
      [s.codigo, s.descripcion, s.codigoSat, s.descripcionSat]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [serviciosTaller, servicioSearch]);

  const refsSinServicio = useMemo(() => {
    const ids = new Set((orden?.serviciosRequisicion || []).map((sv) => String(sv._id)));
    return (orden?.refaccionesSolicitadas || []).filter((r) => {
      const op = r.opciones?.[r.opcionSeleccionada] || {};
      return (
        r.estatus === "APROBADA" &&
        r.opcionSeleccionada !== null &&
        r.opcionSeleccionada !== undefined &&
        Number(op.precioUnitario || 0) > 0 &&
        !(r.servicioId && ids.has(String(r.servicioId)))
      );
    }).length;
  }, [orden]);

  const totalPresupuesto = useMemo(
    () =>
      presRows.reduce(
        (acc, r) => acc + Number(r.cant || 0) * Number(r.precioVenta || 0),
        0
      ),
    [presRows]
  );

  const totalVentaCliente = useMemo(
    () =>
      ventaRows.reduce(
        (acc, r) => acc + Number(r.cant || 0) * Number(r.precioVenta || 0),
        0
      ),
    [ventaRows]
  );

  // IVA (subtotal * porcentaje) y totales con IVA
  const ivaMontoPresupuesto = useMemo(
    () => totalPresupuesto * ((Number(ivaPresupuesto) || 0) / 100),
    [totalPresupuesto, ivaPresupuesto]
  );
  const totalConIvaPresupuesto = totalPresupuesto + ivaMontoPresupuesto;

  const ivaMontoVenta = useMemo(
    () => totalVentaCliente * ((Number(ivaVenta) || 0) / 100),
    [totalVentaCliente, ivaVenta]
  );
  const totalConIvaVenta = totalVentaCliente + ivaMontoVenta;

  const nombreManoObra = (m) => {
    const id = m.esCarroceria ? m.carrocero : m.mecanico;
    return tecnicos.find((x) => x._id === id)?.nombre || id || "—";
  };
  const puestoManoObra = (m) =>
    PUESTO_LABEL[m.puesto] || (m.esCarroceria ? "Carrocero" : "Mecánico");

  // ===== MANO DE OBRA — asignación de partidas de Venta al Cliente =====
  // Solo las partidas que quedaron en Venta al Cliente (Cierre de Orden) son
  // elegibles: es lo que realmente se le va a cobrar al cliente, y puede
  // diferir de lo autorizado en el Presupuesto si el asesor editó, agregó o
  // quitó partidas ahí. ventaRows no trae un _id estable, así que se usa el
  // índice del arreglo como identificador de selección.
  const serviciosParaManoObra = useMemo(
    () => ventaRows.map((v, i) => ({ ...v, _idx: i })),
    [ventaRows]
  );

  const tecnicosDeServicio = (concepto) =>
    moRows.filter((m) => (m.concepto || "") === (concepto || "")).length;

  // Servicios de Venta al Cliente (para elegir en el modal de mano de obra)
  const serviciosVentaMo = useMemo(
    () => ventaRows.filter((v) => (v.concepto || "").trim()).map((v) => ({ concepto: v.concepto, precioVenta: v.precioVenta })),
    [ventaRows]
  );

  const bloqueadoAnticipoMo = tieneComprobanteFiscal(orden?.pagos);

  // Persiste solo manoObra (+ la decisión general); el resto del formulario no se toca.
  const guardarMoRows = async (nuevoMoRows, general = llevaMO) => {
    setGuardandoMo(true);
    try {
      const res = await savePresupuestoVenta(orden._id, {
        manoObra: nuevoMoRows,
        ordenLlevaManoObra: general,
      });
      setMoRows(res.data.vehiculo.manoObra || nuevoMoRows);
      return true;
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.msg || "Error al guardar la mano de obra.");
      return false;
    } finally {
      setGuardandoMo(false);
    }
  };

  // Botón general Sí / No
  const decidirLlevaMO = async (valor) => {
    if (!valor && moRows.length > 0) {
      alert("Ya hay mano de obra asignada. Quita las asignaciones antes de marcar que no lleva.");
      return;
    }
    const anterior = llevaMO;
    setLlevaMO(valor);
    const ok = await guardarMoRows(moRows, valor);
    if (!ok) {
      setLlevaMO(anterior);
      return;
    }
    if (valor) setMoModal({ idx: null });
  };

  // Alta (idx null) o edición de una asignación desde el modal
  const guardarAsignacionMo = async (fila, { otro } = {}) => {
    const idx = moModal?.idx;
    const nuevas = idx === null || idx === undefined ? [...moRows, fila] : moRows.map((m, i) => (i === idx ? fila : m));
    const ok = await guardarMoRows(nuevas, true);
    if (!ok) return false;
    setLlevaMO(true);
    if (!otro) setMoModal(null);
    return true;
  };

  const removeMoRow = (idx) => {
    if (!window.confirm("¿Quitar esta asignación de mano de obra?")) return;
    guardarMoRows(moRows.filter((_, i) => i !== idx));
  };

  // Devuelve un mensaje si falta definir la mano de obra de la orden.
  const validarManoObraObligatoria = () => {
    if (llevaMO === null) {
      return "Indica si la orden lleva mano de obra (Sí / No) en la sección Mano de Obra.";
    }
    if (llevaMO && moRows.length === 0) {
      return "La orden lleva mano de obra: agrega al menos un servicio con su técnico responsable.";
    }
    return null;
  };

  // ===== PRESUPUESTO — HANDLERS =====
  const handleUpdatePres = (idx, field, value) => {
    setPresRows((prev) => {
      const rows = [...prev];
      rows[idx] = { ...rows[idx], [field]: value };
      return rows;
    });
  };

  // Una fila esServicio que agrupa refacciones de un Servicio de catálogo se
  // referencia a sí misma en servicioGrupoId (ver backend omitir-refacciones).
  // (o, si viene de Requisición y Diagnóstico, comparte el id del servicio con sus hijas).
  const esGrupoPadre = (r) => !!r.esServicio && !!r.servicioGrupoId;

  const esHijoDeGrupo = (r) => !r.esServicio && !!r.servicioGrupoId;

  const toggleAutorizado = (idx) => {
    setPresRows((prev) => {
      const row = prev[idx];
      // La línea de grúa queda fija como autorizada; solo un admin puede desautorizarla.
      if (row.esGrua && !esAdmin) return prev;
      const nuevoValor = !row.autorizado;
      const esPadre = esGrupoPadre(row);
      return prev.map((r, i) => {
        if (i === idx) return { ...r, autorizado: nuevoValor };
        if (esPadre && esHijoDeGrupo(r) && String(r.servicioGrupoId) === String(row.servicioGrupoId)) {
          return { ...r, autorizado: nuevoValor };
        }
        return r;
      });
    });
  };

  // Partida ya surtida, o autorizada y enviada a Venta: no se puede eliminar
  const ESTADOS_POST_VENTA = ["PENDIENTE_SURTIR", "PENDIENTE_CIERRE", "REPARACION_EN_CURSO", "CALIDAD", "PENDIENTE_CERRAR"];
  const noSePuedeBorrar = (r) =>
    !r.esGrua && (!!r.surtida || (!!r.autorizado && ESTADOS_POST_VENTA.includes(orden?.estadoOrden)));

  const removePresRow = (idx) =>
    setPresRows((prev) => {
      const row = prev[idx];
      // La línea de grúa no se puede eliminar salvo que el usuario sea admin.
      if (row.esGrua && !esAdmin) return prev;
      if (!esGrupoPadre(row)) return prev.filter((_, i) => i !== idx);
      // Borrar el servicio borra también las refacciones que agrupa.
      return prev.filter((r, i) => {
        if (i === idx) return false;
        if (esHijoDeGrupo(r) && String(r.servicioGrupoId) === String(row.servicioGrupoId)) return false;
        return true;
      });
    });

  // ===== ENVIAR A VENTA — corazón del nuevo flujo =====
  const handleEnviarAVenta = async () => {
    const autorizadas = presRows.filter((r) => r.autorizado);

    if (autorizadas.length === 0) {
      alert("Marca al menos una partida como autorizada para enviar a Venta al Cliente.");
      return;
    }

    // Las refacciones de un Servicio de catálogo no se facturan por separado:
    // ya están incluidas en la línea del servicio que las agrupa.
    const autorizadasParaVenta = autorizadas.filter((r) => !esHijoDeGrupo(r));

    // Partidas con Precio de Venta en $0: puede ser que el asesor olvidó
    // capturarlo o que pulsó "Enviar a Venta" por error. Se bloquea el envío
    // (incluida la solicitud de autorización de garantía, más abajo) hasta
    // que confirme explícitamente que el importe en $0 es correcto.
    const partidasEnCero = autorizadasParaVenta.filter(
      (r) => Number(r.precioVenta || 0) <= 0
    );
    if (partidasEnCero.length > 0) {
      const conceptos = partidasEnCero
        .map((r) => r.concepto || r.refaccion || "Partida sin concepto")
        .join("\n- ");
      const confirmar = window.confirm(
        `Las siguientes partidas tienen Precio de Venta en $0:\n- ${conceptos}\n\n` +
          "¿Confirmas que el importe es correcto y quieres continuar?"
      );
      if (!confirmar) return;
    }

    const nuevasVentas = autorizadasParaVenta.map((r) => ({
      cant: r.cant,
      concepto: r.concepto || r.refaccion || "",
      // El precio de la refacción se pasa como Precio Venta (Sin IVA)
      precioVenta: Number(r.precioVenta || 0),
      observaciones: "",
      codigoServicio: "",
      descripcionServicio: "",
      codigoSat: "",
      descripcionSat: "",
      esGrua: !!r.esGrua,
      // Se recalcula al guardar según la decisión general y los técnicos asignados
      llevaManoObra: llevaMO === false ? false : null,
    }));

    setVentaRows(nuevasVentas);

    // ===== GARANTÍA PENDIENTE: no avanza sola, pide autorización al admin =====
    // Se guardan las partidas de Venta al Cliente (para que el admin las vea)
    // pero la orden NO cambia de estado: se abre un ticket GARANTIA_AUTORIZACION
    // y la orden queda bloqueada hasta que un admin la autorice o niegue desde
    // Solicitudes de Garantías (ver PUT /api/garantias/:id/resolver).
    if (orden?.garantia && orden.garantia.estado === "PENDIENTE") {
      try {
        const res = await savePresupuestoVenta(
          orden._id,
          buildPayload({ presupuesto: presRows, ventaCliente: nuevasVentas })
        );
        if (onSaved) onSaved(res.data.vehiculo);

        await createTicket({
          tipoProblema: "GARANTIA_AUTORIZACION",
          detalle:
            `Solicitud de autorización de garantía (envío a Venta al Cliente) ` +
            `sobre la orden anterior ${orden.garantia.ordenAnteriorFolio || "—"}.` +
            (orden.garantia.motivo ? ` Motivo: ${orden.garantia.motivo}` : ""),
          ordenServicio: orden._id,
          folioOrdenServicio: orden.ordenServicio || "",
        });

        alert(
          "Se envió la solicitud de autorización de garantía al administrador. " +
          "La orden queda bloqueada hasta que sea autorizada o negada."
        );

        // Refresca para reflejar de inmediato el bloqueo (garantia.ticketPendiente)
        const res2 = await getVehiculoById(orden._id);
        if (onSaved) onSaved(res2.data.vehiculo);
      } catch (err) {
        console.error(err);
        alert(err.response?.data?.msg || "Error al solicitar la autorización de la garantía.");
      }
      return;
    }

    // guarda, verifica inventario y cambia estado
    try {
      const res = await savePresupuestoVenta(
        orden._id,
        buildPayload({
          presupuesto: presRows,
          ventaCliente: nuevasVentas,
          estadoOrden: "PENDIENTE_SURTIR",
        })
      );
      if (onSaved) onSaved(res.data.vehiculo);

      // Al enviar a Venta se pregunta si la orden lleva mano de obra
      if (llevaMO === null) setPreguntaMo(true);
      else {
        setTimeout(() => {
          manoObraSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 150);
      }

      const inv = res.data.inventario;
      if (inv) {
        if (inv.pendientesSurtir === 0 && inv.autoSurtidas > 0) {
          alert(
            `${autorizadasParaVenta.length} partida(s) enviada(s) a Venta al Cliente.\n` +
            `✅ ${inv.autoSurtidas} partida(s) cubiertas desde inventario. La orden avanzó a Reparación en Curso.`
          );
        } else if (inv.pendientesSurtir === 0) {
          alert(
            `${autorizadasParaVenta.length} partida(s) enviada(s) a Venta al Cliente.\n` +
            `✅ Sin refacciones pendientes de surtir. La orden avanzó a Reparación en Curso.`
          );
        } else if (inv.autoSurtidas > 0) {
          alert(
            `${autorizadasParaVenta.length} partida(s) enviada(s) a Venta al Cliente.\n` +
            `✅ ${inv.autoSurtidas} cubiertas desde inventario. ⏳ ${inv.pendientesSurtir} pendiente(s) de surtir manualmente.`
          );
        } else {
          alert(`${autorizadasParaVenta.length} partida(s) enviada(s) a Venta al Cliente. Pendientes de surtir.`);
        }
      } else {
        alert(`${autorizadasParaVenta.length} partida(s) enviada(s) a Venta al Cliente.`);
      }
    } catch (err) {
      console.error(err);
      alert("Error al enviar a venta.");
    }
  };

  // ===== VENTA AL CLIENTE — HANDLERS =====
  const handleVentaLineChange = (e) => {
    const { name, value } = e.target;
    setVentaLine((prev) => ({ ...prev, [name]: value }));
  };

  const handleUpdateVentaRow = (idx, field, value) => {
    setVentaRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    );
  };

  const seleccionarServicioVenta = (servicio) => {
    setVentaLine((prev) => ({
      ...prev,
      concepto: servicio.descripcion || "",
      codigoServicio: servicio.codigo || "",
      descripcionServicio: servicio.descripcion || "",
      codigoSat: servicio.codigoSat || "",
      descripcionSat: servicio.descripcionSat || "",
    }));
    setServicioSearch(`${servicio.codigo} - ${servicio.descripcion}`);
    setShowServiciosDropdown(false);
  };

  const addVentaRow = () => {
    const cant = Number(ventaLine.cant) || 0;
    if (!cant || !ventaLine.concepto.trim()) {
      alert("Captura al menos Cantidad y Concepto.");
      return;
    }
    if (requiereFactura && !ventaLine.codigoServicio) {
      alert("Selecciona un servicio de BD Códigos para facturación.");
      return;
    }
    setVentaRows((prev) => [
      ...prev,
      { ...ventaLine, cant, precioVenta: Number(ventaLine.precioVenta || 0) },
    ]);
    setVentaLine({
      cant: "",concepto: "",precioVenta: "",observaciones: "",
      codigoServicio: "",descripcionServicio: "",codigoSat: "",descripcionSat: "",
    });
    setServicioSearch("");
  };

  const removeVentaRow = (idx) =>
    setVentaRows((prev) => prev.filter((r, i) => i !== idx));

  // ===== GUARDADO / PDF =====
  const buildPayload = (extra = {}) => {
    // llevaManoObra por partida se deriva de la decisión general + técnicos asignados
    const ventaConMo = (extra.ventaCliente || ventaRows).map((r) => ({
      ...r,
      llevaManoObra:
        llevaMO === true
          ? tecnicosDeServicio(r.concepto) > 0
          : llevaMO === false
            ? false
            : typeof r.llevaManoObra === "boolean" ? r.llevaManoObra : null,
    }));
    return {
    presupuesto: presRows,
    ventaCliente: ventaConMo,
    manoObra: moRows,
    ordenLlevaManoObra: llevaMO,
    observacionesExternas: obsExternas,
    observacionesInternas: obsInternas,
    dirigidoA,
    departamento,
    observCotizacion,
    requiereFactura,
    ivaPresupuesto: Number(ivaPresupuesto) || 0,
    ivaVenta: Number(ivaVenta) || 0,
    ...extra,
    ventaCliente: ventaConMo,
    };
  };

  const handleGuardarPresupuesto = async () => {
    try {
      const res = await savePresupuestoVenta(orden._id, buildPayload());
      if (onSaved) onSaved(res.data.vehiculo);
      alert("Presupuesto guardado correctamente.");
    } catch (err) {
      console.error(err);
      alert("Error al guardar el presupuesto.");
    }
  };

  const handleImprimir = async () => {
    try {
      const res = await savePresupuestoVenta(orden._id, buildPayload());
      if (onSaved) onSaved(res.data.vehiculo);
      abrirPdf(getPresupuestoPdfUrl(orden._id), "presupuesto.pdf", "Presupuesto");
    } catch (err) {
      console.error(err);
      alert("Error al preparar el PDF.");
    }
  };

  // Verifica que ninguna partida de Venta al Cliente tenga precio <= 0 sin motivo.
  // Devuelve las filas (posiblemente con motivoPrecioCero agregado) o null si el usuario
  // canceló/no pudo justificar el precio en $0 (en cuyo caso la acción que llamó debe abortar).
  const asegurarPreciosVentaCliente = () => {
    const filasEnCero = ventaRows.filter(
      (r) => Number(r.precioVenta) <= 0
    );
    if (filasEnCero.length === 0) return ventaRows;

    const conceptos = filasEnCero
      .map((r) => r.concepto || "Partida sin concepto")
      .join("\n- ");
    const confirmar = window.confirm(
      `Las siguientes partidas de Venta al Cliente tienen Precio de Venta en $0:\n- ${conceptos}\n\n` +
        "¿Confirmas que el precio es correcto en $0?"
    );
    if (!confirmar) {
      alert("Corrige el precio de venta antes de continuar.");
      return null;
    }

    const motivo = window.prompt(
      "Indica el motivo por el cual el precio de venta es $0 (obligatorio para guardar):"
    );
    if (!motivo || !motivo.trim()) {
      alert("Debes indicar un motivo para guardar una partida con precio en $0.");
      return null;
    }

    const filasVenta = ventaRows.map((r) =>
      Number(r.precioVenta) <= 0
        ? { ...r, motivoPrecioCero: motivo.trim() }
        : r
    );
    setVentaRows(filasVenta);
    return filasVenta;
  };

  const handleGuardarOrdenServicio = async () => {
    const hayAutorizada = presRows.some((r) => r.autorizado);
    if (!hayAutorizada) {
      alert(
        "Debes autorizar al menos una partida del presupuesto antes de guardar la orden de servicio."
      );
      return;
    }
    if (ventaRows.length === 0) {
      alert(
        "Debes enviar a Venta al Cliente al menos una partida autorizada antes de guardar la orden de servicio."
      );
      return;
    }

    const msgMo = validarManoObraObligatoria();
    if (msgMo) {
      alert(msgMo);
      manoObraSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const filasVenta = asegurarPreciosVentaCliente();
    if (filasVenta === null) return;

    try {
      const res = await savePresupuestoVenta(
        orden._id,
        buildPayload({ estadoOrden: "REPARACION_EN_CURSO", ventaCliente: filasVenta })
      );
      if (onSaved) onSaved(res.data.vehiculo);
      if (onGoPreparacion) onGoPreparacion();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.msg || "Error al guardar la orden de servicio.");
    }
  };

  const handleImprimirVentaCliente = async () => {
    const filasVenta = asegurarPreciosVentaCliente();
    if (filasVenta === null) return;

    try {
      const res = await savePresupuestoVenta(
        orden._id,
        buildPayload({ ventaCliente: filasVenta })
      );
      if (onSaved) onSaved(res.data.vehiculo);
      abrirPdf(getVentaClientePdfUrl(orden._id), "venta-cliente.pdf", "Venta al Cliente");
    } catch (err) {
      console.error(err);
      alert("Error al preparar el PDF de venta al cliente.");
    }
  };

  const handleRegresarRefaccionaria = async () => {
    if (!window.confirm("¿Regresar esta orden a refaccionaria?")) return;
    try {
      const res = await savePresupuestoVenta(
        orden._id,
        buildPayload({ estadoOrden: "PENDIENTE_REFACCIONARIA" })
      );
      if (onSaved) onSaved(res.data.vehiculo);
      navigate("/vehiculo/consulta-ordenes");
    } catch (err) {
      console.error(err);
      alert("Error al regresar la orden.");
    }
  };

  const [showCancelarModal, setShowCancelarModal] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [notificandoAdmin, setNotificandoAdmin] = useState(false);

  const handleConfirmarCancelar = async (motivo) => {
    try {
      setCancelando(true);
      const res = await savePresupuestoVenta(
        orden._id,
        buildPayload({ estadoOrden: "CANCELADA", motivoCancelacion: motivo })
      );
      if (onSaved) onSaved(res.data.vehiculo);
      setShowCancelarModal(false);
    } catch (err) {
      console.error(err);
      alert("Error al cancelar la orden.");
    } finally {
      setCancelando(false);
    }
  };

  const handleNotificarAdmin = async (motivo) => {
    try {
      setNotificandoAdmin(true);
      await createTicket({
        tipoProblema: "GARANTIA_NO_APLICA",
        detalle: motivo,
        ordenServicio: orden._id,
        folioOrdenServicio: orden.ordenServicio || "",
      });
      setShowCancelarModal(false);
      alert("Se notificó al administrador. La orden queda bloqueada hasta que resuelva el ticket.");
      // Refresca la orden para reflejar de inmediato garantia.ticketPendiente
      // (recién seteado en el backend) y bloquear la pestaña sin esperar a
      // que el asesor navegue/refresque manualmente.
      const res = await getVehiculoById(orden._id);
      if (onSaved) onSaved(res.data.vehiculo);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.msg || "Error al notificar al administrador.");
    } finally {
      setNotificandoAdmin(false);
    }
  };

  // ===== RENDER =====
  return (
    <div className="card">
      <div className="card-body">

        {/* ===== ENCABEZADO ===== */}
        <h5 className="text-center mb-3 fw-bold">PRESUPUESTO Y VENTA AL CLIENTE</h5>

        <div className="row mb-3">
          <div className="col-md-6">
            <label className="form-label">Dirigido a:</label>
            <input
              className="form-control form-control-sm"
              value={dirigidoA}
              onChange={(e) => setDirigidoA(e.target.value)}
            />
          </div>
          <div className="col-md-6">
            <label className="form-label">Departamento:</label>
            <input
              className="form-control form-control-sm"
              value={departamento}
              onChange={(e) => setDepartamento(e.target.value)}
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="form-label">Observaciones en Cotización:</label>
          <textarea
            className="form-control"
            rows={2}
            value={observCotizacion}
            onChange={(e) => setObservCotizacion(e.target.value)}
          />
        </div>

        {/* ===== PRESUPUESTO ===== */}
        {refsSinServicio > 0 && (
          <div className="alert alert-warning">
            Hay {refsSinServicio} refacción(es) seleccionada(s) sin servicio, por eso no
            aparecen aquí. Regresa a Requisición y Diagnóstico y agrúpalas en un servicio.
          </div>
        )}

        <h5 className="text-center mb-2 fw-bold">PRESUPUESTO</h5>

        <div className="pv-lista">
          {presRows.length === 0 && (
            <div className="text-center text-muted py-3">No hay partidas de presupuesto.</div>
          )}

          {presRows.map((r, idx) => {
            // Las refacciones agrupadas en un servicio se ven dentro de su
            // servicio (en "Detalles"), no como partidas sueltas.
            if (esHijoDeGrupo(r)) return null;

            const grupoId = esGrupoPadre(r) ? String(r.servicioGrupoId) : null;
            const hijos = grupoId
              ? presRows
                  .map((row, i) => ({ row, i }))
                  .filter(({ row }) => esHijoDeGrupo(row) && String(row.servicioGrupoId) === grupoId)
              : [];
            const abierto = !!expandedGroups[idx];
            const resumen = [r.tipo, r.marca, r.codigo, r.proveedor].filter(Boolean).join(" · ");
            const importe = Number(r.cant || 0) * Number(r.precioVenta || 0);

            return (
              <div key={idx} className={`pv-card ${r.autorizado ? "pv-auth" : ""}`}>
                <div className="pv-fila">
                  <label
                    className="pv-check"
                    title={
                      r.esGrua && !esAdmin
                        ? "La grúa queda autorizada automáticamente; solo un administrador puede modificarla"
                        : "Marcar como autorizado por el cliente"
                    }
                  >
                    <input
                      type="checkbox"
                      checked={!!r.autorizado}
                      disabled={readOnly || (r.esGrua && !esAdmin)}
                      onChange={() => toggleAutorizado(idx)}
                    />
                  </label>

                  <div className="pv-concepto">
                    <input
                      type="text"
                      className="form-control"
                      value={r.concepto || ""}
                      readOnly={readOnly}
                      onChange={(e) => handleUpdatePres(idx, "concepto", e.target.value)}
                    />
                    <div className="pv-resumen">
                      {r.esServicio && <span className="badge rq-badge-sv me-2">SERVICIO</span>}
                      {r.esGrua && <span className="badge bg-secondary me-2">GRÚA</span>}
                      {hijos.length > 0 && <span>{hijos.length} refacción(es) incluida(s)</span>}
                      {!r.esServicio && resumen}
                    </div>
                  </div>

                  <div className="pv-cant">
                    <span className="pv-label">Cant.</span>
                    {r.cant}
                  </div>

                  <div className="pv-precio">
                    <span className="pv-label">Precio venta (sin IVA)</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      className="form-control text-end"
                      value={r.precioVenta}
                      readOnly={readOnly}
                      onChange={(e) => handleUpdatePres(idx, "precioVenta", e.target.value)}
                    />
                  </div>

                  <div className="pv-importe">
                    <span className="pv-label">Importe</span>
                    {formatMoney(importe)}
                  </div>

                  <div className="pv-acc">
                    <button
                      type="button"
                      className="btn pv-btn pv-btn-detalle"
                      onClick={() => setExpandedGroups((p) => ({ ...p, [idx]: !p[idx] }))}
                    >
                      {abierto ? "▲ Detalles" : "▼ Detalles"}
                    </button>
                    {!readOnly && (!r.esGrua || esAdmin) && (
                      <button
                        type="button"
                        className="btn pv-btn btn-outline-danger"
                        disabled={noSePuedeBorrar(r)}
                        title={
                          noSePuedeBorrar(r)
                            ? "Ya está surtida o autorizada y enviada a Venta; no se puede eliminar"
                            : undefined
                        }
                        onClick={() => removePresRow(idx)}
                      >
                        Borrar
                      </button>
                    )}
                  </div>
                </div>

                {abierto && (
                  <div className="pv-detalle">
                    {!r.esServicio && (
                      <div className="pv-datos">
                        {r.refaccion && <span>Refacción: <b>{r.refaccion}</b></span>}
                        {r.tipo && <span>Tipo: <b>{r.tipo}</b></span>}
                        {r.marca && <span>Marca: <b>{r.marca}</b></span>}
                        {r.codigo && <span>Código: <b>{r.codigo}</b></span>}
                        {r.proveedor && <span>Proveedor: <b>{r.proveedor}</b></span>}
                        {r.tiempoEntrega && <span>Entrega: <b>{r.tiempoEntrega}</b></span>}
                        <span>
                          Precio compra: <b>{formatMoney(r.precioCompra)}</b> {r.moneda || "MN"}
                          {(r.moneda || "MN") === "USD" && ` (TC ${Number(r.tipoCambio || 0).toFixed(4)})`}
                        </span>
                        {Number(r.horasMO) > 0 && <span>M.O.: <b>{r.horasMO} h</b></span>}
                      </div>
                    )}

                    {hijos.length > 0 && (
                      <div className="mb-2">
                        <div className="fw-semibold mb-1">Refacciones del servicio</div>
                        {hijos.map(({ row: hijo, i: hijoIdx }) => (
                          <div className="pv-hijo" key={hijoIdx}>
                            <div>
                              {hijo.cant} × <b>{hijo.concepto || hijo.refaccion}</b>
                              {hijo.obligatoria === false && (
                                <span className="badge bg-secondary ms-1">Opcional</span>
                              )}
                              {hijo.surtida && <span className="badge bg-success ms-2">Surtida</span>}
                            </div>
                            <div className="pv-resumen">
                              {[hijo.tipo, hijo.marca, hijo.codigo, hijo.proveedor].filter(Boolean).join(" · ")}
                              {Number(hijo.precioCompra) > 0 && ` · Compra ${formatMoney(hijo.precioCompra)}`}
                              {hijo.observInt && ` · ${hijo.observInt}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <span className="pv-label">Observaciones internas</span>
                    <input
                      type="text"
                      className="form-control"
                      value={r.observInt || ""}
                      readOnly={readOnly}
                      onChange={(e) => handleUpdatePres(idx, "observInt", e.target.value)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="pv-totales">
          <div><span>Subtotal</span><b>{formatMoney(totalPresupuesto)}</b></div>
          <div>
            <span>
              IVA{" "}
              <input
                type="number"
                inputMode="decimal"
                className="form-control form-control-sm pv-iva"
                value={ivaPresupuesto}
                readOnly={readOnly}
                onChange={(e) => setIvaPresupuesto(e.target.value)}
              />{" "}
              %
            </span>
            <b>{formatMoney(ivaMontoPresupuesto)}</b>
          </div>
          <div className="pv-total"><span>Total</span><span>{formatMoney(totalConIvaPresupuesto)}</span></div>
        </div>

        {/* Botones Presupuesto */}
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-4">
          <div className="d-flex gap-2">
          {!readOnly && (
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={handleRegresarRefaccionaria}
            >
              Regresar a Refaccionaria
            </button>
          )}
          {!readOnly && (
            <button
              type="button"
              className="btn btn-outline-danger btn-sm"
              onClick={() => setShowCancelarModal(true)}
            >
              Cancelar Orden
            </button>
          )}
          </div>
          <div className="d-flex gap-2">
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={handleImprimir}
          >
            Imprimir
          </button>
          {!readOnly && (
            <>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleGuardarPresupuesto}
              >
                Guardar
              </button>
              <button
                type="button"
                className="btn btn-success btn-sm"
                onClick={handleEnviarAVenta}
                title={
                  orden?.garantia && orden.garantia.estado === "PENDIENTE"
                    ? "Envía la solicitud de garantía a autorización del administrador (la orden queda bloqueada hasta que la resuelva)"
                    : "Envía las partidas marcadas con ✓ a Venta al Cliente"
                }
              >
                {orden?.garantia && orden.garantia.estado === "PENDIENTE"
                  ? "Enviar a Venta (autorización) ✓"
                  : "Enviar a Venta ✓"}
              </button>
            </>
          )}
          </div>
        </div>

        {/* ===== VENTA AL CLIENTE ===== */}
        <h5 ref={ventaSectionRef} className="text-center mb-2 fw-bold">VENTA AL CLIENTE (CIERRE DE ORDEN)</h5>

        {/* Captura de partida de venta */}
        {!readOnly && (
          <div className="pv-nuevo">
            <div className="fw-bold mb-2">Agregar partida de venta</div>
            <div className="row g-2">
              {requiereFactura && (
                <div className="col-12" ref={serviciosDropdownRef} style={{ position: "relative" }}>
                  <label className="pv-label">Servicio (BD Códigos)</label>
                  <input
                    className="form-control"
                    placeholder="Buscar por código, descripción o SAT..."
                    value={servicioSearch}
                    onFocus={() => setShowServiciosDropdown(true)}
                    onChange={(e) => {
                      setServicioSearch(e.target.value);
                      setShowServiciosDropdown(true);
                    }}
                  />
                  {showServiciosDropdown && (
                    <div className="pv-sugerencias">
                      {serviciosFiltrados.length === 0 && (
                        <div className="px-2 py-2 text-muted">Sin resultados.</div>
                      )}
                      {serviciosFiltrados.map((srv) => (
                        <button
                          key={srv._id}
                          type="button"
                          className="btn btn-link w-100 text-decoration-none px-2 py-2 text-start"
                          style={{ fontSize: 13 }}
                          onClick={() => seleccionarServicioVenta(srv)}
                        >
                          <span className="fw-semibold text-primary">
                            {srv.codigo} - {srv.descripcion}
                          </span>
                          <span className="text-muted ms-2">
                            SAT: {srv.codigoSat || "-"} - {srv.descripcionSat || "-"}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="col-4 col-md-2">
                <label className="pv-label">Cantidad</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="form-control"
                  name="cant"
                  value={ventaLine.cant}
                  onChange={handleVentaLineChange}
                />
              </div>
              <div className="col-12 col-md-5 order-md-0">
                <label className="pv-label">Concepto, servicio y/o reparación</label>
                <input
                  type="text"
                  className="form-control"
                  name="concepto"
                  value={ventaLine.concepto}
                  onChange={handleVentaLineChange}
                />
              </div>
              <div className="col-8 col-md-3">
                <label className="pv-label">Precio venta (sin IVA)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  className="form-control"
                  name="precioVenta"
                  value={ventaLine.precioVenta}
                  onChange={handleVentaLineChange}
                />
              </div>
              <div className="col-12 col-md-2 d-grid align-items-end">
                <button type="button" className="btn pv-btn-agregar" onClick={addVentaRow}>
                  + Agregar
                </button>
              </div>
              {ventaMas && (
                <div className="col-12">
                  <label className="pv-label">Observaciones</label>
                  <input
                    type="text"
                    className="form-control"
                    name="observaciones"
                    value={ventaLine.observaciones}
                    onChange={handleVentaLineChange}
                  />
                </div>
              )}
            </div>
            <button
              type="button"
              className="btn btn-link btn-sm px-0 mt-1"
              onClick={() => setVentaMas((v) => !v)}
            >
              {ventaMas ? "▲ Ocultar observaciones" : "▼ Agregar observaciones"}
            </button>
          </div>
        )}

        {/* Lista venta al cliente */}
        <div className="pv-lista">
          {ventaRows.length === 0 && (
            <div className="text-center text-muted py-3">No hay partidas de venta al cliente.</div>
          )}

          {ventaRows.map((r, idx) => {
            const obsAbierta = !!ventaObsAbierta[idx];
            return (
              <div className="pv-card" key={idx}>
                <div className="pv-fila pv-venta">
                  <div className="pv-cant">
                    <span className="pv-label">Cant.</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      className="form-control text-center"
                      value={r.cant ?? ""}
                      readOnly={readOnly}
                      onChange={(e) => handleUpdateVentaRow(idx, "cant", e.target.value)}
                    />
                  </div>
                  <div className="pv-concepto">
                    <span className="pv-label">Concepto</span>
                    <input
                      type="text"
                      className="form-control"
                      value={r.concepto ?? ""}
                      readOnly={readOnly}
                      onChange={(e) => handleUpdateVentaRow(idx, "concepto", e.target.value)}
                    />
                  </div>
                  <div className="pv-precio">
                    <span className="pv-label">Precio venta (sin IVA)</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      className="form-control text-end"
                      value={r.precioVenta ?? ""}
                      readOnly={readOnly}
                      onChange={(e) => handleUpdateVentaRow(idx, "precioVenta", e.target.value)}
                    />
                  </div>
                  <div className="pv-importe">
                    <span className="pv-label">Importe</span>
                    {formatMoney(Number(r.cant || 0) * Number(r.precioVenta || 0))}
                  </div>
                  <div className="pv-acc">
                    <button
                      type="button"
                      className="btn pv-btn pv-btn-detalle"
                      onClick={() => setVentaObsAbierta((p) => ({ ...p, [idx]: !p[idx] }))}
                    >
                      Obs.{r.observaciones ? " •" : ""}
                    </button>
                    {!readOnly && (
                      <button
                        type="button"
                        className="btn pv-btn btn-outline-danger"
                        onClick={() => removeVentaRow(idx)}
                      >
                        Borrar
                      </button>
                    )}
                  </div>
                </div>
                {obsAbierta && (
                  <div className="pv-detalle">
                    <span className="pv-label">Observaciones</span>
                    <input
                      type="text"
                      className="form-control"
                      value={r.observaciones || ""}
                      readOnly={readOnly}
                      onChange={(e) => handleUpdateVentaRow(idx, "observaciones", e.target.value)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="pv-totales">
          <div><span>Sub total</span><b>{formatMoney(totalVentaCliente)}</b></div>
          <div>
            <span>
              IVA{" "}
              <input
                type="number"
                inputMode="decimal"
                className="form-control form-control-sm pv-iva"
                value={ivaVenta}
                readOnly={readOnly}
                onChange={(e) => setIvaVenta(e.target.value)}
              />{" "}
              %
            </span>
            <b>{formatMoney(ivaMontoVenta)}</b>
          </div>
          <div className="pv-total"><span>Total</span><span>{formatMoney(totalConIvaVenta)}</span></div>
        </div>

        {/* Botón "Imprimir Venta Cliente" oculto temporalmente:
            ahora se imprime desde la pestaña General al cerrar la orden. */}

        {/* ===== MANO DE OBRA ===== */}
        <h5 ref={manoObraSectionRef} className="text-center mb-2 fw-bold">MANO DE OBRA</h5>

        <div className={`pv-card mb-2 ${llevaMO === null ? "border-danger" : ""}`}>
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
            <div>
              <div className="fw-bold">¿Esta orden lleva mano de obra?</div>
              {llevaMO === null && (
                <div className="small text-danger">Pendiente de definir (obligatorio para guardar la orden)</div>
              )}
            </div>
            <div className="btn-group" role="group">
              <button
                type="button"
                className={`btn ${llevaMO === true ? "pv-btn-detalle fw-bold" : "btn-outline-secondary"}`}
                style={{ minHeight: 44, minWidth: 90 }}
                disabled={readOnly || guardandoMo}
                onClick={() => (llevaMO === true ? setMoModal({ idx: null }) : decidirLlevaMO(true))}
              >
                Sí
              </button>
              <button
                type="button"
                className={`btn ${llevaMO === false ? "pv-btn-detalle fw-bold" : "btn-outline-secondary"}`}
                style={{ minHeight: 44, minWidth: 90 }}
                disabled={readOnly || guardandoMo}
                onClick={() => decidirLlevaMO(false)}
              >
                No
              </button>
            </div>
          </div>

          {llevaMO === true && !readOnly && (
            <div className="mt-2">
              <button
                type="button"
                className="btn pv-btn-agregar"
                style={{ minHeight: 44 }}
                onClick={() => setMoModal({ idx: null })}
              >
                + Agregar mano de obra
              </button>
            </div>
          )}
        </div>

        <div className="pv-lista mb-3">
          {moRows.length === 0 && llevaMO === true && (
            <div className="text-center text-muted py-2">Aún no hay servicios con mano de obra asignada.</div>
          )}

          {moRows.map((m, idx) => {
            const horas = Number(m.horas) || 0;
            const horasAnticipadas = Math.min(horas, Number(m.horasAnticipadas) || 0);
            const horasPendientes = Math.max(0, horas - horasAnticipadas);
            const nombre = nombreManoObra(m);
            return (
              <div className="mo-card" key={idx}>
                <div className="mo-card-top">
                  <div>
                    <div className="mo-titulo">{m.concepto}</div>
                    <div className="mo-tecnico">
                      <span className="mo-avatar">{String(nombre).trim().charAt(0).toUpperCase() || "?"}</span>
                      <span>{nombre}</span>
                      <span className="mo-puesto">{puestoManoObra(m)}</span>
                    </div>
                  </div>
                  <div className="mo-total">
                    <b>{formatMoney(calcImporteHoras(m.horas))}</b>
                    <span>{formatMoney(TARIFA_HORA)} / hora</span>
                  </div>
                </div>
                <div className="mo-stats">
                  <div className="mo-stat"><span>Horas</span><b>{horas}</b></div>
                  <div className="mo-stat"><span>Anticipadas</span><b>{horasAnticipadas}</b></div>
                  <div className="mo-stat"><span>Pendientes</span><b>{horasPendientes}</b></div>
                  <div className="mo-stat"><span>Fecha de pago</span><b>{formatFecha(m.fechaPago) || "—"}</b></div>
                </div>
                {!readOnly && (
                  <div className="pv-acc mt-2">
                    <button type="button" className="btn pv-btn pv-btn-detalle" disabled={guardandoMo}
                      onClick={() => setMoModal({ idx })}>
                      Editar
                    </button>
                    <button type="button" className="btn pv-btn btn-outline-danger" disabled={guardandoMo}
                      onClick={() => removeMoRow(idx)}>
                      Quitar
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {llevaMO === true && serviciosVentaMo.some((v) => tecnicosDeServicio(v.concepto) === 0) && (
            <div className="small text-muted">
              Sin técnico: {serviciosVentaMo.filter((v) => tecnicosDeServicio(v.concepto) === 0).map((v) => v.concepto).join(", ")}
            </div>
          )}
        </div>

        <ModalPreguntaManoObra
          show={preguntaMo}
          onCerrar={() => setPreguntaMo(false)}
          onNo={async () => {
            setPreguntaMo(false);
            await decidirLlevaMO(false);
          }}
          onSi={async () => {
            setPreguntaMo(false);
            await decidirLlevaMO(true);
          }}
        />
        <ModalManoObra
          show={!!moModal}
          servicios={serviciosVentaMo}
          tecnicos={tecnicos}
          inicial={moModal && moModal.idx !== null && moModal.idx !== undefined ? moRows[moModal.idx] : null}
          bloqueadoAnticipo={bloqueadoAnticipoMo}
          guardando={guardandoMo}
          onClose={() => setMoModal(null)}
          onGuardar={guardarAsignacionMo}
        />

        {/* ===== OBSERVACIONES FINALES ===== */}
        <h5 className="text-center mb-2 fw-bold">OBSERVACIONES</h5>

        <div className="row mb-3">
          <div className="col-md-6">
            <label className="form-label">Observaciones Externas:</label>
            <textarea
              className="form-control"
              rows={3}
              value={obsExternas}
              readOnly={readOnly}
              onChange={(e) => setObsExternas(e.target.value)}
            />
          </div>
          <div className="col-md-6">
            <label className="form-label">Observaciones Internas:</label>
            <textarea
              className="form-control"
              rows={3}
              value={obsInternas}
              readOnly={readOnly}
              onChange={(e) => setObsInternas(e.target.value)}
            />
          </div>
        </div>

        {!readOnly && (
          <div className="d-flex justify-content-end">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleGuardarOrdenServicio}
            >
              Guardar Orden de Servicio
            </button>
          </div>
        )}

        <p className="mt-2 text-muted" style={{ fontSize: 12 }}>
          * Marca las partidas autorizadas por el cliente (✓) y usa "Enviar a Venta" para pasarlas a Venta al Cliente.
        </p>
      </div>

      <ModalCancelarOrden
        show={showCancelarModal}
        orden={orden}
        procesando={cancelando}
        notificando={notificandoAdmin}
        puedeCancelarDirecto={esAdmin}
        onClose={() => setShowCancelarModal(false)}
        onCancelar={handleConfirmarCancelar}
        onNotificarAdmin={handleNotificarAdmin}
      />
      {pdfModal}
    </div>
  );
}