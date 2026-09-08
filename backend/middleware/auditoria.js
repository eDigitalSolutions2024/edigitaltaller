// backend/middleware/auditoria.js
//
// Middleware GLOBAL de auditoría. Se monta en server.js sobre `/api` y deja una
// fila en RegistroAccion por cada creación / modificación / cancelación que se
// intenta por HTTP. No bloquea ni añade latencia: el trabajo se hace dentro de
// res.on('finish'), cuando la respuesta ya salió.
//
// Registra:
//   - Peticiones que aplicaron (HTTP 2xx)              -> ok: true
//   - Peticiones con error o rechazadas (4xx / 5xx)    -> ok: false, con el
//     código y el mensaje de error devueltos.
//
// Lo que NO registra:
//   - Métodos de solo lectura (GET, HEAD, OPTIONS) y redirecciones (3xx).
//   - Peticiones sin token válido: sin usuario identificado no se puede
//     atribuir. (El inicio de sesión se audita aparte, en authController.js.)
//   - Recursos ruidosos o sin valor de auditoría (auth, la propia auditoría,
//     reportes) y rutas de generación de documentos (pdf/xml/imprimir...).
//
// Solo el rol 'admin' puede leer estas filas (GET /api/auditoria/registro).

const jwt = require('jsonwebtoken');
const RegistroAccion = require('../models/RegistroAccion');
const User = require('../models/User');

const METODOS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Primer segmento tras /api que no interesa auditar.
const RECURSOS_IGNORADOS = new Set(['auth', 'auditoria', 'reportes']);

// Fragmentos de ruta = generación de documentos / side-effects sin interés.
const RUTA_IGNORADA = /(^|\/)(pdf|xml|imprimir|print|preview|recibo-pdf|ticket-pdf|password-reveal|verify-admin-password)(\/|$|-)/i;

// Claves de body/query que nunca deben quedar guardadas (credenciales, binarios
// grandes...). Es coincidencia sobre el NOMBRE del campo; se ancla a inicio de
// palabra donde el token suelto daría falsos positivos comunes en este dominio
// (p. ej. `firma` dentro de `confirmado`, `cer` dentro de `tercero`).
const CLAVE_SENSIBLE = /(pass|password|contrase|token|secret|\bfirma|signature|base64|imagen|\bfoto|archivo|\bfile|\bxml|certificad|\.cer\b|\bkey\b|\bpem\b)/i;

const MAX_STR = 400; // recorte de strings largas
const MAX_JSON = 4000; // tope del snapshot completo

function sanitizar(valor, prof = 0) {
  if (valor == null) return valor;
  const t = typeof valor;
  if (t === 'string') return valor.length > MAX_STR ? `${valor.slice(0, MAX_STR)}…` : valor;
  if (t === 'number' || t === 'boolean') return valor;
  if (prof >= 3) return '[…]';
  if (Array.isArray(valor)) return valor.slice(0, 20).map((v) => sanitizar(v, prof + 1));
  if (t === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(valor)) {
      out[k] = CLAVE_SENSIBLE.test(k) ? '***' : sanitizar(v, prof + 1);
    }
    return out;
  }
  return undefined;
}

function acotarJson(obj) {
  try {
    const s = JSON.stringify(obj);
    if (s && s.length > MAX_JSON) return { _truncado: true, _preview: `${s.slice(0, MAX_JSON)}…` };
  } catch (_) {
    return {};
  }
  return obj && typeof obj === 'object' ? obj : {};
}

function vacio(obj) {
  return !obj || typeof obj !== 'object' || Object.keys(obj).length === 0;
}

// Del cuerpo de una respuesta de error, quédate solo con el mensaje.
function mensajeError(body) {
  if (body == null) return '';
  if (typeof body === 'string') return body.slice(0, MAX_STR);
  if (typeof body === 'object') {
    const m = body.message || body.error || body.msg || body.mensaje;
    if (typeof m === 'string') return m.slice(0, MAX_STR);
    try {
      return JSON.stringify(body).slice(0, MAX_STR);
    } catch (_) {
      return '';
    }
  }
  return '';
}

// Cache corta userId -> { name, username, role } para no consultar Mongo en
// cada escritura.
const cacheUsuarios = new Map();
const CACHE_TTL = 5 * 60 * 1000;

async function datosUsuario(id, fallback) {
  if (!id) return fallback;
  const clave = String(id);
  const hit = cacheUsuarios.get(clave);
  if (hit && Date.now() - hit.t < CACHE_TTL) return hit.v;
  try {
    const u = await User.findById(id).select('name username role').lean();
    const v = u
      ? { name: u.name || u.username || '', username: u.username || '', role: u.role || '' }
      : fallback;
    cacheUsuarios.set(clave, { t: Date.now(), v });
    return v;
  } catch (_) {
    return fallback;
  }
}

