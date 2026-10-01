// backend/middleware/permisosRol.js
//
// Candado de ESCRITURA por rol. Complementa la matriz del frontend
// (frontend/src/utils/roles.js: ROLE_MODULES / ROLE_READONLY): la UI oculta los
// accesos, y este middleware evita que un rol de "solo consulta" modifique datos
// llamando a la API directamente. Solo mira POST/PUT/PATCH/DELETE; las lecturas
// (GET) siempre pasan.
//
// Dos modos por rol:
//   - soloEscribeEn: el rol NO puede escribir en ningún recurso salvo estos
//     (primer segmento tras /api). Para roles de consulta casi total.
//   - noEscribeEn:   el rol puede escribir en todo salvo en estos recursos.
//
// Roles que no aparecen aquí (admin, coordinador, cajas, asesor_servicio,
// refaccionario...) no se tocan: su alcance sigue dependiendo de cada ruta.
//
// Debe montarse en server.js sobre `/api`, antes de las rutas.

const jwt = require('jsonwebtoken');

// Recursos que cualquier rol autenticado necesita escribir.
const SIEMPRE = ['auth', 'tickets'];

// POST que solo generan/descargan documentos, no modifican datos.
const POST_DE_LECTURA = [
  /^\/facturacion\/preview$/,
  /^\/facturacion\/facturas\/export-zip$/,
];

const REGLAS = {
  auditoria:         { soloEscribeEn: ['garantias'] },
  finanzas:          { soloEscribeEn: [] },
  cuentas_por_pagar: { soloEscribeEn: ['proveedores'] },
  recursos_humanos:  { soloEscribeEn: ['empleados'] },
  cuentas_por_cobrar: {
    noEscribeEn: [
      'vehiculos', 'clientes', 'devoluciones', 'proveedores', 'entradas',
      'inventario', 'salidas', 'vales', 'ordenes-compra', 'empleados', 'grupos',
      'codigos', 'servicios-catalogo',
    ],
  },
  recepcion: {
    noEscribeEn: [
      'proveedores', 'entradas', 'inventario', 'salidas', 'vales',
      'ordenes-compra', 'empleados', 'grupos', 'codigos', 'servicios-catalogo',
    ],
  },
  captura: {
    noEscribeEn: [
      'cajas', 'anticipos', 'facturacion', 'generar-xml', 'facturas-cfdi',
      'proveedores', 'entradas', 'inventario', 'salidas', 'vales',
      'ordenes-compra', 'empleados', 'grupos', 'devoluciones', 'codigos',
      'servicios-catalogo',
    ],
  },
};

const METODOS_ESCRITURA = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function permisosRol(req, res, next) {
  if (!METODOS_ESCRITURA.has(req.method)) return next();

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(); // sin token lo rechaza `proteger` en la ruta

  let rol;
  try {
    rol = jwt.verify(token, process.env.JWT_SECRET).role;
  } catch {
    return next(); // token inválido: lo maneja `proteger`
  }

  const regla = REGLAS[rol];
  if (!regla) return next();

  const path = req.path; // relativo a /api
  const recurso = path.split('/').filter(Boolean)[0] || '';

  if (SIEMPRE.includes(recurso)) return next();
  if (req.method === 'POST' && POST_DE_LECTURA.some((re) => re.test(path))) return next();

  const bloqueado = regla.soloEscribeEn
    ? !regla.soloEscribeEn.includes(recurso)
    : regla.noEscribeEn.includes(recurso);

  if (bloqueado) {
    return res.status(403).json({
      message: 'Tu rol solo tiene acceso de consulta en este apartado.',
    });
  }
  next();
}

module.exports = permisosRol;
