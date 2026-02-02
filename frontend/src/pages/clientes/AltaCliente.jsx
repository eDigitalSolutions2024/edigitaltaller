// src/pages/clientes/AltaCliente.jsx
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createCustomer, getCustomer, updateCustomer } from "../../api/customers";
import { listarEmpleados } from "../../api/empleados";
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
  email: "",
  telefono: { lada: "", numero: "", extension: "" },
  celular: { lada: "", numero: "" },
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

  // EMPRESA (Privada/Arrendadora)
  empresa: {
    contacto: {
      nombre: "",
      correo: "",
      telefono: { lada: "", numero: "", extension: "" },
      celular: { lada: "", numero: "" },
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
      telefono: { lada: "", numero: "", extension: "" },
      celular: { lada: "", numero: "" },
      departamento: "",
      puesto: "",
    },
    dependencia: {
      nombre: "",
      contacto: {
        nombre: "",
        correo: "",
        telefono: { lada: "", numero: "", extension: "" },
        celular: { lada: "", numero: "" },
        departamento: "",
        puesto: "",
      },
    },
  },
};

export default function AltaCliente() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState(initial);
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

        // Mezclamos sobre el initial para no perder ramas
        const merged = {
          ...initial,
          ...c,
          telefono: { ...initial.telefono, ...(c.telefono || {}) },
          celular: { ...initial.celular, ...(c.celular || {}) },
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
              telefono: {
                ...initial.empresa.contacto.telefono,
                ...(c.empresa?.contacto?.telefono || {}),
              },
              celular: {
                ...initial.empresa.contacto.celular,
                ...(c.empresa?.contacto?.celular || {}),
              },
            },
          },
          gobierno: {
            ...initial.gobierno,
            ...(c.gobierno || {}),
            contactoGobierno: {
              ...initial.gobierno.contactoGobierno,
              ...(c.gobierno?.contactoGobierno || {}),
              telefono: {
                ...initial.gobierno.contactoGobierno.telefono,
                ...(c.gobierno?.contactoGobierno?.telefono || {}),
              },
              celular: {
                ...initial.gobierno.contactoGobierno.celular,
                ...(c.gobierno?.contactoGobierno?.celular || {}),
              },
            },
            dependencia: {
              ...initial.gobierno.dependencia,
              ...(c.gobierno?.dependencia || {}),
              contacto: {
                ...initial.gobierno.dependencia.contacto,
                ...(c.gobierno?.dependencia?.contacto || {}),
                telefono: {
                  ...initial.gobierno.dependencia.contacto.telefono,
                  ...(c.gobierno?.dependencia?.contacto?.telefono || {}),
                },
                celular: {
                  ...initial.gobierno.dependencia.contacto.celular,
                  ...(c.gobierno?.dependencia?.contacto?.celular || {}),
                },
              },
            },
          },
        };

        const finalForm = normalizeForType(
          merged,
          merged.tipoCliente || "Particular"
        );

        setForm(finalForm);
      } catch (err) {
        setMsg("❌ " + (err?.response?.data?.error || err.message));
      } finally {
        setLoadingData(false);
      }
    };

    fetchCustomer();
  }, [id, isEdit]);

  // 👉 Cargar empleados para el combo de Asesor Responsable
  useEffect(() => {
    const loadEmpleados = async () => {
      try {
        const data = await listarEmpleados({ activo: true }); // solo activos
        setEmpleados(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error("Error cargando empleados", e);
        setEmpleados([]);
      }
    };

    loadEmpleados();
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    try {
      let payload = deepClone(form);

          // 👉 Por ahora usamos SOLO la dirección de facturación
    // y la guardamos en cliente.direccion
    if (payload.facturacion && payload.facturacion.direccion) {
      payload.direccion = deepClone(payload.facturacion.direccion);
    }

    // Opcional: si no quieres guardar nada de facturación aún
    delete payload.facturacion;


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
        await createCustomer(payload);
        setMsg("✅ Cliente creado correctamente.");
        setForm(initial);
      }

      navigate("/clientes/consulta");
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
    <form className="form-card" onSubmit={onSubmit}>
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
            <label>Nombre</label>
            <input
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
          <div className="form-row">
            <label>Correo Electrónico</label>
            <input
              type="email"
              value={form.email ?? ""}
              onChange={(e) => upd("email", e.target.value)}
            />
          </div>

          <div className="form-row">
            <label>Teléfono Fijo</label>
            <div className="phone-inline">
              <input
                placeholder="LADA"
                value={form.telefono?.lada ?? ""}
                onChange={(e) => upd("telefono.lada", e.target.value)}
              />
              <input
                placeholder="Número"
                value={form.telefono?.numero ?? ""}
                onChange={(e) => upd("telefono.numero", e.target.value)}
              />
            </div>
          </div>

          <div className="form-row">
            <label>Celular</label>
            <div className="phone-inline">
              <input
                placeholder="LADA"
                value={form.celular?.lada ?? ""}
                onChange={(e) => upd("celular.lada", e.target.value)}
              />
              <input
                placeholder="Número"
                value={form.celular?.numero ?? ""}
                onChange={(e) => upd("celular.numero", e.target.value)}
              />
            </div>
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
            <div className="form-row">
              <label>Correo Electrónico</label>
              <input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => upd("email", e.target.value)}
              />
            </div>

            <div className="form-row">
              <label>Teléfono Fijo</label>
              <div className="phone-inline">
                <input
                  placeholder="LADA"
                  value={form.telefono?.lada ?? ""}
                  onChange={(e) => upd("telefono.lada", e.target.value)}
                />
                <input
                  placeholder="Número"
                  value={form.telefono?.numero ?? ""}
                  onChange={(e) => upd("telefono.numero", e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <label>Celular</label>
              <div className="phone-inline">
                <input
                  placeholder="LADA"
                  value={form.celular?.lada ?? ""}
                  onChange={(e) => upd("celular.lada", e.target.value)}
                />
                <input
                  placeholder="Número"
                  value={form.celular?.numero ?? ""}
                  onChange={(e) => upd("celular.numero", e.target.value)}
                />
              </div>
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
            <div className="form-row">
              <label>Correo Electrónico</label>
              <input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => upd("email", e.target.value)}
              />
            </div>

            <div className="form-row">
              <label>Teléfono Fijo</label>
              <div className="phone-inline">
                <input
                  placeholder="LADA"
                  value={form.telefono?.lada ?? ""}
                  onChange={(e) => upd("telefono.lada", e.target.value)}
                />
                <input
                  placeholder="Número"
                  value={form.telefono?.numero ?? ""}
                  onChange={(e) => upd("telefono.numero", e.target.value)}
                />
              </div>
              <input
                placeholder="Extensión"
                value={form.empresa?.contacto?.telefono?.extension ?? ""}
                onChange={(e) =>
                  upd("empresa.contacto.telefono.extension", e.target.value)
                }
              />
            </div>

            <div className="form-row">
              <label>Celular</label>
              <div className="phone-inline">
                <input
                  placeholder="LADA"
                  value={form.celular?.lada ?? ""}
                  onChange={(e) => upd("celular.lada", e.target.value)}
                />
                <input
                  placeholder="Número"
                  value={form.celular?.numero ?? ""}
                  onChange={(e) => upd("celular.numero", e.target.value)}
                />
              </div>
            </div>

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
            <div className="form-row">
              <label>Correo Electrónico</label>
              <input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => upd("email", e.target.value)}
              />
            </div>

            <div className="form-row">
              <label>Celular</label>
              <div className="phone-inline">
                <input
                  placeholder="LADA"
                  value={form.celular?.lada ?? ""}
                  onChange={(e) => upd("celular.lada", e.target.value)}
                />
                <input
                  placeholder="Número"
                  value={form.celular?.numero ?? ""}
                  onChange={(e) => upd("celular.numero", e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <label>Teléfono Gobierno (LADA /Número/Ext.)</label>
              <div className="phone-inline">
                <input
                  placeholder="LADA"
                  value={
                    form.gobierno?.contactoGobierno?.telefono?.lada ?? ""
                  }
                  onChange={(e) =>
                    upd(
                      "gobierno.contactoGobierno.telefono.lada",
                      e.target.value
                    )
                  }
                />
                <input
                  placeholder="Número"
                  value={
                    form.gobierno?.contactoGobierno?.telefono?.numero ?? ""
                  }
                  onChange={(e) =>
                    upd(
                      "gobierno.contactoGobierno.telefono.numero",
                      e.target.value
                    )
                  }
                />
              </div>
              <input
                placeholder="Extensión"
                value={
                  form.gobierno?.contactoGobierno?.telefono?.extension ?? ""
                }
                onChange={(e) =>
                  upd(
                    "gobierno.contactoGobierno.telefono.extension",
                    e.target.value
                  )
                }
              />
            </div>

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

            <div className="form-row">
              <label>Teléfono Dependencia (LADA/Número/Ext.)</label>
              <div className="phone-inline">
                <input
                  placeholder="LADA"
                  value={
                    form.gobierno?.dependencia?.contacto?.telefono?.lada ??
                    ""
                  }
                  onChange={(e) =>
                    upd(
                      "gobierno.dependencia.contacto.telefono.lada",
                      e.target.value
                    )
                  }
                />
                <input
                  placeholder="Número"
                  value={
                    form.gobierno?.dependencia?.contacto?.telefono
                      ?.numero ?? ""
                  }
                  onChange={(e) =>
                    upd(
                      "gobierno.dependencia.contacto.telefono.numero",
                      e.target.value
                    )
                  }
                />
              </div>
              <input
                placeholder="Extensión"
                value={
                  form.gobierno?.dependencia?.contacto?.telefono
                    ?.extension ?? ""
                }
                onChange={(e) =>
                  upd(
                    "gobierno.dependencia.contacto.telefono.extension",
                    e.target.value
                  )
                }
              />
            </div>
            <div className="form-row">
              <label>Celular</label>
              <div className="phone-inline">
                <input
                  placeholder="LADA"
                  value={form.celular?.lada ?? ""}
                  onChange={(e) => upd("celular.lada", e.target.value)}
                />
                <input
                  placeholder="Número"
                  value={form.celular?.numero ?? ""}
                  onChange={(e) => upd("celular.numero", e.target.value)}
                />
              </div>
            </div>

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
          <label>Dirección (Calle)</label>
          <input
            value={form.facturacion?.direccion?.calle ?? ""}
            onChange={(e) =>
              upd("facturacion.direccion.calle", e.target.value)
            }
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
            onChange={(e) =>
              upd("facturacion.direccion.colonia", e.target.value)
            }
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
            onChange={(e) =>
              upd("facturacion.direccion.ciudad", e.target.value)
            }
          />
        </div>
        <div className="form-row">
          <label>Estado</label>
          <input
            value={form.facturacion?.direccion?.estado ?? ""}
            onChange={(e) =>
              upd("facturacion.direccion.estado", e.target.value)
            }
          />
        </div>

        {/* 👉 Combo de Asesor Responsable */}
        <div className="form-row">
          <label>Asesor Responsable</label>
          <select
            value={form.asesorResponsable ?? ""}
            onChange={(e) => upd("asesorResponsable", e.target.value)}
          >
            <option value="">-- Seleccionar --</option>
            {empleados.map((emp) => (
              <option key={emp._id} value={emp.nombre}>
                {emp.nombre}
                {emp.puesto ? ` (${emp.puesto})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label>Condiciones de Pago</label>
          <select
            value={form.condicionesPago ?? ""}
            onChange={(e) => upd("condicionesPago", e.target.value)}
            placeholder="Contado, Crédito 15, Crédito 30..."
          >
            <option value="">-- Seleccionar --</option>
            <option value="Contado">Contado</option>
            <option value="Credito">Crédito</option>
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
