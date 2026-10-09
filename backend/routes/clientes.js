// routes/clientes.js
const express = require("express");
const Cliente = require("../models/Cliente");
const Empleado = require("../models/Empleado");
const User = require("../models/User");
const Vehiculo = require("../models/Vehiculo");
const GarageVehiculo = require("../models/GarageVehiculo");
const { registrarAccion } = require("../utils/registrarAccion");
const { proteger, requiereRol } = require("../middleware/auth");
const { normalizaLineaNegocio } = require("../utils/lineaNegocio");
const { limpiaCuenta, errorCuentaOrdenante, FORMAS_CON_ORDENANTE } = require("../utils/cuentaOrdenante");
const { buscarCoincidenciasPorNombre, detectarGrupos, nombreCliente } = require("../utils/clientesDuplicados");
const FusionCliente = require("../models/FusionCliente");
const AnticipoCliente = require("../models/AnticipoCliente");
const FacturaCfdi = require("../models/FacturaCfdi");
const router = express.Router();

// Todas las rutas de clientes requieren sesión: antes no había ningún
// middleware de autenticación aquí (cualquiera con acceso a la red podía
// leer o modificar clientes sin login). Se vuelve crítico en cuanto el saldo
// a favor (ver Cliente.saldoAFavor) vive en este mismo modelo.
router.use(proteger);

// Traduce el rol de sistema (User.role, permisos de acceso) al puesto de
// taller más parecido (Empleado.puesto, ver su enum) cuando se crea la ficha
// de Empleado de alguien que solo tenía usuario ("solo_usuario"). Únicamente
// se mapean los que tienen una correspondencia clara y sin ambigüedad; el
// resto (cajas, admin, finanzas, etc. no son puestos de taller) se queda en
// "otro" en vez de adivinar.
const ROL_A_PUESTO = {
  mecanico: "mecanico",
  recepcion: "recepcion",
  asesor_servicio: "asesor",
};

// Escapa metacaracteres de regex antes de meterlos en `new RegExp(...)`: el
// texto de búsqueda/duplicados entraba crudo, lo que permite un patrón
// costoso tipo ReDoS (p. ej. "(a+)+$") con solo mandar una búsqueda.
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// El saldo a favor (anticipos) solo debe viajar en la respuesta para
// admin/cajas: no es solo un tema de UI (ocultar la columna), el resto de
// roles con acceso al módulo Clientes (p. ej. asesor_servicio) no debe poder
// verlo ni abriendo el Network tab o llamando la API directo.
function puedeVerSaldo(req) {
  return ["admin", "coordinador", "cajas"].includes(req.user?.role);
}

// Campos que NO corresponden a cada tipoCliente. Se usan para limpiar datos
// de un tipo/estructura anterior cuando el cliente cambia (p. ej. de
// "Empresa Gobierno" a "Empresa Privada", o cuando el nombre de la empresa
// vive solo en "nombre" y ya no en "apellidoPaterno"), evitando que campos
// obsoletos como gobierno.nombreGobierno o apellidoPaterno queden huérfanos
// en la BD y sigan apareciendo (o concatenándose) en reportes/PDFs que los
// leen con prioridad.
function camposNoUsados(tipoCliente) {
  if (tipoCliente === "Empresa Privada" || tipoCliente === "Empresa Arrendadora") {
    return ["gobierno", "apellidoPaterno", "apellidoMaterno"];
  }
  if (tipoCliente === "Empresa Gobierno") {
    return ["empresa", "apellidoPaterno", "apellidoMaterno"];
  }
  if (tipoCliente === "Particular") {
    return ["empresa", "gobierno"];
  }
  return [];
}

// Los datos fiscales viven en dos lugares por historia del modelo: en la raíz
// (regimenFiscal / codigoPostalFiscal, que es lo que lee la facturación CFDI) y
// dentro de `facturacion` (regimenFiscal / direccion.codigoPostal, que es lo que
// muestra y edita el alta de clientes). Cada pantalla escribía solo su mitad, así
// que lo capturado desde Nueva Factura no aparecía en Clientes (y viceversa).
// Estas funciones mantienen ambas copias sincronizadas sin pisar el resto de
// `facturacion` (usoCFDI, dirección completa, etc.).
const noVacio = (v) => String(v ?? "").trim() !== "";

// Alta de cliente: el body trae el objeto `facturacion` completo, así que la
// copia de la raíz se rellena a partir de él (y al revés si solo vino la raíz).
function sincronizaFiscalEnObjeto(body) {
  const regimenAnidado = body.facturacion?.regimenFiscal;
  const cpAnidado = body.facturacion?.direccion?.codigoPostal;

  if (noVacio(regimenAnidado)) body.regimenFiscal = String(regimenAnidado).trim();
  if (noVacio(cpAnidado)) body.codigoPostalFiscal = String(cpAnidado).trim();

  if (!body.facturacion) return body;

  if (noVacio(body.regimenFiscal) && !noVacio(regimenAnidado)) {
    body.facturacion.regimenFiscal = String(body.regimenFiscal).trim();
  }
  if (noVacio(body.codigoPostalFiscal) && !noVacio(cpAnidado)) {
    body.facturacion.direccion = {
      ...(body.facturacion.direccion || {}),
      codigoPostal: String(body.codigoPostalFiscal).trim(),
    };
  }

  return body;
}

const CAMPOS_DIRECCION = ["calle", "numeroExterior", "numeroInterior", "colonia", "ciudad", "estado"];

// Edición parcial (p. ej. Nueva Factura, que solo manda RFC/régimen/CP/dirección):
// se devuelven rutas con punto para no reemplazar el subdocumento `facturacion`
// completo. No aplica cuando el body ya trae `facturacion` (Mongo no admite en
// un mismo $set la ruta padre y sus hijas) ni cuando el cliente se está
// marcando como que no requiere facturación, porque ahí se quiere limpiar.
function setsFiscalAnidados(body) {
  if (body.facturacion !== undefined) return {};
  if (body.requiereFacturacion === false) return {};

  const sets = {};
  if (noVacio(body.regimenFiscal)) {
    sets["facturacion.regimenFiscal"] = String(body.regimenFiscal).trim();
  }
  if (noVacio(body.codigoPostalFiscal)) {
    sets["facturacion.direccion.codigoPostal"] = String(body.codigoPostalFiscal).trim();
  }
  for (const campo of CAMPOS_DIRECCION) {
    const valor = body.direccion?.[campo];
    if (noVacio(valor)) sets[`facturacion.direccion.${campo}`] = String(valor).trim();
  }
  return sets;
}

