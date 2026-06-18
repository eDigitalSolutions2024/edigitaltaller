// src/pages/clientes/AltaCliente.jsx
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createCustomer, getCustomer, updateCustomer } from "../../api/customers";
import { getAsesores } from "../../api/users";
import "../../styles/clientes.css";

const CLIENT_TYPES = [
  "Particular",
  "Empresa Privada",
  "Empresa Arrendadora",
  "Empresa Gobierno",
];

// deep clone simple
const deepClone = (o) => JSON.parse(JSON.stringify(o));

// setIn: actualiza rutas anidadas inmutablemente y crea ramas si faltan
function setIn(obj, path, value) {
  const keys = path.split(".");
  const out = Array.isArray(obj) ? [...obj] : { ...obj };
  let cur = out;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    const next = cur[k];
    cur[k] =
      next && typeof next === "object"
        ? Array.isArray(next)
          ? [...next]
          : { ...next }
        : {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
  return out;
}

const initial = {
  tipoCliente: "Particular",

  // COMUNES
  nombre: "",
  apellidoPaterno: "",
  apellidoMaterno: "",
  emails: [""],
  telefonos: [{ lada: "", numero: "" }],
  celulares: [{ lada: "", numero: "" }],
  rfc: "",
  direccion: {
    calle: "",
    numeroExterior: "",
    numeroInterior: "",
    colonia: "",
    codigoPostal: "",
    ciudad: "",
    estado: "",
  },
  facturacion: {
    regimenFiscal: "",
    usoCFDI: "",
    direccion: {
      calle: "",
      numeroExterior: "",
      numeroInterior: "",
      colonia: "",
      codigoPostal: "",
      ciudad: "",
      estado: "",
    },
  },
  asesorResponsable: "",
  condicionesPago: "",
  observaciones: "",
  requiereFacturacion: false,
  pais: "México",

  // EMPRESA (Privada/Arrendadora)
  empresa: {
    contacto: {
      nombre: "",
      correo: "",
      telefonos: [{ lada: "", numero: "" }], // 👈 array
      celulares: [{ lada: "", numero: "" }], // 👈 array
      departamento: "",
      puesto: "",
    },
  },

  // GOBIERNO
  gobierno: {
    nombreGobierno: "",
    contactoGobierno: {
      nombre: "",
      correo: "",
      telefonos: [{ lada: "", numero: "" }], // 👈 array
      celulares: [{ lada: "", numero: "" }], // 👈 array
      departamento: "",
      puesto: "",
    },
    dependencia: {
      nombre: "",
      contacto: {
        nombre: "",
        correo: "",
        telefonos: [{ lada: "", numero: "" }], // 👈 array
        celulares: [{ lada: "", numero: "" }], // 👈 array
        departamento: "",
        puesto: "",
      },
    },
  },
};


function TelefonoList({ label, valores, onChange }) {
  const handleChange = (i, field, value) => {
    const arr = [...valores];
    arr[i] = { ...arr[i], [field]: value };
    onChange(arr);
  };

  const handleAdd = () => onChange([...valores, { lada: "", numero: "" }]);

  const handleRemove = (i) => onChange(valores.filter((_, idx) => idx !== i));

  return (
    <div className="form-row col-12">
      <label>{label}</label>
      {valores.map((tel, i) => (
        <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "6px", alignItems: "center" }}>
          <input
            placeholder="LADA"
            value={tel.lada ?? ""}
            onChange={(e) => handleChange(i, "lada", e.target.value)}
            style={{ width: "80px" }}
          />
          <input
            placeholder="Número"
            value={tel.numero ?? ""}
            onChange={(e) => handleChange(i, "numero", e.target.value)}
            style={{ flex: 1 }}
          />
          {i === 0 ? (
            <span style={{ fontSize: "12px", color: "var(--color-text-info)", whiteSpace: "nowrap" }}>
              Principal
            </span>
          ) : (
            <button
              type="button"
              onClick={() => handleRemove(i)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "red" }}
            >✕</button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={handleAdd}
        style={{ fontSize: "13px", background: "none", border: "1px dashed #aaa", borderRadius: "6px", padding: "4px 10px", cursor: "pointer", marginTop: "2px" }}
      >
        + Agregar {label.toLowerCase()}
      </button>
    </div>
  );
}

export default function AltaCliente({ modoModal = false, nombreInicial = "", onClienteCreado }) {
  const params = useParams();
  const id = modoModal ? undefined : params.id;
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState(initial);
  useEffect(() => {
    if (modoModal && nombreInicial) {
      setForm((prev) => ({ ...prev, nombre: nombreInicial }));
    }
  }, [modoModal, nombreInicial]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [loadingData, setLoadingData] = useState(false);

  // 👉 lista de empleados para el combo de Asesor Responsable
  const [empleados, setEmpleados] = useState([]);

  const upd = (path, v) => setForm((prev) => setIn(prev, path, v));

  function normalizeForType(prev, tipo) {
    const next = { ...prev, tipoCliente: tipo };

    if (tipo === "Particular") {
      delete next.empresa;
      delete next.gobierno;
    }
    if (tipo === "Empresa Privada" || tipo === "Empresa Arrendadora") {
      next.empresa = next.empresa || deepClone(initial.empresa);
      delete next.gobierno;
    }
    if (tipo === "Empresa Gobierno") {
      next.gobierno = next.gobierno || deepClone(initial.gobierno);
      delete next.empresa;
    }
    return next;
  }

  const onTipoChange = (e) => {
    const tipo = e.target.value;
    setForm((prev) => normalizeForType(prev, tipo));
  };

  // Cargar datos cuando es edición
  useEffect(() => {
  if (!isEdit) return;

  const fetchCustomer = async () => {
    try {
      setLoadingData(true);
      setMsg("");
      const { data } = await getCustomer(id);
      if (!data?.data) throw new Error(data?.error || "Error al cargar cliente");

      const c = data.data;

      // Helper: migra telefono/celular singular a array si viene en formato viejo
      const migarTels = (arr, obj) => {
        if (Array.isArray(arr) && arr.length) return arr;
        if (obj?.numero) return [{ lada: obj.lada || "", numero: obj.numero }];
        return [{ lada: "", numero: "" }];
      };

      const merged = {
        ...initial,
        ...c,
        pais: c.pais || "México",
        emails: Array.isArray(c.emails) && c.emails.length ? c.emails : [""],

        // Migrar telefonos/celulares raíz
        telefonos: migarTels(c.telefonos, c.telefono),
        celulares: migarTels(c.celulares, c.celular),

        requiereFacturacion: Boolean(
          c.rfc ||
          c.direccion?.calle ||
          c.direccion?.codigoPostal ||
          c.facturacion?.direccion?.calle ||
          c.facturacion?.direccion?.codigoPostal
        ),
        direccion: { ...initial.direccion, ...(c.direccion || {}) },
        facturacion: {
          ...initial.facturacion,
          ...(c.facturacion || {}),
          direccion: {
            ...initial.facturacion.direccion,
            ...(c.facturacion?.direccion || {}),
          },
        },
        empresa: {
          ...initial.empresa,
          ...(c.empresa || {}),
          contacto: {
            ...initial.empresa.contacto,
            ...(c.empresa?.contacto || {}),
            // Migrar contacto empresa
            telefonos: migarTels(c.empresa?.contacto?.telefonos, c.empresa?.contacto?.telefono),
            celulares: migarTels(c.empresa?.contacto?.celulares, c.empresa?.contacto?.celular),
          },
        },
        gobierno: {
          ...initial.gobierno,
          ...(c.gobierno || {}),
          contactoGobierno: {
            ...initial.gobierno.contactoGobierno,
            ...(c.gobierno?.contactoGobierno || {}),
            // Migrar contacto gobierno
            telefonos: migarTels(c.gobierno?.contactoGobierno?.telefonos, c.gobierno?.contactoGobierno?.telefono),
            celulares: migarTels(c.gobierno?.contactoGobierno?.celulares, c.gobierno?.contactoGobierno?.celular),
          },
          dependencia: {
            ...initial.gobierno.dependencia,
            ...(c.gobierno?.dependencia || {}),
            contacto: {
              ...initial.gobierno.dependencia.contacto,
              ...(c.gobierno?.dependencia?.contacto || {}),
              // Migrar contacto dependencia
              telefonos: migarTels(c.gobierno?.dependencia?.contacto?.telefonos, c.gobierno?.dependencia?.contacto?.telefono),
              celulares: migarTels(c.gobierno?.dependencia?.contacto?.celulares, c.gobierno?.dependencia?.contacto?.celular),
            },
          },
        },
      };

      const finalForm = normalizeForType(merged, merged.tipoCliente || "Particular");
      setForm(finalForm);
    } catch (err) {
      setMsg("❌ " + (err?.response?.data?.error || err.message));
    } finally {
      setLoadingData(false);
    }
  };

  fetchCustomer();
}, [id, isEdit]);

  // 👉 Cargar asesores (usuarios con rol asesor_servicio) para el combo de Asesor Responsable
  useEffect(() => {
    const loadAsesores = async () => {
      try {
        const data = await getAsesores();
        setEmpleados(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error("Error cargando asesores", e);
        setEmpleados([]);
      }
    };

    loadAsesores();
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    try {
      let payload = deepClone(form);

   if (payload.requiereFacturacion) {
      payload.facturacion = {
        mismaQueDireccion: false,
        regimenFiscal: payload.facturacion?.regimenFiscal || "",
        usoCFDI: payload.facturacion?.usoCFDI || "",
        direccion: payload.facturacion?.direccion || {},
      };
    } else {
      payload.rfc = "";
      payload.facturacion = undefined;
    }


      // Limpia ramas que no aplican
      if (payload.tipoCliente === "Particular") {
        delete payload.empresa;
        delete payload.gobierno;
      }
      if (
        payload.tipoCliente === "Empresa Privada" ||
        payload.tipoCliente === "Empresa Arrendadora"
      ) {
        delete payload.gobierno;
      }
      if (payload.tipoCliente === "Empresa Gobierno") {
        delete payload.empresa;
      }

      if (isEdit) {
        await updateCustomer(id, payload);
        setMsg("✅ Cliente actualizado correctamente.");
      } else {
        const res = await createCustomer(payload);
        const clienteNuevo = res?.data?.data;
        setMsg("✅ Cliente creado correctamente.");
        setForm(initial);

        if (modoModal && onClienteCreado) {
          onClienteCreado(clienteNuevo); // 👈 avisa al padre y cierra el modal
          return;                        // no navega
        }
      }
      if (!modoModal) navigate("/clientes/consulta");
    } catch (err) {
      setMsg("❌ " + (err?.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  if (loadingData) {
    return (
      <div className="form-card">
        <p>Cargando datos del cliente...</p>
      </div>
    );
  }

  return (
    <form className="form-card" onSubmit={onSubmit} autoComplete="off">
      <h2>{isEdit ? "Editar Cliente" : "Alta de Clientes"}</h2>

      {/* Tipo */}
      <div className="form-grid">
        <div className="form-row">
          <label>Tipo de Cliente</label>
          <select value={form.tipoCliente} onChange={onTipoChange}>
            {CLIENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ===== Campos comunes / por tipo ===== */}
      {/* Particular */}
      {form.tipoCliente === "Particular" && (
        <div className="form-grid">
          <div className="form-row">
            <label>Nombre *</label>
            <input
              required={form.tipoCliente === "Particular"}
              value={form.nombre ?? ""}
              onChange={(e) => upd("nombre", e.target.value)}
            />
          </div>
          <div className="form-row">
            <label>Apellido Paterno</label>
            <input
              value={form.apellidoPaterno ?? ""}
              onChange={(e) => upd("apellidoPaterno", e.target.value)}
            />
          </div>
          <div className="form-row">
            <label>Apellido Materno</label>
            <input
              value={form.apellidoMaterno ?? ""}
              onChange={(e) => upd("apellidoMaterno", e.target.value)}
            />
          </div>
          <div className="form-row col-12">
            <label>Correos Electrónicos</label>
            {(form.emails ?? [""]).map((mail, i) => (
              <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "6px", alignItems: "center" }}>
                <input
                  type="email"
                  placeholder={i === 0 ? "Principal" : `Correo ${i + 1}`}
                  value={mail}
                  onChange={(e) => {
                    const arr = [...(form.emails ?? [""])];
                    arr[i] = e.target.value;
                    upd("emails", arr);
                  }}
                  style={{ flex: 1 }}
                />
                {i === 0 ? (
                  <span style={{ fontSize: "12px", color: "var(--color-text-info)", whiteSpace: "nowrap" }}>
                    Principal
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const arr = (form.emails ?? [""]).filter((_, idx) => idx !== i);
                      upd("emails", arr);
                    }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "red" }}
                  >✕</button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => upd("emails", [...(form.emails ?? [""]), ""])}
              style={{ fontSize: "13px", background: "none", border: "1px dashed #aaa", borderRadius: "6px", padding: "4px 10px", cursor: "pointer", marginTop: "2px" }}
            >
              + Agregar correo
            </button>
          </div>

          <TelefonoList
            label="Celular *"
            valores={form.celulares ?? [{ lada: "", numero: "" }]}
            onChange={(arr) => upd("celulares", arr)}
          />

          {/* Dirección del cliente particular */}
          <div className="form-row">
            <label>Dirección (Calle) *</label>
            <input
              required={form.tipoCliente === "Particular"}
              value={form.direccion?.calle ?? ""}
              onChange={(e) => upd("direccion.calle", e.target.value)}
            />
          </div>

          <div className="form-row">
            <label>Número Exterior *</label>
            <input
              required={form.tipoCliente === "Particular"}
              value={form.direccion?.numeroExterior ?? ""}
              onChange={(e) => upd("direccion.numeroExterior", e.target.value)}
            />
          </div>

          <div className="form-row">
            <label>Número Interior</label>
            <input
              value={form.direccion?.numeroInterior ?? ""}
              onChange={(e) => upd("direccion.numeroInterior", e.target.value)}
            />
          </div>

          <div className="form-row">
            <label>Colonia *</label>
            <input
              required={form.tipoCliente === "Particular"}
              value={form.direccion?.colonia ?? ""}
              onChange={(e) => upd("direccion.colonia", e.target.value)}
            />
          </div>

          <div className="form-row">
            <label>Código Postal</label>
            <input
              //required={form.tipoCliente === "Particular"}
              value={form.direccion?.codigoPostal ?? ""}
              onChange={(e) => upd("direccion.codigoPostal", e.target.value)}
            />
          </div>

          <div className="form-row">
            <label>Ciudad *</label>
            <input
              required={form.tipoCliente === "Particular"}
              value={form.direccion?.ciudad ?? ""}
              onChange={(e) => upd("direccion.ciudad", e.target.value)}
            />
          </div>

          <div className="form-row">
            <label>Estado *</label>
            <input
              required={form.tipoCliente === "Particular"}
              value={form.direccion?.estado ?? ""}
              onChange={(e) => upd("direccion.estado", e.target.value)}
            />
          </div>

          <div className="form-row">
            <label>País</label>
            <select
              value={form.pais ?? "México"}
              onChange={(e) => upd("pais", e.target.value)}
            >
              <option value="México">México</option>
              <option value="Estados Unidos">Estados Unidos</option>
            </select>
          </div>

        </div>
      )}

      {/* Empresa Privada */}
      {form.tipoCliente === "Empresa Privada" && (
        <>
          <div className="form-grid">
            <div className="form-row">
              <label>Nombre Empresa</label>
              <input
                value={form.nombre ?? ""}
                onChange={(e) => upd("nombre", e.target.value)}
              />
            </div>
            <div className="form-row">
              <label>Nombre Contacto Empresa</label>
              <input
                value={form.apellidoPaterno ?? ""}
                onChange={(e) => upd("apellidoPaterno", e.target.value)}
              />
            </div>
            <div className="form-row col-12">
              <label>Correos Electrónicos</label>
              {(form.emails ?? [""]).map((mail, i) => (
                <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "6px", alignItems: "center" }}>
                  <input
                    type="email"
                    placeholder={i === 0 ? "Principal" : `Correo ${i + 1}`}
                    value={mail}
                    onChange={(e) => {
                      const arr = [...(form.emails ?? [""])];
                      arr[i] = e.target.value;
                      upd("emails", arr);
                    }}
                    style={{ flex: 1 }}
                  />
                  {i === 0 ? (
                    <span style={{ fontSize: "12px", color: "var(--color-text-info)", whiteSpace: "nowrap" }}>
                      Principal
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const arr = (form.emails ?? [""]).filter((_, idx) => idx !== i);
                        upd("emails", arr);
                      }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "red" }}
                    >✕</button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => upd("emails", [...(form.emails ?? [""]), ""])}
                style={{ fontSize: "13px", background: "none", border: "1px dashed #aaa", borderRadius: "6px", padding: "4px 10px", cursor: "pointer", marginTop: "2px" }}
              >
                + Agregar correo
              </button>
            </div>

            <TelefonoList
              label="Teléfono Fijo"
              valores={form.telefonos ?? [{ lada: "", numero: "" }]}
              onChange={(arr) => upd("telefonos", arr)}
            />

            <TelefonoList
              label="Celular"
              valores={form.celulares ?? [{ lada: "", numero: "" }]}
              onChange={(arr) => upd("celulares", arr)}
            />

            <div className="form-row">
              <label>País</label>
              <select
                value={form.pais ?? "México"}
                onChange={(e) => upd("pais", e.target.value)}
              >
                <option value="México">México</option>
                <option value="Estados Unidos">Estados Unidos</option>
              </select>
            </div>

          </div>
        </>
      )}

      {/* Empresa Arrendadora */}
      {form.tipoCliente === "Empresa Arrendadora" && (
        <>
          <div className="form-grid">
            <div className="form-row">
              <label>Nombre Arrendadora</label>
              <input
                value={form.nombre ?? ""}
                onChange={(e) => upd("nombre", e.target.value)}
              />
            </div>
            <div className="form-row">
              <label>Nombre Contacto Arrendadora</label>
              <input
                value={form.apellidoPaterno ?? ""}
                onChange={(e) => upd("apellidoPaterno", e.target.value)}
              />
            </div>
            <div className="form-row col-12">
              <label>Correos Electrónicos</label>
              {(form.emails ?? [""]).map((mail, i) => (
                <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "6px", alignItems: "center" }}>
                  <input
                    type="email"
                    placeholder={i === 0 ? "Principal" : `Correo ${i + 1}`}
                    value={mail}
                    onChange={(e) => {
                      const arr = [...(form.emails ?? [""])];
                      arr[i] = e.target.value;
                      upd("emails", arr);
                    }}
                    style={{ flex: 1 }}
                  />
                  {i === 0 ? (
                    <span style={{ fontSize: "12px", color: "var(--color-text-info)", whiteSpace: "nowrap" }}>
                      Principal
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const arr = (form.emails ?? [""]).filter((_, idx) => idx !== i);
                        upd("emails", arr);
                      }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "red" }}
                    >✕</button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => upd("emails", [...(form.emails ?? [""]), ""])}
                style={{ fontSize: "13px", background: "none", border: "1px dashed #aaa", borderRadius: "6px", padding: "4px 10px", cursor: "pointer", marginTop: "2px" }}
              >
                + Agregar correo
              </button>
            </div>

            <TelefonoList
              label="Teléfono Fijo"
              valores={form.telefonos ?? [{ lada: "", numero: "" }]}
              onChange={(arr) => upd("telefonos", arr)}
            />

            <TelefonoList
              label="Celular"
              valores={form.celulares ?? [{ lada: "", numero: "" }]}
              onChange={(arr) => upd("celulares", arr)}
            />

            <div className="form-row">
              <label>Departamento</label>
              <input
                value={form.empresa?.contacto?.departamento ?? ""}
                onChange={(e) =>
                  upd("empresa.contacto.departamento", e.target.value)
                }
              />
            </div>

            <div className="form-row">
              <label>Puesto</label>
              <input
                value={form.empresa?.contacto?.puesto ?? ""}
                onChange={(e) =>
                  upd("empresa.contacto.puesto", e.target.value)
                }
              />
            </div>

            <div className="form-row">
              <label>País</label>
              <select
                value={form.pais ?? "México"}
                onChange={(e) => upd("pais", e.target.value)}
              >
                <option value="México">México</option>
                <option value="Estados Unidos">Estados Unidos</option>
              </select>
            </div>

            
          </div>
        </>
      )}

      {/* Gobierno */}
      {form.tipoCliente === "Empresa Gobierno" && (
        <>
          <h3>Gobierno</h3>
          <div className="form-grid">
            <div className="form-row">
              <label>Nombre Gobierno</label>
              <input
                value={form.gobierno?.nombreGobierno ?? ""}
                onChange={(e) =>
                  upd("gobierno.nombreGobierno", e.target.value)
                }
              />
            </div>

            <div className="form-row">
              <label>Contacto Gobierno (Nombre)</label>
              <input
                value={form.gobierno?.contactoGobierno?.nombre ?? ""}
                onChange={(e) =>
                  upd("gobierno.contactoGobierno.nombre", e.target.value)
                }
              />
            </div>
            <div className="form-row col-12">
              <label>Correos Electrónicos</label>
              {(form.emails ?? [""]).map((mail, i) => (
                <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "6px", alignItems: "center" }}>
                  <input
                    type="email"
                    placeholder={i === 0 ? "Principal" : `Correo ${i + 1}`}
                    value={mail}
                    onChange={(e) => {
                      const arr = [...(form.emails ?? [""])];
                      arr[i] = e.target.value;
                      upd("emails", arr);
                    }}
                    style={{ flex: 1 }}
                  />
                  {i === 0 ? (
                    <span style={{ fontSize: "12px", color: "var(--color-text-info)", whiteSpace: "nowrap" }}>
                      Principal
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const arr = (form.emails ?? [""]).filter((_, idx) => idx !== i);
                        upd("emails", arr);
                      }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "red" }}
                    >✕</button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => upd("emails", [...(form.emails ?? [""]), ""])}
                style={{ fontSize: "13px", background: "none", border: "1px dashed #aaa", borderRadius: "6px", padding: "4px 10px", cursor: "pointer", marginTop: "2px" }}
              >
                + Agregar correo
              </button>
            </div>

            <TelefonoList
              label="Celular"
              valores={form.celulares ?? [{ lada: "", numero: "" }]}
              onChange={(arr) => upd("celulares", arr)}
            />

            <TelefonoList
              label="Teléfono Gobierno"
              valores={form.gobierno?.contactoGobierno?.telefonos ?? [{ lada: "", numero: "" }]}
              onChange={(arr) => upd("gobierno.contactoGobierno.telefonos", arr)}
            />

            <div className="form-row">
              <label>Departamento</label>
              <input
                value={
                  form.gobierno?.contactoGobierno?.departamento ?? ""
                }
                onChange={(e) =>
                  upd(
                    "gobierno.contactoGobierno.departamento",
                    e.target.value
                  )
                }
              />
            </div>
            <div className="form-row">
              <label>Puesto</label>
              <input
                value={form.gobierno?.contactoGobierno?.puesto ?? ""}
                onChange={(e) =>
                  upd("gobierno.contactoGobierno.puesto", e.target.value)
                }
              />
            </div>

            <div className="form-row">
              <label>País</label>
              <select
                value={form.pais ?? "México"}
                onChange={(e) => upd("pais", e.target.value)}
              >
                <option value="México">México</option>
                <option value="Estados Unidos">Estados Unidos</option>
              </select>
            </div>

          </div>

          <h3>Dependencia</h3>
          <div className="form-grid">
            <div className="form-row">
              <label>Nombre Dependencia</label>
              <input
                value={form.gobierno?.dependencia?.nombre ?? ""}
                onChange={(e) =>
                  upd("gobierno.dependencia.nombre", e.target.value)
                }
              />
            </div>
            <div className="form-row">
              <label>Contacto Dependencia (Nombre)</label>
              <input
                value={form.gobierno?.dependencia?.contacto?.nombre ?? ""}
                onChange={(e) =>
                  upd(
                    "gobierno.dependencia.contacto.nombre",
                    e.target.value
                  )
                }
              />
            </div>
            <div className="form-row">
              <label>Correo Electronico(Correo)</label>
              <input
                value={form.gobierno?.dependencia?.contacto?.correo ?? ""}
                onChange={(e) =>
                  upd(
                    "gobierno.dependencia.contacto.correo",
                    e.target.value
                  )
                }
              />
            </div>


            <TelefonoList
              label="Teléfono Dependencia"
              valores={form.gobierno?.dependencia?.contacto?.telefonos ?? [{ lada: "", numero: "" }]}
              onChange={(arr) => upd("gobierno.dependencia.contacto.telefonos", arr)}
            />


            <TelefonoList
              label="Celular"
              valores={form.gobierno?.dependencia?.contacto?.celulares ?? [{ lada: "", numero: "" }]}
              onChange={(arr) => upd("gobierno.dependencia.contacto.celulares", arr)}
            />

            <div className="form-row">
              <label>Departamento</label>
              <input
                value={
                  form.gobierno?.dependencia?.contacto?.departamento ??
                  ""
                }
                onChange={(e) =>
                  upd(
                    "gobierno.dependencia.contacto.departamento",
                    e.target.value
                  )
                }
              />
            </div>
            <div className="form-row">
              <label>Puesto</label>
              <input
                value={
                  form.gobierno?.dependencia?.contacto?.puesto ?? ""
                }
                onChange={(e) =>
                  upd(
                    "gobierno.dependencia.contacto.puesto",
                    e.target.value
                  )
                }
              />
            </div>
          </div>
        </>
      )}

      {/* ===== Facturación ===== */}
      <div className="facturacion-toggle">
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={form.requiereFacturacion || false}
            onChange={(e) => upd("requiereFacturacion", e.target.checked)}
          />
          ¿El cliente requiere facturación?
        </label>
      </div>

      {form.requiereFacturacion && (
        <>
          <h3>Datos de Facturación</h3>

          <div className="form-grid">
            <div className="form-row">
              <label>RFC</label>
              <input
                value={form.rfc ?? ""}
                onChange={(e) => upd("rfc", e.target.value.toUpperCase())}
              />
            </div>

            <div className="form-row">
              <label>Régimen Fiscal</label>
              <select
                value={form.facturacion?.regimenFiscal ?? ""}
                onChange={(e) => upd("facturacion.regimenFiscal", e.target.value)}
              >
                <option value="">-- Seleccionar --</option>
                <option value="601">601 - Régimen General de Ley Personas Morales</option>
                <option value="602">602 - Régimen Simplificado de Ley Personas Morales</option>
                <option value="603">603 - Personas Morales con Fines no Lucrativos</option>
                <option value="604">604 - Régimen de Pequeños Contribuyentes</option>
                <option value="605">605 - Régimen de Sueldos y Salarios e Ingresos Asimilados a Salarios</option>
                <option value="606">606 - Régimen de Arrendamiento</option>
                <option value="607">607 - Régimen de Enajenación o Adquisición de Bienes</option>
                <option value="608">608 - Régimen de los Demás Ingresos</option>
                <option value="609">609 - Régimen de Consolidación</option>
                <option value="610">610 - Régimen Residentes en el Extranjero sin Establecimiento Permanente en México</option>
                <option value="611">611 - Régimen de Ingresos por Dividendos (Socios y Accionistas)</option>
                <option value="612">612 - Régimen de las Personas Físicas con Actividades Empresariales y Profesionales</option>
                <option value="613">613 - Régimen Intermedio de las Personas Físicas con Actividades Empresariales</option>
                <option value="614">614 - Régimen de los Ingresos por Intereses</option>
                <option value="615">615 - Régimen de los Ingresos por Obtención de Premios</option>
                <option value="616">616 - Sin Obligaciones Fiscales</option>
                <option value="617">617 - PEMEX</option>
                <option value="618">618 - Régimen Simplificado de Ley Personas Físicas</option>
                <option value="619">619 - Ingresos por la Obtención de Préstamos</option>
                <option value="620">620 - Sociedades Cooperativas de Producción que Optan por Diferir sus Ingresos</option>
                <option value="621">621 - Régimen de Incorporación Fiscal</option>
                <option value="622">622 - Régimen de Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras PM</option>
                <option value="623">623 - Régimen Opcional para Grupos de Sociedades</option>
                <option value="624">624 - Régimen de los Coordinados</option>
                <option value="625">625 - Régimen de las Actividades Empresariales con Ingresos a través de Plataformas Tecnológicas</option>
                <option value="626">626 - Régimen Simplificado de Confianza</option>
              </select>
            </div>

            <div className="form-row">
              <label>Uso de CFDI</label>
              <select
                value={form.facturacion?.usoCFDI ?? ""}
                onChange={(e) => upd("facturacion.usoCFDI", e.target.value)}
              >
                <option value="">-- Seleccionar --</option>
                <option value="G01">G01 - Adquisición de mercancías</option>
                <option value="G03">G03 - Gastos en general</option>
                <option value="I01">I01 - Construcciones</option>
                <option value="I02">I02 - Mobiliario y equipo de oficina</option>
                <option value="I04">I04 - Equipo de cómputo</option>
                <option value="D01">D01 - Honorarios médicos</option>
                <option value="D10">D10 - Pagos por servicios educativos</option>
                <option value="S01">S01 - Sin efectos fiscales</option>
              </select>
            </div>

            <div className="form-row">
              <label>Dirección (Calle)</label>
              <input
                value={form.facturacion?.direccion?.calle ?? ""}
                onChange={(e) => upd("facturacion.direccion.calle", e.target.value)}
              />
            </div>

            <div className="form-row">
              <label>Número Exterior</label>
              <input
                value={form.facturacion?.direccion?.numeroExterior ?? ""}
                onChange={(e) =>
                  upd("facturacion.direccion.numeroExterior", e.target.value)
                }
              />
            </div>

            <div className="form-row">
              <label>Número Interior</label>
              <input
                value={form.facturacion?.direccion?.numeroInterior ?? ""}
                onChange={(e) =>
                  upd("facturacion.direccion.numeroInterior", e.target.value)
                }
              />
            </div>

            <div className="form-row">
              <label>Colonia</label>
              <input
                value={form.facturacion?.direccion?.colonia ?? ""}
                onChange={(e) => upd("facturacion.direccion.colonia", e.target.value)}
              />
            </div>

            <div className="form-row">
              <label>Código Postal</label>
              <input
                value={form.facturacion?.direccion?.codigoPostal ?? ""}
                onChange={(e) =>
                  upd("facturacion.direccion.codigoPostal", e.target.value)
                }
              />
            </div>

            <div className="form-row">
              <label>Ciudad</label>
              <input
                value={form.facturacion?.direccion?.ciudad ?? ""}
                onChange={(e) => upd("facturacion.direccion.ciudad", e.target.value)}
              />
            </div>

            <div className="form-row">
              <label>Estado</label>
              <input
                value={form.facturacion?.direccion?.estado ?? ""}
                onChange={(e) => upd("facturacion.direccion.estado", e.target.value)}
              />
            </div>

            <div className="form-row">
              <label>Condiciones de Pago</label>
              <select
                value={form.condicionesPago ?? ""}
                onChange={(e) => upd("condicionesPago", e.target.value)}
              >
                <option value="">-- Seleccionar --</option>
                <option value="Contado">Contado</option>
                <option value="Credito">Crédito</option>
              </select>
            </div>
          </div>
        </>
      )}

      {/* 👉 Combo de Asesor Responsable */}
      <div className="form-grid">
        <div className="form-row">
          <label>Asesor Responsable</label>
          <select
            value={form.asesorResponsable ?? ""}
            onChange={(e) => upd("asesorResponsable", e.target.value)}
          >
            <option value="">-- Seleccionar --</option>
            {empleados.map((user) => (
              <option key={user._id} value={user.name}>
                {user.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row col-12">
          <label>Observaciones</label>
          <textarea
            rows={3}
            value={form.observaciones ?? ""}
            onChange={(e) => upd("observaciones", e.target.value)}
          />
        </div>
      </div>

      <div className="form-actions">
        <button className="btn btn-primary" disabled={saving}>
          {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Guardar"}
        </button>

        {!isEdit && (
          <button
            type="reset"
            className="btn btn-light"
            onClick={() => setForm(initial)}
            disabled={saving}
          >
            Limpiar
          </button>
        )}

        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={() => navigate("/clientes/consulta")}
          disabled={saving}
        >
          Regresar
        </button>
      </div>

      {msg && <div className="form-msg">{msg}</div>}
    </form>
  );
}
