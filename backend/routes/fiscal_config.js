const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");

const FiscalConfig = require("../models/FiscalConfig"); // ajusta si tu archivo se llama distinto
const { proteger, requiereRol } = require("../middleware/auth");

const router = express.Router();

// Emisor, series/folios y certificado+llave del CSD: solo admin. Cajas ya
// puede facturar (Nueva Factura/Consultar), pero no ver ni tocar esto.
router.use(proteger, requiereRol("admin"));

/* ================== OPENSSL (Windows friendly) ================== */
function findOpenSSLPath() {
  // 1) env
  if (process.env.OPENSSL_PATH && fs.existsSync(process.env.OPENSSL_PATH)) {
    return process.env.OPENSSL_PATH;
  }

  // 2) rutas comunes en Windows
  const candidates = [
    "C:\\Program Files\\Git\\usr\\bin\\openssl.exe",
    "C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe",
    "C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe",
    "C:\\Program Files\\OpenSSL-Win32\\bin\\openssl.exe",
    "C:\\OpenSSL-Win64\\bin\\openssl.exe",
    "C:\\OpenSSL-Win32\\bin\\openssl.exe",
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  // 3) intenta por nombre (si está en PATH)
  return "openssl";
}

const OPENSSL = findOpenSSLPath();

function runOpenSSL(args) {
  return new Promise((resolve, reject) => {
    execFile(OPENSSL, args, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        const msg = (stderr || err.message || "").toString();
        return reject(new Error(msg));
      }
      resolve((stdout || "").toString());
    });
  });
}

/* ================== DIRECTORIOS ================== */
// Debe apuntar a backend/keys sin depender del cwd: generar_xml.js lee
// esa misma carpeta con path.join(__dirname, "..", "keys").
const ROOT_KEYS_DIR = path.join(__dirname, "..", "keys");
if (!fs.existsSync(ROOT_KEYS_DIR)) fs.mkdirSync(ROOT_KEYS_DIR, { recursive: true });

const TMP_DIR = path.join(ROOT_KEYS_DIR, "tmp");
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const upload = multer({ dest: TMP_DIR });

/* ================== HELPERS ================== */
// El serial que entrega OpenSSL viene hex-encoded y al decodificarlo da los
// 20 dígitos ASCII que el SAT pide en NoCertificado.
// Ej: "3330303031303030303030353030303033343136" => "30001000000500003416"
function parseNoCertificado(serialOut) {
  const raw = (serialOut || "").replace("serial=", "").trim();

  if (/^[0-9A-Fa-f]{40}$/.test(raw)) {
    const decoded = Buffer.from(raw, "hex").toString("ascii");
    if (/^\d{20}$/.test(decoded)) return decoded;
  }

  return raw;
}

async function getOrCreateConfig() {
  let cfg = await FiscalConfig.findOne().sort({ createdAt: -1 });
  if (!cfg) {
    cfg = await FiscalConfig.create({
      rfc: "XAXX010101000",
      nombre: "EMISOR",
      regimenFiscal: "601",
      lugarExpedicion: "00000",
      telefono: "",
      serie: "",
      folioInterno: "",
      noCertificado: "",
      certificadoBase64: "",
      certificadoNombreArchivo: "",
      keyPemCargado: false,
      keyNombreArchivo: "",
      listoParaTimbrar: false,
    });
  }
  return cfg;
}

function computeListoParaTimbrar(cfg) {
  const okCer = !!cfg.certificadoBase64 && !!cfg.noCertificado;
  const okKey = !!cfg.keyPemCargado;
  return okCer && okKey;
}

/* ================== ROUTES ================== */

