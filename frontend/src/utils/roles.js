/**
 * Define los módulos permitidos para cada rol restringido.
 * Los roles que NO aparecen aquí tienen acceso completo (admin, coordinador,
 * mecanico, etc.).
 *
 * Además de los módulos "grandes" del Navbar (cajas, vehiculo, facturacion...),
 * hay módulos finos para poder dar acceso a una sola pantalla:
 *   - facturas_consulta  → solo Facturación ▸ Consultar
 *   - devoluciones       → Refaccionaria ▸ Devolución / Consulta devoluciones
 *   - inventario         → Refaccionaria ▸ Consultar Inventario
 *   - factura_proveedor  → Refaccionaria ▸ Consultar Factura Proveedor
 *   - personal           → Personal del taller (Recursos Humanos)
 */
const ROLE_MODULES = {
  refaccionario:   ['refaccionaria', 'proveedores', 'devoluciones', 'inventario', 'factura_proveedor'],
  asesor_servicio: ['clientes', 'vehiculo'],
  captura:         ['reportes', 'vehiculo', 'clientes'],
  cajas:           ['cajas', 'vehiculo', 'clientes', 'facturacion'],
  auditoria:       ['vehiculo', 'clientes', 'reportes', 'inventario', 'devoluciones', 'facturas_consulta'],
  finanzas:        ['clientes', 'vehiculo', 'devoluciones', 'facturas_consulta', 'reportes'],
  recursos_humanos:['personal', 'vehiculo', 'reportes'],
  cuentas_por_cobrar: ['vehiculo', 'facturacion'],
  cuentas_por_pagar:  ['clientes', 'vehiculo', 'devoluciones', 'facturas_consulta', 'proveedores'],
  recepcion:       ['vehiculo', 'facturacion', 'devoluciones', 'factura_proveedor'],
};

// Módulos en los que el rol solo puede CONSULTAR (sin altas, ediciones ni
// cancelaciones). La UI oculta los accesos de captura y el backend rechaza las
// escrituras (backend/middleware/permisosRol.js — mantener ambos en sincronía).
const ROLE_READONLY = {
  auditoria:          ['vehiculo', 'clientes', 'devoluciones', 'facturas_consulta', 'inventario'],
  finanzas:           ['clientes', 'vehiculo', 'devoluciones', 'facturas_consulta'],
  recursos_humanos:   ['vehiculo'],
  cuentas_por_cobrar: ['vehiculo'],
  cuentas_por_pagar:  ['clientes', 'vehiculo', 'devoluciones', 'facturas_consulta'],
  recepcion:          ['factura_proveedor'],
};

// El apartado Clientes (alta + consulta) queda reservado a estos roles, sin
// importar el resto de reglas de ROLE_MODULES (antes lo veía casi cualquier
// rol). Cubre Navbar, <RoleRoute module="clientes"> de App.js y el Dashboard.
// El catálogo de códigos de servicio del cliente es más restringido todavía
// (solo admin/cajas, ver puedeEditarCodigosCliente y el backend).
const CLIENTES_ROLES = [
  'admin', 'coordinador', 'cajas', 'asesor_servicio',
  'captura', 'auditoria', 'finanzas', 'cuentas_por_pagar',
];

/**
 * El coordinador tiene los mismos permisos que el admin (además de los de
 * Cajas). Usar esto en vez de `role === 'admin'` en cualquier check de UI.
 */
export function isAdminLike(role) {
  return role === 'admin' || role === 'coordinador';
}

/**
 * true  → el rol puede ver/acceder al módulo
 * false → debe ser redirigido
 */
export function canSeeModule(role, module) {
  if (module === 'clientes') return CLIENTES_ROLES.includes(role);
  if (!ROLE_MODULES[role]) {
    // Rol sin restricciones: ve todo salvo los módulos finos que solo existen
    // para roles restringidos y no tienen menú propio.
    return module !== 'personal' || ['admin', 'coordinador'].includes(role);
  }
  return ROLE_MODULES[role].includes(module);
}

/** true si el rol solo puede consultar (no modificar) el módulo. */
export function isReadOnly(role, module) {
  return !!ROLE_READONLY[role]?.includes(module);
}

/** true si el rol puede ver al menos uno de los módulos indicados. */
export function canSeeAny(role, modules) {
  return modules.some((m) => canSeeModule(role, m));
}

/**
 * Catálogo de códigos de servicio propios del cliente (⚙ Configuración en
 * "Editar Cliente"). Los asesores pueden dar de alta y consultar clientes,
 * pero NO tocar estos códigos: solo admin/cajas. Debe coincidir con
 * requiereRol('admin','cajas') en backend/routes/clientes.js.
 */
export function puedeEditarCodigosCliente(role) {
  return ['admin', 'coordinador', 'cajas'].includes(role);
}

/**
 * Ruta inicial según el rol al entrar a la app.
 * Todos los roles inician en el Dashboard.
 */
export function defaultRouteForRole(role) {
  return '/dashboard';
}
