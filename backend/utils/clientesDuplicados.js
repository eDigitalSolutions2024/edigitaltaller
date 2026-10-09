// backend/utils/clientesDuplicados.js
// Detección de clientes duplicados (mismo nombre o mismo RFC) y utilidades de
// fusión. Se usa al dar de alta un cliente (advertencia) y en la pantalla
// "Duplicados" de Clientes (identificar y fusionar los que ya existen).
const Cliente = require("../models/Cliente");

// RFC genéricos del SAT (público en general / extranjero): varios clientes
// distintos pueden compartirlos, así que NO sirven para agrupar duplicados.
const RFC_GENERICOS = new Set(["XAXX010101000", "XEXX010101000"]);

// Minúsculas, sin acentos, sin signos y con espacios colapsados: "Strattec,  S.A." == "strattec s a".
function normaliza(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Nombre "visible" del cliente según su tipo (mismo criterio que Consulta de Clientes).
function nombreCliente(c) {
  if (!c) return "";
  if (c.tipoCliente === "Empresa Gobierno") return c.gobierno?.nombreGobierno || c.nombre || "";
  if (c.tipoCliente === "Empresa Privada" || c.tipoCliente === "Empresa Arrendadora") {
    return c.empresa?.razonSocial || c.nombre || "";
  }
  return [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(" ");
}

function claveNombre(c) {
  return normaliza(nombreCliente(c));
}

function claveRfc(c) {
  const rfc = String(c?.rfc ?? "").trim().toUpperCase();
  if (!rfc || RFC_GENERICOS.has(rfc)) return "";
  return rfc;
}

// Campos mínimos que necesita la UI para mostrar una coincidencia.
const CAMPOS_RESUMEN =
  "tipoCliente lineaNegocio nombre apellidoPaterno apellidoMaterno rfc emails telefonos celulares empresa.razonSocial gobierno.nombreGobierno direccion facturacion.direccion activo empleadoRef";

function resumen(c) {
  return {
    _id: c._id,
    nombre: nombreCliente(c),
    tipoCliente: c.tipoCliente,
    rfc: c.rfc || "",
    emails: c.emails || [],
    lineaNegocio: c.lineaNegocio,
  };
}

// Clientes activos con el mismo nombre (normalizado) que el que se va a crear,
// dentro de la misma línea de negocio. `candidato` es el body del alta.
async function buscarCoincidenciasPorNombre(candidato, { excluirId = null } = {}) {
  const clave = claveNombre(candidato);
  if (!clave) return [];
  const filtro = { activo: { $ne: false }, empleadoRef: null };
  if (candidato.lineaNegocio) filtro.lineaNegocio = candidato.lineaNegocio;
  if (excluirId) filtro._id = { $ne: excluirId };
  const todos = await Cliente.find(filtro).select(CAMPOS_RESUMEN).lean();
  return todos.filter((c) => claveNombre(c) === clave).map(resumen);
}

// Agrupa TODOS los clientes activos que comparten nombre normalizado o RFC
// (componentes conexos: A~B por nombre y B~C por RFC => un solo grupo).
async function detectarGrupos() {
  const todos = await Cliente.find({ activo: { $ne: false }, empleadoRef: null })
    .select("-codigosServicio")
    .lean();

  const padre = new Map(todos.map((c) => [String(c._id), String(c._id)]));
  const raiz = (x) => {
    while (padre.get(x) !== x) {
      padre.set(x, padre.get(padre.get(x)));
      x = padre.get(x);
    }
    return x;
  };
  const une = (a, b) => {
    const ra = raiz(a);
    const rb = raiz(b);
    if (ra !== rb) padre.set(ra, rb);
  };

  const porNombre = new Map();
  const porRfc = new Map();
  for (const c of todos) {
    const id = String(c._id);
    const kn = claveNombre(c);
    const kr = claveRfc(c);
    if (kn) {
      const k = `${c.lineaNegocio || ""}|${kn}`;
      if (porNombre.has(k)) une(id, porNombre.get(k));
      else porNombre.set(k, id);
    }
    if (kr) {
      const k = `${c.lineaNegocio || ""}|${kr}`;
      if (porRfc.has(k)) une(id, porRfc.get(k));
      else porRfc.set(k, id);
    }
  }

  const grupos = new Map();
  for (const c of todos) {
    const r = raiz(String(c._id));
    if (!grupos.has(r)) grupos.set(r, []);
    grupos.get(r).push(c);
  }

  return [...grupos.values()]
    .filter((g) => g.length > 1)
    .map((miembros) => {
      const nombres = new Set(miembros.map(claveNombre).filter(Boolean));
      const rfcs = new Set(miembros.map(claveRfc).filter(Boolean));
      const motivos = [];
      if (nombres.size < miembros.length) motivos.push("Mismo nombre");
      if (rfcs.size && rfcs.size < miembros.filter(claveRfc).length) motivos.push("Mismo RFC");
      return { motivos, clientes: miembros.map((m) => ({ ...m, nombreMostrar: nombreCliente(m) })) };
    })
    .sort((a, b) => a.clientes[0].nombreMostrar.localeCompare(b.clientes[0].nombreMostrar, "es"));
}

module.exports = { normaliza, nombreCliente, claveNombre, claveRfc, buscarCoincidenciasPorNombre, detectarGrupos };