// GET /api/fiscal-config
router.get("/", async (_req, res) => {
  try {
    const cfg = await getOrCreateConfig();
    return res.json({ ok: true, data: cfg, openssl: OPENSSL });
  } catch (e) {
    console.error("GET /fiscal-config ERROR:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/fiscal-config
router.post("/", async (req, res) => {
  try {
    const cfg = await getOrCreateConfig();

    const { rfc, nombre, regimenFiscal, lugarExpedicion, telefono, serie, folioInterno } = req.body || {};
    cfg.rfc = (rfc || "").trim().toUpperCase();
    cfg.nombre = (nombre || "").trim().toUpperCase();
    cfg.regimenFiscal = (regimenFiscal || "").trim();
    cfg.lugarExpedicion = (lugarExpedicion || "").trim();
    cfg.telefono = (telefono || "").trim();
    cfg.serie = (serie || "").trim();
    cfg.folioInterno = (folioInterno || "").trim();

    cfg.listoParaTimbrar = computeListoParaTimbrar(cfg);
    await cfg.save();

    return res.json({ ok: true, data: cfg });
  } catch (e) {
    console.error("POST /fiscal-config ERROR:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/fiscal-config/cert
router.post("/cert", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ ok: false, error: "No se recibió archivo .cer" });

    const cfg = await getOrCreateConfig();

    const derBuffer = fs.readFileSync(file.path);
    const cerDerPath = path.join(ROOT_KEYS_DIR, "emisor.cer");
    fs.writeFileSync(cerDerPath, derBuffer);

    cfg.certificadoBase64 = derBuffer.toString("base64");
    cfg.certificadoNombreArchivo = file.originalname || "emisor.cer";

    const cerPemPath = path.join(ROOT_KEYS_DIR, "emisor.cer.pem");

    // 👇 Si openssl no existe, aquí se caía antes, ahora damos mensaje claro
    await runOpenSSL(["x509", "-inform", "DER", "-in", cerDerPath, "-out", cerPemPath]);

    const serialOut = await runOpenSSL(["x509", "-in", cerPemPath, "-noout", "-serial"]);
    cfg.noCertificado = parseNoCertificado(serialOut);

    cfg.listoParaTimbrar = computeListoParaTimbrar(cfg);
    await cfg.save();

    try { fs.unlinkSync(file.path); } catch {}

    return res.json({
      ok: true,
      data: {
        noCertificado: cfg.noCertificado,
        certificadoNombreArchivo: cfg.certificadoNombreArchivo,
      },
    });
  } catch (e) {
    console.error("POST /fiscal-config/cert ERROR:", e);

    const hint =
      `OpenSSL no disponible.\n` +
      `- Ruta usada: ${OPENSSL}\n` +
      `- Solución: instala OpenSSL o pon OPENSSL_PATH correcto en backend/.env y reinicia backend.\n`;

    return res.status(500).json({ ok: false, error: e.message + "\n\n" + hint });
  }
});

// POST /api/fiscal-config/key
router.post("/key", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const password = (req.body?.password || "").toString();

    if (!file) return res.status(400).json({ ok: false, error: "No se recibió archivo .key" });
    if (!password) return res.status(400).json({ ok: false, error: "Falta contraseña del .key" });

    const cfg = await getOrCreateConfig();

    const keyDerPath = path.join(ROOT_KEYS_DIR, "emisor.key");
    fs.writeFileSync(keyDerPath, fs.readFileSync(file.path));

    const keyPemPath = path.join(ROOT_KEYS_DIR, "emisor.key.pem");

    await runOpenSSL([
      "pkcs8",
      "-inform",
      "DER",
      "-in",
      keyDerPath,
      "-passin",
      `pass:${password}`,
      "-out",
      keyPemPath,
    ]);

    // Validar contra cer.pem si existe
    const cerPemPath = path.join(ROOT_KEYS_DIR, "emisor.cer.pem");
    if (fs.existsSync(cerPemPath)) {
      const certMod = await runOpenSSL(["x509", "-noout", "-modulus", "-in", cerPemPath]);
      const keyMod = await runOpenSSL(["rsa", "-noout", "-modulus", "-in", keyPemPath]);

      if (certMod.trim() !== keyMod.trim()) {
        try { fs.unlinkSync(keyPemPath); } catch {}
        try { fs.unlinkSync(keyDerPath); } catch {}
        return res.status(400).json({ ok: false, error: "❌ La llave .key NO corresponde al certificado .cer" });
      }
    }

    cfg.keyPemCargado = true;
    cfg.keyNombreArchivo = file.originalname || "emisor.key";
    cfg.listoParaTimbrar = computeListoParaTimbrar(cfg);
    await cfg.save();

    try { fs.unlinkSync(file.path); } catch {}

    return res.json({ ok: true, data: { keyNombreArchivo: cfg.keyNombreArchivo } });
  } catch (e) {
    console.error("POST /fiscal-config/key ERROR:", e);

    const hint =
      `OpenSSL no disponible o password incorrecto.\n` +
      `- Ruta usada: ${OPENSSL}\n` +
      `- Si dice "bad decrypt": contraseña incorrecta.\n` +
      `- Si dice "not found": instala OpenSSL o pon OPENSSL_PATH.\n`;

    return res.status(500).json({ ok: false, error: e.message + "\n\n" + hint });
  }
});

module.exports = router;
