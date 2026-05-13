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
  const [moLine, setMoLine] = useState({
    concepto: "",
    mecanico: "",
    horas: "",
    fechaPago: "",
    observaciones: "",
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

  // Carga inicial desde la orden
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
  }, [orden]);

  const handleLineChange = (e) => {
    const { name, value } = e.target;
    setLine((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleMoLineChange = (e) => {
    const { name, value } = e.target;
    setMoLine((prev) => ({ ...prev, [name]: value }));
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
    const importe = cantNum * puNum;

    if (!cantNum || !line.refaccion.trim()) {
      alert("Captura al menos Cantidad y Refacción.");
      return;
    }

    const nueva = {
      ...line,
      cant: cantNum,
      precioUnitario: puNum,
      importeTotal: importe,
      precioCore: line.core === "NO" ? Number(line.precioCore) || 0 : 0,
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
    const opcion = ref?.opciones?.[opIdx];

    if (!opcion) return;

    const cant = Number(ref.cant || 0);
    const precio = Number(opcion.precioUnitario || 0);
    const moneda = opcion.moneda || "MN";
    const tipoCambio = moneda === "USD" ? Number(opcion.tipoCambio || 0) : 0;
    const importe = cant * precio * (moneda === "USD" ? tipoCambio : 1);


    const nuevasFilas = rows.map((r, i) => {
      if (i !== refIdx) return r;

      return {
        ...r,
        unidad: opcion.unidad || r.unidad || "",
        tipo: opcion.tipo || "",
        marca: opcion.marca || "",
        proveedor: opcion.proveedor || "",
        codigo: opcion.codigo || "",
        precioUnitario: precio,
        tipoCambio,
        importeTotal: importe,
        moneda,
        tiempoEntrega: opcion.tiempoEntrega || "",
        core: opcion.core || "",
        precioCore: Number(opcion.precioCore || 0),
        observaciones: opcion.observaciones || "",
        opcionSeleccionada: opIdx,
        opciones: (r.opciones || []).map((op, idx) => ({
          ...op,
          seleccionada: idx === opIdx,
        })),
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
        tipo: "",
        marca: "",
        proveedor: "",
        codigo: "",
        precioUnitario: 0,
        importeTotal: 0,
        tiempoEntrega: "",
        core: "",
        precioCore: 0,
        observaciones: "",
        opcionSeleccionada: null,
        opciones: (r.opciones || []).map((op) => ({
          ...op,
          seleccionada: false,
        })),
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

  const totalGeneral = useMemo(
    () => rows.reduce((acc, r) => acc + (Number(r.importeTotal) || 0), 0),
    [rows]
  );

  const totalSeleccionadas = useMemo(
    () =>
      getSeleccionadas().reduce(
        (acc, r) => acc + (Number(r.importeTotal) || 0),
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
        {/* Diagnóstico del técnico + botón */}
        <div className="d-flex justify-content-between align-items-start mb-3">
          <div className="flex-grow-1 me-3">
            <label className="form-label">Diagnóstico del Técnico:</label>
            <textarea
              className="form-control"
              rows={3}
              value={diagnostico}
              onChange={(e) => setDiagnostico(e.target.value)}
            />
          </div>

          <div className="mt-4 d-flex flex-column gap-2 align-items-stretch">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleGuardarSeleccion}
              disabled={saving}
            >
              Guardar selección
            </button>

            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={handleRegresarRefaccionaria}
              disabled={saving}
            >
              Regresar a Refaccionaria
            </button>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleContinuarPresupuesto}
              disabled={saving}
            >
              {saving ? "Guardando..." : "Continuar a Presupuesto"}
            </button>
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

                return (
                  <tr key={idx}>
                    <td className="text-center">{r.cant}</td>
                    <td className="text-center">{r.unidad}</td>
                    <td>{r.refaccion}</td>
                    <td className="text-center">{r.tipo}</td>
                    <td>{r.marca}</td>
                    <td>{r.proveedor}</td>
                    <td>{r.codigo}</td>
                    <td className="text-end">{formatMoney(r.precioUnitario)}</td>
                    <td className="text-end fw-bold">{formatMoney(r.importeTotal)}</td>
                    <td className="text-center">{r.moneda}</td>
                    <td className="text-end">
                      {(r.moneda || "MN") === "USD"
                        ? Number(r.tipoCambio || 0).toFixed(4)
                        : "-"}
                    </td>
                    <td>{r.tiempoEntrega}</td>
                    <td>{r.observaciones}</td>
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

        <div className="table-responsive mb-4">
          <table className="table table-bordered table-sm align-middle">
            <thead className="table-light text-center">
              <tr>
                <th>Reparación y/o Servicio</th>
                <th>Mecánico</th>
                <th>Horas</th>
                <th>Fecha de Pago</th>
                <th>Observaciones</th>
                <th style={{ width: "70px" }}>Acción</th>
              </tr>
            </thead>

            <tbody>
              <tr className="table-info">
                <td>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    name="concepto"
                    value={moLine.concepto}
                    onChange={handleMoLineChange}
                  />
                </td>

                <td style={{ width: "160px" }}>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    name="mecanico"
                    value={moLine.mecanico}
                    onChange={handleMoLineChange}
                  />
                </td>

                <td style={{ width: "80px" }}>
                  <input
                    type="number"
                    step="0.1"
                    className="form-control form-control-sm"
                    name="horas"
                    value={moLine.horas}
                    onChange={handleMoLineChange}
                  />
                </td>

                <td style={{ width: "150px" }}>
                  <input
                    type="date"
                    className="form-control form-control-sm"
                    name="fechaPago"
                    value={moLine.fechaPago}
                    onChange={handleMoLineChange}
                  />
                </td>

                <td>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    name="observaciones"
                    value={moLine.observaciones}
                    onChange={handleMoLineChange}
                  />
                </td>

                <td className="text-center">
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={addMoRow}
                  >
                    +
                  </button>
                </td>
              </tr>

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
                  <td className="text-center">{m.mecanico}</td>
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



        {/* ===== NUEVA SECCIÓN: CARGOS EN ORDEN ===== 
        <h5 className="text-center mb-2 fw-bold">CARGOS EN ORDEN</h5>

        <div className="table-responsive">
          <table className="table table-bordered table-sm align-middle">
            <thead className="table-light text-center">
              <tr>
                <th>Cant</th>
                <th>Unidad</th>
                <th>Refacción y/o Servicio</th>
                <th>Marca</th>
                <th>Proveedor</th>
                <th>Código</th>
                <th>Precio Unitario</th>
                <th>Importe Total</th>
                <th>Moneda</th>
                <th>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {cargos.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center text-muted">
                    No hay cargos registrados para esta orden.
                  </td>
                </tr>
              )}

              {cargos.map((c, idx) => (
                <tr key={idx}>
                  <td className="text-center">{c.cant}</td>
                  <td className="text-center">{c.unidad}</td>
                  <td>{c.refaccion}</td>
                  <td className="text-center">{c.marca}</td>
                  <td className="text-center">{c.proveedor}</td>
                  <td className="text-center">{c.codigo}</td>
                  <td className="text-end">
                    {formatMoney(c.precioUnitario)}
                  </td>
                  <td className="text-end">
                    {formatMoney(c.importeTotal)}
                  </td>
                  <td className="text-center">{c.moneda}</td>
                  <td>{c.observaciones}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={7} className="text-end fw-bold">
                  Total:
                </td>
                <td className="text-end fw-bold">
                  {formatMoney(totalCargos)}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>*/}

      </div>
    </div>
  );
}
