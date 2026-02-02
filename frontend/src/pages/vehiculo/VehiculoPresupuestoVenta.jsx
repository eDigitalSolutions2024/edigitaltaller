// src/pages/vehiculo/VehiculoPresupuestoVenta.jsx
import React, { useEffect, useMemo, useState } from "react";
import { savePresupuestoVenta } from "../../api/vehiculos";

export default function VehiculoPresupuestoVenta({ orden, onSaved }) {
  // Datos de encabezado
  const [dirigidoA, setDirigidoA] = useState("");
  const [departamento, setDepartamento] = useState("");
  const [observCotizacion, setObservCotizacion] = useState("");

  // ===== PRESUPUESTO =====
  const [presRows, setPresRows] = useState([]);

  // ===== VENTA AL CLIENTE =====
  const [ventaRows, setVentaRows] = useState([]);
  const [ventaLine, setVentaLine] = useState({
    cant: "",
    concepto: "",
    precioVenta: "",
    observaciones: "",
  });

  // ===== MANO DE OBRA =====
  const [moRows, setMoRows] = useState([]);
  const [moLine, setMoLine] = useState({
    concepto: "",
    mecanico: "",
    horas: "",
    fechaPago: "",
    observaciones: "",
  });

  // ===== OBSERVACIONES FINALES =====
  const [obsExternas, setObsExternas] = useState("");
  const [obsInternas, setObsInternas] = useState("");

  useEffect(() => {
    if (!orden) return;

    // Si luego guardas encabezado en BD, aquí podrías leerlo:
    // setDirigidoA(orden.dirigidoA || "");
    // setDepartamento(orden.departamento || "");
    // setObservCotizacion(orden.observCotizacion || "");

    // 1) Presupuesto desde la orden (o lo construimos desde refacciones aprobadas)
    if (Array.isArray(orden.presupuesto) && orden.presupuesto.length > 0) {
      setPresRows(orden.presupuesto);
    } else {
      const refSolicitadas = orden.refaccionesSolicitadas || [];
      const aprobadas = refSolicitadas.filter(
        (r) => (r.estatus || "PENDIENTE") === "APROBADA"
      );

      const mappedPres = aprobadas.map((r) => ({
        cant: r.cant ?? 0,
        concepto: r.refaccion || r.descripcion || "",
        refaccion: r.refaccion || "",
        tipo: r.tipo || "",
        marca: r.marca || "",
        proveedor: r.proveedor || "",
        codigo: r.codigo || "",
        precioCompra: r.precioUnitario ?? 0,
        tiempoEntrega: r.tiempoEntrega ?? "",
        horasMO: 0,
        precioVenta: r.precioUnitario ?? 0,
        observInt: r.observaciones ?? "",
      }));

      setPresRows(mappedPres);
    }

    // Venta al cliente ya guardada
    setVentaRows(orden.ventaCliente || []);

    // Mano de obra ya guardada
    setMoRows(orden.manoObra || []);

    // Observaciones finales ya guardadas
    setObsExternas(orden.observacionesExternas || "");
    setObsInternas(orden.observacionesInternas || "");
  }, [orden]);

  const formatMoney = (n) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 2,
    }).format(Number(n) || 0);

  // Total de presupuesto = sum(cant * precioVenta)
  const totalPresupuesto = useMemo(
    () =>
      presRows.reduce(
        (acc, r) => acc + (Number(r.cant || 0) * Number(r.precioVenta || 0)),
        0
      ),
    [presRows]
  );

  // Total venta cliente = sum(cant * precioVenta)
  const totalVentaCliente = useMemo(
    () =>
      ventaRows.reduce(
        (acc, r) => acc + (Number(r.cant || 0) * Number(r.precioVenta || 0)),
        0
      ),
    [ventaRows]
  );

  const handleVentaLineChange = (e) => {
    const { name, value } = e.target;
    setVentaLine((prev) => ({ ...prev, [name]: value }));
  };

  const handleMoLineChange = (e) => {
    const { name, value } = e.target;
    setMoLine((prev) => ({ ...prev, [name]: value }));
  };

  const removePresRow = (idx) => {
    setPresRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const addVentaRow = () => {
    const cant = Number(ventaLine.cant) || 0;
    if (!cant || !ventaLine.concepto.trim()) {
      alert("En venta al cliente captura al menos Cantidad y Concepto.");
      return;
    }
    setVentaRows((prev) => [...prev, { ...ventaLine, cant }]);
    setVentaLine({
      cant: "",
      concepto: "",
      precioVenta: "",
      observaciones: "",
    });
  };

  const removeVentaRow = (idx) => {
    setVentaRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const addMoRow = () => {
    if (!moLine.concepto.trim()) {
      alert("En mano de obra captura al menos el concepto/servicio.");
      return;
    }
    setMoRows((prev) => [...prev, moLine]);
    setMoLine({
      concepto: "",
      mecanico: "",
      horas: "",
      fechaPago: "",
      observaciones: "",
    });
  };

  const removeMoRow = (idx) => {
    setMoRows((prev) => prev.filter((_, i) => i !== idx));
  };

  // Botones de la parte de arriba: por ahora solo Autorizar hace algo real
  const handleGuardarPresupuesto = () => {
    alert("Luego conectamos este botón al backend para guardar presupuesto.");
  };

  const handleEnviar = () => {
    alert("Luego conectamos 'Enviar' al flujo de asesor / ventas.");
  };

  // Autorizar: arma Venta al Cliente desde el presupuesto y guarda eso
  const handleAutorizar = async () => {
    try {
      if (presRows.length === 0) {
        alert("No hay partidas de presupuesto para autorizar.");
        return;
      }

      const nuevasVentas = presRows.map((r) => ({
        cant: r.cant || 0,
        concepto: r.concepto || r.refaccion || "",
        precioVenta: Number(r.precioVenta) || 0,
        observaciones: "",
      }));

      setVentaRows(nuevasVentas);

      const payload = {
        presupuesto: presRows,
        ventaCliente: nuevasVentas,
        // si quieres, aquí podrías cambiar estadoOrden
        // estadoOrden: "PENDIENTE_CERRAR",
      };

      const res = await savePresupuestoVenta(orden._id, payload);
      const vAct = res.data.vehiculo;

      if (onSaved) onSaved(vAct);

      alert("Presupuesto autorizado y enviado a Venta al Cliente.");
    } catch (err) {
      console.error(err);
      alert("Error al autorizar el presupuesto.");
    }
  };

  // Guardar Orden de Servicio: incluye mano de obra + observaciones
  const handleGuardarOrdenServicio = async () => {
    try {
      const payload = {
        presupuesto: presRows,
        ventaCliente: ventaRows,
        manoObra: moRows,
        observacionesExternas: obsExternas,
        observacionesInternas: obsInternas,
      };

      const res = await savePresupuestoVenta(orden._id, payload);
      const vAct = res.data.vehiculo;

      if (onSaved) onSaved(vAct);

      alert("Orden de servicio guardada correctamente.");
    } catch (err) {
      console.error(err);
      alert("Error al guardar la orden de servicio.");
    }
  };

  const handleRechazar = () => {
    alert("Luego conectamos 'Rechazado' al flujo correspondiente.");
  };

  const handleRegresarRefaccionaria = () => {
    alert("Luego definimos la lógica para regresar la orden a refaccionaria.");
  };

  return (
    <div className="card">
      <div className="card-body">
        {/* ===== Encabezado ===== */}
        <h5 className="text-center mb-3 fw-bold">
          PRESUPUESTO Y VENTA AL CLIENTE
        </h5>

        <div className="row mb-3">
          <div className="col-md-6">
            <label className="form-label">Dirigido a:</label>
            <input
              type="text"
              className="form-control form-control-sm"
              value={dirigidoA}
              onChange={(e) => setDirigidoA(e.target.value)}
            />
          </div>
          <div className="col-md-6">
            <label className="form-label">Departamento:</label>
            <input
              type="text"
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

        {/* =================== PRESUPUESTO =================== */}
        <h5 className="text-center mb-2 fw-bold">PRESUPUESTO</h5>

        <div className="table-responsive mb-2">
          <table className="table table-bordered table-sm align-middle">
            <thead className="table-light text-center">
              <tr>
                <th>Cantidad</th>
                <th>Concepto, Servicio y/o Reparación</th>
                <th>Refacción</th>
                <th>Tipo</th>
                <th>Marca</th>
                <th>Proveedor</th>
                <th>Código</th>
                <th>Precio Compra</th>
                <th>Tiempo Entrega</th>
                <th>M.O. (Hrs)</th>
                <th>Precio Venta (Sin IVA)</th>
                <th>Obs. Internas</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {presRows.length === 0 && (
                <tr>
                  <td colSpan={13} className="text-center text-muted">
                    No hay partidas de presupuesto.
                  </td>
                </tr>
              )}

              {presRows.map((r, idx) => (
                <tr key={idx}>
                  <td className="text-center">{r.cant}</td>
                  <td>{r.concepto}</td>
                  <td>{r.refaccion}</td>
                  <td className="text-center">{r.tipo}</td>
                  <td className="text-center">{r.marca}</td>
                  <td className="text-center">{r.proveedor}</td>
                  <td className="text-center">{r.codigo}</td>
                  <td className="text-end">{formatMoney(r.precioCompra)}</td>
                  <td className="text-center">{r.tiempoEntrega}</td>
                  <td className="text-center">{r.horasMO}</td>
                  <td className="text-end">{formatMoney(r.precioVenta)}</td>
                  <td>{r.observInt}</td>
                  <td className="text-center">
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => removePresRow(idx)}
                    >
                      Borrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={10}></td>
                <td className="text-end fw-bold">Total:</td>
                <td className="text-end fw-bold">
                  {formatMoney(totalPresupuesto)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Botones estilo sistema viejo */}
        <div className="d-flex justify-content-end gap-2 mb-4">
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
            onClick={handleEnviar}
          >
            Enviar
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleAutorizar}
          >
            Autorizado
          </button>
          <button
            type="button"
            className="btn btn-outline-danger btn-sm"
            onClick={handleRechazar}
          >
            Rechazado
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={handleRegresarRefaccionaria}
          >
            Regresar a Refaccionaria
          </button>
        </div>

        {/* =================== VENTA AL CLIENTE =================== */}
        <h5 className="text-center mb-2 fw-bold">
          VENTA AL CLIENTE (CIERRE DE ORDEN)
        </h5>

        {/* Línea de captura venta cliente */}
        <div className="table-responsive mb-2">
          <table className="table table-bordered table-sm align-middle mb-0">
            <thead className="table-light text-center">
              <tr>
                <th>Cantidad</th>
                <th>Concepto, Servicio y/o Reparación</th>
                <th>Precio Venta (Sin IVA)</th>
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
                    value={ventaLine.cant}
                    onChange={handleVentaLineChange}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    name="concepto"
                    value={ventaLine.concepto}
                    onChange={handleVentaLineChange}
                  />
                </td>
                <td style={{ width: "140px" }}>
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
                <td className="text-center" style={{ width: "70px" }}>
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
        </div>

        {/* Lista venta cliente */}
        <div className="table-responsive mb-4">
          <table className="table table-bordered table-sm align-middle">
            <thead className="table-light text-center">
              <tr>
                <th>Cantidad</th>
                <th>Concepto, Servicio y/o Reparación</th>
                <th>Precio Venta (Sin IVA)</th>
                <th>Observaciones</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {ventaRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-muted">
                    No hay partidas de venta al cliente.
                  </td>
                </tr>
              )}

              {ventaRows.map((r, idx) => (
                <tr key={idx}>
                  <td className="text-center">{r.cant}</td>
                  <td>{r.concepto}</td>
                  <td className="text-end">{formatMoney(r.precioVenta)}</td>
                  <td>{r.observaciones}</td>
                  <td className="text-center">
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => removeVentaRow(idx)}
                    >
                      Borrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}></td>
                <td className="text-end fw-bold">
                  {formatMoney(totalVentaCliente)}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* =================== MANO DE OBRA =================== */}
        <h5 className="text-center mb-2 fw-bold">MANO DE OBRA</h5>

        {/* Línea de captura mano de obra */}
        <div className="table-responsive mb-2">
          <table className="table table-bordered table-sm align-middle mb-0">
            <thead className="table-light text-center">
              <tr>
                <th>Reparación y/o Servicio</th>
                <th>Mecánico</th>
                <th>Horas</th>
                <th>Fecha de Pago</th>
                <th>Observaciones</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              <tr>
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
                <td className="text-center" style={{ width: "70px" }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={addMoRow}
                  >
                    +
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Lista mano de obra */}
        <div className="table-responsive mb-4">
          <table className="table table-bordered table-sm align-middle">
            <thead className="table-light text-center">
              <tr>
                <th>Reparación y/o Servicio</th>
                <th>Mecánico</th>
                <th>Horas</th>
                <th>Fecha de Pago</th>
                <th>Observaciones</th>
                <th>Acción</th>
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
                  <td className="text-center">{m.mecanico}</td>
                  <td className="text-center">{m.horas}</td>
                  <td className="text-center">{m.fechaPago}</td>
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

        {/* =================== OBSERVACIONES FINALES =================== */}
        <h5 className="text-center mb-2 fw-bold">OBSERVACIONES</h5>

        <div className="row mb-3">
          <div className="col-md-6">
            <label className="form-label">Observaciones Externas:</label>
            <textarea
              className="form-control"
              rows={3}
              value={obsExternas}
              onChange={(e) => setObsExternas(e.target.value)}
            />
          </div>
          <div className="col-md-6">
            <label className="form-label">Observaciones Internas:</label>
            <textarea
              className="form-control"
              rows={3}
              value={obsInternas}
              onChange={(e) => setObsInternas(e.target.value)}
            />
          </div>
        </div>

        <div className="d-flex justify-content-end">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleGuardarOrdenServicio}
          >
            Guardar Orden de Servicio
          </button>
        </div>

        <p className="mt-2 text-muted" style={{ fontSize: "12px" }}>
          * Favor de aprobar o rechazar todas las partidas para cerrar la orden
          de servicio.
        </p>
      </div>
    </div>
  );
}
