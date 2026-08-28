// routes/clientes.js
const express = require("express");
const Cliente = require("../models/Cliente");
const { proteger, requiereRol } = require("../middleware/auth");
const router = express.Router();

// Todas las rutas de clientes requieren sesión: antes no había ningún
// middleware de autenticación aquí (cualquiera con acceso a la red podía
// leer o modificar clientes sin login). Se vuelve crítico en cuanto el saldo
// a favor (ver Cliente.saldoAFavor) vive en este mismo modelo.
router.use(proteger);

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
  return ["admin", "cajas"].includes(req.user?.role);
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

    // 👇 Validación de nombre duplicado
    const { nombre, apellidoPaterno, apellidoMaterno, tipoCliente } = body;

    if (tipoCliente === "Particular" && nombre) {
      const query = {
        nombre: { $regex: new RegExp(`^${escapeRegex(nombre.trim())}$`, "i") },
        apellidoPaterno: { $regex: new RegExp(`^${escapeRegex((apellidoPaterno || "").trim())}$`, "i") },
        apellidoMaterno: { $regex: new RegExp(`^${escapeRegex((apellidoMaterno || "").trim())}$`, "i") },
      };

      const existe = await Cliente.findOne(query);
      if (existe) {
        return res.status(409).json({
          ok: false,
          error: `Ya existe un cliente con el nombre "${nombre} ${apellidoPaterno || ""} ${apellidoMaterno || ""}".`.trim(),
        });
      }
    }

    // Para empresa/gobierno checa razón social o nombre gobierno
    if (tipoCliente === "Empresa Privada" || tipoCliente === "Empresa Arrendadora") {
      if (body.nombre) {
        const existe = await Cliente.findOne({
          tipoCliente,
          nombre: { $regex: new RegExp(`^${escapeRegex(body.nombre.trim())}$`, "i") },
        });
        if (existe) {
          return res.status(409).json({
            ok: false,
            error: `Ya existe una empresa con el nombre "${body.nombre}".`,
          });
        }
      }
    }

    if (tipoCliente === "Empresa Gobierno") {
      const nombreGob = body.gobierno?.nombreGobierno;
      if (nombreGob) {
        const existe = await Cliente.findOne({
          "gobierno.nombreGobierno": { $regex: new RegExp(`^${escapeRegex(nombreGob.trim())}$`, "i") },
        });
        if (existe) {
          return res.status(409).json({
            ok: false,
            error: `Ya existe un gobierno con el nombre "${nombreGob}".`,
          });
        }
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
    const { q = "", page = 1, limit = 10 } = req.query;
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

// GET /api/clientes/:id
router.get("/:id", async (req, res) => {
  const camposExcluidos = puedeVerSaldo(req) ? undefined : "-saldoAFavor";
  const c = await Cliente.findById(req.params.id).select(camposExcluidos);
  if (!c) return res.status(404).json({ ok: false, error: "No encontrado" });
  res.json({ ok: true, data: c });
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
