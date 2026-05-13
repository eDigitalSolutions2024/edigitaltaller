// src/pages/vehiculo/ServicioReparacionTab.jsx
import React, { useEffect, useState } from "react";
import { updateServicioReparacion, saveRequisicionDiagnostico } from "../../api/vehiculos";
import { fetchServiciosTaller } from "../../api/codigos";

const emptyServicio = {
  serviciosSeleccionados: [],
  infoLlantas: "",
  revisionFallas: "",

  mantenimientoMotor: {
    afinacion: false,
    limpiezaInyectores: false,
    limpiezaCuerpoAceleracion: false,
    lubricacion: false,
    cambioAceite: false,
    engrase: false,
    revisionNivelesFluidos: false,
    lubricacionBisagras: false,
    lubricarSuspensionDireccion: false,
    revisionCarretera: false,
    diagnosticoCompra: false,
    otrosServicios: false,
    alineacionComputadora: false,
    balanceo4Ruedas: false,
    reemplazoBalatas4Ruedas: false,
    recargaGasAC: false,
    servicioCoolingTermostato: false,
  },

  fallasReportadasCliente: "",

  sintomas: {
    noEnciende: false,
    tardaEncenderFrio: false,
    tardaEncenderCaliente: false,
    cascabelea: false,
    motorTembloroso: false,
    faltaPotencia: false,
    hechaHumo: false,
    humoColor: "",
  },

  indicadoresTableroServicio: {
    checkEngine: false,
    abs: false,
    airBag: false,
    frenos: false,
    aceite: false,
    alternador: false,
    otros: "",
  },

  fallasMotorOtros: "",
  precioFallasMotorOtros: 0,

  sistemaElectricoAire: "",
  precioSistemaElectricoAire: 0,

  suspensionDireccionFrenos: "",
  precioSuspensionDireccionFrenos: 0,

  sistemaEnfriamiento: "",
  precioSistemaEnfriamiento: 0,
};