const RE_OBJECTID = /^[a-f\d]{24}$/i;
const RE_FOLIO = /^(OS|OC|VS|CP|A|F)[-\d]/i;

function derivarAccion(req) {
  const segs = req.path.split('/').filter(Boolean);
  const recurso = (segs[0] || '').toLowerCase();
  const p = req.path.toLowerCase();
  const m = req.method;

  let accion;
  if (/\/(cancelar|anular)(\/|$)/.test(p) && !/deshacer/.test(p)) {
    accion = 'CANCELAR';
  } else if (/\/(status|estatus|estado)(\/|$)/.test(p)) {
    const flag = req.body && (req.body.activo ?? req.body.isActive ?? req.body.active);
    accion = flag === false ? 'DESACTIVAR' : flag === true ? 'ACTIVAR' : 'MODIFICAR';
  } else if (m === 'POST') {
    accion = 'CREAR';
  } else if (m === 'PUT' || m === 'PATCH') {
    accion = 'MODIFICAR';
  } else if (m === 'DELETE') {
    accion = 'ELIMINAR';
  } else {
    accion = m;
  }

  let referencia = '';
  for (const s of segs.slice(1)) {
    if (RE_OBJECTID.test(s) || RE_FOLIO.test(s)) {
      referencia = s;
      break;
    }
  }

  return { recurso, accion, referencia };
}

function ipDe(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.ip || req.connection?.remoteAddress || '';
}

module.exports = function auditoria(req, res, next) {
  try {
    if (!METODOS.has(req.method)) return next();

    const segs = req.path.split('/').filter(Boolean);
    const recurso = (segs[0] || '').toLowerCase();
    if (!recurso || RECURSOS_IGNORADOS.has(recurso)) return next();
    if (RUTA_IGNORADA.test(req.path)) return next();

    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return next();

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (_) {
      return next();
    }
    if (!payload || !payload.id) return next();

    // Snapshot SÍNCRONO del body antes de que el handler lo mute.
    const bodySnap = acotarJson(sanitizar(req.body));
    const querySnap = acotarJson(sanitizar(req.query));
    const { accion, referencia } = derivarAccion(req);
    const inicio = Date.now();
    const meta = {
      accion,
      entidad: recurso,
      referencia,
      usuarioId: payload.id,
      rolTok: payload.role || '',
      userTok: payload.username || '',
      ip: ipDe(req),
      metodo: req.method,
      ruta: req.originalUrl || req.url,
      ua: String(req.headers['user-agent'] || '').slice(0, 200),
    };

    // Captura el cuerpo de la respuesta SOLO si es un error, para guardar el
    // mensaje. Se envuelven json() y send() sin cambiar su comportamiento.
    let cuerpoError = '';
    const _json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 400) cuerpoError = mensajeError(body);
      return _json(body);
    };
    const _send = res.send.bind(res);
    res.send = (body) => {
      if (res.statusCode >= 400 && !cuerpoError) cuerpoError = mensajeError(body);
      return _send(body);
    };

    res.on('finish', () => {
      const code = res.statusCode;
      if (code < 200) return;
      if (code >= 300 && code < 400) return; // redirecciones: nada que auditar

      const okFlag = code < 400;
      (async () => {
        const u = await datosUsuario(meta.usuarioId, {
          name: meta.userTok,
          username: meta.userTok,
          role: meta.rolTok,
        });
        const detalle = {
          status: code,
          ok: okFlag,
          duracionMs: Date.now() - inicio,
          ua: meta.ua,
        };
        if (!vacio(bodySnap)) detalle.body = bodySnap;
        if (!vacio(querySnap)) detalle.query = querySnap;
        if (!okFlag && cuerpoError) detalle.error = cuerpoError;

        await RegistroAccion.create({
          accion: meta.accion,
          entidad: meta.entidad,
          referencia: meta.referencia,
          usuario: u.name || u.username || meta.userTok || '',
          usuarioId: meta.usuarioId,
          rol: u.role || meta.rolTok || '',
          ip: meta.ip,
          metodo: meta.metodo,
          ruta: meta.ruta,
          ok: okFlag,
          origen: 'auto',
          detalle,
        });
      })().catch((err) => console.error('auditoria (no crítico):', err.message));
    });

    return next();
  } catch (err) {
    console.error('auditoria middleware (no crítico):', err.message);
    return next();
  }
};