// POST /api/clientes  (crear)
router.post("/", async (req, res) => {
  try {
    const body = { ...req.body };

    // Línea de negocio (Servicompacto / Chirey). Se normaliza siempre: si no
    // viene, cae al default 'SERVICOMPACTO'. El chequeo de nombre duplicado de
    // abajo se hace por línea, para no bloquear un alta de Chirey solo porque
    // el mismo nombre ya existe en la cartera de Servicompacto.
    body.lineaNegocio = normalizaLineaNegocio(body.lineaNegocio);
    // El formato de factura solo se cambia desde ⚙ Configuración (PUT /:id/formato-factura).
    delete body.formatoFactura;
    delete body.razonesSociales;

    // 👇 Advertencia de nombre duplicado (misma línea de negocio, sin importar
    // mayúsculas/acentos/signos). No es un bloqueo duro: responde 409 con las
    // coincidencias y el frontend pide confirmación; si el usuario decide crear
    // igual, reenvía con `confirmarDuplicado: true`.
    const { tipoCliente } = body;
    const confirmarDuplicado = body.confirmarDuplicado === true;
    delete body.confirmarDuplicado;

    if (!confirmarDuplicado) {
      const coincidencias = await buscarCoincidenciasPorNombre(body);
      if (coincidencias.length) {
        return res.status(409).json({
          ok: false,
          duplicado: true,
          coincidencias,
          error: `Ya existe un cliente con el nombre "${nombreCliente(body)}".`,
        });
      }
    }
    // 👆 fin validación

    // Descarta campos que no correspondan al tipo (defensa extra: el
    // frontend ya no los envía, pero así queda protegido cualquier caller).
    for (const campo of camposNoUsados(tipoCliente)) delete body[campo];

    // saldoAFavor nunca se acepta por mass-assignment: el único camino válido
    // para tocarlo es /api/anticipos, con sus guardas atómicas contra doble
    // gasto (ver backend/utils/anticiposCliente.js).
    delete body.saldoAFavor;

    // codigosServicio solo se toca por su endpoint dedicado
    // (PUT /api/clientes/:id/codigos-servicio), nunca por el body del cliente:
    // así el "Guardar" del alta/edición no puede pisar el catálogo.
    delete body.codigosServicio;
    // Igual con cuentasBancarias (PUT /api/clientes/:id/cuentas-bancarias).
    delete body.cuentasBancarias;

    sincronizaFiscalEnObjeto(body);

    const cliente = await Cliente.create(body);
    res.status(201).json({ ok: true, data: cliente });
  } catch (err) {
    console.error(err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// routes/clientes.js — GET /
router.get("/", async (req, res) => {
  try {
    const { q = "", page = 1, limit = 10, estado = "activos" } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    // 👇 Reemplaza el $text por $regex — busca parcial, insensible a mayúsculas
    const qEscapado = escapeRegex(q.trim());
    const find = q.trim()
      ? {
          $or: [
            { nombre: { $regex: qEscapado, $options: "i" } },
            { apellidoPaterno: { $regex: qEscapado, $options: "i" } },
            { apellidoMaterno: { $regex: qEscapado, $options: "i" } },
            { emails: { $regex: qEscapado, $options: "i" } },
            { rfc: { $regex: qEscapado, $options: "i" } },
            { "empresa.razonSocial": { $regex: qEscapado, $options: "i" } },
            { "gobierno.nombreGobierno": { $regex: qEscapado, $options: "i" } },
            { "gobierno.dependencia.nombre": { $regex: qEscapado, $options: "i" } },
          ],
        }
      : {};

    // Baja lógica (Cliente.activo): por default solo se listan/buscan
    // activos — así desaparecen tanto de Consulta de Clientes como del
    // buscador de Nueva Orden de Servicio sin borrar nada. `estado=inactivos`
    // es lo que usa el toggle "Mostrar inactivos" de Consulta de Clientes
    // para poder encontrarlos y reactivarlos; `estado=todos` no filtra.
    if (estado === "inactivos") find.activo = false;
    else if (estado !== "todos") find.activo = { $ne: false };

    // Un cliente ya vinculado a un Empleado (ver empleadoRef / "Convertir a
    // Empleado") queda oculto de Clientes de forma permanente: sus órdenes
    // siguen intactas porque apuntan al mismo _id, solo deja de aparecer
    // aquí. No depende de `estado` porque no es una baja reversible desde
    // esta pantalla.
    find.empleadoRef = null;

    // La lista nunca necesita el catálogo de códigos por cliente
    // (codigosServicio solo se usa al editar un cliente o al facturar); con un
    // limit alto — p. ej. Entrada de Vehículo pide limit=9999 — infla la
    // respuesta, así que se excluye siempre.
    const camposExcluidos = puedeVerSaldo(req)
      ? "-codigosServicio"
      : "-saldoAFavor -codigosServicio";

    const [items, total] = await Promise.all([
      Cliente.find(find).select(camposExcluidos).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Cliente.countDocuments(find),
    ]);

    res.json({ ok: true, data: items, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ------------------------------------------------------------------ */
/* Duplicados: identificar y fusionar (solo admin).                    */
/* ------------------------------------------------------------------ */

// SOLO el rol admin (requiereRol("admin") también deja pasar al coordinador).
const soloAdmin = (req, res, next) =>
  req.user?.role === "admin" ? next() : res.status(403).json({ ok: false, error: "Solo el administrador puede hacer esto." });

// GET /api/clientes/duplicados  → grupos de clientes activos con mismo nombre o RFC
router.get("/duplicados", soloAdmin, async (_req, res) => {
  try {
    const grupos = await detectarGrupos();
    res.json({ ok: true, data: grupos });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Campos escalares que el usuario puede resolver a mano en la fusión.
const CAMPOS_FUSION = [
  "tipoCliente", "nombre", "apellidoPaterno", "apellidoMaterno", "rfc",
  "regimenFiscal", "codigoPostalFiscal", "asesorResponsable", "condicionesPago",
  "observaciones", "empresa.razonSocial", "gobierno.nombreGobierno",
  "direccion.calle", "direccion.numeroExterior", "direccion.numeroInterior",
  "direccion.colonia", "direccion.codigoPostal", "direccion.ciudad", "direccion.estado",
  "facturacion.usoCFDI",
];

const unicosPor = (arr, clave) => {
  const vistos = new Set();
  return arr.filter((x) => {
    const k = clave(x);
    if (!k || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
};
const claveTel = (t) => `${String(t?.lada ?? "").trim()}|${String(t?.numero ?? "").replace(/\D/g, "")}|${String(t?.extension ?? "").trim()}`;
const claveContacto = (c) => JSON.stringify(c ?? {});

// POST /api/clientes/fusionar
// body: { principalId, duplicadoIds: [..], campos: { "rfc": "...", "direccion.calle": "..." } }
// Deja UN solo cliente (principal) con la información de todos: los campos
// escalares los decide el usuario (`campos`), las listas (correos, teléfonos,
// códigos, cuentas, razones sociales, contactos) se unen sin repetir, el saldo
// a favor se suma y todo lo que apuntaba a los duplicados (órdenes, anticipos,
// facturas, garaje) pasa al principal. Los duplicados quedan INACTIVOS
// (fusionadoEn → principal), nunca se borran.

// Órdenes de cada duplicado, para elegir cuáles se mueven y para la vista previa.
async function resumenDuplicados(principalId, dupIds) {
  const clientes = await Cliente.find({ _id: { $in: dupIds } }).select("saldoAFavor").lean();
  const ordenes = await Vehiculo.find({ cliente: { $in: dupIds } })
    .select("cliente ordenServicio marca modelo anio placas createdAt")
    .sort({ createdAt: -1 })
    .lean();
  const out = [];
  for (const c of clientes) {
    const [anticipos, facturas] = await Promise.all([
      AnticipoCliente.countDocuments({ cliente: c._id }),
      FacturaCfdi.countDocuments({ "cliente.clienteId": c._id }),
    ]);
    out.push({
      clienteId: c._id,
      saldoAFavor: c.saldoAFavor || 0,
      anticipos,
      facturas,
      ordenes: ordenes.filter((o) => String(o.cliente) === String(c._id)),
    });
  }
  return out;
}

// POST /api/clientes/fusionar/vista-previa  body: { principalId, duplicadoIds }
// Cuenta lo que se movería (órdenes con su detalle, anticipos, facturas, saldo).
router.post("/fusionar/vista-previa", soloAdmin, async (req, res) => {
  try {
    const { principalId, duplicadoIds } = req.body || {};
    const dupIds = (Array.isArray(duplicadoIds) ? duplicadoIds : []).map(String).filter((x) => x !== String(principalId));
    res.json({ ok: true, data: await resumenDuplicados(principalId, dupIds) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// POST /api/clientes/fusionar
// body: { principalId, duplicadoIds: [..], campos: {...}, ordenIds?: [..] }
// `ordenIds` (opcional): órdenes de los duplicados que se mueven. Sin él se
// mueven todas. Un duplicado cuyas órdenes se movieron TODAS se absorbe por
// completo (datos, anticipos, facturas, saldo, garaje; queda inactivo con
// fusionadoEn). Si quedan órdenes sin mover, solo se mueven las elegidas y el
// duplicado sigue activo con el resto. Todo se registra en FusionCliente para
// poder deshacerlo.
router.post("/fusionar", soloAdmin, async (req, res) => {
  try {
    const { principalId, duplicadoIds, campos = {}, ordenIds } = req.body || {};
    const dupIds = [...new Set((Array.isArray(duplicadoIds) ? duplicadoIds : []).map(String))].filter(
      (x) => x !== String(principalId)
    );
    if (!principalId || !dupIds.length) {
      return res.status(400).json({ ok: false, error: "Indica el cliente principal y al menos un duplicado." });
    }

    const principal = await Cliente.findById(principalId);
    const duplicados = await Cliente.find({ _id: { $in: dupIds } });
    if (!principal || duplicados.length !== dupIds.length) {
      return res.status(404).json({ ok: false, error: "Alguno de los clientes ya no existe." });
    }
    const todos = [principal, ...duplicados];
    if (todos.some((c) => c.empleadoRef)) {
      return res.status(409).json({ ok: false, error: "No se puede fusionar la ficha de un empleado." });
    }
    if (todos.some((c) => c.lineaNegocio !== principal.lineaNegocio)) {
      return res.status(409).json({ ok: false, error: "Los clientes son de líneas de negocio distintas." });
    }

    // 0) Qué órdenes se mueven y qué duplicados se absorben por completo.
    const ordenesDup = await Vehiculo.find({ cliente: { $in: dupIds } }).select("_id cliente").lean();
    const elegidas = Array.isArray(ordenIds) ? new Set(ordenIds.map(String)) : null;
    const ordenesMover = ordenesDup.filter((o) => !elegidas || elegidas.has(String(o._id)));
    const completos = duplicados.filter((d) =>
      ordenesDup.filter((o) => String(o.cliente) === String(d._id)).every((o) => !elegidas || elegidas.has(String(o._id)))
    );
    const parciales = duplicados.filter((d) => !completos.includes(d));
    if (!ordenesMover.length && !completos.length) {
      return res.status(400).json({ ok: false, error: "No hay nada que fusionar: selecciona al menos una orden." });
    }

    const fusion = {
      principal: principal._id,
      principalNombre: nombreCliente(principal),
      duplicados: completos.map((d) => ({
        cliente: d._id, nombre: nombreCliente(d), activo: d.activo !== false,
        saldoAFavor: d.saldoAFavor || 0, fusionadoEn: d.fusionadoEn || null,
      })),
      origenesParciales: parciales.map((d) => d._id),
      ordenes: ordenesMover.map((o) => ({ id: o._id, de: o.cliente })),
      anticipos: [], facturas: [], garage: [], saldoSumado: 0, principalPrevio: {},
      usuario: req.user?.username || req.user?.email || req.user?.nombre || "",
    };
    const compIds = completos.map((d) => d._id);

    // 1) Datos del principal (solo con los duplicados absorbidos por completo).
    const set = {};
    const fiscal = {};
    let saldoExtra = 0;
    if (completos.length) {
      for (const k of CAMPOS_FUSION) {
        if (campos[k] === undefined) continue;
        set[k] = typeof campos[k] === "string" ? campos[k].trim() : campos[k];
      }
      if (set.rfc !== undefined) set.rfc = String(set.rfc).toUpperCase();
      if (noVacio(set.regimenFiscal)) fiscal["facturacion.regimenFiscal"] = set.regimenFiscal;
      if (noVacio(set.codigoPostalFiscal)) fiscal["facturacion.direccion.codigoPostal"] = set.codigoPostalFiscal;
      if (noVacio(set.rfc)) set.requiereFacturacion = true;

      const plano = [principal, ...completos].map((c) => c.toObject());
      set.emails = unicosPor(plano.flatMap((c) => c.emails || []), (e) => String(e).toLowerCase());
      set.telefonos = unicosPor(plano.flatMap((c) => c.telefonos || []), claveTel);
      set.celulares = unicosPor(plano.flatMap((c) => c.celulares || []), claveTel);
      set.codigosServicio = unicosPor(
        plano.flatMap((c) => c.codigosServicio || []),
        (f) => `${f.codigoInterno}|${f.codigoCliente}`
      );
      set.cuentasBancarias = unicosPor(
        plano.flatMap((c) => c.cuentasBancarias || []),
        (f) => `${f.banco}|${f.formaPago}|${f.numeroCuenta}`
      );
      set.razonesSociales = Object.values(
        plano.flatMap((c) => c.razonesSociales || []).reduce((acc, r) => {
          const k = String(r.nombre || "").trim().toLowerCase();
          if (!k) return acc;
          const prev = acc[k];
          acc[k] = prev
            ? {
                ...prev,
                veces: (prev.veces || 0) + (r.veces || 0),
                ultimaVez: [prev.ultimaVez, r.ultimaVez].filter(Boolean).sort().pop() || null,
              }
            : { ...r };
          return acc;
        }, {})
      );
      const contactosEmpresa = unicosPor(plano.flatMap((c) => c.empresa?.contacto || []), claveContacto);
      if (contactosEmpresa.length) set["empresa.contacto"] = contactosEmpresa;
      const contactosGob = unicosPor(plano.flatMap((c) => c.gobierno?.contactoGobierno || []), claveContacto);
      if (contactosGob.length) set["gobierno.contactoGobierno"] = contactosGob;
      if (principal.formatoFactura === "NORMAL" && completos.some((d) => d.formatoFactura === "INEGI")) {
        set.formatoFactura = "INEGI";
      }
      saldoExtra = Math.round(completos.reduce((s, d) => s + (d.saldoAFavor || 0), 0) * 100) / 100;

      // Valor previo de cada campo raíz que se va a tocar (para deshacer).
      const previoPlano = principal.toObject();
      for (const k of Object.keys({ ...set, ...fiscal })) {
        const top = k.split(".")[0];
        fusion.principalPrevio[top] = previoPlano[top] === undefined ? null : previoPlano[top];
      }
    }

    // 2) Reapuntar lo movido (guardando los _id para poder devolverlo).
    await Vehiculo.updateMany({ _id: { $in: ordenesMover.map((o) => o._id) } }, { $set: { cliente: principal._id } });
    if (compIds.length) {
      const [ants, facs, garajes] = await Promise.all([
        AnticipoCliente.find({ cliente: { $in: compIds } }).select("_id cliente").lean(),
        FacturaCfdi.find({ "cliente.clienteId": { $in: compIds } }).select("_id cliente.clienteId").lean(),
        GarageVehiculo.find({ clientes: { $in: compIds } }).select("_id clientes").lean(),
      ]);
      fusion.anticipos = ants.map((a) => ({ id: a._id, de: a.cliente }));
      fusion.facturas = facs.map((f) => ({ id: f._id, de: f.cliente.clienteId }));
      fusion.garage = garajes.map((g) => ({
        id: g._id,
        clientes: g.clientes.filter((c) => compIds.some((x) => String(x) === String(c))),
      }));
      await AnticipoCliente.updateMany({ _id: { $in: ants.map((a) => a._id) } }, { $set: { cliente: principal._id } });
      await FacturaCfdi.updateMany({ _id: { $in: facs.map((f) => f._id) } }, { $set: { "cliente.clienteId": principal._id } });
      try {
        await GarageVehiculo.updateMany({ _id: { $in: garajes.map((g) => g._id) } }, { $addToSet: { clientes: principal._id } });
        await GarageVehiculo.updateMany({ _id: { $in: garajes.map((g) => g._id) } }, { $pull: { clientes: { $in: compIds } } });
      } catch (e) {
        console.error("Sincronización de Garaje (no crítico):", e.message);
      }
    }

    // 3) Principal actualizado (+ saldo sumado de forma atómica) y duplicados completos inactivos.
    let actualizado = principal;
    if (completos.length) {
      const update = { $set: { ...set, ...fiscal } };
      if (saldoExtra > 0) update.$inc = { saldoAFavor: saldoExtra };
      actualizado = await Cliente.findByIdAndUpdate(principal._id, update, { new: true });
      await Cliente.updateMany(
        { _id: { $in: compIds } },
        { $set: { activo: false, saldoAFavor: 0, fusionadoEn: principal._id } }
      );
    }
    fusion.saldoSumado = saldoExtra;
    const registro = await FusionCliente.create(fusion);

    registrarAccion(req, {
      accion: "CLIENTE_FUSIONAR",
      entidad: "Cliente",
      entidadId: principal._id,
      referencia: nombreCliente(actualizado),
      detalle: {
        fusionId: String(registro._id),
        principal: String(principal._id),
        absorbidos: compIds.map(String),
        soloOrdenesDe: parciales.map((d) => String(d._id)),
        ordenesMovidas: fusion.ordenes.length,
        anticiposMovidos: fusion.anticipos.length,
        facturasMovidas: fusion.facturas.length,
        saldoSumado: saldoExtra,
      },
    });

    res.json({
      ok: true,
      data: {
        fusionId: registro._id,
        cliente: actualizado,
        ordenesMovidas: fusion.ordenes.length,
        anticiposMovidos: fusion.anticipos.length,
        facturasMovidas: fusion.facturas.length,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// Una fusión solo se puede deshacer durante esta ventana.
const DIAS_DESHACER_FUSION = 7;

// GET /api/clientes/fusiones  → últimas fusiones (para "Deshacer")
router.get("/fusiones", soloAdmin, async (_req, res) => {
  try {
    const limite = new Date(Date.now() - DIAS_DESHACER_FUSION * 24 * 60 * 60 * 1000);
    const data = await FusionCliente.find({ createdAt: { $gte: limite } }).sort({ createdAt: -1 }).limit(30).lean();
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/clientes/fusiones/:id/deshacer
// Devuelve a su cliente original lo que se movió (solo lo que siga en el
// principal), reactiva a los duplicados, resta el saldo sumado y restaura los
// campos del principal que la fusión sobrescribió. Si el saldo sumado ya se
// gastó, se bloquea: hay que resolver ese saldo antes.
router.post("/fusiones/:id/deshacer", soloAdmin, async (req, res) => {
  try {
    const f = await FusionCliente.findById(req.params.id);
    if (!f) return res.status(404).json({ ok: false, error: "Fusión no encontrada." });
    if (f.deshechaEn) return res.status(409).json({ ok: false, error: "Esta fusión ya se deshizo." });
    if (Date.now() - new Date(f.createdAt).getTime() > DIAS_DESHACER_FUSION * 24 * 60 * 60 * 1000) {
      return res.status(409).json({
        ok: false,
        error: `Ya pasaron más de ${DIAS_DESHACER_FUSION} días: esta fusión ya no se puede deshacer.`,
      });
    }

    // 1) Saldo: atómico y con guarda (no puede quedar negativo).
    if (f.saldoSumado > 0) {
      const r = await Cliente.updateOne(
        { _id: f.principal, saldoAFavor: { $gte: f.saldoSumado } },
        { $inc: { saldoAFavor: -f.saldoSumado } }
      );
      if (!r.modifiedCount) {
        return res.status(409).json({
          ok: false,
          error: "El saldo a favor que se sumó ya se usó; no se puede deshacer hasta resolverlo.",
        });
      }
    }

    // 2) Devolver cada documento a su dueño original (solo si sigue en el principal).
    const devolver = async (Modelo, lista, campo) => {
      const porDueno = new Map();
      for (const x of lista) {
        const k = String(x.de);
        if (!porDueno.has(k)) porDueno.set(k, []);
        porDueno.get(k).push(x.id);
      }
      for (const [dueno, ids] of porDueno) {
        await Modelo.updateMany({ _id: { $in: ids }, [campo]: f.principal }, { $set: { [campo]: dueno } });
      }
    };
    await devolver(Vehiculo, f.ordenes, "cliente");
    await devolver(AnticipoCliente, f.anticipos, "cliente");
    await devolver(FacturaCfdi, f.facturas, "cliente.clienteId");
    try {
      for (const g of f.garage) {
        await GarageVehiculo.updateOne({ _id: g.id }, { $addToSet: { clientes: { $each: g.clientes } } });
      }
    } catch (e) {
      console.error("Sincronización de Garaje (no crítico):", e.message);
    }

    // 3) Duplicados absorbidos: vuelven a como estaban.
    for (const d of f.duplicados) {
      await Cliente.updateOne(
        { _id: d.cliente },
        { $set: { activo: d.activo, saldoAFavor: d.saldoAFavor, fusionadoEn: d.fusionadoEn } }
      );
    }

    // 4) Campos del principal.
    const previo = f.principalPrevio || {};
    const $set = {};
    const $unset = {};
    for (const [k, v] of Object.entries(previo)) {
      if (v === null) $unset[k] = "";
      else $set[k] = v;
    }
    const upd = {};
    if (Object.keys($set).length) upd.$set = $set;
    if (Object.keys($unset).length) upd.$unset = $unset;
    if (Object.keys(upd).length) await Cliente.updateOne({ _id: f.principal }, upd);

    f.deshechaEn = new Date();
    f.deshechaPor = req.user?.username || req.user?.email || req.user?.nombre || "";
    await f.save();

    registrarAccion(req, {
      accion: "CLIENTE_FUSION_DESHACER",
      entidad: "Cliente",
      entidadId: f.principal,
      referencia: f.principalNombre,
      detalle: { fusionId: String(f._id), ordenes: f.ordenes.length, anticipos: f.anticipos.length, facturas: f.facturas.length },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// GET /api/clientes/:id
router.get("/:id", async (req, res) => {
  const camposExcluidos = puedeVerSaldo(req) ? undefined : "-saldoAFavor";
  const c = await Cliente.findById(req.params.id).select(camposExcluidos);
  if (!c) return res.status(404).json({ ok: false, error: "No encontrado" });
  res.json({ ok: true, data: c });
});

/* ------------------------------------------------------------------ */
/* Activar / desactivar cliente (baja lógica). Solo admin — a diferencia */
/* del resto de Clientes (alta/edición), que sí ven cajas/asesor_servicio */
/* (ver CLIENTES_ROLES en frontend/src/utils/roles.js).                  */
/* ------------------------------------------------------------------ */

// PATCH /api/clientes/:id/estado   body: { activo: true|false, motivo? }
// Al desactivar, `motivo` es obligatorio (lo exige el modal de confirmación
// en AltaCliente.jsx) — no se guarda aparte en Cliente porque el middleware
// de auditoría ya registra este PATCH como DESACTIVAR con el body completo
// (ver derivarAccion en middleware/auditoria.js), así que basta con que viaje.
router.patch(
  "/:id/estado",
  requiereRol("admin"),
  async (req, res) => {
    try {
      const { activo, motivo } = req.body;
      if (typeof activo !== "boolean") {
        return res.status(400).json({ ok: false, error: 'El campo "activo" debe ser booleano' });
      }
      if (activo === false && !String(motivo || "").trim()) {
        return res.status(400).json({ ok: false, error: "El motivo es obligatorio para desactivar un cliente." });
      }

      const c = await Cliente.findByIdAndUpdate(req.params.id, { activo }, { new: true });
      if (!c) return res.status(404).json({ ok: false, error: "No encontrado" });
      res.json({ ok: true, data: c });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  }
);

/* ------------------------------------------------------------------ */
/* Puente Cliente ⇄ Empleado (ver Cliente.empleadoRef).                */
/* ------------------------------------------------------------------ */

const errHttp = (status, message) => Object.assign(new Error(message), { status });

// Busca (o crea la primera vez) la ficha-sombra de Cliente ligada a una
// persona del roster de Personal. Lanza errores con `.status` para que cada
// ruta los traduzca. Compartido por POST /desde-personal y
// POST /:id/migrar-ordenes-a-empleado.
async function obtenerClienteDePersonal({ empleadoId, userId } = {}) {
  let empleado;

  if (empleadoId) {
    empleado = await Empleado.findById(empleadoId);
    if (!empleado) throw errHttp(404, "Empleado no encontrado");
  } else if (userId) {
    const user = await User.findById(userId);
    if (!user) throw errHttp(404, "Usuario no encontrado");
    if (user.isActive === false) {
      throw errHttp(409, "El usuario está inactivo.");
    }

    empleado = user.employee ? await Empleado.findById(user.employee) : null;
    if (!empleado) {
      // Copia correo/teléfono del usuario: sin esto, la ficha de Empleado
      // nacía vacía y "pisaba" en Personal el contacto que la persona ya
      // tenía como solo_usuario (ver GET /empleados/personal).
      empleado = await Empleado.create({
        nombre: user.name,
        puesto: ROL_A_PUESTO[user.role] || "otro",
        correo: user.email || "",
        telefono: user.telefono || user.celular || "",
      });
      user.employee = empleado._id;
      await user.save();
    } else {
      // Autocorrige fichas que este mismo flujo haya creado antes de este
      // ajuste (sin correo/teléfono/puesto real) — solo rellena lo que
      // esté vacío o siga en el default "otro".
      let cambios = false;
      if (!empleado.correo && user.email) { empleado.correo = user.email; cambios = true; }
      if (!empleado.telefono && (user.telefono || user.celular)) {
        empleado.telefono = user.telefono || user.celular;
        cambios = true;
      }
      if (empleado.puesto === "otro" && ROL_A_PUESTO[user.role]) {
        empleado.puesto = ROL_A_PUESTO[user.role];
        cambios = true;
      }
      if (cambios) await empleado.save();
    }
    if (!empleado.usuario) {
      empleado.usuario = user._id;
      await empleado.save();
    }
  } else {
    throw errHttp(400, "Falta empleadoId o userId.");
  }

  if (!empleado.activo) {
    throw errHttp(409, "El empleado está inactivo.");
  }

  let cliente = await Cliente.findOne({ empleadoRef: empleado._id });

  if (!cliente) {
    cliente = await Cliente.create({
      tipoCliente: "Particular",
      nombre: empleado.nombre,
      esEmpleado: true,
      empleadoRef: empleado._id,
      // Precarga correo/celular desde la ficha de Empleado para que ya
      // aparezcan al abrir la orden (antes quedaban en blanco aunque el
      // empleado ya los tuviera registrados en Personal).
      emails: empleado.correo ? [empleado.correo] : [],
      celulares: empleado.telefono ? [{ numero: empleado.telefono }] : [],
    });
  } else {
    let cambios = false;
    if (!cliente.activo) {
      // Reactivar automáticamente: si se había desactivado, seleccionar de
      // nuevo a esta persona desde este botón implica que vuelve a estar en uso.
      cliente.activo = true;
      cambios = true;
    }
    // Mismo backfill que arriba, para fichas ya creadas antes de este
    // ajuste o para cuando se agregó el correo/teléfono después en Personal.
    if (!cliente.emails?.length && empleado.correo) {
      cliente.emails = [empleado.correo];
      cambios = true;
    }
    if (!cliente.celulares?.length && empleado.telefono) {
      cliente.celulares = [{ numero: empleado.telefono }];
      cambios = true;
    }
    if (cambios) await cliente.save();
  }
  return cliente;
}

// POST /api/clientes/desde-personal   body: { empleadoId } o { userId }
// Botón "Empleados" de Nueva Orden de Servicio y editor de "Datos de
// facturación" de Administración → Personal: en vez de dar de alta a mano un
// cliente y marcar la casilla "Empleado", busca (o crea la primera vez) la
// ficha-sombra de Cliente ligada a esa persona del roster de Personal
// (ver GET /api/empleados/personal) y la regresa lista para usarse.
//
// Personal mezcla dos fuentes (mismo criterio que Personal.jsx): un
// `Empleado` (con o sin usuario de sistema vinculado) o, para altas
// "solo_usuario", un `User` sin ficha de Empleado — a esos se les crea aquí
// la ficha de Empleado que les faltaba (ligando ambos lados) antes de seguir
// con el mismo camino de siempre.
router.post("/desde-personal", async (req, res) => {
  try {
    const cliente = await obtenerClienteDePersonal(req.body || {});
    res.status(201).json({ ok: true, data: cliente });
  } catch (err) {
    res.status(err.status || 400).json({ ok: false, error: err.message });
  }
});

// POST /api/clientes/:id/migrar-ordenes-a-empleado   body: { empleadoId | userId }
// Se dispara al marcar "¿Es empleado?" en Editar Cliente (solo admin): TODAS
// las órdenes del cliente pasan a la ficha-sombra del empleado elegido
// (Vehiculo.cliente) y el cliente original queda inactivo (baja lógica, no se
// borra). Se bloquea si el cliente tiene saldo a favor, porque ese saldo
// vive en el cliente y quedaría huérfano en una ficha inactiva.
router.post("/:id/migrar-ordenes-a-empleado", requiereRol("admin"), async (req, res) => {
  try {
    const origen = await Cliente.findById(req.params.id);
    if (!origen) return res.status(404).json({ ok: false, error: "Cliente no encontrado" });
    if (origen.empleadoRef) {
      return res.status(409).json({ ok: false, error: "Este cliente ya es la ficha de un empleado." });
    }
    if ((origen.saldoAFavor || 0) > 0) {
      return res.status(409).json({
        ok: false,
        error: "El cliente tiene saldo a favor; aplícalo o reembólsalo antes de convertirlo en empleado.",
      });
    }

    const destino = await obtenerClienteDePersonal(req.body || {});
    if (String(destino._id) === String(origen._id)) {
      return res.status(400).json({ ok: false, error: "El destino es el mismo cliente." });
    }

    const ids = await Vehiculo.find({ cliente: origen._id }).distinct("_id");
    const series = await Vehiculo.find({ cliente: origen._id }).distinct("serie");
    const r = await Vehiculo.updateMany({ _id: { $in: ids } }, { $set: { cliente: destino._id } });

    // Garaje (sugerencias por VIN): el empleado sustituye al cliente original.
    const seriesLimpias = series.map((x) => String(x || "").trim()).filter(Boolean);
    if (seriesLimpias.length) {
      try {
        await GarageVehiculo.updateMany({ serie: { $in: seriesLimpias } }, { $addToSet: { clientes: destino._id } });
        await GarageVehiculo.updateMany({ serie: { $in: seriesLimpias } }, { $pull: { clientes: origen._id } });
      } catch (e) {
        console.error("Sincronización de Garaje (no crítico):", e.message);
      }
    }

    origen.activo = false;
    origen.esEmpleado = true;
    await origen.save();

    registrarAccion(req, {
      accion: "CLIENTE_MIGRAR_ORDENES_EMPLEADO",
      entidadId: origen._id,
      referencia: origen.nombre || "",
      detalle: {
        de: { clienteId: String(origen._id), nombre: origen.nombre || "" },
        a: { clienteId: String(destino._id), nombre: destino.nombre || "" },
        ordenesMovidas: r.modifiedCount ?? ids.length,
      },
    });

    res.json({ ok: true, data: { ordenesMovidas: r.modifiedCount ?? ids.length, origen, destino } });
  } catch (err) {
    res.status(err.status || 400).json({ ok: false, error: err.message });
  }
});

// POST /api/clientes/:id/convertir-a-empleado
// Migración manual (Consulta de Clientes → "Convertir a Empleado") para
// clientes esEmpleado=true dados de alta a mano antes de que existiera el
// botón "Empleados": liga el cliente a un Empleado (existente, por
// `empleadoId`, o uno nuevo con los datos del cliente si no viene) sin tocar
// las órdenes (Vehiculo.cliente) que ya apuntan a este _id — solo deja de
// listarse en Clientes (ver GET / arriba, filtra empleadoRef != null).
router.post("/:id/convertir-a-empleado", requiereRol("admin"), async (req, res) => {
  try {
    const cliente = await Cliente.findById(req.params.id);
    if (!cliente) return res.status(404).json({ ok: false, error: "Cliente no encontrado" });
    if (cliente.empleadoRef) {
      return res.status(409).json({ ok: false, error: "Este cliente ya está ligado a un empleado." });
    }

    let empleado;
    if (req.body?.empleadoId) {
      empleado = await Empleado.findById(req.body.empleadoId);
      if (!empleado) return res.status(404).json({ ok: false, error: "Empleado no encontrado" });
    } else {
      const nombre = (req.body?.nombreEmpleado || cliente.nombre || "").trim();
      if (!nombre) {
        return res.status(400).json({ ok: false, error: "Falta el nombre para crear el empleado." });
      }
      empleado = await Empleado.create({
        nombre,
        puesto: req.body?.puesto || "otro",
      });
    }

    cliente.empleadoRef = empleado._id;
    cliente.esEmpleado = true;
    await cliente.save();

    res.json({ ok: true, data: { cliente, empleado } });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/* ------------------------------------------------------------------ */
/* Catálogo de códigos de servicio propios del cliente.               */
/* Se edita desde "Editar Cliente" → ⚙ Configuración y se usa al       */
/* timbrar para llenar NoIdentificacion (ver Cliente.codigosServicio  */
/* y buildCfdiXmlUnsigned en routes/generar_xml.js).                  */
/* Solo admin/cajas: es el mismo criterio de acceso al apartado       */
/* Clientes (ver frontend/src/utils/roles.js).                        */
/* ------------------------------------------------------------------ */

// Normaliza el arreglo recibido: recorta cada campo, quita el separador `|`
// que el patrón de NoIdentificacion del SAT no admite, corta a 100 y descarta
// filas sin `codigoCliente` (lo único imprescindible).
function sanitizaCodigosServicio(body) {
  const filas = Array.isArray(body) ? body : Array.isArray(body?.codigosServicio) ? body.codigosServicio : [];
  return filas
    .map((f) => ({
      codigoInterno: String(f?.codigoInterno ?? "").replace(/\|/g, "").trim().slice(0, 100),
      codigoCliente: String(f?.codigoCliente ?? "").replace(/\|/g, "").trim().slice(0, 100),
      descripcion: String(f?.descripcion ?? "").trim().slice(0, 300),
    }))
    .filter((f) => f.codigoCliente);
}

// GET /api/clientes/:id/codigos-servicio
router.get("/:id/codigos-servicio", requiereRol("admin", "cajas"), async (req, res) => {
  try {
    const c = await Cliente.findById(req.params.id).select("codigosServicio nombre");
    if (!c) return res.status(404).json({ ok: false, error: "No encontrado" });
    res.json({ ok: true, data: c.codigosServicio || [] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/clientes/:id/codigos-servicio  (reemplaza el catálogo completo)
router.put("/:id/codigos-servicio", requiereRol("admin", "cajas"), async (req, res) => {
  try {
    const codigosServicio = sanitizaCodigosServicio(req.body);
    const c = await Cliente.findByIdAndUpdate(
      req.params.id,
      { $set: { codigosServicio } },
      { new: true }
    ).select("codigosServicio");
    if (!c) return res.status(404).json({ ok: false, error: "No encontrado" });
    res.json({ ok: true, data: c.codigosServicio || [] });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// Cuentas bancarias del cliente (una por banco): sirven de Banco/Cuenta ordenante en
// el Complemento de pago por transferencia. Cuenta: 10-50 caracteres A-Z/0-9 (SAT
// CtaOrdenante: 10-11, 15-16, 18 dígitos, o alfanumérica 10-50).
function sanitizaCuentasBancarias(body) {
  const filas = Array.isArray(body) ? body : [];
  const porBanco = new Map();
  for (const f of filas) {
    const banco = String(f?.banco ?? "").trim();
    const formaPago = String(f?.formaPago ?? "").trim();
    const numeroCuenta = limpiaCuenta(f?.numeroCuenta);
    if (!banco && !numeroCuenta) continue;
    if (!banco) throw new Error("Selecciona el banco de cada cuenta.");
    if (formaPago && !FORMAS_CON_ORDENANTE.includes(formaPago)) {
      throw new Error(`Forma de pago inválida para ${banco}.`);
    }
    // Con forma de pago se valida su longitud exacta; sin ella (captura general) 10-18 dígitos.
    const err = formaPago
      ? errorCuentaOrdenante(formaPago, numeroCuenta)
      : /^\d{10,18}$/.test(numeroCuenta) ? "" : "Debe tener entre 10 y 18 dígitos.";
    if (!numeroCuenta || err) throw new Error(`Cuenta de ${banco}: ${err || "captura el número de cuenta."}`);
    porBanco.set(`${banco}|${formaPago}`, { banco, formaPago, numeroCuenta });
  }
  return [...porBanco.values()];
}

const ROLES_CUENTAS_CLIENTE = ["admin", "coordinador", "cajas"];

// GET /api/clientes/:id/razones-sociales  (lo lee también Nueva Factura)
router.get("/:id/razones-sociales", async (req, res) => {
  try {
    const c = await Cliente.findById(req.params.id).select("razonesSociales").lean();
    if (!c) return res.status(404).json({ ok: false, error: "No encontrado" });
    const lista = [...(c.razonesSociales || [])].sort(
      (a, b) => new Date(b.ultimaVez || 0) - new Date(a.ultimaVez || 0)
    );
    res.json({ ok: true, data: lista });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/clientes/:id/razones-sociales  (reemplaza la lista: editar / eliminar / agregar)
router.put("/:id/razones-sociales", requiereRol(...ROLES_CUENTAS_CLIENTE), async (req, res) => {
  try {
    const vistos = new Set();
    const razonesSociales = (Array.isArray(req.body) ? req.body : [])
      .map((r) => ({
        nombre: String(r?.nombre || "").trim(),
        veces: Math.max(Number(r?.veces) || 0, 0),
        ultimaVez: r?.ultimaVez ? new Date(r.ultimaVez) : null,
      }))
      .filter((r) => {
        const k = r.nombre.toLowerCase();
        if (!r.nombre || vistos.has(k)) return false;
        vistos.add(k);
        return true;
      });
    const c = await Cliente.findByIdAndUpdate(req.params.id, { $set: { razonesSociales } }, { new: true })
      .select("razonesSociales")
      .lean();
    if (!c) return res.status(404).json({ ok: false, error: "No encontrado" });
    res.json({ ok: true, data: c.razonesSociales || [] });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// GET /api/clientes/:id/formato-factura
router.get("/:id/formato-factura", requiereRol(...ROLES_CUENTAS_CLIENTE), async (req, res) => {
  try {
    const c = await Cliente.findById(req.params.id).select("formatoFactura").lean();
    if (!c) return res.status(404).json({ ok: false, error: "No encontrado" });
    res.json({ ok: true, data: { formatoFactura: c.formatoFactura === "INEGI" ? "INEGI" : "NORMAL" } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/clientes/:id/formato-factura  { formatoFactura: "NORMAL" | "INEGI" }
router.put("/:id/formato-factura", requiereRol(...ROLES_CUENTAS_CLIENTE), async (req, res) => {
  try {
    const formatoFactura = req.body?.formatoFactura === "INEGI" ? "INEGI" : "NORMAL";
    const c = await Cliente.findByIdAndUpdate(req.params.id, { $set: { formatoFactura } }, { new: true })
      .select("formatoFactura")
      .lean();
    if (!c) return res.status(404).json({ ok: false, error: "No encontrado" });
    res.json({ ok: true, data: { formatoFactura: c.formatoFactura } });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// GET /api/clientes/:id/cuentas-bancarias
router.get("/:id/cuentas-bancarias", requiereRol(...ROLES_CUENTAS_CLIENTE), async (req, res) => {
  try {
    const c = await Cliente.findById(req.params.id).select("cuentasBancarias");
    if (!c) return res.status(404).json({ ok: false, error: "No encontrado" });
    res.json({ ok: true, data: c.cuentasBancarias || [] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/clientes/:id/cuentas-bancarias  (reemplaza la lista completa)
router.put("/:id/cuentas-bancarias", requiereRol(...ROLES_CUENTAS_CLIENTE), async (req, res) => {
  try {
    const cuentasBancarias = sanitizaCuentasBancarias(req.body);
    const c = await Cliente.findByIdAndUpdate(
      req.params.id,
      { $set: { cuentasBancarias } },
      { new: true }
    ).select("cuentasBancarias");
    if (!c) return res.status(404).json({ ok: false, error: "No encontrado" });
    res.json({ ok: true, data: c.cuentasBancarias || [] });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// PUT /api/clientes/:id
router.put("/:id", async (req, res) => {
  try {
    const body = { ...req.body };

    // saldoAFavor nunca se acepta por mass-assignment aquí, ni siquiera de un
    // usuario autenticado con permiso de editar clientes: el único camino
    // válido para tocarlo es /api/anticipos (ver POST /api/clientes arriba).
    delete body.saldoAFavor;

    // codigosServicio solo se edita por PUT /api/clientes/:id/codigos-servicio:
    // el body de "Editar Cliente" puede traer una copia vieja (si se abrió el
    // modal ⚙ y se guardó ahí sin recargar) que pisaría el catálogo.
    delete body.codigosServicio;

    // Solo se toca la línea de negocio si el body la trae explícitamente
    // (para no pisar con el default a un cliente cuyo formulario no la envió);
    // si viene, se normaliza a un valor válido.
    if (body.lineaNegocio !== undefined) {
      body.lineaNegocio = normalizaLineaNegocio(body.lineaNegocio);
    }

    // Igual: el formato de factura no se pisa con la copia del formulario.
    delete body.formatoFactura;
    delete body.razonesSociales;

    // 🔴 Tampoco actualizamos facturación por ahora
    //delete body.facturacion;

    // findByIdAndUpdate solo toca los campos presentes en `body`: si el
    // cliente cambió de tipo (p. ej. dejó de ser "Empresa Gobierno"), los
    // campos viejos ("gobierno"/"empresa"/"apellidoPaterno") no viajan en
    // el body pero tampoco se borran solos en Mongo, así que quedan
    // huérfanos y siguen apareciendo (o concatenándose) en cualquier lugar
    // que los lea con prioridad. Se limpian explícitamente aquí con $unset.

    // Mantiene sincronizadas las dos copias de los datos fiscales (ver arriba):
    // primero rellena la raíz desde `facturacion` cuando viene completo, y si no
    // viene, propaga la raíz hacia `facturacion.*` con rutas con punto.
    sincronizaFiscalEnObjeto(body);
    const setsAnidados = setsFiscalAnidados(body);

    const noUsados = body.tipoCliente ? camposNoUsados(body.tipoCliente) : [];
    const update = { $set: { ...body, ...setsAnidados } };
    for (const campo of noUsados) delete update.$set[campo];
    if (noUsados.length) {
      update.$unset = Object.fromEntries(noUsados.map((campo) => [campo, ""]));
    }

    const c = await Cliente.findByIdAndUpdate(req.params.id, update, {
      new: true,
    });
    res.json({ ok: true, data: c });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// DELETE (soft delete opcional)
router.delete("/:id", async (req, res) => {
  const c = await Cliente.findByIdAndUpdate(
    req.params.id,
    { activo: false },
    { new: true }
  );
  res.json({ ok: true, data: c });
});

module.exports = router;
