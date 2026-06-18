// src/pages/vehiculo/VehiculoRequisicionDiagnostico.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  saveRequisicionDiagnostico,
  generarOrdenCompra,
} from "../../api/vehiculos";
import http from "../../api/http"; // 👈 para descargar el PDF de la OC

export default function VehiculoRequisicionDiagnostico({ orden, onSaved, onGoPresupuesto, }) {
  const [diagnostico, setDiagnostico] = useState("");
  const [rows, setRows] = useState([]); // refaccionesSolicitadas
  const [cargos, setCargos] = useState([]); // cargosEnOrden
  const [moRows, setMoRows] = useState([]);
  const [mecanicos, setMecanicos] = useState([]);
  const [carroceros, setCarroceros] = useState([]);
  const [moLine, setMoLine] = useState({
    concepto: "",
    mecanico: "",
    horas: "",
    fechaPago: "",
    observaciones: "",
    esCarroceria: false,   // ← nuevo
    carrocero: "",         // ← nuevo
    precioCarroceria: "",
  });

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
        ? r.opciones.map((op) => ({
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
            seleccionada: !!op.seleccionada,
          }))
        : [],
      requiereOC: !!r.requiereOC,
      ocGenerada: !!r.ocGenerada,
      numeroOC: r.numeroOC || null,
      ordenCompra: r.ordenCompra || null,
    }));

    setRows(refConEstatus);

    // Cargos en orden (lo que ya viene del backend)
    setCargos(orden.cargosEnOrden || []);
    setMoRows(orden.manoObra || []);
  }, [orden?._id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleLineChange = (e) => {
    const { name, value } = e.target;
    setLine((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleMoLineChange = (e) => {
    const { name, value, type, checked } = e.target;
    setMoLine((prev) => {
      const updates = { [name]: type === "checkbox" ? checked : value };
      // Al cambiar el tipo (carrocería/mecánico) limpiar el selector del otro
      if (name === "esCarroceria") {
        updates.mecanico = "";
        updates.carrocero = "";
      }
      return { ...prev, ...updates };
    });
  };

  const addMoRow = async () => {
    if (!moLine.concepto.trim()) {
      alert("En mano de obra captura al menos el concepto/servicio.");
      return;
    }

    const nuevasMo = [...moRows, moLine];

    setMoRows(nuevasMo);
    setMoLine({
      concepto: "",
      mecanico: "",
      horas: "",
      fechaPago: "",
      observaciones: "",
      esCarroceria: false,
      carrocero: "",
      precioCarroceria: "",
    });

    try {
      await saveRequisicionDiagnostico(orden._id, {
        diagnosticoTecnico: diagnostico,
        refacciones: rows,
        manoObra: nuevasMo,
      });
    } catch (err) {
      console.error(err);
      alert("Error al guardar la mano de obra.");
      setMoRows(moRows);
    }
  };


  const removeMoRow = async (idx) => {
    const prevMo = moRows;
    const nuevasMo = moRows.filter((_, i) => i !== idx);

    setMoRows(nuevasMo);

    try {
      await saveRequisicionDiagnostico(orden._id, {
        diagnosticoTecnico: diagnostico,
        refacciones: rows,
        manoObra: nuevasMo,
      });
    } catch (err) {
      console.error(err);
      alert("Error al borrar la mano de obra.");
      setMoRows(prevMo);
    }
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
      await saveRequisicionDiagnostico(orden._id, {
        diagnosticoTecnico: diagnostico,
        refacciones: nuevasFilas,
        manoObra: moRows,
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

      await saveRequisicionDiagnostico(orden._id, {
        diagnosticoTecnico: diagnostico,
        refacciones: rows,
        manoObra: moRows,
      });
    } catch (err) {
      console.error(err);
      alert("Error al guardar los cambios de la refacción.");
    }
  };

  const getSeleccionadas = () =>
    rows.filter((r) => r.estatus === "APROBADA" && r.opcionSeleccionada !== null);

  const handleSeleccionarOpcion = async (refIdx, opIdx) => {
    const ref = rows[refIdx];
    if (!ref?.opciones?.[opIdx]) return;

    const nuevasFilas = rows.map((r, i) => {
      if (i !== refIdx) return r;
      return {
        ...r,
        opcionSeleccionada: opIdx,
        estatus: "APROBADA",
      };
    });

    setRows(nuevasFilas);

    try {
      await saveRequisicionDiagnostico(orden._id, {
        diagnosticoTecnico: diagnostico,
        refacciones: nuevasFilas,
        manoObra: moRows,
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
      };
    });

    setRows(nuevasFilas);

    try {
      await saveRequisicionDiagnostico(orden._id, {
        diagnosticoTecnico: diagnostico,
        refacciones: nuevasFilas,
        manoObra: moRows,
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
      await saveRequisicionDiagnostico(orden._id, {
        diagnosticoTecnico: diagnostico,
        refacciones: nuevasFilas,
        manoObra: moRows,
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
      const resp = await http.get(`/ordenes-compra/${ordenCompraId}/pdf`, {
        responseType: "blob",
      });

      const blob = new Blob([resp.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      window.open(url, "_blank");
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

  const formatFecha = (value) => {
    if (!value) return "";

    const [year, month, day] = String(value).split("-");
    if (!year || !month || !day) return value;

    const meses = [
      "Enero",
      "Febrero",
      "Marzo",
      "Abril",
      "Mayo",
      "Junio",
      "Julio",
      "Agosto",
      "Septiembre",
      "Octubre",
      "Noviembre",
      "Diciembre",
    ];

    return `${day}-${meses[Number(month) - 1]}-${year}`;
  };


  const guardarRequisicion = async (estadoOrden) => {
    const payload = {
      diagnosticoTecnico: diagnostico,
      refacciones: rows,
      manoObra: moRows,
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
    if (getSeleccionadas().length === 0) {
      alert("Selecciona al menos una refacción para continuar al presupuesto.");
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
              <div className="bg-light px-3 py-2 d-flex justify-content-between">
                <div>
                  <strong>{r.refaccion}</strong>
                  <span className="ms-3">Cantidad: {r.cant}</span>
                  {r.unidad && <span className="ms-2">({r.unidad})</span>}
                </div>
                <span className={badgeClass(r.estatus || "PENDIENTE")}>
                  {r.estatus || "PENDIENTE"}
                </span>
              </div>

              <div className="table-responsive">
                <table className="table table-bordered table-sm align-middle mb-0">
                  <thead className="table-light text-center">
                    <tr>
                      <th>Tipo</th>
                      <th>Marca</th>
                      <th>Proveedor</th>
                      <th>Código</th>
                      <th>Precio</th>
                      <th>Importe</th>
                      <th>Moneda</th>
                      <th>Tipo Cambio</th>
                      <th>Tiempo</th>
                      <th>Core</th>
                      <th>Precio Core</th>
                      <th>Observaciones</th>
                      <th style={{ width: "110px" }}>Acción</th>
                    </tr>
                  </thead>

                  <tbody>
                    {(!r.opciones || r.opciones.length === 0) && (
                      <tr>
                        <td colSpan={13} className="text-center text-muted">
                          Refaccionaria aún no agregó opciones.
                        </td>
                      </tr>
                    )}

                    {(r.opciones || []).map((op, opIdx) => (
                      <tr
                        key={opIdx}
                        className={op.seleccionada ? "table-success" : ""}
                      >
                        <td className="text-center">{op.tipo || "-"}</td>
                        <td>{op.marca || "-"}</td>
                        <td>{op.proveedor || "-"}</td>
                        <td>{op.codigo || "-"}</td>
                        <td className="text-end">{formatMoney(op.precioUnitario)}</td>
                        <td className="text-end fw-bold">
                          {formatMoney(op.importeTotal)}
                        </td>
                        <td className="text-center">{op.moneda || "MN"}</td>
                        <td className="text-end">
                          {(op.moneda || "MN") === "USD"
                            ? Number(op.tipoCambio || 0).toFixed(4)
                            : "-"}
                        </td>
                        <td>{op.tiempoEntrega || "-"}</td>
                        <td className="text-center">{op.core || "N/A"}</td>
                        <td className="text-end">
                          {op.precioCore ? formatMoney(op.precioCore) : "-"}
                        </td>
                        <td>{op.observaciones || "-"}</td>
                        <td className="text-center">
                          <button
                            type="button"
                            className={
                              op.seleccionada
                                ? "btn btn-success btn-sm w-100"
                                : "btn btn-outline-primary btn-sm w-100"
                            }
                            onClick={() => handleSeleccionarOpcion(idx, opIdx)}
                          >
                            {op.seleccionada ? "Elegida" : "Elegir"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>

        <h5 className="text-center mb-2 fw-bold">REFACCIONES SELECCIONADAS</h5>

        <div className="table-responsive mb-4">
          <table className="table table-bordered table-sm align-middle">
            <thead className="table-light text-center">
              <tr>
                <th>Cant</th>
                <th>Unidad</th>
                <th>Refacción</th>
                <th>Tipo</th>
                <th>Marca</th>
                <th>Proveedor</th>
                <th>Código</th>
                <th>Precio Unitario</th>
                <th>Importe Total</th>
                <th>Moneda</th>
                <th>Tipo Cambio</th>
                <th>Tiempo Entrega</th>
                <th>Observaciones</th>
                <th style={{ width: "100px" }}>Acción</th>
              </tr>
            </thead>

            <tbody>
              {getSeleccionadas().length === 0 && (
                <tr>
                  <td colSpan={14} className="text-center text-muted">
                    No hay refacciones seleccionadas.
                  </td>
                </tr>
              )}

              {rows.map((r, idx) => {
                if (r.estatus !== "APROBADA" || r.opcionSeleccionada === null) {
                  return null;
                }

                const op = getOpcion(r);
                return (
                  <tr key={idx}>
                    <td className="text-center">{r.cant}</td>
                    <td className="text-center">{op.unidad}</td>
                    <td>{r.refaccion}</td>
                    <td className="text-center">{op.tipo}</td>
                    <td>{op.marca}</td>
                    <td>{op.proveedor}</td>
                    <td>{op.codigo}</td>
                    <td className="text-end">{formatMoney(op.precioUnitario)}</td>
                    <td className="text-end fw-bold">{formatMoney(op.importeTotal)}</td>
                    <td className="text-center">{op.moneda}</td>
                    <td className="text-end">
                      {(op.moneda || "MN") === "USD"
                        ? Number(op.tipoCambio || 0).toFixed(4)
                        : "-"}
                    </td>
                    <td>{op.tiempoEntrega}</td>
                    <td>{op.observaciones}</td>
                    <td className="text-center">
                      <button
                        type="button"
                        className="btn btn-outline-danger btn-sm w-100"
                        onClick={() => handleQuitarSeleccion(idx)}
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            <tfoot>
              <tr>
                <td colSpan={8} className="text-end fw-bold">
                  Total:
                </td>
                <td className="text-end fw-bold">
                  {formatMoney(totalSeleccionadas)}
                </td>
                <td colSpan={5}></td>
              </tr>
            </tfoot>
          </table>
        </div>


        <h5 className="text-center mb-2 fw-bold">MANO DE OBRA</h5>

        {/* ── Tabla de registros guardados ── */}
        <div className="table-responsive mb-3">
          <table className="table table-bordered table-sm align-middle">
            <thead className="table-light text-center">
              <tr>
                <th>Reparación y/o Servicio</th>
                <th>Mecánico / Carrocero</th>
                <th>Horas</th>
                <th>Fecha de Pago</th>
                <th>Observaciones</th>
                <th style={{ width: "70px" }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {moRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-muted">
                    No hay registros de mano de obra.
                  </td>
                </tr>
              )}
              {moRows.map((m, idx) => (
                <tr key={idx}>
                  <td>{m.concepto}</td>
                  <td className="text-center">
                    {m.esCarroceria
                      ? carroceros.find((x) => x._id === m.carrocero)?.nombre || m.carrocero || "—"
                      : mecanicos.find((x) => x._id === m.mecanico)?.nombre || m.mecanico || "—"}
                  </td>
                  <td className="text-center">{m.horas}</td>
                  <td className="text-center">{formatFecha(m.fechaPago)}</td>
                  <td>{m.observaciones}</td>
                  <td className="text-center">
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => removeMoRow(idx)}
                    >
                      Borrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Formulario de nueva Mano de Obra ── */}
        <div className="card border-primary mb-4">
          <div className="card-header bg-primary text-white fw-semibold">
            Agregar Mano de Obra
          </div>
          <div className="card-body">
            <div className="row g-2 mb-2">
              <div className="col-md-5">
                <label className="form-label form-label-sm mb-1">Reparación / Servicio</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  name="concepto"
                  placeholder="Concepto o servicio..."
                  value={moLine.concepto}
                  onChange={handleMoLineChange}
                />
              </div>
              <div className="col-md-3">
                <label className="form-label form-label-sm mb-1">
                  {moLine.esCarroceria ? "Carrocero" : "Mecánico"}
                </label>
                {moLine.esCarroceria ? (
                  <select
                    className="form-select form-select-sm"
                    name="carrocero"
                    value={moLine.carrocero}
                    onChange={handleMoLineChange}
                  >
                    <option value="">-- Seleccionar carrocero --</option>
                    {carroceros.map((c) => (
                      <option key={c._id} value={c._id}>{c.nombre}</option>
                    ))}
                  </select>
                ) : (
                  <select
                    className="form-select form-select-sm"
                    name="mecanico"
                    value={moLine.mecanico}
                    onChange={handleMoLineChange}
                  >
                    <option value="">-- Seleccionar --</option>
                    {mecanicos.map((m) => (
                      <option key={m._id} value={m._id}>{m.nombre}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="col-md-2">
                <label className="form-label form-label-sm mb-1">Horas</label>
                <input
                  type="number"
                  step="0.1"
                  className="form-control form-control-sm"
                  name="horas"
                  value={moLine.horas}
                  onChange={handleMoLineChange}
                />
              </div>
              <div className="col-md-2">
                <label className="form-label form-label-sm mb-1">Fecha de Pago</label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  name="fechaPago"
                  value={moLine.fechaPago}
                  onChange={handleMoLineChange}
                />
              </div>
            </div>
            <div className="row g-2 mb-2">
              <div className="col-md-8">
                <label className="form-label form-label-sm mb-1">Observaciones</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  name="observaciones"
                  value={moLine.observaciones}
                  onChange={handleMoLineChange}
                />
              </div>
              <div className="col-md-4 d-flex align-items-end">
                <div className="form-check ms-2">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id="esCarroceriaCheck"
                    name="esCarroceria"
                    checked={moLine.esCarroceria}
                    onChange={handleMoLineChange}
                  />
                  <label className="form-check-label fw-semibold" htmlFor="esCarroceriaCheck">
                    ¿Trabajo de Carrocería?
                  </label>
                </div>
              </div>
            </div>

            <div className="d-flex justify-content-end mt-2">
              <button
                type="button"
                className="btn btn-primary btn-sm px-4"
                onClick={addMoRow}
              >
                + Agregar
              </button>
            </div>
          </div>
        </div>



        {/* ── BOTONES DE ACCIÓN ── */}
        <div className="d-flex justify-content-between align-items-center border-top pt-3 mt-2">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={handleRegresarRefaccionaria}
            disabled={saving}
          >
            Regresar a Refaccionaria
          </button>
          <div className="d-flex gap-2">
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

      </div>
    </div>
  );
}
