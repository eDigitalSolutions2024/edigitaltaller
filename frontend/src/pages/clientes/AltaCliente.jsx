// src/pages/clientes/AltaCliente.jsx
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Dropdown from "../../components/Dropdown";
import { createCustomer, getCustomer, updateCustomer } from "../../api/customers";
import { getAsesores } from "../../api/users";
import { getUser } from "../../auth";
import { puedeEditarCodigosCliente } from "../../utils/roles";
import { REGIMEN_FISCAL_OPTIONS } from "../../utils/regimenFiscal";
import ModalCodigosCliente from "./components/ModalCodigosCliente";
import "../../styles/clientes.css";

const CLIENT_TYPES = [
  "Particular",
  "Empresa Privada",
  "Empresa Arrendadora",
  "Empresa Gobierno",
];

// deep clone simple
const deepClone = (o) => JSON.parse(JSON.stringify(o));

function formatMoneyMXN(n) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}

const emptyContacto = () => ({
  nombre: "",
  correo: "",
  telefonos: [{ lada: "", numero: "" }],
  celulares: [{ lada: "", numero: "" }],
  departamento: "",
  puesto: "",
});

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
  esEmpleado: false,
  pais: "México",

  // EMPRESA (Privada/Arrendadora)
  empresa: {
    razonSocial: "",
    contacto: [emptyContacto()], // 👈 varios contactos
  },

  // GOBIERNO
  gobierno: {
    nombreGobierno: "",
    contactoGobierno: [emptyContacto()], // 👈 varios contactos
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


function EmailList({ emails, onChange }) {
  const lista = emails?.length ? emails : [""];

  const handleChange = (i, value) => {
    const arr = [...lista];
    arr[i] = value;
    onChange(arr);
  };

  const handleAdd = () => onChange([...lista, ""]);

  const handleRemove = (i) => onChange(lista.filter((_, idx) => idx !== i));

  return (
    <div className="form-row col-12">
      <label>Correos Electrónicos</label>
      <div className="repeat-list">
        {lista.map((mail, i) => (
          <div className="repeat-list-item" key={i}>
            <input
              type="email"
              placeholder={i === 0 ? "Principal" : `Correo ${i + 1}`}
              value={mail}
              onChange={(e) => handleChange(i, e.target.value)}
            />
            {i === 0 ? (
              <span className="chip-principal">Principal</span>
            ) : (
              <button
                type="button"
                onClick={() => handleRemove(i)}
                className="btn-remove"
              >✕</button>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={handleAdd} className="btn-add-dashed">
        + Agregar correo
      </button>
    </div>
  );
}

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
      <div className="repeat-list">
        {valores.map((tel, i) => (
          <div className="repeat-list-item" key={i}>
            <input
              className="lada-input"
              placeholder="LADA"
              value={tel.lada ?? ""}
              onChange={(e) => handleChange(i, "lada", e.target.value)}
            />
            <input
              placeholder="Número"
              value={tel.numero ?? ""}
              onChange={(e) => handleChange(i, "numero", e.target.value)}
            />
            {i === 0 ? (
              <span className="chip-principal">Principal</span>
            ) : (
              <button
                type="button"
                onClick={() => handleRemove(i)}
                className="btn-remove"
              >✕</button>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={handleAdd} className="btn-add-dashed">
        + Agregar {label.toLowerCase()}
      </button>
    </div>
  );
}

function ContactoList({ label = "Contactos", contactos, onChange }) {
  const lista = contactos?.length ? contactos : [emptyContacto()];

  const handleField = (i, field, value) => {
    const arr = [...lista];
    arr[i] = { ...arr[i], [field]: value };
    onChange(arr);
  };

  const handleAdd = () => onChange([...lista, emptyContacto()]);

  const handleRemove = (i) => onChange(lista.filter((_, idx) => idx !== i));

  return (
    <div className="form-row col-12">
      <label>{label}</label>
      {lista.map((c, i) => (
        <div className="contacto-card" key={i}>
          <div className="contacto-card-header">
            <span className="chip-principal">
              {i === 0 ? "Contacto principal" : `Contacto ${i + 1}`}
            </span>
            {i > 0 && (
              <button
                type="button"
                onClick={() => handleRemove(i)}
                className="btn-remove"
              >✕ Quitar</button>
            )}
          </div>

          <div className="contacto-card-row">
            <input
              placeholder="Nombre"
              value={c.nombre ?? ""}
              onChange={(e) => handleField(i, "nombre", e.target.value)}
            />
            <input
              type="email"
              placeholder="Correo"
              value={c.correo ?? ""}
              onChange={(e) => handleField(i, "correo", e.target.value)}
            />
          </div>

          <TelefonoList
            label="Teléfono"
            valores={c.telefonos ?? [{ lada: "", numero: "" }]}
            onChange={(arr) => handleField(i, "telefonos", arr)}
          />
          <TelefonoList
            label="Celular"
            valores={c.celulares ?? [{ lada: "", numero: "" }]}
            onChange={(arr) => handleField(i, "celulares", arr)}
          />

          <div className="contacto-card-row">
            <input
              placeholder="Departamento"
              value={c.departamento ?? ""}
              onChange={(e) => handleField(i, "departamento", e.target.value)}
            />
            <input
              placeholder="Puesto"
              value={c.puesto ?? ""}
              onChange={(e) => handleField(i, "puesto", e.target.value)}
            />
          </div>
        </div>
      ))}
      <button type="button" onClick={handleAdd} className="btn-add-dashed">
        + Agregar contacto
      </button>
    </div>
  );
}

function PaisSelect({ value, onChange }) {
  return (
    <div className="form-row">
      <label>País</label>
      <Dropdown value={value ?? "México"} onChange={onChange}>
        <Dropdown.Option value="México">México</Dropdown.Option>
        <Dropdown.Option value="Estados Unidos">Estados Unidos</Dropdown.Option>
      </Dropdown>
    </div>
  );
}

export default function AltaCliente({ modoModal = false, nombreInicial = "", onClienteCreado }) {
  const params = useParams();
  const id = modoModal ? undefined : params.id;
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const isAdmin = getUser()?.role === "admin";
  // El saldo a favor (anticipos) solo lo puede ver admin/cajas: el backend ya
  // ni siquiera manda el campo para otros roles (ver GET /api/clientes/:id),
  // así que aquí solo se evita mostrar una sección con $0.00 engañoso.
  const puedeVerSaldo = ["admin", "cajas"].includes(getUser()?.role);
  // Los asesores pueden dar de alta/consultar clientes, pero el catálogo de
  // códigos de servicio del cliente (⚙ Configuración) es solo admin/cajas.
  const puedeCodigos = puedeEditarCodigosCliente(getUser()?.role);

  const [form, setForm] = useState(initial);
  useEffect(() => {
    if (modoModal && nombreInicial) {
      setForm((prev) => ({ ...prev, nombre: nombreInicial }));
    }
  }, [modoModal, nombreInicial]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [loadingData, setLoadingData] = useState(false);
  // Catálogo de códigos de servicio propios del cliente (solo en edición).
  const [showCodigos, setShowCodigos] = useState(false);

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

      // Helper: migra un contacto (objeto legacy) al formato completo actual
      const migarContacto = (obj) => ({
        nombre: obj?.nombre || "",
        correo: obj?.correo || "",
        telefonos: migarTels(obj?.telefonos, obj?.telefono),
        celulares: migarTels(obj?.celulares, obj?.celular),
        departamento: obj?.departamento || "",
        puesto: obj?.puesto || "",
      });

      // Helper: migra contacto/contactoGobierno de objeto único (formato viejo) a array
      const migarContactos = (val) => {
        if (Array.isArray(val) && val.length) return val.map(migarContacto);
        if (val && typeof val === "object" && Object.keys(val).length) return [migarContacto(val)];
        return [emptyContacto()];
      };

      const merged = {
        ...initial,
        ...c,
        pais: c.pais || "México",
        emails: Array.isArray(c.emails) && c.emails.length ? c.emails : [""],

        // Migrar telefonos/celulares raíz
        telefonos: migarTels(c.telefonos, c.telefono),
        celulares: migarTels(c.celulares, c.celular),

        requiereFacturacion:
          c.requiereFacturacion !== undefined
            ? Boolean(c.requiereFacturacion)
            : Boolean(
                c.rfc ||
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
          // Migrar contacto(s) de empresa (formato viejo: objeto único)
          contacto: migarContactos(c.empresa?.contacto),
        },
        gobierno: {
          ...initial.gobierno,
          ...(c.gobierno || {}),
          // Migrar contacto(s) de gobierno (formato viejo: objeto único)
          contactoGobierno: migarContactos(c.gobierno?.contactoGobierno),
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
        // El nombre de la empresa/arrendadora vive únicamente en "nombre";
        // apellidoPaterno/apellidoMaterno son campos de "Particular" y no
        // deben arrastrar un contacto viejo que se concatene en los PDFs.
        payload.apellidoPaterno = "";
        payload.apellidoMaterno = "";
      }
      if (payload.tipoCliente === "Empresa Gobierno") {
        delete payload.empresa;
        payload.apellidoPaterno = "";
        payload.apellidoMaterno = "";
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
      <div className="d-flex justify-content-between align-items-start gap-2">
        <h2>{isEdit ? "Editar Cliente" : "Alta de Clientes"}</h2>

        {/* Configuración del cliente: por ahora, su catálogo de códigos de
            servicio (se usan al facturar para llenar NoIdentificacion). Solo
            en edición de un cliente ya guardado y solo para admin/cajas. */}
        {isEdit && !modoModal && puedeCodigos && (
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={() => setShowCodigos(true)}
            title="Configuración del cliente"
          >
            ⚙ Configuración
          </button>
        )}
      </div>

      {isEdit && !modoModal && puedeCodigos && showCodigos && (
        <ModalCodigosCliente
          clienteId={id}
          clienteNombre={form.nombre}
          onClose={() => setShowCodigos(false)}
        />
      )}

      {/* Saldo a Favor (anticipos): solo lectura aquí — registrar un depósito
          o ver el historial de movimientos vive en Cajas (ver
          frontend/src/pages/cajas/CajasAnticipos.jsx), porque es ahí donde
          se emite el recibo y el rol 'cajas' tiene acceso al módulo. */}
      {isEdit && !modoModal && puedeVerSaldo && (
        <div className="form-section">
          <h3 className="form-section-title">Saldo a Favor</h3>
          <div className="d-flex align-items-center gap-3 flex-wrap">
            <span className="fs-5">
              <strong className="text-success">{formatMoneyMXN(form.saldoAFavor)}</strong>
            </span>
            <button
              type="button"
              className="btn btn-outline-primary btn-sm"
              onClick={() => navigate(`/cajas/anticipos?clienteId=${id}`)}
            >
              Ver movimientos / Registrar anticipo
            </button>
          </div>
        </div>
      )}

      {/* Tipo */}
      <div className="form-grid">
        <div className="form-row">
          <label>Tipo de Cliente</label>
          <Dropdown value={form.tipoCliente} onChange={onTipoChange}>
            {CLIENT_TYPES.map((t) => (
              <Dropdown.Option key={t} value={t}>
                {t}
              </Dropdown.Option>
            ))}
          </Dropdown>
        </div>
      </div>

      {/* ===== Campos comunes / por tipo ===== */}
      {/* Particular */}
      {form.tipoCliente === "Particular" && (
        <>
          <div className="form-section">
            <h3 className="form-section-title">Datos personales</h3>
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
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">Contacto</h3>
            <div className="form-grid">
              <EmailList emails={form.emails} onChange={(arr) => upd("emails", arr)} />

              <TelefonoList
                label="Teléfono Fijo"
                valores={form.telefonos ?? [{ lada: "", numero: "" }]}
                onChange={(arr) => upd("telefonos", arr)}
              />

              <TelefonoList
                label="Celular *"
                valores={form.celulares ?? [{ lada: "", numero: "" }]}
                onChange={(arr) => upd("celulares", arr)}
              />
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">Dirección</h3>
            <div className="form-grid">
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

              <PaisSelect value={form.pais} onChange={(e) => upd("pais", e.target.value)} />
            </div>
          </div>
        </>
      )}

      {/* Empresa Privada */}
      {form.tipoCliente === "Empresa Privada" && (
        <>
          <div className="form-section">
            <h3 className="form-section-title">Datos de la empresa</h3>
            <div className="form-grid">
              <div className="form-row">
                <label>Nombre Fiscal (Razón Social)</label>
                <input
                  value={form.empresa?.razonSocial ?? ""}
                  onChange={(e) => upd("empresa.razonSocial", e.target.value)}
                />
              </div>
              <div className="form-row">
                <label>Nombre Comercial</label>
                <input
                  value={form.nombre ?? ""}
                  onChange={(e) => upd("nombre", e.target.value)}
                />
              </div>
              <PaisSelect value={form.pais} onChange={(e) => upd("pais", e.target.value)} />
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">Contacto de la empresa</h3>
            <div className="form-grid">
              <EmailList emails={form.emails} onChange={(arr) => upd("emails", arr)} />

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
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">Contactos</h3>
            <div className="form-grid">
              <ContactoList
                contactos={form.empresa?.contacto}
                onChange={(arr) => upd("empresa.contacto", arr)}
              />
            </div>
          </div>
        </>
      )}

      {/* Empresa Arrendadora */}
      {form.tipoCliente === "Empresa Arrendadora" && (
        <>
          <div className="form-section">
            <h3 className="form-section-title">Datos de la empresa</h3>
            <div className="form-grid">
              <div className="form-row">
                <label>Nombre Comercial</label>
                <input
                  value={form.nombre ?? ""}
                  onChange={(e) => upd("nombre", e.target.value)}
                />
              </div>
              <div className="form-row">
                <label>Nombre Fiscal (Razón Social)</label>
                <input
                  value={form.empresa?.razonSocial ?? ""}
                  onChange={(e) => upd("empresa.razonSocial", e.target.value)}
                />
              </div>
              <PaisSelect value={form.pais} onChange={(e) => upd("pais", e.target.value)} />
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">Contacto de la empresa</h3>
            <div className="form-grid">
              <EmailList emails={form.emails} onChange={(arr) => upd("emails", arr)} />

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
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">Contactos</h3>
            <div className="form-grid">
              <ContactoList
                contactos={form.empresa?.contacto}
                onChange={(arr) => upd("empresa.contacto", arr)}
              />
            </div>
          </div>
        </>
      )}

      {/* Gobierno */}
      {form.tipoCliente === "Empresa Gobierno" && (
        <>
          <div className="form-section">
            <h3 className="form-section-title">Gobierno</h3>
            <div className="form-grid">
              <div className="form-row">
                <label>Nombre Fiscal</label>
                <input
                  value={form.gobierno?.nombreGobierno ?? ""}
                  onChange={(e) =>
                    upd("gobierno.nombreGobierno", e.target.value)
                  }
                />
              </div>
              <PaisSelect value={form.pais} onChange={(e) => upd("pais", e.target.value)} />
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">Contacto general</h3>
            <div className="form-grid">
              <EmailList emails={form.emails} onChange={(arr) => upd("emails", arr)} />

              <TelefonoList
                label="Celular"
                valores={form.celulares ?? [{ lada: "", numero: "" }]}
                onChange={(arr) => upd("celulares", arr)}
              />
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">Contacto de gobierno</h3>
            <div className="form-grid">
              <ContactoList
                label="Contacto Gobierno"
                contactos={form.gobierno?.contactoGobierno}
                onChange={(arr) => upd("gobierno.contactoGobierno", arr)}
              />
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">Dependencia</h3>
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
                <label>Correo Electrónico</label>
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
          </div>
        </>
      )}

      {/* ===== Opciones ===== */}
      <div className="form-section">
        <h3 className="form-section-title">Opciones</h3>
        <div className="opciones-row">
          <label className="opcion-toggle">
            <input
              type="checkbox"
              checked={form.esEmpleado || false}
              onChange={(e) => upd("esEmpleado", e.target.checked)}
            />
            ¿Es empleado?
          </label>

          <label className="opcion-toggle">
            <input
              type="checkbox"
              checked={form.requiereFacturacion || false}
              onChange={(e) => upd("requiereFacturacion", e.target.checked)}
            />
            ¿El cliente requiere facturación?
          </label>
        </div>
      </div>

      {form.requiereFacturacion && (
        <div className="form-section">
          <h3 className="form-section-title">Datos de facturación</h3>

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
              <Dropdown
                value={form.facturacion?.regimenFiscal ?? ""}
                onChange={(e) => upd("facturacion.regimenFiscal", e.target.value)}
              >
                <Dropdown.Option value="">-- Seleccionar --</Dropdown.Option>
                {REGIMEN_FISCAL_OPTIONS.map((o) => (
                  <Dropdown.Option key={o.value} value={o.value}>{o.label}</Dropdown.Option>
                ))}
              </Dropdown>
            </div>

            <div className="form-row">
              <label>Uso de CFDI</label>
              <Dropdown
                value={form.facturacion?.usoCFDI ?? ""}
                onChange={(e) => upd("facturacion.usoCFDI", e.target.value)}
              >
                <Dropdown.Option value="">-- Seleccionar --</Dropdown.Option>
                <Dropdown.Option value="G01">G01 - Adquisición de mercancías</Dropdown.Option>
                <Dropdown.Option value="G03">G03 - Gastos en general</Dropdown.Option>
                <Dropdown.Option value="I01">I01 - Construcciones</Dropdown.Option>
                <Dropdown.Option value="I02">I02 - Mobiliario y equipo de oficina</Dropdown.Option>
                <Dropdown.Option value="I04">I04 - Equipo de cómputo</Dropdown.Option>
                <Dropdown.Option value="D01">D01 - Honorarios médicos</Dropdown.Option>
                <Dropdown.Option value="D10">D10 - Pagos por servicios educativos</Dropdown.Option>
                <Dropdown.Option value="S01">S01 - Sin efectos fiscales</Dropdown.Option>
              </Dropdown>
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
              <Dropdown
                value={form.condicionesPago ?? ""}
                onChange={(e) => upd("condicionesPago", e.target.value)}
              >
                <Dropdown.Option value="">-- Seleccionar --</Dropdown.Option>
                <Dropdown.Option value="Contado">Contado</Dropdown.Option>
                <Dropdown.Option value="Credito">Crédito</Dropdown.Option>
              </Dropdown>
            </div>
          </div>
        </div>
      )}

      {/* Asesor Responsable: solo visible para administradores */}
      <div className="form-section">
        <h3 className="form-section-title">Información adicional</h3>
        <div className="form-grid">
          {isAdmin && (
            <div className="form-row">
              <label>Asesor Responsable</label>
              <Dropdown
                value={form.asesorResponsable ?? ""}
                onChange={(e) => upd("asesorResponsable", e.target.value)}
              >
                <Dropdown.Option value="">-- Seleccionar --</Dropdown.Option>
                {empleados.map((user) => (
                  <Dropdown.Option key={user._id} value={user.name}>
                    {user.name}
                  </Dropdown.Option>
                ))}
              </Dropdown>
            </div>
          )}

          <div className="form-row col-12">
            <label>Observaciones</label>
            <textarea
              rows={3}
              value={form.observaciones ?? ""}
              onChange={(e) => upd("observaciones", e.target.value)}
            />
          </div>
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
