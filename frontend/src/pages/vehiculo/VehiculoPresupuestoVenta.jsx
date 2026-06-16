// src/pages/vehiculo/VehiculoPresupuestoVenta.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

import { useNavigate } from "react-router-dom";
import {
  savePresupuestoVenta,
  openPresupuestoPdf,
  openVentaClientePdf,
} from "../../api/vehiculos";
import { fetchServiciosTaller } from "../../api/codigos";
import http from "../../api/http";

export default function VehiculoPresupuestoVenta({ orden, onSaved, onGoPreparacion }) {
  const navigate = useNavigate();

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
  });

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

  // ===== OBSERVACIONES =====
  const [obsExternas, setObsExternas] = useState("");
  const [obsInternas, setObsInternas] = useState("");

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

    // Presupuesto
    if (Array.isArray(orden.presupuesto) && orden.presupuesto.length > 0) {
      setPresRows(
        orden.presupuesto.map((p) => ({
          ...p,
          autorizado: !!p.autorizado,
        }))
      );
    } else {
      // Construir desde refacciones aprobadas
      const refParaPresupuesto = (orden.refaccionesSolicitadas || []).filter(
        (r) => {
          const op = r.opciones?.[r.opcionSeleccionada] || {};
          return (
            r.estatus === "APROBADA" &&
            r.opcionSeleccionada !== null &&
            r.opcionSeleccionada !== undefined &&
            Number(op.precioUnitario || 0) > 0
          );
        }
      );

      setPresRows(
        refParaPresupuesto.map((r) => {
          const op = r.opciones?.[r.opcionSeleccionada] || {};
          const cant = Number(r.cant || 0);
          const precioUnitario = Number(op.precioUnitario || 0);
          const importeTotal = Number(op.importeTotal || 0);
          const moneda = op.moneda || "MN";
          const tipoCambio = moneda === "USD" ? Number(op.tipoCambio || 0) : 0;
          const precioCompraMXN =
            moneda === "USD" ? importeTotal / (cant || 1) : precioUnitario;

          return {
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
        })
      );
    }

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

  // ===== PRESUPUESTO — HANDLERS =====
  const handleUpdatePres = (idx, field, value) => {
    setPresRows((prev) => {
      const rows = [...prev];
      rows[idx] = { ...rows[idx], [field]: value };
      return rows;
    });
  };

  const toggleAutorizado = (idx) => {
    setPresRows((prev) =>
      prev.map((r, i) =>
        i === idx ? { ...r, autorizado: !r.autorizado } : r
      )
    );
  };

  const removePresRow = (idx) =>
    setPresRows((prev) => prev.filter((_, i) => i !== idx));

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
        manual: true,
      },
    ]);

    setNewPresLine({
      cant: "",concepto: "",refaccion: "",tipo: "",marca: "",
      proveedor: "",codigo: "",precioCompra: "",moneda: "MN",
      tipoCambio: "",tiempoEntrega: "",horasMO: "",precioVenta: "",
      observInt: "",autorizado: false,
    });
  };

  // ===== ENVIAR A VENTA — corazón del nuevo flujo =====
  const handleEnviarAVenta = async () => {
    const autorizadas = presRows.filter((r) => r.autorizado);

    if (autorizadas.length === 0) {
      alert("Marca al menos una partida como autorizada para enviar a Venta al Cliente.");
      return;
    }

    const nuevasVentas = autorizadas.map((r) => ({
      cant: r.cant,
      concepto: r.concepto || r.refaccion || "",
      precioVenta: 0,
      observaciones: "",
      codigoServicio: "",
      descripcionServicio: "",
      codigoSat: "",
      descripcionSat: "",
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
            `${autorizadas.length} partida(s) enviada(s) a Venta al Cliente.\n` +
            `✅ ${inv.autoSurtidas} partida(s) cubiertas desde inventario. La orden avanzó a Reparación en Curso.`
          );
        } else if (inv.autoSurtidas > 0) {
          alert(
            `${autorizadas.length} partida(s) enviada(s) a Venta al Cliente.\n` +
            `✅ ${inv.autoSurtidas} cubiertas desde inventario. ⏳ ${inv.pendientesSurtir} pendiente(s) de surtir manualmente.`
          );
        } else {
          alert(`${autorizadas.length} partida(s) enviada(s) a Venta al Cliente. Pendientes de surtir.`);
        }
      } else {
        alert(`${autorizadas.length} partida(s) enviada(s) a Venta al Cliente.`);
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
    setVentaRows((prev) => prev.filter((_, i) => i !== idx));

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
      openPresupuestoPdf(orden._id);
    } catch (err) {
      console.error(err);
      alert("Error al preparar el PDF.");
    }
  };

  const handleGuardarOrdenServicio = async () => {
    try {
      const res = await savePresupuestoVenta(
        orden._id,
        buildPayload({ estadoOrden: "REPARACION_EN_CURSO" })
      );
      if (onSaved) onSaved(res.data.vehiculo);
      if (onGoPreparacion) onGoPreparacion();
    } catch (err) {
      console.error(err);
      alert("Error al guardar la orden de servicio.");
    }
  };

  const handleImprimirVentaCliente = async () => {
    try {
      const res = await savePresupuestoVenta(orden._id, buildPayload());
      if (onSaved) onSaved(res.data.vehiculo);
      openVentaClientePdf(orden._id);
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

              {presRows.map((r, idx) => (
                <tr key={idx} className={r.autorizado ? "table-success" : ""}>
                  {/* Checkbox autorizado */}
                  <td className="text-center">
                    <input
                      type="checkbox"
                      checked={!!r.autorizado}
                      onChange={() => toggleAutorizado(idx)}
                      title="Marcar como autorizado por el cliente"
                    />
                  </td>

                  <td className="text-center">{r.cant}</td>
                  <td>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={r.concepto || ""}
                      onChange={(e) => handleUpdatePres(idx, "concepto", e.target.value)}
                    />
                  </td>
                  <td>{r.refaccion}</td>
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
                      onChange={(e) =>
                        handleUpdatePres(idx, "observInt", e.target.value)
                      }
                    />
                  </td>

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

              {/* Fila de captura manual */}
              <tr className="table-info">
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
                  <select
                    className="form-select form-select-sm"
                    value={newPresLine.tipo}
                    onChange={(e) =>
                      setNewPresLine({ ...newPresLine, tipo: e.target.value })
                    }
                  >
                    <option value="">Sel...</option>
                    <option value="Original">Original</option>
                    <option value="Alterna">Alterna</option>
                  </select>
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
                  <select
                    className="form-select form-select-sm"
                    value={newPresLine.moneda || "MN"}
                    onChange={(e) =>
                      setNewPresLine({ ...newPresLine, moneda: e.target.value })
                    }
                  >
                    <option value="MN">MN</option>
                    <option value="USD">USD</option>
                  </select>
                </td>
                <td>
                  {(newPresLine.moneda || "MN") === "USD" ? (
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      value={newPresLine.tipoCambio || ""}
                      onChange={(e) =>
                        setNewPresLine({ ...newPresLine, tipoCambio: e.target.value })
                      }
                    />
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
              </tr>
            </tbody>

            <tfoot className="table-light">
              <tr>
                <td colSpan={14} className="text-end fw-bold text-uppercase">
                  Total Presupuesto:
                </td>
                <td className="text-end fw-bold text-white bg-primary" style={{ fontSize: "1.1rem" }}>
                  {formatMoney(totalPresupuesto)}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Botones Presupuesto */}
        <div className="d-flex justify-content-end gap-2 mb-4">
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={handleRegresarRefaccionaria}
          >
            Regresar a Refaccionaria
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={handleImprimir}
          >
            Imprimir
          </button>
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
        <div className="mb-2" style={{ overflow: "visible" }}>
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
        </div>

        {/* Lista venta al cliente */}
        <div className="table-responsive mb-3">
          <table className="table table-bordered table-sm align-middle">
            <thead className="table-light text-center">
              <tr>
                <th style={{ width: 70 }}>Cantidad</th>
                <th>Concepto, Servicio y/o Reparación</th>
                <th style={{ width: 160 }}>Precio Venta (Sin IVA)</th>
                <th>Observaciones</th>
                <th style={{ width: 80 }}>Acción</th>
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
                  <td className="text-center">
                    <input
                      type="number"
                      className="form-control form-control-sm text-center"
                      value={r.cant ?? ""}
                      onChange={(e) => handleUpdateVentaRow(idx, "cant", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={r.concepto ?? ""}
                      onChange={(e) => handleUpdateVentaRow(idx, "concepto", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control form-control-sm text-end"
                      value={r.precioVenta ?? ""}
                      onChange={(e) => handleUpdateVentaRow(idx, "precioVenta", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={r.observaciones || ""}
                      onChange={(e) => handleUpdateVentaRow(idx, "observaciones", e.target.value)}
                    />
                  </td>
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
                <td colSpan={2} className="text-end fw-bold">Total:</td>
                <td className="text-end fw-bold">{formatMoney(totalVentaCliente)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Botones Venta al Cliente */}
        <div className="d-flex justify-content-end gap-2 mb-4">
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={handleImprimirVentaCliente}
            disabled={ventaRows.length === 0}
          >
            Imprimir Venta Cliente
          </button>
        </div>

        {/* ===== MANO DE OBRA (solo lectura) ===== */}
        <h5 className="text-center mb-2 fw-bold">MANO DE OBRA</h5>

        <div className="table-responsive mb-4">
          <table className="table table-bordered table-sm align-middle">
            <thead className="table-light text-center">
              <tr>
                <th>Reparación y/o Servicio</th>
                <th>Mecánico / Carrocero</th>
                <th>Horas</th>
                <th>Fecha de Pago</th>
                <th>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {moRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted">
                    No hay registros de mano de obra.
                  </td>
                </tr>
              ) : (
                moRows.map((m, idx) => (
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

        <p className="mt-2 text-muted" style={{ fontSize: 12 }}>
          * Marca las partidas autorizadas por el cliente (✓) y usa "Enviar a Venta" para pasarlas a Venta al Cliente.
        </p>
      </div>
    </div>
  );
}