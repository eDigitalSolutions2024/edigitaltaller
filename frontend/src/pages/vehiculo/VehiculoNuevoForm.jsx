// src/pages/vehiculo/VehiculoNuevoForm.jsx
import React, { useEffect, useState } from "react";
import { createVehiculo, updateDatosOrden } from "../../api/vehiculos";
import { upsertGarageVehiculo } from "../../api/garage";
import VehicleDamageCanvas from "../../components/VehicleDamageCanvas";
import { getUser } from "../../auth";
import { getOrdenServicioContador } from "../../api/configuracion";

// 🔹 Helper para generar el folio igual que en el backend
{/*function generateOrdenServicio() {
  const ahora = new Date();
  const yyyy = ahora.getFullYear();
  const mm = String(ahora.getMonth() + 1).padStart(2, "0");
  const dd = String(ahora.getDate()).padStart(2, "0");
  const hh = String(ahora.getHours()).padStart(2, "0");
  const mi = String(ahora.getMinutes()).padStart(2, "0");
  const ss = String(ahora.getSeconds()).padStart(2, "0");
  return `OS-${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}*/}

function getTodayInputDate() {
  const ahora = new Date();
  const yyyy = ahora.getFullYear();
  const mm = String(ahora.getMonth() + 1).padStart(2, "0");
  const dd = String(ahora.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function getCurrentInputTime() {
  const ahora = new Date();
  const hh = String(ahora.getHours()).padStart(2, "0");
  const mi = String(ahora.getMinutes()).padStart(2, "0");

  return `${hh}:${mi}`;
}

function formatDateForInput(value) {
  if (!value) return "";

  if (typeof value === "string") {
    // Si ya viene como YYYY-MM-DD, lo dejamos igual
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

    // Si viene como ISO: 2026-05-08T...
    if (value.includes("T")) return value.split("T")[0];
  }

  const fecha = new Date(value);
  if (Number.isNaN(fecha.getTime())) return "";

  const yyyy = fecha.getFullYear();
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const dd = String(fecha.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}



const INSPECCION_FIELDS = [
  'grua', 'precioGrua', 'espejoLateralIzq', 'espejoLateralDer',
  'copasDelanterasIzq', 'copasDelanterasDer', 'parabrisas', 'focosDel', 'focosTras',
  'espejoInt', 'tapetesDelanterosIzq', 'tapetesDelanterosDer', 'estereo', 'extra',
  'copasTraserasIzq', 'copasTraserasDer', 'micas', 'antena', 'encendedor',
  'tapetesTraserosIzq', 'tapetesTraserosDer', 'gato', 'bateria',
  'nivelGasolina', 'danoVehiculo',
  'checkEngine', 'abs', 'airBag', 'frenos', 'aceite', 'alternador',
  'indicadoresTablero', 'otros', 'observaciones',
];

export default function VehiculoNuevoForm({
  cliente,
  initialData,
  readOnly = false,
  onCreated,
  vehiculoGarage,
}) {
  const esParticular = cliente?.tipoCliente === "Particular";
  const requiereFactura = cliente?.requiereFacturacion === true;
  
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
    regimenFiscal: "",
    usoCFDI: "",
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
    correos: [],
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
    nivelGasolina: false,
    danoVehculo: null, // aquí guardaremos el dibujo del daño como base64 para mostrar en detalle

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

  const [otrosIndicadoresActivo, setOtrosIndicadoresActivo] = useState(false);
  const [proximoFolio, setProximoFolio] = useState(null);

  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  // ── Admin edit ──────────────────────────────────────────
  const isAdmin = getUser()?.role === "admin";
  const [editandoAdmin, setEditandoAdmin] = useState(false);
  // Si es admin y activó edición, el form se desbloquea aunque venga readOnly=true
  const efectivoReadOnly = readOnly && !(isAdmin && editandoAdmin);

  // 🔹 Al montar, si es ALTA (sin initialData), el folio de OS se asigna
  // hasta guardar; aquí solo mostramos una vista previa del próximo número.
  useEffect(() => {
    if (!initialData) {
      setForm((prev) => ({
        ...prev,
        ordenServicio: "",
        fechaRecepcion: getTodayInputDate(),
        horaRecepcion: getCurrentInputTime(),
      }));

      setProximoFolio(null);
      getOrdenServicioContador()
        .then((res) => setProximoFolio(`P-${Number(res?.valor || 0) + 1}`))
        .catch(() => setProximoFolio(null));
    }
  }, [initialData]);

  // Precarga datos del cliente cuando llega del padre
  useEffect(() => {
    if (!cliente) return;

    const esParticular = cliente.tipoCliente === "Particular";
    const requiereFactura = cliente.requiereFacturacion === true;

    const tel = (cliente.telefonos || [])[0] || {};
    const cel = (cliente.celulares || [])[0] || {};
    const facturDir = cliente?.facturacion?.direccion;
    const dir = (cliente?.requiereFacturacion && facturDir?.calle)
      ? facturDir
      : cliente.direccion || {};
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
              cliente.apellidoPaterno ||
              cliente.empresa?.contacto?.nombre ||
              contactoGob.nombre ||
              contactoDep.nombre ||
              "",
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
      regimenFiscal: cliente.facturacion?.regimenFiscal || "",
      usoCFDI: cliente.facturacion?.usoCFDI || "",
      correos: Array.isArray(cliente.emails) && cliente.emails.length
        ? cliente.emails
        : [contactoGob.correo || contactoDep.correo || ""].filter(Boolean),
    }));
  }, [cliente]);

  // cuando viene una orden completa para detalle
  useEffect(() => {
    if (!initialData) return;

    // Extraer datos del cliente desde populate
    const c = initialData.cliente || {};
    const esParticular = c.tipoCliente === "Particular";
    const gob = c.gobierno || {};
    const dep = gob.dependencia || {};
    const contactoGob = gob.contactoGobierno || {};
    const contactoDep = dep.contacto || {};
    const tel = (c.telefonos || [])[0] || {};
    const cel = (c.celulares || [])[0] || {};
    const dir = c.direccion || {};

    setForm((prev) => ({
      ...prev,
      ...initialData,
      ...(initialData.inspeccionFisica || {}),
      fechaRecepcion: formatDateForInput(initialData.fechaRecepcion),
      horaRecepcion: initialData.horaRecepcion || "",
      // Datos del cliente extraídos del populate
      ...(esParticular
        ? {
            nombreCliente: c.nombre || "",
            apellidoPaterno: c.apellidoPaterno || "",
            apellidoMaterno: c.apellidoMaterno || "",
            nombreGobierno: "",
            nombreContactoGobierno: "",
            nombreDependencia: "",
            nombreContactoDependencia: "",
          }
        : {
            nombreGobierno: gob.nombreGobierno || c.nombre || "",
            nombreContactoGobierno: c.apellidoPaterno || contactoGob.nombre || c.empresa?.contacto?.nombre || "",
            nombreDependencia: dep.nombre || "",
            nombreContactoDependencia: contactoDep.nombre || "",
            nombreCliente: "",
            apellidoPaterno: "",
            apellidoMaterno: "",
          }),
      telefonoFijoLada: tel.lada || "",
      telefonoFijo: tel.numero || "",
      celularLada: cel.lada || "",
      celular: cel.numero || "",
      direccion: dir.calle || "",
      numeroExt: dir.numeroExterior || "",
      numeroInt: dir.numeroInterior || "",
      colonia: dir.colonia || "",
      codigoPostal: dir.codigoPostal || "",
      ciudad: dir.ciudad || "",
      estado: dir.estado || "",
      rfc: c.rfc || "",
      correos: Array.isArray(c.emails) && c.emails.length
        ? c.emails
        : [contactoGob.correo || ""].filter(Boolean),
    }));
  }, [initialData]);

  // Pre-llenar campos de vehículo cuando se selecciona desde el garaje
  useEffect(() => {
    if (!vehiculoGarage) return;
    setForm((prev) => ({
      ...prev,
      marca:           vehiculoGarage.marca || "",
      modelo:          vehiculoGarage.modelo || "",
      anio:            vehiculoGarage.anio || "",
      color:           vehiculoGarage.color || "",
      serie:           vehiculoGarage.serie || "",
      placas:          vehiculoGarage.placas || "",
      kmsMillas:       vehiculoGarage.kmsMillas || "",
      nacionalidad:    vehiculoGarage.nacionalidad || "",
      motor:           vehiculoGarage.motor || "",
      numeroEconomico: vehiculoGarage.numeroEconomico || "",
      traccion:        vehiculoGarage.traccion || "",
    }));
  }, [vehiculoGarage]);

  const handleChange = (e) => {
    if (efectivoReadOnly) return; // no permitir editar en detalle

    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (efectivoReadOnly) return;
    if (guardando || guardado) return;

    const usuario = getUser();

    const inspeccionFisica = Object.fromEntries(
      INSPECCION_FIELDS.map((k) => [k, form[k]])
    );
    inspeccionFisica.precioGrua = form.grua === "SI" ? Number(form.precioGrua || 0) : 0;

    const payload = {
      ...form,
      inspeccionFisica,
      correos: form.correos || [],
      creadoPor: usuario?.name || usuario?.username || "Sin usuario",
    };

    console.log("PAYLOAD creadoPor:", payload.creadoPor);

    console.log(getUser())

    // ── Modo edición admin (orden ya existente) ──────────
    if (initialData?._id) {
      try {
        setGuardando(true);
        const res = await updateDatosOrden(initialData._id, payload);
        const vehiculoActualizado = res.data?.vehiculo || res.data;
        if (onCreated) onCreated(vehiculoActualizado);
        setEditandoAdmin(false);
        alert("Datos actualizados correctamente.");
      } catch (err) {
        console.error("Error actualizando datos:", err);
        const msg = err?.response?.data?.msg || "Error al actualizar. Revisa la consola.";
        alert(msg);
      } finally {
        setGuardando(false);
      }
      return;
    }

    // ── Modo creación normal ─────────────────────────────
    if (!cliente || !cliente._id) {
      alert("No hay cliente seleccionado.");
      return;
    }

    try {
      setGuardando(true);
      const res = await createVehiculo(cliente._id, payload);
      setGuardado(true);
      const vehiculoCreado = res.data?.vehiculo || res.data;
      window.dispatchEvent(new CustomEvent('orden-creada'));
      console.log("Vehiculo guardado:", res.data || res);

      // Guardar automáticamente en el garaje si tiene serie (sin pedir confirmación)
      if (form.serie?.trim()) {
        try {
          await upsertGarageVehiculo({
            serie:           form.serie,
            marca:           form.marca,
            modelo:          form.modelo,
            anio:            form.anio,
            color:           form.color,
            placas:          form.placas,
            kmsMillas:       form.kmsMillas,
            nacionalidad:    form.nacionalidad,
            motor:           form.motor,
            numeroEconomico: form.numeroEconomico,
            traccion:        form.traccion,
            clienteId:       cliente?._id,
          });
        } catch (garageErr) {
          console.error("Error guardando en garaje:", garageErr);
        }
      }

      if (onCreated) onCreated(vehiculoCreado);
      alert(
        `Vehículo / orden guardada correctamente.\nOrden de Servicio: ${vehiculoCreado?.ordenServicio || ""}`
      );
    } catch (err) {
      console.error("Error guardando vehiculo:", err);
      const msg = err?.response?.data?.msg || "Error al guardar el vehículo. Revisa la consola.";
      alert(msg);
      setGuardando(false);
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

  const handleTodoOkAccesorios = () => {
    if (efectivoReadOnly) return;

    setForm((prev) => ({
      ...prev,
      espejoLateralIzq: true,
      espejoLateralDer: true,
      copasDelanterasIzq: true,
      copasDelanterasDer: true,
      parabrisas: "BUENO",
      focosDel: true,
      focosTras: true,
      espejoInt: true,
      tapetesDelanterosIzq: true,
      tapetesDelanterosDer: true,
      estereo: true,
      extra: true,
      copasTraserasIzq: true,
      copasTraserasDer: true,
      micas: true,
      antena: true,
      encendedor: true,
      tapetesTraserosIzq: true,
      tapetesTraserosDer: true,
      gato: true,
      bateria: true,
    }));
  };

  const handleLimpiarAccesorios = () => {
    if (efectivoReadOnly) return;

    setForm((prev) => ({
      ...prev,
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
    }));
  };

  const handleIndicadoresNo = () => {
    if (efectivoReadOnly) return;

    setForm((prev) => ({
      ...prev,
      checkEngine: "NO",
      abs: "NO",
      airBag: "NO",
      frenos: "NO",
      aceite: "NO",
      alternador: "NO",
    }));
  };

  return (
    <div className="card mt-3">
      <div className="card-header fw-bold">Datos del Cliente</div>
      <div className="card-body">
        <form onSubmit={handleSubmit} onKeyDown={(e) => { if (e.key === "Enter" && e.target.type !== "submit") e.preventDefault(); }}>
          {/* ====== FILA: ORDEN / FECHA / HORA ====== */}
          <div className="row g-2 mb-2">
            <div className="col-md-4">
              <label className="form-label">Orden de Servicio</label>
              <input
                type="text"
                className="form-control"
                name="ordenServicio"
                value={form.ordenServicio}
                onChange={handleChange}
                readOnly={initialData && efectivoReadOnly}
                disabled={!initialData}
                placeholder={
                  !initialData
                    ? proximoFolio
                      ? `${proximoFolio}`
                      : "Se asignará automáticamente al guardar"
                    : ""
                }
              />
              {!initialData && (
                <small className="text-muted">
                  El número definitivo se confirma al guardar la orden.
                </small>
              )}
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
                    {/* === EMPRESA PRIVADA / ARRENDADORA === */}
                    {(cliente?.tipoCliente === "Empresa Privada" ||
                      cliente?.tipoCliente === "Empresa Arrendadora" ||
                      cliente?.tipoCliente === "Empresa") && (
                      <>
                        <div className="col-12">
                          <label className="form-label">Nombre Empresa</label>
                          <input
                            type="text"
                            className="form-control"
                            name="nombreGobierno"
                            value={form.nombreGobierno}
                            onChange={handleChange}
                          />
                        </div>

                        <div className="col-12">
                          <label className="form-label">Nombre Contacto Empresa</label>
                          <input
                            type="text"
                            className="form-control"
                            name="nombreContactoGobierno"
                            value={form.nombreContactoGobierno}
                            onChange={handleChange}
                          />
                        </div>
                      </>
                    )}

                    {/* === EMPRESA GOBIERNO === */}
                    {cliente?.tipoCliente === "Empresa Gobierno" && (
                      <>
                        <div className="col-12">
                          <label className="form-label">
                            Nombre Gobierno
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
                            Nombre Contacto Gobierno
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
                  </>
                )}

                {/* TELEFONOS */}
                {/* Teléfono fijo SOLO empresa/gobierno */}
                {!esParticular && (
                  <>
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
                  </>
                )}

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

                {requiereFactura && (
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
              )}

              {requiereFactura && (
                <>
                  <div className="col-md-6">
                    <label className="form-label">Régimen Fiscal</label>
                    <input
                      type="text"
                      className="form-control"
                      name="regimenFiscal"
                      value={form.regimenFiscal}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Uso de CFDI</label>
                    <input
                      type="text"
                      className="form-control"
                      name="usoCFDI"
                      value={form.usoCFDI}
                      onChange={handleChange}
                    />
                  </div>
                </>
              )}

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

                {/* Correos del cliente (solo lectura, tomados del alta) */}
                <div className="col-md-6">
                  <label className="form-label">Correo(s)</label>
                  {form.correos && form.correos.length > 0 ? (
                    form.correos.map((c, i) => (
                      <input
                        key={i}
                        type="email"
                        className={`form-control${i > 0 ? " mt-1" : ""}`}
                        value={c}
                        readOnly
                        placeholder="Sin correo"
                      />
                    ))
                  ) : (
                    <input type="email" className="form-control" value="" readOnly placeholder="Sin correo" />
                  )}
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
          {!efectivoReadOnly && (
          <div className="d-flex justify-content-start align-items-center gap-3 mb-3">
            <p className="text-muted small mb-0 me-auto">
              Los elementos marcados indican que el vehículo cuenta con dichos accesorios
              al momento de la recepción.
            </p>
            <button
              type="button"
              className="btn btn-sm btn-success"
              onClick={handleTodoOkAccesorios}
            >
              Todo OK
            </button>

            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={handleLimpiarAccesorios}
            >
              Limpiar accesorios
            </button>
          </div>)}

          <div className="row g-2">
            {/* Espejos, copas, parabrisas, etc. */}
            <div className="col-md-3">
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
            <div className="col-md-3">
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

            {/* Columna daños del vehículo */}
            <div className="col-md-3">
              <div className="fw-semibold mb-1" style={{ fontSize: "13px" }}>
                Daños del vehículo
              </div>
              <VehicleDamageCanvas
                value={form.danoVehiculo}
                onChange={(data) => setForm((prev) => ({ ...prev, danoVehiculo: data }))}
                readOnly={efectivoReadOnly}
              />
            </div>

            {/*gasolina */}
            <div className="col-md-3">
              <div className="d-flex flex-column">
                <hr className="my-2" />

                {/* Nivel de gasolina */}
                <div className="d-flex flex-column align-items-center">
                  <div className="fw-semibold mb-1">Nivel de Gasolina</div>
                  <svg
                    width="200"
                    height="130"
                    viewBox="0 0 200 130"
                    style={{ cursor: efectivoReadOnly ? "default" : "pointer" }}
                    onClick={(e) => {
                      if (efectivoReadOnly) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const scaleX = 200 / rect.width;
                      const scaleY = 130 / rect.height;
                      const mx = (e.clientX - rect.left) * scaleX;
                      const my = (e.clientY - rect.top) * scaleY;
                      const dx = mx - 100, dy = my - 100;
                      let angle = Math.atan2(dy, dx);
                      if (angle < 0) angle += 2 * Math.PI;
                      const START_RAD = 210 * Math.PI / 180;
                      const END_RAD = 330 * Math.PI / 180;
                      let pct = (angle - START_RAD) / (END_RAD - START_RAD);
                      pct = Math.max(0, Math.min(1, pct));
                      const NIVELES = [
                        { pct: 0,     label: "E" },
                        { pct: 0.125, label: "1/8" },
                        { pct: 0.25,  label: "1/4" },
                        { pct: 0.375, label: "3/8" },
                        { pct: 0.5,   label: "1/2" },
                        { pct: 0.625, label: "5/8" },
                        { pct: 0.75,  label: "3/4" },
                        { pct: 0.875, label: "7/8" },
                        { pct: 1,     label: "F" },
                      ];
                      const closest = NIVELES.reduce((a, b) =>
                        Math.abs(b.pct - pct) < Math.abs(a.pct - pct) ? b : a
                      );
                      setForm((prev) => ({ ...prev, nivelGasolina: closest.label }));
                    }}
                  >
                    {(() => {
                      const CX = 100, CY = 100, R = 70;
                      const START_DEG = 210, END_DEG = 330;
                      const NIVELES = [
                        { pct: 0,     label: "E" },
                        { pct: 0.125, label: "1/8" },
                        { pct: 0.25,  label: "1/4" },
                        { pct: 0.375, label: "3/8" },
                        { pct: 0.5,   label: "1/2" },
                        { pct: 0.625, label: "5/8" },
                        { pct: 0.75,  label: "3/4" },
                        { pct: 0.875, label: "7/8" },
                        { pct: 1,     label: "F" },
                      ];
                      const toRad = (deg) => deg * Math.PI / 180;
                      const pctToAngle = (pct) => toRad(START_DEG + pct * (END_DEG - START_DEG));
                      const pctToXY = (pct, radius) => {
                        const a = pctToAngle(pct);
                        return { x: CX + radius * Math.cos(a), y: CY + radius * Math.sin(a) };
                      };
                      const arcPath = (pct0, pct1, r) => {
                        const s = pctToXY(pct0, r);
                        const e = pctToXY(pct1, r);
                        const span = (pct1 - pct0) * toRad(END_DEG - START_DEG);
                        return `M ${s.x} ${s.y} A ${r} ${r} 0 ${span > Math.PI ? 1 : 0} 1 ${e.x} ${e.y}`;
                      };
                      const currentNivel = NIVELES.find(n => n.label === form.nivelGasolina);
                      const currentPct = currentNivel ? currentNivel.pct : null;
                      const needleColor =
                        currentPct === null ? "#888" :
                        currentPct <= 0.25 ? "#E24B4A" :
                        currentPct <= 0.5  ? "#BA7517" : "#1D9E75";
                      const needleAngle = currentPct !== null ? pctToAngle(currentPct) : toRad(210);
                      const nx = CX + 58 * Math.cos(needleAngle);
                      const ny = CY + 58 * Math.sin(needleAngle);
                      return (
                        <>
                          <path d={arcPath(0, 1, R)} fill="none" stroke="#ddd" strokeWidth="4" strokeLinecap="round" />
                          {currentPct !== null && currentPct > 0 && (
                            <path d={arcPath(0, currentPct, R)} fill="none" stroke={needleColor} strokeWidth="4" strokeLinecap="round" />
                          )}
                          {NIVELES.map((n) => {
                            const pos = pctToXY(n.pct, R);
                            const isActive = form.nivelGasolina === n.label;
                            return (
                              <circle key={n.label} cx={pos.x} cy={pos.y} r={isActive ? 5 : 3} fill={isActive ? needleColor : "#bbb"} />
                            );
                          })}
                          <line x1={CX} y1={CY} x2={nx} y2={ny} stroke={needleColor} strokeWidth="2.5" strokeLinecap="round" />
                          <circle cx={CX} cy={CY} r="5" fill={needleColor} />
                          <text x="18" y="112" fontSize="12" fontWeight="500" fill="#888" textAnchor="middle">E</text>
                          <text x="182" y="112" fontSize="12" fontWeight="500" fill="#888" textAnchor="middle">F</text>
                        </>
                      );
                    })()}
                  </svg>
                  <div className="mt-1 text-center">
                    {form.nivelGasolina ? (
                      <span className="badge bg-secondary fs-6 px-3">{form.nivelGasolina}</span>
                    ) : (
                      <span className="text-muted small">Sin capturar</span>
                    )}
                  </div>
                </div>

              </div>
            </div>


          </div>

          {/* ====== INDICADORES TABLERO / MECÁNICOS ====== */}
          <hr className="my-3" />

          <div className="d-flex justify-content-between align-items-center mb-2">
            <h6 className="fw-bold mb-0">Indicadores del Tablero</h6>

            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={handleIndicadoresNo}
            >
              Limpiar indicadores
            </button>
          </div>

          <p className="text-muted small mb-2">
            Marca únicamente los indicadores que se encuentren encendidos o presenten alerta.
          </p>

          <div className="row g-2">
            {[
              ["checkEngine", "Check Engine"],
              ["abs", "ABS"],
              ["airBag", "Air Bag"],
              ["frenos", "Frenos"],
              ["aceite", "Aceite"],
              ["alternador", "Alternador"],
            ].map(([name, label]) => (
              <div className="col-md-4 col-sm-6" key={name}>
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id={name}
                    checked={form[name] === "SI"}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        [name]: e.target.checked ? "SI" : "NO",
                      }))
                    }
                  />
                  <label className="form-check-label" htmlFor={name}>
                    {label}
                  </label>
                </div>
              </div>
            ))}

            <div className="col-12 mt-2">
              <div className="form-check mb-2">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="otrosIndicadoresCheck"
                  checked={otrosIndicadoresActivo}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setOtrosIndicadoresActivo(checked);

                    if (!checked) {
                      setForm((prev) => ({
                        ...prev,
                        otros: "",
                      }));
                    }
                  }}
                />
                <label className="form-check-label" htmlFor="otrosIndicadoresCheck">
                  Otros indicadores
                </label>
              </div>

              <input
                type="text"
                className="form-control"
                name="otros"
                placeholder="Especificar otros indicadores"
                value={form.otros}
                onChange={handleChange}
                disabled={!otrosIndicadoresActivo}
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

          {/* Modo creación normal */}
          {!readOnly && (
            <button
              type="submit"
              className="btn btn-success px-5"
              disabled={guardando || guardado}
            >
              {guardando ? "Guardando..." : guardado ? "Guardado" : "Guardar"}
            </button>
          )}

          {/* Admin sobre orden existente — botón Editar */}
          {readOnly && isAdmin && !editandoAdmin && (
            <button
              type="button"
              className="btn btn-warning px-5"
              onClick={() => setEditandoAdmin(true)}
            >
              Editar
            </button>
          )}

          {/* Admin sobre orden existente — Guardar cambios / Cancelar */}
          {readOnly && isAdmin && editandoAdmin && (
            <div className="d-flex gap-2">
              <button
                type="submit"
                className="btn btn-success px-5"
                disabled={guardando}
              >
                {guardando ? "Guardando..." : "Guardar cambios"}
              </button>
              <button
                type="button"
                className="btn btn-secondary px-4"
                disabled={guardando}
                onClick={() => setEditandoAdmin(false)}
              >
                Cancelar
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
