// src/pages/vehiculo/VehiculoRequisicionDiagnostico.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  saveRequisicionDiagnostico,
  generarOrdenCompra,
} from "../../api/vehiculos";
import { getOrdenCompraPdfBlobUrl } from "../../api/ordenesCompra";
import usePdfModal from "../../hooks/usePdfModal";
import "../../styles/requisicion.css";
import "../../styles/presupuestoVenta.css";

export default function VehiculoRequisicionDiagnostico({ orden, onSaved, onGoPresupuesto, readOnly = false }) {
  const { pdfModal, abrirPdf } = usePdfModal();
  const [diagnostico, setDiagnostico] = useState("");
  const [rows, setRows] = useState([]); // refaccionesSolicitadas
  const [cargos, setCargos] = useState([]); // cargosEnOrden
  const [servicios, setServicios] = useState([]); // serviciosRequisicion [{_id, nombre}]
  const [marcadas, setMarcadas] = useState([]); // índices de rows marcados para agrupar
  const [nombreServicio, setNombreServicio] = useState("");
  const [servicioDestino, setServicioDestino] = useState(""); // "" = crear nuevo

  const [line, setLine] = useState({
    cant: "",
    unidad: "",
    refaccion: "",
    tipo: "",
    marca: "",
    proveedor: "",
    codigo: "",
    precioUnitario: "",
    moneda: "MN",
    tiempoEntrega: "",
    core: "",
    precioCore: "",
    observaciones: "",
  });
  const [saving, setSaving] = useState(false);
  const [savingLine, setSavingLine] = useState(false); // para el botón +

  const [editingRefIdx, setEditingRefIdx] = useState(null);

  // Carga inicial desde la orden — solo cuando cambia el ID de la orden, no en cada re-render
  useEffect(() => {
    if (!orden) return;

    setDiagnostico(orden.diagnosticoTecnico || "");

    // Refacciones solicitadas (arriba)
    const refConEstatus = (orden.refaccionesSolicitadas || []).map((r) => ({
      ...r,
      cant: Number(r.cant || 0),
      estatus: r.estatus || "PENDIENTE",
      opcionSeleccionada:
        r.opcionSeleccionada === undefined ? null : r.opcionSeleccionada,
      opciones: Array.isArray(r.opciones)
        ? r.opciones.map((op, i) => ({
            ...op,
            precioUnitario: Number(op.precioUnitario || 0),
            tipoCambio: op.moneda === "USD" ? Number(op.tipoCambio || 0) : 0,
            importeTotal:
              Number(op.importeTotal || 0) ||
              Number(r.cant || 0) *
                Number(op.precioUnitario || 0) *
                (op.moneda === "USD" ? Number(op.tipoCambio || 0) : 1),
            precioCore: op.core === "SI" ? Number(op.precioCore || 0) : 0,
            moneda: op.moneda || "MN",
            seleccionada: !!op.seleccionada || r.opcionSeleccionada === i,
          }))
        : [],
      requiereOC: !!r.requiereOC,
      ocGenerada: !!r.ocGenerada,
      numeroOC: r.numeroOC || null,
      ordenCompra: r.ordenCompra || null,
    }));

    setRows(refConEstatus);
    setServicios(
      (orden.serviciosRequisicion || []).map((sv) => ({
        _id: String(sv._id),
        nombre: sv.nombre || "",
      }))
    );
    setMarcadas([]);

    // Cargos en orden (lo que ya viene del backend)
    setCargos(orden.cargosEnOrden || []);
  }, [orden?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Guarda y avisa al padre para que su copia de la orden no quede desfasada
  // (si no, al cambiar de pestaña y volver se pinta la orden anterior).
  const guardarParcial = async (payload) => {
    const res = await saveRequisicionDiagnostico(orden._id, payload);
    const vAct = res?.data?.vehiculo;
    if (vAct && onSaved) onSaved(vAct);
    return res;
  };

  const handleLineChange = (e) => {
    const { name, value } = e.target;
    setLine((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Botón +: agrega refacción y guarda en backend
  const handleAddLine = async () => {
    const cantNum = Number(line.cant) || 0;
    const puNum = Number(line.precioUnitario) || 0;
    const moneda = line.moneda || "MN";
    const tipoCambio = moneda === "USD" ? Number(line.tipoCambio || 0) : 0;
    const importe = cantNum * puNum * (moneda === "USD" ? tipoCambio : 1);

    if (!cantNum || !line.refaccion.trim()) {
      alert("Captura al menos Cantidad y Refacción.");
      return;
    }

    // Si el asesor ingresó datos de precio, se guardan como opciones[0]
    const tieneOpcionInicial =
      puNum > 0 || line.proveedor.trim() || line.codigo.trim() || line.marca.trim();

    const opciones = tieneOpcionInicial
      ? [
          {
            unidad: line.unidad || "",
            tipo: line.tipo || "",
            marca: line.marca || "",
            proveedor: line.proveedor || "",
            codigo: line.codigo || "",
            precioUnitario: puNum,
            importeTotal: importe,
            moneda,
            tipoCambio,
            tiempoEntrega: line.tiempoEntrega || "",
            core: line.core || "",
            precioCore: line.core === "NO" ? Number(line.precioCore) || 0 : 0,
            observaciones: line.observaciones || "",
          },
        ]
      : [];

    const nueva = {
      cant: cantNum,
      refaccion: line.refaccion.trim(),
      opciones,
      opcionSeleccionada: tieneOpcionInicial ? 0 : null,
      estatus: "PENDIENTE",
      requiereOC: false,
      ocGenerada: false,
      numeroOC: null,
      ordenCompra: null,
    };

    const nuevasFilas = [...rows, nueva];

    setRows(nuevasFilas);
    setLine({
      cant: "",
      unidad: "",
      refaccion: "",
      tipo: "",
      marca: "",
      proveedor: "",
      codigo: "",
      precioUnitario: "",
      moneda: "MN",
      tiempoEntrega: "",
      core: "",
      precioCore: "",
      observaciones: "",
    });

    try {
      setSavingLine(true);
      await guardarParcial({
        diagnosticoTecnico: diagnostico,
        refacciones: nuevasFilas,
      });
    } catch (err) {
      console.error(err);
      alert("Error al guardar la refacción. Revisa conexión / backend.");
      setRows(rows); // revertimos
    } finally {
      setSavingLine(false);
    }
  };

  const handleRemoveRow = (idx) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleEditRow = (idx) => {
    setEditingRefIdx(idx);
  };

  const handleUpdateRefRow = (idx, field, value) => {
    const nuevasFilas = [...rows];

    nuevasFilas[idx][field] = value;

    const cant = Number(nuevasFilas[idx].cant) || 0;
    const precio = Number(nuevasFilas[idx].precioUnitario) || 0;

    nuevasFilas[idx].importeTotal = cant * precio;

    if (field === "core" && value !== "NO") {
      nuevasFilas[idx].precioCore = 0;
    }

    if (field === "precioCore") {
      nuevasFilas[idx].precioCore = Number(value) || 0;
    }

    setRows(nuevasFilas);
  };

  const handleSaveEditRow = async () => {
    try {
      setEditingRefIdx(null);

      await guardarParcial({
        diagnosticoTecnico: diagnostico,
        refacciones: rows,
      });
    } catch (err) {
      console.error(err);
      alert("Error al guardar los cambios de la refacción.");
    }
  };

  const getSeleccionadas = () =>
    rows.filter((r) => r.estatus === "APROBADA" && r.opcionSeleccionada !== null);

  // ===== Agrupación de refacciones en servicios =====
  const nuevoId = () => {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  };

  const esSeleccionada = (r) =>
    r.estatus === "APROBADA" && r.opcionSeleccionada !== null;

  const servicioDe = (r) =>
    r.servicioId ? servicios.find((sv) => sv._id === String(r.servicioId)) : null;

  // Seleccionadas que todavía no pertenecen a ningún servicio
  const sueltas = rows
    .map((r, idx) => ({ r, idx }))
    .filter(({ r }) => esSeleccionada(r) && !servicioDe(r));

  // Un servicio sin refacciones seleccionadas ya no tiene razón de existir
  const podarServicios = (filas, lista) =>
    lista.filter((sv) =>
      filas.some((r) => esSeleccionada(r) && String(r.servicioId) === sv._id)
    );

  const persistirAgrupacion = async (filas, lista) => {
    const prevRows = rows;
    const prevServicios = servicios;
    const podados = podarServicios(filas, lista);
    setRows(filas);
    setServicios(podados);
    try {
      await guardarParcial({
        diagnosticoTecnico: diagnostico,
        refacciones: filas,
        serviciosRequisicion: podados,
      });
    } catch (err) {
      console.error(err);
      alert("Error al guardar la agrupación de servicios.");
      setRows(prevRows);
      setServicios(prevServicios);
    }
  };

  const toggleMarcada = (idx) =>
    setMarcadas((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );

  const handleAgruparServicio = async () => {
    if (marcadas.length === 0) {
      alert("Marca al menos una refacción seleccionada para agrupar.");
      return;
    }
    let lista = servicios;
    let destinoId = servicioDestino;
    if (!destinoId) {
      const nombre = nombreServicio.trim();
      if (!nombre) {
        alert("Escribe el nombre del servicio.");
        return;
      }
      destinoId = nuevoId();
      lista = [...servicios, { _id: destinoId, nombre }];
    }
    const filas = rows.map((r, i) =>
      marcadas.includes(i) ? { ...r, servicioId: destinoId } : r
    );
    setMarcadas([]);
    setNombreServicio("");
    setServicioDestino("");
    await persistirAgrupacion(filas, lista);
  };

  const handleQuitarDeServicio = (idx) => {
    const filas = rows.map((r, i) => (i === idx ? { ...r, servicioId: null } : r));
    persistirAgrupacion(filas, servicios);
  };

  const handleEliminarServicio = (svId) => {
    const ok = window.confirm(
      "¿Eliminar este servicio? Sus refacciones quedarán sueltas y deberás agruparlas de nuevo."
    );
    if (!ok) return;
    const filas = rows.map((r) =>
      String(r.servicioId) === svId ? { ...r, servicioId: null } : r
    );
    persistirAgrupacion(
      filas,
      servicios.filter((sv) => sv._id !== svId)
    );
  };

  const handleRenombrarServicio = (svId, nombre) =>
    setServicios((prev) => prev.map((sv) => (sv._id === svId ? { ...sv, nombre } : sv)));

  const handleGuardarNombreServicio = async (svId) => {
    const sv = servicios.find((x) => x._id === svId);
    if (!sv?.nombre.trim()) {
      alert("El servicio necesita un nombre.");
      return;
    }
    try {
      await guardarParcial({
        diagnosticoTecnico: diagnostico,
        serviciosRequisicion: servicios,
      });
    } catch (err) {
      console.error(err);
      alert("Error al guardar el nombre del servicio.");
    }
  };

  const handleSeleccionarOpcion = async (refIdx, opIdx) => {
    const ref = rows[refIdx];
    if (!ref?.opciones?.[opIdx]) return;

    const nuevasFilas = rows.map((r, i) => {
      if (i !== refIdx) return r;
      return {
        ...r,
        opcionSeleccionada: opIdx,
        estatus: "APROBADA",
        opciones: r.opciones.map((op, oi) => ({
          ...op,
          seleccionada: oi === opIdx, 
        })),
      };
    });

    setRows(nuevasFilas);

    try {
      await guardarParcial({
        diagnosticoTecnico: diagnostico,
        refacciones: nuevasFilas,
      });
    } catch (err) {
      console.error(err);
      alert("Error al elegir la refacción.");
    }
  };

  const handleQuitarSeleccion = async (refIdx) => {
    const nuevasFilas = rows.map((r, i) => {
      if (i !== refIdx) return r;
      return {
        ...r,
        opcionSeleccionada: null,
        estatus: "PENDIENTE",
        servicioId: null, // al deseleccionarla sale de su servicio
        opciones: r.opciones.map((op) => ({ ...op, seleccionada: false })),
      };
    });

    const serviciosVigentes = podarServicios(
      nuevasFilas.map((r, i) => (i === refIdx ? { ...r, servicioId: null } : r)),
      servicios
    );
    setRows(nuevasFilas);
    setServicios(serviciosVigentes);
    setMarcadas((prev) => prev.filter((i) => i !== refIdx));

    try {
      await guardarParcial({
        diagnosticoTecnico: diagnostico,
        refacciones: nuevasFilas,
        serviciosRequisicion: serviciosVigentes,
      });
    } catch (err) {
      console.error(err);
      alert("Error al quitar la selección.");
    }
  };

  const handleSetStatus = async (idx, estatus) => {
    const prevRows = rows;
    const nuevasFilas = rows.map((r, i) =>
      i === idx ? { ...r, estatus } : r
    );

    setRows(nuevasFilas);

    try {
      await guardarParcial({
        diagnosticoTecnico: diagnostico,
        refacciones: nuevasFilas,
      });
    } catch (err) {
      console.error(err);
      alert("Error al actualizar el estatus de la refacción.");
      setRows(prevRows);
    }
  };

  // 👉 Descargar / abrir PDF de una OC existente
  const handleVerOrdenCompra = async (ordenCompraId) => {
    if (!ordenCompraId) return;

    try {
      const url = await getOrdenCompraPdfBlobUrl(ordenCompraId);
      abrirPdf(url, "orden-compra.pdf", "Orden de Compra");
    } catch (err) {
      console.error(err);
      alert("No se pudo abrir el PDF de la orden de compra.");
    }
  };

  // 👉 Generar orden de compra DESDE el checkbox
  const handleGenerarOC = async (idx) => {
    const ref = rows[idx];

    if (ref.ocGenerada) {
      // si ya existe, mejor abrimos el PDF directo
      if (ref.ordenCompra) {
        await handleVerOrdenCompra(ref.ordenCompra);
      } else {
        alert("Esta refacción ya tiene una OC generada.");
      }
      return;
    }

    if (ref.estatus !== "APROBADA") {
      alert("Solo se puede generar orden de compra para refacciones APROBADAS.");
      return;
    }

    const ok = window.confirm(
      "¿Generar orden de compra para esta refacción?"
    );
    if (!ok) return;

    const prevRows = rows;
    let nuevasFilas = rows.map((r, i) =>
      i === idx ? { ...r, _ocLoading: true } : r
    );
    setRows(nuevasFilas);

    try {
      const data = await generarOrdenCompra(orden._id, ref);
      // espero algo como: { numeroOC, ordenCompraId }
      nuevasFilas = nuevasFilas.map((r, i) =>
        i === idx
          ? {
              ...r,
              _ocLoading: false,
              ocGenerada: true,
              requiereOC: true,
              numeroOC: data.numeroOC || r.numeroOC || null,
              ordenCompra: data.ordenCompraId || r.ordenCompra || null,
            }
          : r
      );
      setRows(nuevasFilas);

      alert(
        data.numeroOC
          ? `Orden de compra generada: ${data.numeroOC}`
          : "Orden de compra generada correctamente."
      );

      // 👉 Abrir inmediatamente el PDF si tenemos el ID
      if (data.ordenCompraId) {
        await handleVerOrdenCompra(data.ordenCompraId);
      }
    } catch (err) {
      console.error(err);
      alert("Error al generar la orden de compra.");
      setRows(prevRows);
    }
  };

  const getOpcion = (r) => r.opciones?.[r.opcionSeleccionada] || {};

  const totalGeneral = useMemo(
    () => rows.reduce((acc, r) => acc + (Number(getOpcion(r).importeTotal) || 0), 0),
    [rows]
  );

  const totalSeleccionadas = useMemo(
    () =>
      getSeleccionadas().reduce(
        (acc, r) => acc + (Number(getOpcion(r).importeTotal) || 0),
        0
      ),
    [rows]
  );


  const totalCargos = useMemo(
    () => cargos.reduce((acc, c) => acc + (Number(c.importeTotal) || 0), 0),
    [cargos]
  );

  const formatMoney = (n) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 2,
    }).format(Number(n) || 0);

  const guardarRequisicion = async (estadoOrden) => {
    const payload = {
      diagnosticoTecnico: diagnostico,
      refacciones: rows,
      serviciosRequisicion: podarServicios(rows, servicios),
    };

    if (estadoOrden) {
      payload.estadoOrden = estadoOrden;
    }

    const res = await saveRequisicionDiagnostico(orden._id, payload);
    const vAct = res.data.vehiculo;

    if (onSaved) onSaved(vAct);

    return vAct;
  };

  const handleGuardarSeleccion = async () => {
    try {
      setSaving(true);
      await guardarRequisicion();
      alert("Selección guardada correctamente.");
    } catch (err) {
      console.error(err);
      alert("Error al guardar la selección.");
    } finally {
      setSaving(false);
    }
  };

  const handleRegresarRefaccionaria = async () => {
    const ok = window.confirm(
      "¿Deseas regresar esta orden a refaccionaria?"
    );

    if (!ok) return;

    try {
      setSaving(true);
      await guardarRequisicion("PENDIENTE_REFACCIONARIA");
      alert("Orden regresada a refaccionaria.");
    } catch (err) {
      console.error(err);
      alert("Error al regresar la orden a refaccionaria.");
    } finally {
      setSaving(false);
    }
  };

  const handleContinuarPresupuesto = async () => {
    // Una orden sin refacciones (omitidas) puede continuar sin selección
    if (getSeleccionadas().length === 0 && !orden?.refaccionesOmitidas) {
      alert("Selecciona al menos una refacción para continuar al presupuesto.");
      return;
    }

    if (sueltas.length > 0) {
      alert(
        `Hay ${sueltas.length} refacción(es) sin servicio. Márcalas y agrúpalas en un servicio antes de continuar al presupuesto.`
      );
      return;
    }

    try {
      setSaving(true);
      await guardarRequisicion("PENDIENTE_AUTORIZACION_CLIENTE");
      alert("Refacciones enviadas a presupuesto.");

      if (onGoPresupuesto) {
        onGoPresupuesto();
      }
    } catch (err) {
      console.error(err);
      alert("Error al continuar a presupuesto.");
    } finally {
      setSaving(false);
    }
  };


  const badgeClass = (estatus) => {
    switch (estatus) {
      case "APROBADA":
        return "badge bg-success";
      case "RECHAZADA":
        return "badge bg-danger";
      default:
        return "badge bg-secondary";
    }
  };

  return (
    <div className="card">
      <div className="card-body">

        {/* ── DIAGNÓSTICO DEL TÉCNICO ── */}
        <div className="card mb-4 border-secondary">
          <div className="card-header fw-bold bg-secondary text-white">
            DIAGNÓSTICO DEL TÉCNICO
          </div>
          <div className="card-body">
            <textarea
              className="form-control"
              rows={4}
              placeholder="Describe el diagnóstico técnico del vehículo..."
              value={diagnostico}
              readOnly={readOnly}
              onChange={(e) => setDiagnostico(e.target.value)}
            />
          </div>
        </div>

        <h5 className="text-center mb-2 fw-bold">OPCIONES DE REFACCIONES</h5>

        <div className="mb-4">
          {rows.length === 0 && (
            <div className="alert alert-info text-center">
              No hay refacciones solicitadas.
            </div>
          )}

          {rows.map((r, idx) => (
            <div className="border rounded mb-3" key={idx}>
              <div className="bg-light px-3 py-1 d-flex justify-content-between align-items-center">
                <div>
                  <strong>{r.refaccion}</strong>
                  <span className="ms-3">Cantidad: {r.cant}</span>
                  {r.unidad && <span className="ms-2">({r.unidad})</span>}
                </div>
                <span className={badgeClass(r.estatus || "PENDIENTE")}>
                  {r.estatus || "PENDIENTE"}
                </span>
              </div>

              <div className="p-2">
                {(!r.opciones || r.opciones.length === 0) && (
                  <div className="text-center text-muted">
                    Refaccionaria aún no agregó opciones.
                  </div>
                )}

                <div className="row g-2">
                  {(r.opciones || []).map((op, opIdx) => (
                    <div className="col-12 col-md-6 col-xl-4" key={opIdx}>
                      <div className={`rq-opcion ${op.seleccionada ? "rq-elegida" : ""}`}>
                        <div className="d-flex justify-content-between align-items-start mb-1">
                          <div>
                            <div className="fw-bold">{op.proveedor || "-"}</div>
                            <div className="text-muted small">
                              {[op.tipo, op.marca].filter(Boolean).join(" · ") || "-"}
                            </div>
                          </div>
                          <div className="text-end">
                            <div className="rq-precio">{formatMoney(op.importeTotal)}</div>
                            <div className="text-muted small">
                              {formatMoney(op.precioUnitario)} c/u · {op.moneda || "MN"}
                              {(op.moneda || "MN") === "USD" &&
                                ` (TC ${Number(op.tipoCambio || 0).toFixed(4)})`}
                            </div>
                          </div>
                        </div>

                        <div className="rq-dato mb-1">
                          <span>Código: <b>{op.codigo || "-"}</b></span>
                          <span>Entrega: <b>{op.tiempoEntrega || "-"}</b></span>
                          <span>
                            Core: <b>{op.core || "N/A"}</b>
                            {op.precioCore ? ` (${formatMoney(op.precioCore)})` : ""}
                          </span>
                        </div>
                        {op.observaciones && (
                          <div className="small text-muted mb-1">{op.observaciones}</div>
                        )}

                        {!readOnly && (
                          <button
                            type="button"
                            className={`btn rq-btn w-100 ${
                              op.seleccionada ? "rq-btn-elegida" : "rq-btn-elegir"
                            }`}
                            onClick={() => handleSeleccionarOpcion(idx, opIdx)}
                          >
                            {op.seleccionada ? "✓ Elegida" : "Elegir"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <h5 className="text-center mb-2 fw-bold">REFACCIONES SELECCIONADAS</h5>

        <div className="mb-4">
          {getSeleccionadas().length === 0 && (
            <div className="text-center text-muted">No hay refacciones seleccionadas.</div>
          )}

          <div className="d-flex flex-column gap-1">
            {rows.map((r, idx) => {
              if (!esSeleccionada(r)) return null;
              const op = getOpcion(r);
              const sv = servicioDe(r);
              const marcada = marcadas.includes(idx);
              return (
                <div
                  key={idx}
                  className={`rq-sel ${marcada ? "rq-marcada" : ""} ${sv ? "" : "rq-sinservicio"}`}
                  onClick={() => !readOnly && toggleMarcada(idx)}
                >
                  <div className="d-flex align-items-center gap-3">
                    {!readOnly && (
                      <input
                        type="checkbox"
                        className="form-check-input rq-check m-0"
                        checked={marcada}
                        onChange={() => toggleMarcada(idx)}
                        onClick={(e) => e.stopPropagation()}
                        title="Marcar para agrupar en un servicio"
                      />
                    )}
                    <div className="flex-grow-1">
                      <div className="d-flex flex-wrap justify-content-between gap-2">
                        <div>
                          <strong>{r.cant} × {r.refaccion}</strong>
                          <span className="ms-2">
                            {sv ? (
                              <span className="badge rq-badge-sv">{sv.nombre}</span>
                            ) : (
                              <span className="badge rq-badge-sin">Sin servicio</span>
                            )}
                          </span>
                        </div>
                        <strong>{formatMoney(op.importeTotal)}</strong>
                      </div>
                      <div className="rq-dato mt-1">
                        <span>{[op.tipo, op.marca, op.proveedor].filter(Boolean).join(" · ")}</span>
                        {op.codigo && <span>Código: <b>{op.codigo}</b></span>}
                        {op.tiempoEntrega && <span>Entrega: <b>{op.tiempoEntrega}</b></span>}
                      </div>
                    </div>
                    {!readOnly && (
                      <button
                        type="button"
                        className="btn btn-outline-danger rq-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuitarSeleccion(idx);
                        }}
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-end fw-bold fs-5 mt-3">
            Total: {formatMoney(totalSeleccionadas)}
          </div>
        </div>


        {/* ── SERVICIOS: agrupar refacciones sueltas ── */}
        {getSeleccionadas().length > 0 && (
          <div className="card mb-4 rq-panel">
            <div className="card-header fw-bold rq-panel-head d-flex justify-content-between">
              <span>SERVICIOS DEL PRESUPUESTO</span>
              {sueltas.length > 0 && (
                <span className="badge bg-light text-danger">
                  {sueltas.length} refacción(es) sin servicio
                </span>
              )}
            </div>
            <div className="card-body">
              {!readOnly && (
                <div className="row g-2 align-items-end mb-3">
                  <div className="col-12 col-md-4">
                    <label className="form-label small mb-1">Agregar a servicio existente</label>
                    <select
                      className="form-select"
                      value={servicioDestino}
                      onChange={(e) => setServicioDestino(e.target.value)}
                    >
                      <option value="">— Crear servicio nuevo —</option>
                      {servicios.map((sv) => (
                        <option key={sv._id} value={sv._id}>{sv.nombre}</option>
                      ))}
                    </select>
                  </div>
                  {!servicioDestino && (
                    <div className="col-12 col-md-5">
                      <label className="form-label small mb-1">Nombre del servicio</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Ej. Cambio de balatas"
                        value={nombreServicio}
                        onChange={(e) => setNombreServicio(e.target.value)}
                      />
                    </div>
                  )}
                  <div className="col-12 col-md-3">
                    <button
                      type="button"
                      className="btn rq-btn rq-btn-agrupar w-100"
                      onClick={handleAgruparServicio}
                      disabled={marcadas.length === 0}
                    >
                      Agrupar marcadas ({marcadas.length})
                    </button>
                  </div>
                </div>
              )}

              {servicios.length === 0 ? (
                <div className="text-muted small">
                  Marca las refacciones seleccionadas y agrúpalas en un servicio.
                  Es obligatorio para continuar al presupuesto.
                </div>
              ) : (
                servicios.map((sv) => (
                  <div className="border rounded mb-2" key={sv._id}>
                    <div className="bg-light px-3 py-2 d-flex gap-2 align-items-center">
                      <input
                        type="text"
                        className="form-control fw-bold"
                        value={sv.nombre}
                        readOnly={readOnly}
                        onChange={(e) => handleRenombrarServicio(sv._id, e.target.value)}
                        onBlur={() => !readOnly && handleGuardarNombreServicio(sv._id)}
                      />
                      {!readOnly && (
                        <button
                          type="button"
                          className="btn btn-outline-danger text-nowrap"
                          onClick={() => handleEliminarServicio(sv._id)}
                        >
                          Eliminar servicio
                        </button>
                      )}
                    </div>
                    <ul className="list-group list-group-flush">
                      {rows.map((r, idx) =>
                        esSeleccionada(r) && String(r.servicioId) === sv._id ? (
                          <li
                            key={idx}
                            className="list-group-item d-flex justify-content-between align-items-center py-1"
                          >
                            <span>
                              {r.cant} × {r.refaccion}
                              <span className="text-muted ms-2">
                                {formatMoney(getOpcion(r).importeTotal)}
                              </span>
                            </span>
                            {!readOnly && (
                              <button
                                type="button"
                                className="btn btn-outline-danger btn-sm"
                                onClick={() => handleQuitarDeServicio(idx)}
                              >
                                Sacar del servicio
                              </button>
                            )}
                          </li>
                        ) : null
                      )}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* La mano de obra ahora se asigna en la pestaña Presupuesto/Venta,
            eligiendo directamente los servicios ya presupuestados. */}

        {/* ── BOTONES DE ACCIÓN ── */}
        {!readOnly && (
          <div className="rq-acciones d-flex justify-content-between align-items-center border-top pt-3 mt-2">
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={handleRegresarRefaccionaria}
              disabled={saving}
            >
              Regresar a Refaccionaria
            </button>
            <div className="rq-acciones d-flex gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleGuardarSeleccion}
                disabled={saving}
              >
                {saving ? "Guardando..." : "Guardar selección"}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleContinuarPresupuesto}
                disabled={saving}
              >
                {saving ? "Guardando..." : "Continuar a Presupuesto →"}
              </button>
            </div>
          </div>
        )}

      </div>
      {pdfModal}
    </div>
  );
}
