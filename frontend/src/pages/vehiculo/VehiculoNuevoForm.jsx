// src/pages/vehiculo/VehiculoNuevoForm.jsx
import React, { useEffect, useState } from "react";
import { createVehiculo } from "../../api/vehiculos";

// 🔹 Helper para generar el folio igual que en el backend
function generateOrdenServicio() {
  const ahora = new Date();
  const yyyy = ahora.getFullYear();
  const mm = String(ahora.getMonth() + 1).padStart(2, "0");
  const dd = String(ahora.getDate()).padStart(2, "0");
  const hh = String(ahora.getHours()).padStart(2, "0");
  const mi = String(ahora.getMinutes()).padStart(2, "0");
  const ss = String(ahora.getSeconds()).padStart(2, "0");
  return `OS-${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

export default function VehiculoNuevoForm({
  cliente,
  initialData,
  readOnly = false,
}) {
  const [form, setForm] = useState({
    // ----- Datos de orden / cabecera -----
    ordenServicio: "", // se llenará automático al montar
    fechaRecepcion: "",
    horaRecepcion: "",

    // ----- Datos cliente PARTICULAR -----
    nombreCliente: "",
    apellidoPaterno: "",
    apellidoMaterno: "",

    // ----- Datos cliente GOBIERNO / EMPRESA -----
    nombreGobierno: "",
    nombreContactoGobierno: "",
    nombreDependencia: "",
    nombreContactoDependencia: "",

    // ----- Teléfonos / dirección comunes -----
    telefonoFijoLada: "",
    telefonoFijo: "",
    celularLada: "",
    celular: "",

    direccion: "",
    numeroExt: "",
    numeroInt: "",
    colonia: "",
    rfc: "",
    codigoPostal: "",
    ciudad: "",
    estado: "",

    // ----- Datos de vehículo -----
    nombreUsuarioDejaVehiculo: "",
    marca: "",
    modelo: "",
    anio: "",
    color: "",
    serie: "",
    placas: "",
    kmsMillas: "",
    nacionalidad: "",
    motor: "",
    numeroEconomico: "",
    correo: "",
    traccion: "",

    // ----- Checkboxes de accesorios / daños -----
    grua: "",
    precioGrua: 0, // 🔹 como número
    espejoLateralIzq: false,
    espejoLateralDer: false,
    copasDelanterasIzq: false,
    copasDelanterasDer: false,
    parabrisas: "",
    focosDel: false,
    focosTras: false,
    espejoInt: false,
    tapetesDelanterosIzq: false,
    tapetesDelanterosDer: false,
    estereo: false,
    extra: false,
    copasTraserasIzq: false,
    copasTraserasDer: false,
    micas: false,
    antena: false,
    encendedor: false,
    tapetesTraserosIzq: false,
    tapetesTraserosDer: false,
    gato: false,
    bateria: false,

    // ----- Indicadores del tablero / mecánicos -----
    checkEngine: "",
    abs: "",
    airBag: "",
    frenos: "",
    aceite: "",
    alternador: "",

    indicadoresTablero: "",
    otros: "",
    observaciones: "",
  });

  // 🔹 Al montar, si es ALTA (sin initialData), generamos folio de OS
  useEffect(() => {
    if (!initialData) {
      setForm((prev) => ({
        ...prev,
        ordenServicio: generateOrdenServicio(),
      }));
    }
  }, [initialData]);

  // Precarga datos del cliente cuando llega del padre
  useEffect(() => {
    if (!cliente) return;

    const esParticular = cliente.tipoCliente === "Particular";

    const tel = cliente.telefono || {};
    const cel = cliente.celular || {};
    const dir = cliente.direccion || {};
    const gob = cliente.gobierno || {};
    const dep = gob.dependencia || {};
    const contactoGob = gob.contactoGobierno || {};
    const contactoDep = dep.contacto || {};

    setForm((prev) => ({
      ...prev,

      // === Datos de encabezado según tipo de cliente ===
      ...(esParticular
        ? {
            // PARTICULAR
            nombreCliente: cliente.nombre || "",
            apellidoPaterno: cliente.apellidoPaterno || "",
            apellidoMaterno: cliente.apellidoMaterno || "",
            // limpiamos campos de empresa/gobierno
            nombreGobierno: "",
            nombreContactoGobierno: "",
            nombreDependencia: "",
            nombreContactoDependencia: "",
          }
        : {
            // EMPRESA / GOBIERNO
            nombreGobierno: gob.nombreGobierno || cliente.nombre || "",
            nombreContactoGobierno:
              contactoGob.nombre || contactoDep.nombre || "",
            nombreDependencia: dep.nombre || "",
            nombreContactoDependencia: contactoDep.nombre || "",
            // limpiamos campos de particular
            nombreCliente: "",
            apellidoPaterno: "",
            apellidoMaterno: "",
          }),

      // === Teléfonos ===
      telefonoFijoLada: tel.lada || "",
      telefonoFijo: tel.numero || "",
      celularLada: cel.lada || "",
      celular: cel.numero || "",

      // === Dirección ===
      direccion: dir.calle || "",
      numeroExt: dir.numeroExterior || "",
      numeroInt: dir.numeroInterior || "",
      colonia: dir.colonia || "",
      codigoPostal: dir.codigoPostal || "",
      ciudad: dir.ciudad || "",
      estado: dir.estado || "",

      // === RFC y correo ===
      rfc: cliente.rfc || "",
      correo:
        cliente.email ||
        contactoGob.correo ||
        contactoDep.correo ||
        "",
    }));
  }, [cliente]);

  // cuando viene una orden completa para detalle
  useEffect(() => {
    if (!initialData) return;
    setForm((prev) => ({
      ...prev,
      ...initialData,
    }));
  }, [initialData]);

  const handleChange = (e) => {
    if (readOnly) return; // no permitir editar en detalle

    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (readOnly) return;

    if (!cliente || !cliente._id) {
      alert("No hay cliente seleccionado.");
      return;
    }

    try {
      const payload = {
        ...form,
        // aseguramos que precioGrua vaya como número
        precioGrua: form.grua === "SI" ? Number(form.precioGrua || 0) : 0,
      };

      const res = await createVehiculo(cliente._id, payload);
      console.log("Vehiculo guardado:", res.data || res);
      alert(
        `Vehículo / orden guardada correctamente.\nOrden de Servicio: ${payload.ordenServicio}`
      );
    } catch (err) {
      console.error("Error guardando vehiculo:", err);
      alert("Error al guardar el vehículo. Revisa la consola.");
    }
  };

  // helper para selects de SI/NO
  const renderSiNoSelect = (name, label) => (
    <div className="col-md-3 col-sm-6 mb-2">
      <label className="form-label">{label}</label>
      <select
        className="form-select"
        name={name}
        value={form[name]}
        onChange={handleChange}
      >
        <option value="">Seleccionar...</option>
        <option value="SI">SI</option>
        <option value="NO">NO</option>
      </select>
    </div>
  );

  return (
    <div className="card mt-3">
      <div className="card-header fw-bold">Datos del Cliente</div>
      <div className="card-body">
        <form onSubmit={handleSubmit}>
          {/* ====== FILA: ORDEN / FECHA / HORA ====== */}
          <div className="row g-2 mb-2">
            <div className="col-md-4">
              <label className="form-label">Orden de Servicio</label>
              <input
                type="text"
                className="form-control"
                name="ordenServicio"
                value={form.ordenServicio}
                readOnly // 🔒 solo visualizar
              />
            </div>
            <div className="col-md-4">
              <label className="form-label">Fecha Recepción</label>
              <input
                type="date"
                className="form-control"
                name="fechaRecepcion"
                value={form.fechaRecepcion}
                onChange={handleChange}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label">Hora</label>
              <input
                type="time"
                className="form-control"
                name="horaRecepcion"
                value={form.horaRecepcion}
                onChange={handleChange}
              />
            </div>
          </div>

          {/* ====== COLUMNAS IZQ / DER ====== */}
          <div className="row">
            {/* -------- COLUMNA IZQUIERDA (CLIENTE) -------- */}
            <div className="col-md-6">
              <div className="row g-2">
                {cliente?.tipoCliente === "Particular" ? (
                  <>
                    {/* === PARTICULAR === */}
                    <div className="col-12">
                      <label className="form-label">Nombre Cliente</label>
                      <input
                        type="text"
                        className="form-control"
                        name="nombreCliente"
                        value={form.nombreCliente}
                        onChange={handleChange}
                      />
                    </div>

                    <div className="col-12">
                      <label className="form-label">Apellido Paterno</label>
                      <input
                        type="text"
                        className="form-control"
                        name="apellidoPaterno"
                        value={form.apellidoPaterno}
                        onChange={handleChange}
                      />
                    </div>

                    <div className="col-12">
                      <label className="form-label">Apellido Materno</label>
                      <input
                        type="text"
                        className="form-control"
                        name="apellidoMaterno"
                        value={form.apellidoMaterno}
                        onChange={handleChange}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    {/* === EMPRESA / GOBIERNO === */}
                    <div className="col-12">
                      <label className="form-label">
                        Nombre Gobierno / Empresa
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        name="nombreGobierno"
                        value={form.nombreGobierno}
                        onChange={handleChange}
                      />
                    </div>

                    <div className="col-12">
                      <label className="form-label">
                        Nombre Contacto Gobierno / Empresa
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        name="nombreContactoGobierno"
                        value={form.nombreContactoGobierno}
                        onChange={handleChange}
                      />
                    </div>

                    <div className="col-12">
                      <label className="form-label">Nombre Dependencia</label>
                      <input
                        type="text"
                        className="form-control"
                        name="nombreDependencia"
                        value={form.nombreDependencia}
                        onChange={handleChange}
                      />
                    </div>

                    <div className="col-12">
                      <label className="form-label">
                        Nombre Contacto Dependencia
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        name="nombreContactoDependencia"
                        value={form.nombreContactoDependencia}
                        onChange={handleChange}
                      />
                    </div>
                  </>
                )}

                {/* Teléfonos */}
                <div className="col-md-3">
                  <label className="form-label">Teléfono Fijo (LADA)</label>
                  <input
                    type="text"
                    className="form-control"
                    name="telefonoFijoLada"
                    value={form.telefonoFijoLada}
                    onChange={handleChange}
                  />
                </div>
                <div className="col-md-9">
                  <label className="form-label">&nbsp;</label>
                  <input
                    type="text"
                    className="form-control"
                    name="telefonoFijo"
                    value={form.telefonoFijo}
                    onChange={handleChange}
                  />
                </div>

                <div className="col-md-3">
                  <label className="form-label">Celular (LADA)</label>
                  <input
                    type="text"
                    className="form-control"
                    name="celularLada"
                    value={form.celularLada}
                    onChange={handleChange}
                  />
                </div>
                <div className="col-md-9">
                  <label className="form-label">&nbsp;</label>
                  <input
                    type="text"
                    className="form-control"
                    name="celular"
                    value={form.celular}
                    onChange={handleChange}
                  />
                </div>

                {/* Dirección */}
                <div className="col-12">
                  <label className="form-label">Dirección (Calle)</label>
                  <input
                    type="text"
                    className="form-control"
                    name="direccion"
                    value={form.direccion}
                    onChange={handleChange}
                  />
                </div>

                <div className="col-md-4">
                  <label className="form-label">Número Ext</label>
                  <input
                    type="text"
                    className="form-control"
                    name="numeroExt"
                    value={form.numeroExt}
                    onChange={handleChange}
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label">Número Int</label>
                  <input
                    type="text"
                    className="form-control"
                    name="numeroInt"
                    value={form.numeroInt}
                    onChange={handleChange}
                  />
                </div>

                <div className="col-md-4">
                  <label className="form-label">Colonia</label>
                  <input
                    type="text"
                    className="form-control"
                    name="colonia"
                    value={form.colonia}
                    onChange={handleChange}
                  />
                </div>

                <div className="col-md-6">
                  <label className="form-label">RFC</label>
                  <input
                    type="text"
                    className="form-control"
                    name="rfc"
                    value={form.rfc}
                    onChange={handleChange}
                  />
                </div>

                <div className="col-md-6">
                  <label className="form-label">Código Postal</label>
                  <input
                    type="text"
                    className="form-control"
                    name="codigoPostal"
                    value={form.codigoPostal}
                    onChange={handleChange}
                  />
                </div>

                <div className="col-md-6">
                  <label className="form-label">Ciudad</label>
                  <input
                    type="text"
                    className="form-control"
                    name="ciudad"
                    value={form.ciudad}
                    onChange={handleChange}
                  />
                </div>

                <div className="col-md-6">
                  <label className="form-label">Estado</label>
                  <input
                    type="text"
                    className="form-control"
                    name="estado"
                    value={form.estado}
                    onChange={handleChange}
                  />
                </div>

                {/* Grua */}
                <div className="col-12">
                  <label className="form-label">Grua</label>
                  <select
                    className="form-select"
                    name="grua"
                    value={form.grua}
                    onChange={handleChange}
                  >
                    <option value="">Select an Option</option>
                    <option value="SI">SI</option>
                    <option value="NO">NO</option>
                  </select>
                </div>

                {/* 🔹 Campo precioGrua solo si grua === "SI" */}
                {form.grua === "SI" && (
                  <div className="col-12">
                    <label className="form-label">Precio de la grúa</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control"
                      name="precioGrua"
                      value={form.precioGrua}
                      onChange={handleChange}
                      placeholder="Ej. 800.00"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* -------- COLUMNA DERECHA (VEHÍCULO) -------- */}
            <div className="col-md-6">
              <div className="row g-2">
                <div className="col-12">
                  <label className="form-label">
                    Nombre Usuario Deja Vehículo
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    name="nombreUsuarioDejaVehiculo"
                    value={form.nombreUsuarioDejaVehiculo}
                    onChange={handleChange}
                  />
                </div>

                <div className="col-md-6">
                  <label className="form-label">Marca</label>
                  <input
                    type="text"
                    className="form-control"
                    name="marca"
                    value={form.marca}
                    onChange={handleChange}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Modelo</label>
                  <input
                    type="text"
                    className="form-control"
                    name="modelo"
                    value={form.modelo}
                    onChange={handleChange}
                  />
                </div>

                <div className="col-md-4">
                  <label className="form-label">Año</label>
                  <input
                    type="text"
                    className="form-control"
                    name="anio"
                    value={form.anio}
                    onChange={handleChange}
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label">Color</label>
                  <input
                    type="text"
                    className="form-control"
                    name="color"
                    value={form.color}
                    onChange={handleChange}
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label">Serie</label>
                  <input
                    type="text"
                    className="form-control"
                    name="serie"
                    value={form.serie}
                    onChange={handleChange}
                  />
                </div>

                <div className="col-md-6">
                  <label className="form-label">Placas</label>
                  <input
                    type="text"
                    className="form-control"
                    name="placas"
                    value={form.placas}
                    onChange={handleChange}
                  />
                </div>

                <div className="col-md-6">
                  <label className="form-label">KMS/Millas</label>
                  <input
                    type="text"
                    className="form-control"
                    name="kmsMillas"
                    value={form.kmsMillas}
                    onChange={handleChange}
                  />
                </div>

                <div className="col-md-6">
                  <label className="form-label">Nacionalidad</label>
                  <input
                    type="text"
                    className="form-control"
                    name="nacionalidad"
                    value={form.nacionalidad}
                    onChange={handleChange}
                  />
                </div>

                <div className="col-md-6">
                  <label className="form-label">Motor</label>
                  <input
                    type="text"
                    className="form-control"
                    name="motor"
                    value={form.motor}
                    onChange={handleChange}
                  />
                </div>

                <div className="col-md-6">
                  <label className="form-label">Número Económico</label>
                  <input
                    type="text"
                    className="form-control"
                    name="numeroEconomico"
                    value={form.numeroEconomico}
                    onChange={handleChange}
                  />
                </div>

                <div className="col-md-6">
                  <label className="form-label">Correo</label>
                  <input
                    type="email"
                    className="form-control"
                    name="correo"
                    value={form.correo}
                    onChange={handleChange}
                  />
                </div>

                <div className="col-12">
                  <label className="form-label">Tracción</label>
                  <select
                    className="form-select"
                    name="traccion"
                    value={form.traccion}
                    onChange={handleChange}
                  >
                    <option value="">Select an Option</option>
                    <option value="4x2">4x2</option>
                    <option value="4x4">4x4</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* ====== ACCESORIOS / CHECKBOXES ====== */}
          <hr className="my-3" />

          <div className="row g-2">
            {/* Espejos, copas, parabrisas, etc. */}
            <div className="col-md-6">
              <div className="row g-1">
                <div className="col-12 fw-semibold mb-1">
                  Espejo / Copas / Focos / Interior
                </div>

                <div className="col-12">
                  <label className="me-3">Espejo Lateral:</label>
                  <div className="form-check form-check-inline">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      name="espejoLateralIzq"
                      checked={form.espejoLateralIzq}
                      onChange={handleChange}
                    />
                    <label className="form-check-label">IZQ</label>
                  </div>
                  <div className="form-check form-check-inline">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      name="espejoLateralDer"
                      checked={form.espejoLateralDer}
                      onChange={handleChange}
                    />
                    <label className="form-check-label">DER</label>
                  </div>
                </div>

                <div className="col-12">
                  <label className="me-3">Copas Delanteras:</label>
                  <div className="form-check form-check-inline">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      name="copasDelanterasIzq"
                      checked={form.copasDelanterasIzq}
                      onChange={handleChange}
                    />
                    <label className="form-check-label">IZQ</label>
                  </div>
                  <div className="form-check form-check-inline">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      name="copasDelanterasDer"
                      checked={form.copasDelanterasDer}
                      onChange={handleChange}
                    />
                    <label className="form-check-label">DER</label>
                  </div>
                </div>

                <div className="col-12">
                  <label className="form-label me-2">Parabrisas</label>
                  <select
                    className="form-select d-inline-block w-auto"
                    name="parabrisas"
                    value={form.parabrisas}
                    onChange={handleChange}
                  >
                    <option value="">Select an Option</option>
                    <option value="BUENO">Bueno</option>
                    <option value="MALO">Malo</option>
                    <option value="QUEBRADO">Quebrado</option>
                  </select>
                </div>

                <div className="col-12">
                  <label className="me-3">Focos:</label>
                  <div className="form-check form-check-inline">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      name="focosDel"
                      checked={form.focosDel}
                      onChange={handleChange}
                    />
                    <label className="form-check-label">DEL.</label>
                  </div>
                  <div className="form-check form-check-inline">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      name="focosTras"
                      checked={form.focosTras}
                      onChange={handleChange}
                    />
                    <label className="form-check-label">TRAS.</label>
                  </div>
                </div>

                <div className="col-12">
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      name="espejoInt"
                      checked={form.espejoInt}
                      onChange={handleChange}
                    />
                    <label className="form-check-label">
                      Espejo Interior
                    </label>
                  </div>
                </div>

                <div className="col-12">
                  <label className="me-3">Tapetes Delanteros:</label>
                  <div className="form-check form-check-inline">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      name="tapetesDelanterosIzq"
                      checked={form.tapetesDelanterosIzq}
                      onChange={handleChange}
                    />
                    <label className="form-check-label">IZQ</label>
                  </div>
                  <div className="form-check form-check-inline">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      name="tapetesDelanterosDer"
                      checked={form.tapetesDelanterosDer}
                      onChange={handleChange}
                    />
                    <label className="form-check-label">DER</label>
                  </div>
                </div>

                <div className="col-12">
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      name="estereo"
                      checked={form.estereo}
                      onChange={handleChange}
                    />
                    <label className="form-check-label">Estéreo</label>
                  </div>
                </div>

                <div className="col-12">
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      name="extra"
                      checked={form.extra}
                      onChange={handleChange}
                    />
                    <label className="form-check-label">Extra</label>
                  </div>
                </div>
              </div>
            </div>

            {/* Columna derecha de accesorios */}
            <div className="col-md-6">
              <div className="row g-1">
                <div className="col-12 fw-semibold mb-1">
                  Copas Traseras / Tapetes / Otros
                </div>

                <div className="col-12">
                  <label className="me-3">Copas Traseras:</label>
                  <div className="form-check form-check-inline">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      name="copasTraserasIzq"
                      checked={form.copasTraserasIzq}
                      onChange={handleChange}
                    />
                    <label className="form-check-label">IZQ</label>
                  </div>
                  <div className="form-check form-check-inline">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      name="copasTraserasDer"
                      checked={form.copasTraserasDer}
                      onChange={handleChange}
                    />
                    <label className="form-check-label">DER</label>
                  </div>
                </div>

                <div className="col-12">
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      name="micas"
                      checked={form.micas}
                      onChange={handleChange}
                    />
                    <label className="form-check-label">Micas</label>
                  </div>
                </div>

                <div className="col-12">
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      name="antena"
                      checked={form.antena}
                      onChange={handleChange}
                    />
                    <label className="form-check-label">Antena</label>
                  </div>
                </div>

                <div className="col-12">
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      name="encendedor"
                      checked={form.encendedor}
                      onChange={handleChange}
                    />
                    <label className="form-check-label">Encendedor</label>
                  </div>
                </div>

                <div className="col-12">
                  <label className="me-3">Tapetes Traseros:</label>
                  <div className="form-check form-check-inline">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      name="tapetesTraserosIzq"
                      checked={form.tapetesTraserosIzq}
                      onChange={handleChange}
                    />
                    <label className="form-check-label">IZQ</label>
                  </div>
                  <div className="form-check form-check-inline">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      name="tapetesTraserosDer"
                      checked={form.tapetesTraserosDer}
                      onChange={handleChange}
                    />
                    <label className="form-check-label">DER</label>
                  </div>
                </div>

                <div className="col-12">
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      name="gato"
                      checked={form.gato}
                      onChange={handleChange}
                    />
                    <label className="form-check-label">Gato</label>
                  </div>
                </div>

                <div className="col-12">
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      name="bateria"
                      checked={form.bateria}
                      onChange={handleChange}
                    />
                    <label className="form-check-label">Batería</label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ====== INDICADORES TABLERO / MECÁNICOS ====== */}
          <hr className="my-3" />

          <div className="row g-2">
            <div className="col-12">
              <label className="form-label">Indicadores del Tablero</label>
              <input
                type="text"
                className="form-control"
                name="indicadoresTablero"
                value={form.indicadoresTablero}
                onChange={handleChange}
              />
            </div>

            {renderSiNoSelect("checkEngine", "Check Engine")}
            {renderSiNoSelect("abs", "Abs")}
            {renderSiNoSelect("airBag", "Air Bag")}
            {renderSiNoSelect("frenos", "Frenos")}
            {renderSiNoSelect("aceite", "Aceite")}
            {renderSiNoSelect("alternador", "Alternador")}

            <div className="col-12">
              <label className="form-label">Otros</label>
              <input
                type="text"
                className="form-control"
                name="otros"
                value={form.otros}
                onChange={handleChange}
              />
            </div>

            <div className="col-12">
              <label className="form-label">Observaciones</label>
              <textarea
                className="form-control"
                rows={3}
                name="observaciones"
                value={form.observaciones}
                onChange={handleChange}
              />
            </div>
          </div>

          {!readOnly && (
            <div className="mt-3 text-center">
              <button type="submit" className="btn btn-success px-5">
                Guardar
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
