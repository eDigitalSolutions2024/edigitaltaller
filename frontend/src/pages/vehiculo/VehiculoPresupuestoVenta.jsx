// src/pages/vehiculo/VehiculoPresupuestoVenta.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  savePresupuestoVenta,
  openPresupuestoPdf,
  openVentaClientePdf
} from "../../api/vehiculos";
import { fetchServiciosTaller } from "../../api/codigos";


export default function VehiculoPresupuestoVenta({ orden, onSaved }) {
  const navigate = useNavigate();

  // Datos de encabezado
  const [dirigidoA, setDirigidoA] = useState("");
  const [departamento, setDepartamento] = useState("");
  const [observCotizacion, setObservCotizacion] = useState("");

  const serviciosDropdownRef = useRef(null);

  //Datos para dropdown de servicios (en mano de obra)
  const [requiereFactura, setRequiereFactura] = useState(false);
  const [serviciosTaller, setServiciosTaller] = useState([]);
  const [servicioSearch, setServicioSearch] = useState("");
  const [showServiciosDropdown, setShowServiciosDropdown] = useState(false);



  // ===== PRESUPUESTO =====
  const [presRows, setPresRows] = useState([]);

  // ===== VENTA AL CLIENTE =====
  const [ventaRows, setVentaRows] = useState([]);
  const [ventaLine, setVentaLine] = useState({
    cant: "",
    concepto: "",
    precioVenta: "",
    observaciones: "",
    autorizacionCliente: "SI",
    codigoServicio: "",
    descripcionServicio: "",
    codigoSat: "",
    descripcionSat: "",
  });


  const [newPresLine, setNewPresLine] = useState({
    cant: "",
    concepto: "",
    refaccion: "",
    tipo: "",
    marca: "",
    proveedor: "",
    codigo: "",
    precioCompra: "",
    tiempoEntrega: "",
    horasMO: "",
    precioVenta: "",
    observInt: "",
    estatusCotizacion: "COTIZADA",
    estatusCliente: "COTIZADA",
  });

  const [editingCell, setEditingCell] = useState({ row: null, field: null });

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
    setDirigidoA(orden.dirigidoA || "");
    setDepartamento(orden.departamento || "");
    setObservCotizacion(orden.observCotizacion || "");

    setRequiereFactura(!!orden.requiereFactura);

    // 1) Presupuesto desde la orden (o lo construimos desde refacciones aprobadas)
    if (Array.isArray(orden.presupuesto) && orden.presupuesto.length > 0) {
    setPresRows(
      orden.presupuesto.map((p) => ({
        ...p,
        estatusCotizacion: p.estatusCotizacion || "COTIZADA",
        estatusCliente: p.estatusCliente || "COTIZADA",
      }))
    );
  } else {
      const refSolicitadas = orden.refaccionesSolicitadas || [];

      const refParaPresupuesto = refSolicitadas.filter(
        (r) =>
          (r.estatus || "PENDIENTE") === "APROBADA" &&
          r.opcionSeleccionada !== null &&
          r.opcionSeleccionada !== undefined &&
          Number(r.precioUnitario || 0) > 0
      );


      const mappedPres = refParaPresupuesto.map((r) => {
        const cant = Number(r.cant || 0);
        const precioUnitario = Number(r.precioUnitario || 0);
        const importeTotal = Number(r.importeTotal || 0);
        const moneda = r.moneda || "MN";
        const tipoCambio = moneda === "USD" ? Number(r.tipoCambio || 0) : 0;

        const precioCompraMXN =
          moneda === "USD"
            ? importeTotal / (cant || 1)
            : precioUnitario;

        return {
          cant,
          concepto: r.concepto || r.refaccion || r.descripcion || "",
          refaccion: r.refaccion || "",
          tipo: r.tipo || "",
          marca: r.marca || "",
          proveedor: r.proveedor || "",
          codigo: r.codigo || "",
          precioOriginal: precioUnitario,
          moneda,
          tipoCambio,
          precioCompra: precioCompraMXN,
          tiempoEntrega: r.tiempoEntrega ?? "",
          horasMO: 0,
          precioVenta: precioCompraMXN,
          observInt: r.observaciones ?? "",
          estatusCotizacion: r.estatusCotizacion || "COTIZADA",
          estatusCliente: r.estatusCliente || "COTIZADA",
        };
      });




      setPresRows(mappedPres);
    }

    // Venta al cliente ya guardada
    setVentaRows(
      (orden.ventaCliente || []).map((v) => ({
        ...v,
        autorizacionCliente: v.autorizacionCliente || "SI",
      }))
    );


    // Mano de obra ya guardada
    setMoRows(orden.manoObra || []);

    // Observaciones finales ya guardadas
    setObsExternas(orden.observacionesExternas || "");
    setObsInternas(orden.observacionesInternas || "");
  }, [orden]);

  useEffect(() => {
    const cargarServicios = async () => {
      try {
        const data = await fetchServiciosTaller();
        setServiciosTaller(data);
      } catch (err) {
        console.error("Error cargando servicios SAT:", err);
        setServiciosTaller([]);
      }
    };

    cargarServicios();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        serviciosDropdownRef.current &&
        !serviciosDropdownRef.current.contains(event.target)
      ) {
        setShowServiciosDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);


  const serviciosFiltrados = useMemo(() => {
    const q = servicioSearch.trim().toLowerCase();

    if (!q) return serviciosTaller;

    return serviciosTaller.filter((s) =>
      [
        s.codigo,
        s.descripcion,
        s.codigoSat,
        s.descripcionSat,
        s.label,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [serviciosTaller, servicioSearch]);

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

  {/*const handleServicioVentaChange = (e) => {
    const codigoServicio = e.target.value;
    const servicio = serviciosTaller.find((s) => s.codigo === codigoServicio);

    if (!servicio) {
      setVentaLine((prev) => ({
        ...prev,
        concepto: "",
        codigoServicio: "",
        descripcionServicio: "",
        codigoSat: "",
        descripcionSat: "",
      }));
      return;
    }

    setVentaLine((prev) => ({
      ...prev,
      concepto: servicio.descripcion || "",
      codigoServicio: servicio.codigo || "",
      descripcionServicio: servicio.descripcion || "",
      codigoSat: servicio.codigoSat || "",
      descripcionSat: servicio.descripcionSat || "",
    }));
  };*/}
  
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

    if (requiereFactura && !ventaLine.codigoServicio) {
      alert("Selecciona un servicio de BD Códigos para facturación.");
      return;
    }

    setVentaRows((prev) => [
      ...prev,
      {
        ...ventaLine,
        cant,
        precioVenta: Number(ventaLine.precioVenta || 0),
      },
    ]);

    setVentaLine({
      cant: "",
      concepto: "",
      precioVenta: "",
      observaciones: "",
      autorizacionCliente: "SI",
      codigoServicio: "",
      descripcionServicio: "",
      codigoSat: "",
      descripcionSat: "",
    });
    setServicioSearch("");
    setShowServiciosDropdown(false);
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
  const handleGuardarPresupuesto = async () => {
    try {
      const payload = {
        presupuesto: presRows,
        ventaCliente: ventaRows,
        manoObra: moRows,
        observacionesExternas: obsExternas,
        observacionesInternas: obsInternas,
        dirigidoA,
        departamento,
        observCotizacion,
        requiereFactura,
        manoObra: moRows,
      };

      const res = await savePresupuestoVenta(orden._id, payload);
      const vAct = res.data.vehiculo;

      if (onSaved) onSaved(vAct);
      console.log("Historial cotizaciones:", vAct.historialCotizaciones);


      alert("Presupuesto guardado correctamente.");
    } catch (err) {
      console.error(err);
      alert("Error al guardar el presupuesto.");
    }
  };


  const handleEnviar = async (crearNuevaVersionCotizacion = false) => {
    try {
      const payload = {
        presupuesto: presRows,
        ventaCliente: ventaRows,
        observacionesExternas: obsExternas,
        observacionesInternas: obsInternas,
        dirigidoA,
        departamento,
        observCotizacion,
        requiereFactura,
        accionCotizacion: "ENVIAR_COTIZACION",
        crearNuevaVersionCotizacion: Boolean(crearNuevaVersionCotizacion),
      };

      const res = await savePresupuestoVenta(orden._id, payload);
      const vAct = res.data.vehiculo;

      if (onSaved) onSaved(vAct);

      console.log("Historial cotizaciones:", vAct.historialCotizaciones);
      alert("Cotización enviada y guardada en historial.");
    } catch (err) {
      if (err.response?.status === 409) {
        const msg =
          err.response?.data?.msg ||
          "Ya existe una cotización activa para esta orden.";

        const confirmar = window.confirm(
          `${msg}\n\n¿Deseas crear una nueva versión de cotización?`
        );

        if (confirmar) {
          return handleEnviar(true);
        }

        return;
      }

      console.error("Error handleEnviar:", err.response?.data || err);
      alert(
        err.response?.data?.msg ||
          err.response?.data?.message ||
          "Error al guardar Venta al Cliente."
      );
    }
  };

  const handleGuardarHistorialVentaCliente = async (
    crearNuevaVersionVentaCliente = false
  ) => {
    try {
      const { autorizadas, noAutorizadas } = separarVentasPorAutorizacion();
      const payload = {
        presupuesto: presRows,
        ventaCliente: autorizadas,
        historialVentaPartidas: noAutorizadas,
        manoObra: moRows,
        observacionesExternas: obsExternas,
        observacionesInternas: obsInternas,
        dirigidoA,
        departamento,
        observCotizacion,
        requiereFactura,
        accionVentaCliente: "GUARDAR_HISTORIAL_VENTA",
        crearNuevaVersionVentaCliente: Boolean(crearNuevaVersionVentaCliente),
      };


      const res = await savePresupuestoVenta(orden._id, payload);
      const vAct = res.data.vehiculo;

      if (onSaved) onSaved(vAct);
      setVentaRows(vAct.ventaCliente || autorizadas);

      console.log("Historial venta cliente:", vAct.historialVentaCliente);
      alert("Historial de venta al cliente guardado correctamente.");
    } catch (err) {
      if (err.response?.status === 409) {
        const msg =
          err.response?.data?.msg ||
          "Ya existe un historial de venta activo para esta orden.";

        const confirmar = window.confirm(
          `${msg}\n\n¿Deseas crear una nueva versión de venta al cliente?`
        );

        if (confirmar) {
          return handleGuardarHistorialVentaCliente(true);
        }

        return;
      }

      console.error("Error historial venta cliente:", err.response?.data || err);
      alert(
        err.response?.data?.msg ||
          err.response?.data?.message ||
          "Error al guardar historial de venta al cliente."
      );
    }
  };

  const separarVentasPorAutorizacion = () => {
    const autorizadas = ventaRows.filter(
      (v) => (v.autorizacionCliente || "SI") !== "NO"
    );

    const noAutorizadas = ventaRows.filter(
      (v) => (v.autorizacionCliente || "SI") === "NO"
    );

    return { autorizadas, noAutorizadas };
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
        autorizacionCliente: "SI",
      }));

      setVentaRows(nuevasVentas);

      const payload = {
        presupuesto: presRows,
        ventaCliente: nuevasVentas,
        requiereFactura,
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
        dirigidoA,
        departamento,
        observCotizacion,
        requiereFactura,
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

  const handleRegresarRefaccionaria = async () => {
    const confirmar = window.confirm(
      "¿Deseas regresar esta orden a refaccionaria para revisión?"
    );

    if (!confirmar) return;

    try {
      const payload = {
        presupuesto: presRows,
        ventaCliente: ventaRows,
        manoObra: moRows,
        observacionesExternas: obsExternas,
        observacionesInternas: obsInternas,
        dirigidoA,
        departamento,
        observCotizacion,
        estadoOrden: "PENDIENTE_REFACCIONARIA",
        requiereFactura,
      };

      const res = await savePresupuestoVenta(orden._id, payload);
      const vAct = res.data.vehiculo;

      if (onSaved) onSaved(vAct);

      alert("Orden regresada a refaccionaria correctamente.");
      navigate("/vehiculo/consulta-ordenes");
    } catch (err) {
      console.error(err);
      alert("Error al regresar la orden a refaccionaria.");
    }
  };


  const handleImprimir = async () => {
    try {
      const payload = {
        presupuesto: presRows,
        ventaCliente: ventaRows,
        manoObra: moRows,
        observacionesExternas: obsExternas,
        observacionesInternas: obsInternas,
        dirigidoA,
        departamento,
        observCotizacion,
        requiereFactura,
      };

      const res = await savePresupuestoVenta(orden._id, payload);

      if (onSaved) {
        onSaved(res.data.vehiculo);
      }

      openPresupuestoPdf(orden._id);
    } catch (err) {
      console.error("Error al imprimir:", err);
      alert("Error al preparar el PDF");
    }
  };

  const handleUpdatePres = (idx, field, value) => {
  const newRows = [...presRows];
  newRows[idx][field] = value;

  if (field === "precioCompra" && !newRows[idx].precioVenta) {
    newRows[idx].precioVenta = value;
  }

  setPresRows(newRows);
};

const handleEditPresClick = (idx) => {
  setEditingCell({ row: idx, field: "presupuesto" });
};

const handleSavePresEdit = () => {
  setEditingCell({ row: null, field: null });
};

const addManualPresRow = () => {
  if (!newPresLine.concepto.trim()) {
    alert("Por favor, ingresa al menos el concepto.");
    return;
  }

  const cant = Number(newPresLine.cant) || 1;
  const precioCompra = Number(newPresLine.precioCompra) || 0;
  const precioVenta =
    Number(newPresLine.precioVenta) || precioCompra || 0;

  setPresRows((prev) => [
    ...prev,
    {
      cant,
      concepto: newPresLine.concepto.trim(),
      refaccion: newPresLine.refaccion || "",
      tipo: newPresLine.tipo || "",
      marca: newPresLine.marca || "",
      proveedor: newPresLine.proveedor || "",
      codigo: newPresLine.codigo || "",
      precioCompra,
      tiempoEntrega: newPresLine.tiempoEntrega || "",
      horasMO: Number(newPresLine.horasMO) || 0,
      precioVenta,
      observInt: newPresLine.observInt || "",
      estatusCotizacion: newPresLine.estatusCotizacion || "COTIZADA",
      estatusCliente: newPresLine.estatusCliente || "COTIZADA",
      manual: true,
    },
  ]);

  setNewPresLine({
    cant: "",
    concepto: "",
    refaccion: "",
    tipo: "",
    marca: "",
    proveedor: "",
    codigo: "",
    precioCompra: "",
    tiempoEntrega: "",
    horasMO: "",
    precioVenta: "",
    observInt: "",
    estatusCotizacion: "COTIZADA",
    estatusCliente: "COTIZADA",
  });
};

const handleImprimirVentaCliente = async () => {
  try {
    const payload = {
      presupuesto: presRows,
      ventaCliente: ventaRows,
      manoObra: moRows,
      observacionesExternas: obsExternas,
      observacionesInternas: obsInternas,
      dirigidoA,
      departamento,
      observCotizacion,
      requiereFactura,
    };

    const res = await savePresupuestoVenta(orden._id, payload);

    if (onSaved) {
      onSaved(res.data.vehiculo);
    }

    openVentaClientePdf(orden._id);
  } catch (err) {
    console.error("Error al imprimir venta al cliente:", err);
    alert("Error al preparar el PDF de venta al cliente.");
  }
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
                <th>Moneda</th>
                <th>Tipo Cambio</th>
                <th>Tiempo Entrega</th>
                <th>M.O. (Hrs)</th>
                <th>Precio Venta (Sin IVA)</th>
                <th className="table-secondary">Importe</th>
                <th>Estatus</th>
                <th>Obs. Internas</th>
                <th style={{ width: "100px" }}>Acción</th>
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
                const isEditingRow =
                  editingCell.row === idx && editingCell.field === "presupuesto";

                const importeFila =
                  (Number(r.cant) || 0) * (Number(r.precioVenta) || 0);

                return (
                  <tr key={idx} className={isEditingRow ? "table-warning" : ""}>
                    <td>
                      {isEditingRow ? (
                        <input
                          type="number"
                          className="form-control form-control-sm"
                          value={r.cant}
                          onChange={(e) =>
                            handleUpdatePres(idx, "cant", e.target.value)
                          }
                        />
                      ) : (
                        r.cant
                      )}
                    </td>

                    <td>
                      {isEditingRow ? (
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          value={r.concepto}
                          onChange={(e) =>
                            handleUpdatePres(idx, "concepto", e.target.value)
                          }
                        />
                      ) : (
                        r.concepto
                      )}
                    </td>

                    <td>
                      {isEditingRow ? (
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          value={r.refaccion}
                          onChange={(e) =>
                            handleUpdatePres(idx, "refaccion", e.target.value)
                          }
                        />
                      ) : (
                        r.refaccion
                      )}
                    </td>

                    <td>
                      {isEditingRow ? (
                        <select
                          className="form-select form-select-sm"
                          value={r.tipo}
                          onChange={(e) =>
                            handleUpdatePres(idx, "tipo", e.target.value)
                          }
                        >
                          <option value="">Selec...</option>
                          <option value="Original">Original</option>
                          <option value="Alterna">Alterna</option>
                        </select>
                      ) : (
                        r.tipo
                      )}
                    </td>

                    <td>
                      {isEditingRow ? (
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          value={r.marca}
                          onChange={(e) =>
                            handleUpdatePres(idx, "marca", e.target.value)
                          }
                        />
                      ) : (
                        r.marca
                      )}
                    </td>

                    <td>
                      {isEditingRow ? (
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          value={r.proveedor}
                          onChange={(e) =>
                            handleUpdatePres(idx, "proveedor", e.target.value)
                          }
                        />
                      ) : (
                        r.proveedor
                      )}
                    </td>

                    <td>
                      {isEditingRow ? (
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          value={r.codigo}
                          onChange={(e) =>
                            handleUpdatePres(idx, "codigo", e.target.value)
                          }
                        />
                      ) : (
                        r.codigo
                      )}
                    </td>

                    <td className="text-end">
                      {isEditingRow ? (
                        <input
                          type="number"
                          className="form-control form-control-sm"
                          value={r.precioCompra}
                          onChange={(e) =>
                            handleUpdatePres(idx, "precioCompra", e.target.value)
                          }
                        />
                      ) : (
                        formatMoney(r.precioCompra)
                      )}
                    </td>

                    <td className="text-center">
                      {r.moneda || "MN"}
                    </td>

                    <td className="text-end">
                      {(r.moneda || "MN") === "USD"
                        ? Number(r.tipoCambio || 0).toFixed(4)
                        : "-"}
                    </td>


                    <td>
                      {isEditingRow ? (
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          value={r.tiempoEntrega}
                          onChange={(e) =>
                            handleUpdatePres(idx, "tiempoEntrega", e.target.value)
                          }
                        />
                      ) : (
                        r.tiempoEntrega
                      )}
                    </td>

                    <td>
                      {isEditingRow ? (
                        <input
                          type="number"
                          className="form-control form-control-sm"
                          value={r.horasMO}
                          onChange={(e) =>
                            handleUpdatePres(idx, "horasMO", e.target.value)
                          }
                        />
                      ) : (
                        r.horasMO
                      )}
                    </td>

                    <td className="text-end">
                      {isEditingRow ? (
                        <input
                          type="number"
                          className="form-control form-control-sm"
                          value={r.precioVenta}
                          onChange={(e) =>
                            handleUpdatePres(idx, "precioVenta", e.target.value)
                          }
                        />
                      ) : (
                        formatMoney(r.precioVenta)
                      )}
                    </td>

                    <td className="text-end fw-bold bg-light">
                      {formatMoney(importeFila)}
                    </td>

                    <td>
                      <select
                        className="form-select form-select-sm"
                        value={r.estatusCotizacion || "COTIZADA"}
                        onChange={(e) =>
                          handleUpdatePres(idx, "estatusCotizacion", e.target.value)
                        }
                      >
                        <option value="COTIZADA">Cotizada</option>
                        <option value="PENDIENTE_CLIENTE">Pendiente cliente</option>
                        <option value="AUTORIZADA">Autorizada</option>
                        <option value="RECHAZADA">Rechazada</option>
                      </select>
                    </td>


                    <td>
                      {isEditingRow ? (
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          value={r.observInt}
                          onChange={(e) =>
                            handleUpdatePres(idx, "observInt", e.target.value)
                          }
                        />
                      ) : (
                        r.observInt
                      )}
                    </td>

                    <td className="text-center">
                      {isEditingRow ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-success w-100"
                          onClick={handleSavePresEdit}
                        >
                          Listo
                        </button>
                      ) : (
                        <div className="btn-group-vertical w-100">
                          {/*<button
                            type="button"
                            className="btn btn-warning"
                            onClick={() => handleEditPresClick(idx)}
                          >
                            Editar
                          </button>*/}
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => removePresRow(idx)}
                          >
                            Borrar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              <tr className="table-info">
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
                    <option value="">Selec...</option>
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
                    value={newPresLine.codigo}
                    onChange={(e) =>
                      setNewPresLine({ ...newPresLine, codigo: e.target.value })
                    }
                  />
                </td>

                <td>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    value={newPresLine.precioCompra}
                    onChange={(e) =>
                      setNewPresLine({
                        ...newPresLine,
                        precioCompra: e.target.value,
                      })
                    }
                  />
                </td>

                <td>
                  <select
                    className="form-select form-select-sm"
                    value={newPresLine.moneda || "MN"}
                    onChange={(e) =>
                      setNewPresLine({
                        ...newPresLine,
                        moneda: e.target.value,
                        tipoCambio: e.target.value === "USD" ? newPresLine.tipoCambio : "",
                      })
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
                      min="0"
                      step="0.0001"
                      className="form-control form-control-sm"
                      value={newPresLine.tipoCambio || ""}
                      onChange={(e) =>
                        setNewPresLine({
                          ...newPresLine,
                          tipoCambio: e.target.value,
                        })
                      }
                    />
                  ) : (
                    <span className="text-muted">-</span>
                  )}
                </td>


                <td>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    value={newPresLine.tiempoEntrega}
                    onChange={(e) =>
                      setNewPresLine({
                        ...newPresLine,
                        tiempoEntrega: e.target.value,
                      })
                    }
                  />
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
                  <select
                    className="form-select form-select-sm"
                    value={newPresLine.estatusCotizacion || "COTIZADA"}
                    onChange={(e) =>
                      setNewPresLine({
                        ...newPresLine,
                        estatusCotizacion: e.target.value,
                      })
                    }
                  >
                    <option value="COTIZADA">Cotizada</option>
                    <option value="PENDIENTE_CLIENTE">Pendiente cliente</option>
                    <option value="AUTORIZADA">Autorizada</option>
                    <option value="RECHAZADA">Rechazada</option>
                  </select>
                </td>


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
                <td colSpan={13} className="text-end fw-bold text-uppercase">
                  Total Presupuesto:
                </td>
                <td
                  className="text-end fw-bold text-white bg-primary"
                  style={{ fontSize: "1.1rem" }}
                >
                  {formatMoney(totalPresupuesto)}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Botones estilo sistema viejo */}
        <div className="d-flex justify-content-end gap-2 mb-4">
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
            onClick={() => handleEnviar(false)}
          >
            Enviar
          </button>
          {/*<button
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
          </button>*/}
        </div>

        {/* =================== VENTA AL CLIENTE =================== */}
        <h5 className="text-center mb-2 fw-bold">
          VENTA AL CLIENTE (CIERRE DE ORDEN)
        </h5>

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
              Para cambiar si requiere factura, elimina primero las partidas de venta capturadas.
            </div>
          )}

        </div>


        {/* Línea de captura venta cliente */}
        <div className="mb-2" style={{ overflow: "visible" }}>
          <table
            className="table table-bordered table-sm align-middle mb-0"
            style={{ overflow: "visible" }}
          >

            <thead className="table-light text-center">
              <tr>
                <th>Cantidad</th>
                {requiereFactura && <th>Servicio</th>}
                <th>Concepto, Servicio y/o Reparación</th>
                <th>Precio Venta (Sin IVA)</th>
                <th>Autorización Cliente</th>
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

                {requiereFactura && (
                  <td ref={serviciosDropdownRef} style={{ minWidth: "520px", position: "relative" }}>
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
                          top: "31px",
                          left: 0,
                          right: 0,
                          maxHeight: "170px",
                          overflowY: "auto",
                          fontSize: "12px",
                        }}
                      >

                        {serviciosFiltrados.length === 0 && (
                          <div className="px-2 py-2 text-muted">
                            No hay servicios encontrados.
                          </div>
                        )}

                        {serviciosFiltrados.map((srv) => (
                          <button
                            key={srv._id}
                            type="button"
                            className="btn btn-link w-100 text-decoration-none px-2 py-2"
                            style={{
                              fontSize: "12px",
                              lineHeight: "1.25",
                              textAlign: "left",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = "#f1f5f9";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "transparent";
                            }}
                            onClick={() => seleccionarServicioVenta(srv)}
                          >

                            <div className="d-flex gap-3 align-items-start">
                              <div style={{ flex: "1 1 50%", minWidth: 0 }}>
                                <div className="fw-semibold text-primary">
                                  {srv.codigo} - {srv.descripcion}
                                </div>
                              </div>

                              <div style={{ flex: "1 1 50%", minWidth: 0 }}>
                                <div className="text-muted">
                                  SAT: {srv.codigoSat || "-"} - {srv.descripcionSat || "-"}
                                </div>
                              </div>
                            </div>
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

                <td style={{ width: "150px" }}>
                  <select
                    className="form-select form-select-sm"
                    name="autorizacionCliente"
                    value={ventaLine.autorizacionCliente || "SI"}
                    onChange={handleVentaLineChange}
                  >
                    <option value="SI">SI</option>
                    <option value="NO">NO</option>
                    <option value="PENDIENTE">Pendiente</option>
                  </select>
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
                <th>Autorización Cliente</th>
                <th>Observaciones</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {ventaRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-muted">
                    No hay partidas de venta al cliente.
                  </td>
                </tr>
              )}

              {ventaRows.map((r, idx) => (
                <tr key={idx}>
                  <td className="text-center">{r.cant}</td>
                  <td>{r.concepto}</td>
                  <td className="text-end">{formatMoney(r.precioVenta)}</td>
                  <td style={{ width: "150px" }}>
                    <select
                      className="form-select form-select-sm"
                      value={r.autorizacionCliente || "SI"}
                      onChange={(e) =>
                        setVentaRows((prev) =>
                          prev.map((item, i) =>
                            i === idx
                              ? { ...item, autorizacionCliente: e.target.value }
                              : item
                          )
                        )
                      }
                    >
                      <option value="SI">SI</option>
                      <option value="NO">NO</option>
                      <option value="PENDIENTE">Pendiente</option>
                    </select>
                  </td>

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
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="d-flex justify-content-end mb-4">

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => handleGuardarHistorialVentaCliente(false)}
            disabled={ventaRows.length === 0}
          >
            Guardar autorización cliente
          </button>


          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={handleImprimirVentaCliente}
            disabled={ventaRows.length === 0}
          >
            Imprimir Venta Cliente
          </button>
        </div>


        {/* =================== MANO DE OBRA =================== */}
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
              </tr>
            </thead>

            <tbody>
              {moRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-muted">
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