export default function ServicioReparacionTab({ ordenId, initialData, onSaved }) {
  const [form, setForm] = useState(emptyServicio);
  const [saving, setSaving] = useState(false);
  const [catalogoServicios, setCatalogoServicios] = useState([]);
  const [cargandoServicios, setCargandoServicios] = useState(false);
  const [showRefaccionesModal, setShowRefaccionesModal] = useState(false); 
  const [refaccionesSolicitud, setRefaccionesSolicitud] = useState([
    { refaccion: "", cantidad: 1, precio: 0 },
  ]);
  const [guardandoRefacciones, setGuardandoRefacciones] = useState(false);


  useEffect(() => {
    if (initialData) {
      setForm({
        ...emptyServicio,
        ...initialData,
        mantenimientoMotor: {
          ...emptyServicio.mantenimientoMotor,
          ...(initialData.mantenimientoMotor || {}),
        },
        sintomas: {
          ...emptyServicio.sintomas,
          ...(initialData.sintomas || {}),
        },
        indicadoresTableroServicio: {
          ...emptyServicio.indicadoresTableroServicio,
          ...(initialData.indicadoresTableroServicio || {}),
        },
        serviciosSeleccionados: initialData.serviciosSeleccionados || [],
      });
    }
  }, [initialData]);

  useEffect(() => {
    const cargarServicios = async () => {
      try {
        setCargandoServicios(true);
        const servicios = await fetchServiciosTaller();
        setCatalogoServicios(servicios);
      } catch (err) {
        console.error("Error cargando servicios:", err);
        setCatalogoServicios([]);
      } finally {
        setCargandoServicios(false);
      }
    };

    cargarServicios();
  }, []);

  const handleChangeText = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleNumber = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: Number(value || 0) }));
  };

  const toggleNested = (section, field) => {
    setForm((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: !prev[section]?.[field],
      },
    }));
  };

  const changeNested = (section, field, value) => {
    setForm((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }));
  };

  const toggleServicio = (codigoServicio) => {
    setForm((prev) => {
      const yaEsta = prev.serviciosSeleccionados.includes(codigoServicio);
      return {
        ...prev,
        serviciosSeleccionados: yaEsta
          ? prev.serviciosSeleccionados.filter((c) => c !== codigoServicio)
          : [...prev.serviciosSeleccionados, codigoServicio],
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!ordenId) return;

    try {
      setSaving(true);
      const res = await updateServicioReparacion(ordenId, form);
      alert("Servicio / Reparación guardado correctamente.");
      if (onSaved) onSaved(res.data.vehiculo);
    } catch (err) {
      console.error(err);
      alert("Error al guardar Servicio / Reparación");
    } finally {
      setSaving(false);
    }
  };

  const serviciosMotor = [
    ["afinacion", "Afinación"],
    ["limpiezaInyectores", "Limpieza de inyectores"],
    ["limpiezaCuerpoAceleracion", "Limpieza al cuerpo de aceleración"],
    ["lubricacion", "Lubricación"],
    ["cambioAceite", "Cambio de aceite"],
    ["engrase", "Engrase"],
    ["revisionNivelesFluidos", "Revisión de niveles de fluidos"],
    ["lubricacionBisagras", "Lubricación de bisagras"],
    ["lubricarSuspensionDireccion", "Lubricar suspensión y dirección"],
    ["revisionCarretera", "Revisión para carretera"],
    ["diagnosticoCompra", "Diagnóstico de compra"],
    ["otrosServicios", "Otros servicios"],
    ["alineacionComputadora", "Alineación por computadora"],
    ["balanceo4Ruedas", "Balanceo en las 4 ruedas"],
    ["reemplazoBalatas4Ruedas", "Reemplazo de balatas en las 4 ruedas"],
    ["recargaGasAC", "Recarga de gas A/C"],
    ["servicioCoolingTermostato", "Servicio de anticongelante y termostato"],
  ];

  const sintomas = [
    ["noEnciende", "No enciende"],
    ["tardaEncenderFrio", "Tarda para encender en frío"],
    ["tardaEncenderCaliente", "Tarda para encender en caliente"],
    ["cascabelea", "Cascabelea"],
    ["motorTembloroso", "Motor tembloroso"],
    ["faltaPotencia", "Falta potencia"],
    ["hechaHumo", "Echa humo"],
  ];

  const indicadores = [
    ["checkEngine", "Check engine"],
    ["abs", "ABS"],
    ["airBag", "Air bag"],
    ["frenos", "Frenos"],
    ["aceite", "Aceite"],
    ["alternador", "Alternador"],
  ];

  const agregarRefaccion = () => {
    setRefaccionesSolicitud((prev) => [
      ...prev,
      { refaccion: "", cantidad: 1},
    ]);
  };

  const eliminarRefaccion = (index) => {
    setRefaccionesSolicitud((prev) => prev.filter((_, i) => i !== index));
  };

  const cambiarRefaccion = (index, field, value) => {
    setRefaccionesSolicitud((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              [field]:
                field === "cantidad" || field === "precio"
                  ? Number(value || 0)
                  : value,
            }
          : item
      )
    );
  };

  const guardarSolicitudRefacciones = async () => {
    if (!ordenId) return;

    const refaccionesValidas = refaccionesSolicitud
      .filter((item) => item.refaccion.trim() && Number(item.cantidad) > 0)
      .map((item) => ({
        refaccion: item.refaccion.trim(),
        cant: Number(item.cantidad || 0),
        precioUnitario: 0,
        importeTotal: 0,
        estatus: "PENDIENTE",
        requiereOC: false,
        ocGenerada: false,
        opciones: [],
        opcionSeleccionada: null,
      }));

    if (refaccionesValidas.length === 0) {
      alert("Agrega al menos una refacción con cantidad.");
      return;
    }

    try {
      setGuardandoRefacciones(true);

      // 1. Guardar primero el diagnóstico / servicio actual
      await updateServicioReparacion(ordenId, form);

      // 2. Guardar la solicitud de refacciones
      const res = await saveRequisicionDiagnostico(ordenId, {
        refacciones: refaccionesValidas,
        estadoOrden: "PENDIENTE_REFACCIONARIA",
      });

      alert("Solicitud de refacciones enviada a refaccionaria.");

      setShowRefaccionesModal(false);
      setRefaccionesSolicitud([{ refaccion: "", cantidad: 1 }]);

      // 3. Redirigir hasta que todo quedó guardado
      if (onSaved && res?.data?.vehiculo) {
        onSaved(res.data.vehiculo);
      }
    } catch (err) {
      console.error(err);
      alert("Error al guardar y solicitar refacciones.");
    } finally {
      setGuardandoRefacciones(false);
    }
  };





  return (
    <form onSubmit={handleSubmit}>
      <div className="card">
        <div className="card-header fw-bold text-center">
          SERVICIO O REPARACIÓN
        </div>  

        <div className="card-body">
          <div className="row g-3">
            {/* Columna izquierda */}
            <div className="col-lg-4">
              <div className="border rounded p-2 h-100">
                <h6 className="fw-bold text-center bg-light py-2">
                  MANTENIMIENTO DEL MOTOR
                </h6>

                {serviciosMotor.map(([field, label]) => (
                  <label
                    key={field}
                    className="d-flex justify-content-between border-bottom py-1"
                  >
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={!!form.mantenimientoMotor[field]}
                      onChange={() => toggleNested("mantenimientoMotor", field)}
                    />
                  </label>
                ))}

                <h6 className="fw-bold text-center bg-light py-2 mt-3">
                  REVISIÓN DE FALLAS REPORTADAS
                </h6>

                {sintomas.map(([field, label]) => (
                  <label
                    key={field}
                    className="d-flex justify-content-between border-bottom py-1"
                  >
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={!!form.sintomas[field]}
                      onChange={() => toggleNested("sintomas", field)}
                    />
                  </label>
                ))}

                <div className="mt-2">
                  <label className="form-label fw-semibold">Color humo</label>
                  <select
                    className="form-select form-select-sm"
                    value={form.sintomas.humoColor}
                    onChange={(e) =>
                      changeNested("sintomas", "humoColor", e.target.value)
                    }
                  >
                    <option value="">Seleccione</option>
                    <option value="BLANCO">Blanco</option>
                    <option value="NEGRO">Negro</option>
                    <option value="AZUL">Azul</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Columna centro */}
            <div className="col-lg-4">
              <div className="border rounded p-2 h-100">
                <h6 className="fw-bold text-center bg-light py-2">
                  SERVICIOS GENERALES
                </h6>

                <div className="table-responsive mb-3">
                  <table className="table table-bordered table-sm align-middle">
                    <thead>
                      <tr>
                        <th>Servicio</th>
                        <th className="text-center">✓</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cargandoServicios && (
                        <tr>
                          <td colSpan={2}>Cargando servicios...</td>
                        </tr>
                      )}

                      {!cargandoServicios && catalogoServicios.length === 0 && (
                        <tr>
                          <td colSpan={2} className="text-muted">
                            No hay servicios dados de alta en BD de códigos.
                          </td>
                        </tr>
                      )}

                      {!cargandoServicios &&
                        catalogoServicios.map((srv) => {
                          const codigo = srv.codigo;
                          const activo =
                            form.serviciosSeleccionados.includes(codigo);
                          const descripcion = srv.descripcion || srv.label;

                          return (
                            <tr key={srv._id || codigo}>
                              <td>
                                {codigo} - {descripcion}
                              </td>
                              <td className="text-center">
                                <input
                                  type="checkbox"
                                  className="form-check-input"
                                  checked={activo}
                                  onChange={() => toggleServicio(codigo)}
                                />
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>

                <label className="form-label fw-semibold">
                  Fallas reportadas por el cliente
                </label>
                <textarea
                  className="form-control mb-3"
                  rows={5}
                  name="fallasReportadasCliente"
                  value={form.fallasReportadasCliente}
                  onChange={handleChangeText}
                />

                <label className="form-label fw-semibold">
                  Información de llantas
                </label>
                <textarea
                  className="form-control"
                  rows={4}
                  name="infoLlantas"
                  value={form.infoLlantas}
                  onChange={handleChangeText}
                />
              </div>
            </div>

            {/* Columna derecha */}
            <div className="col-lg-4">
              <div className="border rounded p-2 h-100">
                <h6 className="fw-bold text-center bg-light py-2">
                  INDICADORES DEL TABLERO
                </h6>

                {indicadores.map(([field, label]) => (
                  <label
                    key={field}
                    className="d-flex justify-content-between border-bottom py-1"
                  >
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={!!form.indicadoresTableroServicio[field]}
                      onChange={() =>
                        toggleNested("indicadoresTableroServicio", field)
                      }
                    />
                  </label>
                ))}

                <label className="form-label fw-semibold mt-2">Otros</label>
                <input
                  className="form-control form-control-sm mb-3"
                  value={form.indicadoresTableroServicio.otros}
                  onChange={(e) =>
                    changeNested(
                      "indicadoresTableroServicio",
                      "otros",
                      e.target.value
                    )
                  }
                />

                <SectionPrecio
                  title="Fallas de motor y otros"
                  textName="fallasMotorOtros"
                  priceName="precioFallasMotorOtros"
                  textValue={form.fallasMotorOtros}
                  priceValue={form.precioFallasMotorOtros}
                  onText={handleChangeText}
                  onPrice={handleNumber}
                />

                <SectionPrecio
                  title="Sistema eléctrico y aire acondicionado"
                  textName="sistemaElectricoAire"
                  priceName="precioSistemaElectricoAire"
                  textValue={form.sistemaElectricoAire}
                  priceValue={form.precioSistemaElectricoAire}
                  onText={handleChangeText}
                  onPrice={handleNumber}
                />

                <SectionPrecio
                  title="Suspensión, dirección y frenos"
                  textName="suspensionDireccionFrenos"
                  priceName="precioSuspensionDireccionFrenos"
                  textValue={form.suspensionDireccionFrenos}
                  priceValue={form.precioSuspensionDireccionFrenos}
                  onText={handleChangeText}
                  onPrice={handleNumber}
                />

                <SectionPrecio
                  title="Sistema de enfriamiento"
                  textName="sistemaEnfriamiento"
                  priceName="precioSistemaEnfriamiento"
                  textValue={form.sistemaEnfriamiento}
                  priceValue={form.precioSistemaEnfriamiento}
                  onText={handleChangeText}
                  onPrice={handleNumber}
                />
              </div>
            </div>
          </div>

          <div className="mt-3">
            <label className="form-label fw-semibold">
              Revisión / observaciones generales
            </label>
            <textarea
              className="form-control"
              rows={3}
              name="revisionFallas"
              value={form.revisionFallas}
              onChange={handleChangeText}
            />
          </div>

          <button
            type="button"
            className="btn btn-outline-primary w-100 mt-3"
            onClick={() => setShowRefaccionesModal(true)}
          >
            Solicitar refacciones
          </button>

          {showRefaccionesModal && (
            <div
              className="modal fade show"
              style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
              tabIndex="-1"
            >
              <div className="modal-dialog modal-lg modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header">
                    <h5 className="modal-title">Solicitar refacciones</h5>
                    <button
                      type="button"
                      className="btn-close"
                      onClick={() => setShowRefaccionesModal(false)}
                    />
                  </div>

                  <div className="modal-body">
                    <div className="table-responsive">
                      <table className="table table-sm table-bordered align-middle">
                        <thead>
                          <tr>
                            <th>Refacción</th>
                            <th style={{ width: "120px" }}>Cantidad</th>
                            {/*<th style={{ width: "140px" }}>Precio</th>*/}
                            <th style={{ width: "60px" }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {refaccionesSolicitud.map((item, index) => (
                            <tr key={index}>
                              <td>
                                <input
                                  className="form-control form-control-sm"
                                  value={item.refaccion}
                                  onChange={(e) =>
                                    cambiarRefaccion(index, "refaccion", e.target.value)
                                  }
                                  placeholder="Nombre de la refacción"
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min="1"
                                  className="form-control form-control-sm"
                                  value={item.cantidad}
                                  onChange={(e) =>
                                    cambiarRefaccion(index, "cantidad", e.target.value)
                                  }
                                />
                              </td>
                              {/*<td>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  className="form-control form-control-sm"
                                  value={item.precio}
                                  onChange={(e) =>
                                    cambiarRefaccion(index, "precio", e.target.value)
                                  }
                                />
                              </td>*/}
                              <td className="text-center">
                                <button
                                  type="button"
                                  className="btn btn-outline-danger btn-sm"
                                  onClick={() => eliminarRefaccion(index)}
                                  disabled={refaccionesSolicitud.length === 1}
                                >
                                  ×
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={agregarRefaccion}
                    >
                      Agregar refacción
                    </button>
                  </div>

                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setShowRefaccionesModal(false)}
                      disabled={guardandoRefacciones}
                    >
                      Cancelar
                    </button>

                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={guardarSolicitudRefacciones}
                      disabled={guardandoRefacciones}
                    >
                      {guardandoRefacciones ? "Guardando..." : "Guardar solicitud"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}


          <div className="text-center mt-4">
            <button
              type="submit"
              className="btn btn-primary px-5"
              disabled={saving}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>

            
          </div>
        </div>
      </div>
    </form>
  );
}

function SectionPrecio({
  title,
  textName,
  priceName,
  textValue,
  priceValue,
  onText,
  onPrice,
}) {
  return (
    <div className="border rounded p-2 mb-2">
      <label className="form-label fw-semibold">{title}</label>
      <textarea
        className="form-control form-control-sm mb-2"
        rows={2}
        name={textName}
        value={textValue}
        onChange={onText}
      />
      <div className="input-group input-group-sm">
        <span className="input-group-text">Precio $</span>
        <input
          type="number"
          min="0"
          step="0.01"
          className="form-control"
          name={priceName}
          value={priceValue}
          onChange={onPrice}
        />
      </div>
    </div>
  );
}