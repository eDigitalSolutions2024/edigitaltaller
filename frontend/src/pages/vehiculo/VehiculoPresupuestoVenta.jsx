// src/pages/vehiculo/VehiculoPresupuestoVenta.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

import { useNavigate } from "react-router-dom";
import Dropdown from "../../components/Dropdown";
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
import useTipoCambioActual from "../../hooks/useTipoCambioActual";
import { getUser } from "../../auth";
import { createTicket } from "../../api/tickets";
import ModalCancelarOrden from "./ModalCancelarOrden";

export default function VehiculoPresupuestoVenta({ orden, onSaved, onGoPreparacion, readOnly = false }) {
  const navigate = useNavigate();
  const esAdmin = getUser()?.role === "admin";
  const { pdfModal, abrirPdf } = usePdfModal();

  // Encabezado
  const [dirigidoA, setDirigidoA] = useState("");
  const [departamento, setDepartamento] = useState("");
  const [observCotizacion, setObservCotizacion] = useState("");

  // Factura
  const [requiereFactura, setRequiereFactura] = useState(false);

  //Mano de obra
  const [mecanicos, setMecanicos] = useState([]);
  const [carroceros, setCarroceros] = useState([]);

  // Servicios SAT (para factura)
  const [serviciosTaller, setServiciosTaller] = useState([]);
  const [servicioSearch, setServicioSearch] = useState("");
  const [showServiciosDropdown, setShowServiciosDropdown] = useState(false);
  const serviciosDropdownRef = useRef(null);
  const ventaSectionRef = useRef(null);

  // ===== PRESUPUESTO =====
  const [presRows, setPresRows] = useState([]);
  // Filas de refacciones incluidas en un Servicio de catálogo, colapsadas bajo
  // su fila esServicio (mismo servicioGrupoId); se expanden solo para consulta.
  const [expandedGroups, setExpandedGroups] = useState({});
  const [newPresLine, setNewPresLine] = useState({
    cant: "",
    concepto: "",
    refaccion: "",
    tipo: "",
    marca: "",
    proveedor: "",
    codigo: "",
    precioCompra: "",
    moneda: "MN",
    tipoCambio: "",
    tiempoEntrega: "",
    horasMO: "",
    precioVenta: "",
    observInt: "",
    autorizado: false,
    esServicio: false,
  });
  const { tipoCambio: tipoCambioConfig, loading: cargandoTipoCambio } = useTipoCambioActual();

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
  // Asignación: qué servicios del presupuesto se marcan y a qué mecánico/carrocero
  const [moTipo, setMoTipo] = useState("mecanico"); // "mecanico" | "carrocero"
  const [moAsignado, setMoAsignado] = useState("");
  const [moHorasOverride, setMoHorasOverride] = useState("");
  const [moFechaPago, setMoFechaPago] = useState("");
  const [serviciosMoSeleccionados, setServiciosMoSeleccionados] = useState({});

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

    // Solo agregamos las aprobadas que todavía no están representadas
    const nuevasDesdeAprobadas = refAprobadas
      .filter((r) => !idsYaEnPresupuesto.has(String(r._id)))
      .map((r) => {
        const op = r.opciones?.[r.opcionSeleccionada] || {};
        const cant = Number(r.cant || 0);
        const precioUnitario = Number(op.precioUnitario || 0);
        const importeTotal = Number(op.importeTotal || 0);
        const moneda = op.moneda || "MN";
        const tipoCambio = moneda === "USD" ? Number(op.tipoCambio || 0) : 0;
        const precioCompraMXN =
          moneda === "USD" ? importeTotal / (cant || 1) : precioUnitario;

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
          precioVenta: precioCompraMXN,
          observInt: op.observaciones ?? "",
          autorizado: false,
        };
      });

    setPresRows(
      ensureGruaEnPresupuesto(
        [
          ...presupuestoGuardado.map((p) => ({ ...p, autorizado: !!p.autorizado })),
          ...nuevasDesdeAprobadas,
        ],
        orden
      )
    );

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
        const [resMec, resCar] = await Promise.all([
          http.get("/empleados?puesto=mecanico&activo=true"),
          http.get("/empleados?puesto=carrocero&activo=true"),
        ]);
        setMecanicos(resMec.data || []);
        setCarroceros(resCar.data || []);
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

  const nombreManoObra = (m) =>
    m.esCarroceria
      ? carroceros.find((x) => x._id === m.carrocero)?.nombre || m.carrocero || "—"
      : mecanicos.find((x) => x._id === m.mecanico)?.nombre || m.mecanico || "—";

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

  const nombreServicioPresupuesto = (p) => p?.concepto || "";

  const toggleServicioMo = (id) => {
    setServiciosMoSeleccionados((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const agregarAsignacionMano = () => {
    const idsElegidos = Object.entries(serviciosMoSeleccionados)
      .filter(([, marcado]) => marcado)
      .map(([id]) => id);

    if (idsElegidos.length === 0) {
      alert("Selecciona al menos un servicio.");
      return;
    }
    if (!moAsignado) {
      alert(moTipo === "carrocero" ? "Selecciona un carrocero." : "Selecciona un mecánico.");
      return;
    }

    const nuevasFilas = idsElegidos.map((id) => {
      const servicio = serviciosParaManoObra.find((p) => String(p._idx) === String(id));
      // Si el asesor capturó horas manualmente, esas mandan; si no, se usan
      // las horas ya estimadas en el presupuesto (horasMO) de ese servicio.
      const horas = moHorasOverride !== "" ? Number(moHorasOverride) || 0 : Number(servicio?.horasMO) || 0;
      return {
        concepto: nombreServicioPresupuesto(servicio),
        // Precio de venta de la partida al momento de asignarla: los reportes
        // de RH lo usan directo, sin volver a buscar en presupuesto[].
        precioServicio: Number(servicio?.precioVenta || 0),
        mecanico: moTipo === "carrocero" ? "" : moAsignado,
        carrocero: moTipo === "carrocero" ? moAsignado : "",
        esCarroceria: moTipo === "carrocero",
        horas,
        fechaPago: moFechaPago,
        observaciones: "",
        precioCarroceria: 0,
      };
    });

    setMoRows((prev) => [...prev, ...nuevasFilas]);
    setServiciosMoSeleccionados({});
    setMoAsignado("");
    setMoHorasOverride("");
    setMoFechaPago("");
  };

  const handleUpdateMo = (idx, field, value) => {
    setMoRows((prev) => {
      const rows = [...prev];
      rows[idx] = { ...rows[idx], [field]: value };
      return rows;
    });
  };

  const removeMoRow = (idx) => {
    setMoRows((prev) => prev.filter((_, i) => i !== idx));
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
  const esGrupoPadre = (r) =>
    !!r.esServicio && !!r.servicioGrupoId && String(r.servicioGrupoId) === String(r._id);

  const esHijoDeGrupo = (r) => !!r.origenServicioCatalogo && !!r.servicioGrupoId;

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

  const addManualPresRow = () => {
    if (!newPresLine.concepto.trim()) {
      alert("Captura al menos el concepto.");
      return;
    }
    const cant = Number(newPresLine.cant) || 1;
    const precioCompra = Number(newPresLine.precioCompra) || 0;
    const precioVenta = Number(newPresLine.precioVenta) || precioCompra;

    setPresRows((prev) => [
      ...prev,
      {
        ...newPresLine,
        cant,
        precioCompra,
        precioVenta,
        horasMO: Number(newPresLine.horasMO) || 0,
        autorizado: false,
        esServicio: !!newPresLine.esServicio,
        manual: true,
      },
    ]);

    setNewPresLine({
      cant: "",concepto: "",refaccion: "",tipo: "",marca: "",
      proveedor: "",codigo: "",precioCompra: "",moneda: "MN",
      tipoCambio: "",tiempoEntrega: "",horasMO: "",precioVenta: "",
      observInt: "",autorizado: false,esServicio: false,
    });
  };

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
    }));

    setVentaRows(nuevasVentas);

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

      setTimeout(() => {
        ventaSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);

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
  const buildPayload = (extra = {}) => ({
    presupuesto: presRows,
    ventaCliente: ventaRows,
    manoObra: moRows,
    observacionesExternas: obsExternas,
    observacionesInternas: obsInternas,
    dirigidoA,
    departamento,
    observCotizacion,
    requiereFactura,
    ivaPresupuesto: Number(ivaPresupuesto) || 0,
    ivaVenta: Number(ivaVenta) || 0,
    ...extra,
  });

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
        <h5 className="text-center mb-2 fw-bold">PRESUPUESTO</h5>

        <div className="table-responsive mb-2">
          <table className="table table-bordered table-sm align-middle">
            <thead className="table-light text-center">
              <tr>
                <th>Autorizado</th>
                <th>Cantidad</th>
                <th>Concepto, Servicio y/o Reparación</th>
                <th>Refacción</th>
                <th>Tipo</th>
                <th>Marca</th>
                <th>Código</th>        
                <th>Proveedor</th>     
                <th>TE</th>            
                <th>Precio Compra</th>
                <th>Moneda</th>
                <th>TC</th>
                <th>M.O. (Hrs)</th>
                <th>Precio Venta (Sin IVA)</th>
                <th className="table-secondary">Importe</th>
                <th>Obs. Internas</th>
                <th>Acción</th>
              </tr>
            </thead>

            <tbody>
              {presRows.length === 0 && (
                <tr>
                  <td colSpan={17} className="text-center text-muted">
                    No hay partidas de presupuesto.
                  </td>
                </tr>
              )}

              {presRows.map((r, idx) => {
                // Las refacciones incluidas en un Servicio de catálogo se
                // muestran colapsadas bajo su fila esServicio, no como filas
                // sueltas (ver "Ver refacciones" más abajo).
                if (esHijoDeGrupo(r)) return null;

                const grupoId = esGrupoPadre(r) ? String(r.servicioGrupoId) : null;
                const hijos = grupoId
                  ? presRows
                      .map((row, i) => ({ row, i }))
                      .filter(
                        ({ row }) =>
                          esHijoDeGrupo(row) && String(row.servicioGrupoId) === grupoId
                      )
                  : [];
                const expandido = grupoId ? !!expandedGroups[grupoId] : false;

                return (
                <React.Fragment key={idx}>
                <tr className={r.autorizado ? "table-success" : ""}>
                  {/* Checkbox autorizado */}
                  <td className="text-center">
                    <input
                      type="checkbox"
                      checked={!!r.autorizado}
                      disabled={readOnly || (r.esGrua && !esAdmin)}
                      onChange={() => toggleAutorizado(idx)}
                      title={
                        r.esGrua && !esAdmin
                          ? "La grúa queda autorizada automáticamente; solo un administrador puede modificarla"
                          : "Marcar como autorizado por el cliente"
                      }
                    />
                  </td>

                  <td className="text-center">{r.cant}</td>
                  <td>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={r.concepto || ""}
                      readOnly={readOnly}
                      onChange={(e) => handleUpdatePres(idx, "concepto", e.target.value)}
                    />
                  </td>
                  <td>
                    {r.esServicio ? (
                      <>
                        <span className="badge bg-info text-dark">SERVICIO</span>
                        {hijos.length > 0 && (
                          <button
                            type="button"
                            className="btn btn-link btn-sm p-0 ms-2"
                            onClick={() =>
                              setExpandedGroups((prev) => ({
                                ...prev,
                                [grupoId]: !prev[grupoId],
                              }))
                            }
                          >
                            {expandido
                              ? "▲ Ocultar refacciones"
                              : `▼ Ver refacciones (${hijos.length})`}
                          </button>
                        )}
                      </>
                    ) : (
                      r.refaccion
                    )}
                  </td>
                  <td className="text-center">{r.tipo}</td>
                  <td>{r.marca}</td>
                  <td>{r.codigo}</td>
                  <td>{r.proveedor}</td>
                  <td>{r.tiempoEntrega}</td>
                  <td className="text-end">{formatMoney(r.precioCompra)}</td>
                  <td className="text-center">{r.moneda || "MN"}</td>
                  <td className="text-end">
                    {(r.moneda || "MN") === "USD"
                      ? Number(r.tipoCambio || 0).toFixed(4)
                      : "-"}
                  </td>
                  <td className="text-center">{r.horasMO}</td>

                  {/* Precio Venta editable inline */}
                  <td className="text-end">
                    <input
                      type="number"
                      className="form-control form-control-sm text-end"
                      style={{ minWidth: 90 }}
                      value={r.precioVenta}
                      readOnly={readOnly}
                      onChange={(e) =>
                        handleUpdatePres(idx, "precioVenta", e.target.value)
                      }
                    />
                  </td>

                  <td className="text-end fw-bold bg-light">
                    {formatMoney(
                      Number(r.cant || 0) * Number(r.precioVenta || 0)
                    )}
                  </td>

                  <td>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={r.observInt || ""}
                      readOnly={readOnly}
                      onChange={(e) =>
                        handleUpdatePres(idx, "observInt", e.target.value)
                      }
                    />
                  </td>

                  {!readOnly && (
                    <td className="text-center">
                      {(!r.esGrua || esAdmin) && (
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() => removePresRow(idx)}
                        >
                          Borrar
                        </button>
                      )}
                    </td>
                  )}
                </tr>

                {grupoId && expandido && hijos.map(({ row: hijo, i: hijoIdx }) => (
                  <tr key={hijoIdx} className="table-light">
                    <td></td>
                    <td className="text-center text-muted">
                      <small>{hijo.cant}</small>
                    </td>
                    <td colSpan={2} className="text-muted">
                      <small>
                        ↳ {hijo.concepto || hijo.refaccion}
                        {hijo.obligatoria === false && (
                          <span className="badge bg-secondary ms-1">Opcional</span>
                        )}
                      </small>
                    </td>
                    <td colSpan={11}></td>
                    <td className="text-muted">
                      <small>{hijo.observInt}</small>
                    </td>
                    <td></td>
                  </tr>
                ))}
                </React.Fragment>
                );
              })}

              {/* Fila de captura manual */}
              {!readOnly && <tr className="table-info">
                <td></td>
                <td>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    value={newPresLine.cant}
                    onChange={(e) =>
                      setNewPresLine({ ...newPresLine, cant: e.target.value })
                    }
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    value={newPresLine.concepto}
                    onChange={(e) =>
                      setNewPresLine({ ...newPresLine, concepto: e.target.value })
                    }
                  />
                  <div className="form-check mt-1 mb-0">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="newPresEsServicio"
                      checked={!!newPresLine.esServicio}
                      onChange={(e) =>
                        setNewPresLine({ ...newPresLine, esServicio: e.target.checked })
                      }
                    />
                    <label
                      className="form-check-label small text-muted"
                      htmlFor="newPresEsServicio"
                    >
                      Servicio (no requiere surtido)
                    </label>
                  </div>
                </td>
                <td>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    value={newPresLine.refaccion}
                    onChange={(e) =>
                      setNewPresLine({ ...newPresLine, refaccion: e.target.value })
                    }
                  />
                </td>
                <td>
                  <Dropdown
                    className="form-select-sm"
                    value={newPresLine.tipo}
                    onChange={(e) =>
                      setNewPresLine({ ...newPresLine, tipo: e.target.value })
                    }
                  >
                    <Dropdown.Option value="">Sel...</Dropdown.Option>
                    <Dropdown.Option value="Original">Original</Dropdown.Option>
                    <Dropdown.Option value="Alterna">Alterna</Dropdown.Option>
                  </Dropdown>
                </td>
                <td>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    value={newPresLine.marca}
                    onChange={(e) =>
                      setNewPresLine({ ...newPresLine, marca: e.target.value })
                    }
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    value={newPresLine.codigo}
                    onChange={(e) =>
                      setNewPresLine({ ...newPresLine, codigo: e.target.value })
                    }
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    value={newPresLine.proveedor}
                    onChange={(e) =>
                      setNewPresLine({ ...newPresLine, proveedor: e.target.value })
                    }
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    value={newPresLine.tiempoEntrega}
                    onChange={(e) =>
                      setNewPresLine({ ...newPresLine, tiempoEntrega: e.target.value })
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    value={newPresLine.precioCompra}
                    onChange={(e) =>
                      setNewPresLine({ ...newPresLine, precioCompra: e.target.value })
                    }
                  />
                </td>
                <td>
                  <Dropdown
                    className="form-select-sm"
                    value={newPresLine.moneda || "MN"}
                    onChange={(e) => {
                      const moneda = e.target.value;
                      setNewPresLine({
                        ...newPresLine,
                        moneda,
                        tipoCambio: moneda === "USD" ? (tipoCambioConfig ? String(tipoCambioConfig) : "") : "",
                      });
                    }}
                  >
                    <Dropdown.Option value="MN">MN</Dropdown.Option>
                    <Dropdown.Option value="USD">USD</Dropdown.Option>
                  </Dropdown>
                </td>
                <td>
                  {(newPresLine.moneda || "MN") === "USD" ? (
                    <>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        value={newPresLine.tipoCambio || ""}
                        disabled
                        readOnly
                        title="Se toma del tipo de cambio definido en Configuración"
                      />
                      {!cargandoTipoCambio && !tipoCambioConfig && (
                        <small className="text-danger d-block">Sin configurar</small>
                      )}
                    </>
                  ) : (
                    <span className="text-muted">-</span>
                  )}
                </td>
                
                <td>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    value={newPresLine.horasMO}
                    onChange={(e) =>
                      setNewPresLine({ ...newPresLine, horasMO: e.target.value })
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    value={newPresLine.precioVenta}
                    onChange={(e) =>
                      setNewPresLine({ ...newPresLine, precioVenta: e.target.value })
                    }
                  />
                </td>
                <td className="bg-info-subtle"></td>
                <td>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    value={newPresLine.observInt}
                    onChange={(e) =>
                      setNewPresLine({ ...newPresLine, observInt: e.target.value })
                    }
                  />
                </td>
                <td className="text-center">
                  <button
                    type="button"
                    className="btn btn-sm btn-danger fw-bold w-100"
                    onClick={addManualPresRow}
                  >
                    +
                  </button>
                </td>
              </tr>}
            </tbody>

            <tfoot className="table-light">
              <tr>
                <td colSpan={14} className="text-end fw-bold text-uppercase">
                  Subtotal:
                </td>
                <td className="text-end fw-bold" style={{ fontSize: "1.05rem" }}>
                  {formatMoney(totalPresupuesto)}
                </td>
                <td colSpan={2}></td>
              </tr>
              <tr>
                <td colSpan={14} className="text-end fw-bold text-uppercase">
                  <span className="me-2">IVA</span>
                  <input
                    type="number"
                    className="form-control form-control-sm d-inline-block text-end"
                    style={{ width: 70 }}
                    value={ivaPresupuesto}
                    readOnly={readOnly}
                    onChange={(e) => setIvaPresupuesto(e.target.value)}
                  />
                  <span className="ms-1">%:</span>
                </td>
                <td className="text-end fw-bold">
                  {formatMoney(ivaMontoPresupuesto)}
                </td>
                <td colSpan={2}></td>
              </tr>
              <tr>
                <td colSpan={14} className="text-end fw-bold text-uppercase">
                  Total:
                </td>
                <td className="text-end fw-bold text-white bg-primary" style={{ fontSize: "1.1rem" }}>
                  {formatMoney(totalConIvaPresupuesto)}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Botones Presupuesto */}
        <div className="d-flex justify-content-end gap-2 mb-4">
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
                title="Envía las partidas marcadas con ✓ a Venta al Cliente"
              >
                Enviar a Venta ✓
              </button>
            </>
          )}
        </div>

        {/* ===== VENTA AL CLIENTE ===== */}
        <h5 ref={ventaSectionRef} className="text-center mb-2 fw-bold">VENTA AL CLIENTE (CIERRE DE ORDEN)</h5>

        <div className="form-check mb-3">
          <input
            className="form-check-input"
            type="checkbox"
            id="requiereFactura"
            checked={requiereFactura}
            disabled={ventaRows.length > 0}
            onChange={(e) => setRequiereFactura(e.target.checked)}
          />
          <label className="form-check-label fw-semibold" htmlFor="requiereFactura">
            Requiere factura
          </label>
          {ventaRows.length > 0 && (
            <div className="text-muted small mt-1">
              Para cambiar si requiere factura, elimina primero las partidas capturadas.
            </div>
          )}
        </div>

        {/* Fila de captura venta */}
        {!readOnly && <div className="mb-2" style={{ overflow: "visible" }}>
          <table className="table table-bordered table-sm align-middle mb-0" style={{ overflow: "visible" }}>
            <thead className="table-light text-center">
              <tr>
                <th style={{ width: 70 }}>Cantidad</th>
                {requiereFactura && <th>Servicio (BD Códigos)</th>}
                <th>Concepto, Servicio y/o Reparación</th>
                <th style={{ width: 140 }}>Precio Venta (Sin IVA)</th>
                <th>Observaciones</th>
                <th style={{ width: 70 }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    name="cant"
                    value={ventaLine.cant}
                    onChange={handleVentaLineChange}
                  />
                </td>

                {requiereFactura && (
                  <td ref={serviciosDropdownRef} style={{ minWidth: 400, position: "relative" }}>
                    <input
                      className="form-control form-control-sm"
                      placeholder="Buscar por código, descripción o SAT..."
                      value={servicioSearch}
                      onFocus={() => setShowServiciosDropdown(true)}
                      onChange={(e) => {
                        setServicioSearch(e.target.value);
                        setShowServiciosDropdown(true);
                      }}
                    />
                    {showServiciosDropdown && (
                      <div
                        className="border bg-white shadow-sm"
                        style={{
                          position: "absolute",
                          zIndex: 9999,
                          top: 31,
                          left: 0,
                          right: 0,
                          maxHeight: 170,
                          overflowY: "auto",
                          fontSize: 12,
                        }}
                      >
                        {serviciosFiltrados.length === 0 && (
                          <div className="px-2 py-2 text-muted">Sin resultados.</div>
                        )}
                        {serviciosFiltrados.map((srv) => (
                          <button
                            key={srv._id}
                            type="button"
                            className="btn btn-link w-100 text-decoration-none px-2 py-1 text-start"
                            style={{ fontSize: 12 }}
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
                  </td>
                )}

                <td>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    name="concepto"
                    value={ventaLine.concepto}
                    onChange={handleVentaLineChange}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control form-control-sm"
                    name="precioVenta"
                    value={ventaLine.precioVenta}
                    onChange={handleVentaLineChange}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    name="observaciones"
                    value={ventaLine.observaciones}
                    onChange={handleVentaLineChange}
                  />
                </td>
                <td className="text-center">
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={addVentaRow}
                  >
                    +
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>}

        {/* Lista venta al cliente */}
        <div className="table-responsive mb-3">
          <table className="table table-bordered table-sm align-middle">
            <thead className="table-light text-center">
              <tr>
                <th style={{ width: 70 }}>Cantidad</th>
                <th>Concepto, Servicio y/o Reparación</th>
                <th style={{ width: 160 }}>Precio Venta (Sin IVA)</th>
                <th>Observaciones</th>
                {!readOnly && <th style={{ width: 80 }}>Acción</th>}
              </tr>
            </thead>
            <tbody>
              {ventaRows.length === 0 && (
                <tr>
                  <td colSpan={readOnly ? 4 : 5} className="text-center text-muted">
                    No hay partidas de venta al cliente.
                  </td>
                </tr>
              )}

              {ventaRows.map((r, idx) => (
                <tr key={idx}>
                  <td className="text-center">
                    <input
                      type="number"
                      className="form-control form-control-sm text-center"
                      value={r.cant ?? ""}
                      readOnly={readOnly}
                      onChange={(e) => handleUpdateVentaRow(idx, "cant", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={r.concepto ?? ""}
                      readOnly={readOnly}
                      onChange={(e) => handleUpdateVentaRow(idx, "concepto", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control form-control-sm text-end"
                      value={r.precioVenta ?? ""}
                      readOnly={readOnly}
                      onChange={(e) => handleUpdateVentaRow(idx, "precioVenta", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={r.observaciones || ""}
                      readOnly={readOnly}
                      onChange={(e) => handleUpdateVentaRow(idx, "observaciones", e.target.value)}
                    />
                  </td>
                  {!readOnly && (
                    <td className="text-center">
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => removeVentaRow(idx)}
                      >
                        Borrar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} className="text-end fw-bold">Sub Total:</td>
                <td className="text-end fw-bold">{formatMoney(totalVentaCliente)}</td>
                <td colSpan={readOnly ? 1 : 2}></td>
              </tr>
              <tr>
                <td colSpan={2} className="text-end fw-bold">
                  <span className="me-2">IVA</span>
                  <input
                    type="number"
                    className="form-control form-control-sm d-inline-block text-end"
                    style={{ width: 70 }}
                    value={ivaVenta}
                    readOnly={readOnly}
                    onChange={(e) => setIvaVenta(e.target.value)}
                  />
                  <span className="ms-1">%:</span>
                </td>
                <td className="text-end fw-bold">{formatMoney(ivaMontoVenta)}</td>
                <td colSpan={readOnly ? 1 : 2}></td>
              </tr>
              <tr>
                <td colSpan={2} className="text-end fw-bold">Total:</td>
                <td className="text-end fw-bold text-white bg-primary">{formatMoney(totalConIvaVenta)}</td>
                <td colSpan={readOnly ? 1 : 2}></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Botón "Imprimir Venta Cliente" oculto temporalmente:
            ahora se imprime desde la pestaña General al cerrar la orden. */}

        {/* ===== MANO DE OBRA ===== */}
        <h5 className="text-center mb-2 fw-bold">MANO DE OBRA</h5>

        {!readOnly && (
          <div className="card border-primary mb-3">
            <div className="card-header bg-primary text-white fw-semibold">
              Asignar servicio(s) a un mecánico / carrocero
            </div>
            <div className="card-body">
              {serviciosParaManoObra.length === 0 ? (
                <p className="text-muted mb-0">
                  No hay partidas en Venta al Cliente (Cierre de Orden) todavía.
                  Agrega o envía partidas autorizadas desde el Presupuesto para
                  poder asignarles mano de obra.
                </p>
              ) : (
                <>
                  <div className="table-responsive mb-3">
                    <table className="table table-sm table-bordered align-middle mb-0">
                      <thead className="table-light">
                        <tr>
                          <th style={{ width: "40px" }}></th>
                          <th>Servicio</th>
                          <th className="text-end">Precio Venta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {serviciosParaManoObra.map((p) => (
                          <tr key={p._idx}>
                            <td className="text-center">
                              <input
                                type="checkbox"
                                checked={!!serviciosMoSeleccionados[p._idx]}
                                onChange={() => toggleServicioMo(p._idx)}
                              />
                            </td>
                            <td>{nombreServicioPresupuesto(p)}</td>
                            <td className="text-end">{formatMoney(p.precioVenta)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="row g-2 align-items-end">
                    <div className="col-md-2">
                      <label className="form-label form-label-sm mb-1">Asignar a</label>
                      <Dropdown
                        className="form-select-sm"
                        value={moTipo}
                        onChange={(e) => {
                          setMoTipo(e.target.value);
                          setMoAsignado("");
                        }}
                      >
                        <Dropdown.Option value="mecanico">Mecánico</Dropdown.Option>
                        <Dropdown.Option value="carrocero">Carrocero</Dropdown.Option>
                      </Dropdown>
                    </div>
                    <div className="col-md-3">
                      <label className="form-label form-label-sm mb-1">
                        {moTipo === "carrocero" ? "Carrocero" : "Mecánico"}
                      </label>
                      <Dropdown
                        className="form-select-sm"
                        value={moAsignado}
                        onChange={(e) => setMoAsignado(e.target.value)}
                      >
                        <Dropdown.Option value="">-- Seleccionar --</Dropdown.Option>
                        {(moTipo === "carrocero" ? carroceros : mecanicos).map((e) => (
                          <Dropdown.Option key={e._id} value={e._id}>{e.nombre}</Dropdown.Option>
                        ))}
                      </Dropdown>
                    </div>
                    <div className="col-md-2">
                      <label className="form-label form-label-sm mb-1">Horas</label>
                      <input
                        type="number"
                        step="0.1"
                        className="form-control form-control-sm"
                        placeholder="Según presupuesto"
                        title="Deja en blanco para usar las horas ya estimadas en el presupuesto"
                        value={moHorasOverride}
                        onChange={(e) => setMoHorasOverride(e.target.value)}
                      />
                    </div>
                    <div className="col-md-2">
                      <label className="form-label form-label-sm mb-1">Fecha de Pago</label>
                      <input
                        type="date"
                        className="form-control form-control-sm"
                        value={moFechaPago}
                        onChange={(e) => setMoFechaPago(e.target.value)}
                      />
                    </div>
                    <div className="col-md-3 text-end">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm px-4"
                        onClick={agregarAsignacionMano}
                      >
                        + Agregar asignación
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div className="table-responsive mb-4">
          <table className="table table-bordered table-sm align-middle">
            <thead className="table-light text-center">
              <tr>
                <th>Reparación y/o Servicio</th>
                <th>Mecánico / Carrocero</th>
                <th>Horas</th>
                <th>Total x Horas ({formatMoney(TARIFA_HORA)} / hora)</th>
                <th>Fecha de Pago</th>
                <th>Observaciones</th>
                {!readOnly && <th style={{ width: "70px" }}>Acción</th>}
              </tr>
            </thead>
            <tbody>
              {moRows.length === 0 ? (
                <tr>
                  <td colSpan={readOnly ? 6 : 7} className="text-center text-muted">
                    No hay registros de mano de obra.
                  </td>
                </tr>
              ) : (
                moRows.map((m, idx) => (
                  <tr key={idx}>
                    <td>{m.concepto}</td>
                    <td className="text-center">{nombreManoObra(m)}</td>
                    <td className="text-center" style={{ maxWidth: "90px" }}>
                      {readOnly ? (
                        m.horas
                      ) : (
                        <input
                          type="number"
                          step="0.1"
                          className="form-control form-control-sm text-center"
                          value={m.horas}
                          onChange={(e) => handleUpdateMo(idx, "horas", e.target.value)}
                        />
                      )}
                    </td>
                    <td className="text-center fw-bold">{formatMoney(calcImporteHoras(m.horas))}</td>
                    <td className="text-center" style={{ maxWidth: "140px" }}>
                      {readOnly ? (
                        formatFecha(m.fechaPago)
                      ) : (
                        <input
                          type="date"
                          className="form-control form-control-sm"
                          value={m.fechaPago || ""}
                          onChange={(e) => handleUpdateMo(idx, "fechaPago", e.target.value)}
                        />
                      )}
                    </td>
                    <td>
                      {readOnly ? (
                        m.observaciones
                      ) : (
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          value={m.observaciones || ""}
                          onChange={(e) => handleUpdateMo(idx, "observaciones", e.target.value)}
                        />
                      )}
                    </td>
                    {!readOnly && (
                      <td className="text-center">
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() => removeMoRow(idx)}
                        >
                          Quitar
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

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