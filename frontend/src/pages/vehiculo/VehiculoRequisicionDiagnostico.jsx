// src/pages/vehiculo/VehiculoRequisicionDiagnostico.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  saveRequisicionDiagnostico,
  generarOrdenCompra,
} from "../../api/vehiculos";
import http from "../../api/http"; // 👈 para descargar el PDF de la OC

export default function VehiculoRequisicionDiagnostico({ orden, onSaved }) {
  const [diagnostico, setDiagnostico] = useState("");
  const [rows, setRows] = useState([]); // refaccionesSolicitadas
  const [cargos, setCargos] = useState([]); // cargosEnOrden
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
    observaciones: "",
  });
  const [saving, setSaving] = useState(false);
  const [savingLine, setSavingLine] = useState(false); // para el botón +

  // Carga inicial desde la orden
  useEffect(() => {
    if (!orden) return;

    setDiagnostico(orden.diagnosticoTecnico || "");

    // Refacciones solicitadas (arriba)
    const refConEstatus = (orden.refaccionesSolicitadas || []).map((r) => ({
      ...r,
      estatus: r.estatus || "PENDIENTE",
      requiereOC: !!r.requiereOC,
      ocGenerada: !!r.ocGenerada,
      numeroOC: r.numeroOC || null,
      ordenCompra: r.ordenCompra || null, // 👈 ID de la OC
    }));
    setRows(refConEstatus);

    // Cargos en orden (lo que ya viene del backend)
    setCargos(orden.cargosEnOrden || []);
  }, [orden]);

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
      observaciones: "",
    });

    try {
      setSavingLine(true);
      await saveRequisicionDiagnostico(orden._id, {
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
    const r = rows[idx];
    setLine({
      cant: String(r.cant ?? ""),
      unidad: r.unidad || "",
      refaccion: r.refaccion || "",
      tipo: r.tipo || "",
      marca: r.marca || "",
      proveedor: r.proveedor || "",
      codigo: r.codigo || "",
      precioUnitario:
        r.precioUnitario != null ? String(r.precioUnitario) : "",
      moneda: r.moneda || "MN",
      tiempoEntrega: r.tiempoEntrega || "",
      core: r.core || "",
      observaciones: r.observaciones || "",
    });
    handleRemoveRow(idx);
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

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload = {
        diagnosticoTecnico: diagnostico,
        refacciones: rows,
        estadoOrden: "PENDIENTE_AUTORIZACION",
      };
      const res = await saveRequisicionDiagnostico(orden._id, payload);
      const vAct = res.data.vehiculo;
      if (onSaved) onSaved(vAct);
      alert("Orden enviada al asesor correctamente.");
    } catch (err) {
      console.error(err);
      alert("Error al guardar la requisición/diagnóstico.");
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

          <div className="mt-4">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Enviando..." : "Enviar Orden a Asesor"}
            </button>
          </div>
        </div>

        {/* ===== Tabla refacciones solicitadas (arriba) ===== */}
        <h5 className="text-center mb-2 fw-bold">REFACCIONES SOLICITADAS</h5>

        <div className="table-responsive mb-2">
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
                <th>Tiempo Entrega</th>
                <th>Observaciones</th>
                <th>Estatus</th>
                <th>Orden compra</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={15} className="text-center text-muted">
                    No hay refacciones capturadas.
                  </td>
                </tr>
              )}

              {rows.map((r, idx) => (
                <tr key={idx}>
                  <td className="text-center">{r.cant}</td>
                  <td className="text-center">{r.unidad}</td>
                  <td>{r.refaccion}</td>
                  <td className="text-center">{r.tipo}</td>
                  <td className="text-center">{r.marca}</td>
                  <td className="text-center">{r.proveedor}</td>
                  <td className="text-center">{r.codigo}</td>
                  <td className="text-end">{formatMoney(r.precioUnitario)}</td>
                  <td className="text-end">{formatMoney(r.importeTotal)}</td>
                  <td className="text-center">{r.moneda}</td>
                  <td className="text-center">{r.tiempoEntrega}</td>
                  <td>{r.observaciones}</td>
                  <td className="text-center">
                    <span className={badgeClass(r.estatus || "PENDIENTE")}>
                      {r.estatus || "PENDIENTE"}
                    </span>
                  </td>

                  {/* ✅ COLUMNA ORDEN DE COMPRA */}
                  <td className="text-center">
                    {r.ocGenerada && r.ordenCompra ? (
                      <button
                        type="button"
                        className="btn btn-info btn-sm"
                        onClick={() => handleVerOrdenCompra(r.ordenCompra)}
                      >
                        {r.numeroOC ? `OC ${r.numeroOC}` : "Ver OC"}
                      </button>
                    ) : (
                      <input
                        type="checkbox"
                        disabled={r._ocLoading}
                        onChange={() => handleGenerarOC(idx)}
                        title={
                          r.estatus !== "APROBADA"
                            ? "Solo refacciones APROBADAS pueden generar OC"
                            : "Generar orden de compra"
                        }
                      />
                    )}
                  </td>

                  <td className="text-center">
                    <div className="btn-group-vertical btn-group-sm">
                      <button
                        type="button"
                        className="btn btn-warning"
                        onClick={() => handleEditRow(idx)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => handleRemoveRow(idx)}
                      >
                        Borrar
                      </button>
                      <button
                        type="button"
                        className="btn btn-success"
                        onClick={() => handleSetStatus(idx, "APROBADA")}
                      >
                        Autorizado
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-danger"
                        onClick={() => handleSetStatus(idx, "RECHAZADA")}
                      >
                        Rechazado
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={8} className="text-end fw-bold">
                  Total:
                </td>
                <td className="text-end fw-bold">
                  {formatMoney(totalGeneral)}
                </td>
                <td colSpan={6}></td> {/* 8 + 1 + 6 = 15 columnas */}
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ===== Línea de captura (abajo) ===== */}
        <div className="table-responsive mb-4">
          <table className="table table-bordered table-sm align-middle mb-0">
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
                <th>Moneda</th>
                <th>Tiempo Entrega</th>
                <th>Core</th>
                <th>Observaciones</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ width: "70px" }}>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    name="cant"
                    value={line.cant}
                    onChange={handleLineChange}
                  />
                </td>
                <td style={{ width: "90px" }}>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    name="unidad"
                    value={line.unidad}
                    onChange={handleLineChange}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    name="refaccion"
                    value={line.refaccion}
                    onChange={handleLineChange}
                  />
                </td>
                <td style={{ width: "120px" }}>
                  <select
                    className="form-select form-select-sm"
                    name="tipo"
                    value={line.tipo}
                    onChange={handleLineChange}
                  >
                    <option value="">Selec...</option>
                    <option value="Original">Original</option>
                    <option value="Alterna">Alterna</option>
                  </select>
                </td>
                <td style={{ width: "120px" }}>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    name="marca"
                    value={line.marca}
                    onChange={handleLineChange}
                  />
                </td>
                <td style={{ width: "120px" }}>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    name="proveedor"
                    value={line.proveedor}
                    onChange={handleLineChange}
                  />
                </td>
                <td style={{ width: "110px" }}>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    name="codigo"
                    value={line.codigo}
                    onChange={handleLineChange}
                  />
                </td>
                <td style={{ width: "120px" }}>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control form-control-sm"
                    name="precioUnitario"
                    value={line.precioUnitario}
                    onChange={handleLineChange}
                  />
                </td>
                <td style={{ width: "90px" }}>
                  <select
                    className="form-select form-select-sm"
                    name="moneda"
                    value={line.moneda}
                    onChange={handleLineChange}
                  >
                    <option value="MN">MN</option>
                    <option value="USD">USD</option>
                  </select>
                </td>
                <td style={{ width: "110px" }}>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    name="tiempoEntrega"
                    value={line.tiempoEntrega}
                    onChange={handleLineChange}
                  />
                </td>
                <td style={{ width: "100px" }}>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    name="core"
                    value={line.core}
                    onChange={handleLineChange}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    name="observaciones"
                    value={line.observaciones}
                    onChange={handleLineChange}
                  />
                </td>
                <td className="text-center" style={{ width: "70px" }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={handleAddLine}
                    disabled={savingLine}
                  >
                    {savingLine ? "..." : "+"}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ===== NUEVA SECCIÓN: CARGOS EN ORDEN ===== */}
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
        </div>
      </div>
    </div>
  );
}
