/**
 * Define los módulos permitidos para cada rol restringido.
 * Los roles que NO aparecen aquí tienen acceso completo (admin, mecanico, etc.)
 */
const ROLE_MODULES = {
  refaccionario:   ['refaccionaria', 'proveedores'],
  asesor_servicio: ['clientes', 'vehiculo'],
  captura:         ['reportes'],
  cajas:           ['cajas', 'vehiculo', 'clientes', 'facturacion'],
};

// El apartado Clientes (alta + consulta) queda reservado a estos roles, sin
// importar el resto de reglas de ROLE_MODULES (antes lo veía casi cualquier
// rol). Cubre Navbar, <RoleRoute module="clientes"> de App.js y el Dashboard.
// El catálogo de códigos de servicio del cliente es más restringido todavía
// (solo admin/cajas, ver puedeEditarCodigosCliente y el backend).
const CLIENTES_ROLES = ['admin', 'cajas', 'asesor_servicio'];

/**
 * true  → el rol puede ver/acceder al módulo
 * false → debe ser redirigido
 */
export function canSeeModule(role, module) {
  if (module === 'clientes') return CLIENTES_ROLES.includes(role);
  if (!ROLE_MODULES[role]) return true;          // rol sin restricciones
  return ROLE_MODULES[role].includes(module);
}

/**
 * Catálogo de códigos de servicio propios del cliente (⚙ Configuración en
 * "Editar Cliente"). Los asesores pueden dar de alta y consultar clientes,
 * pero NO tocar estos códigos: solo admin/cajas. Debe coincidir con
 * requiereRol('admin','cajas') en backend/routes/clientes.js.
 */
export function puedeEditarCodigosCliente(role) {
  return ['admin', 'cajas'].includes(role);
}

/**
 * Ruta inicial según el rol al entrar a la app.
 * Todos los roles inician en el Dashboard.
 */
export function defaultRouteForRole(role) {
  return '/dashboard';
}
