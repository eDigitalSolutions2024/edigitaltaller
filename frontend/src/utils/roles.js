/**
 * Define los módulos permitidos para cada rol restringido.
 * Los roles que NO aparecen aquí tienen acceso completo (admin, mecanico, etc.)
 */
const ROLE_MODULES = {
  refaccionario:   ['refaccionaria'],
  asesor_servicio: ['clientes', 'vehiculo'],
  captura:         ['reportes'],
};

/**
 * true  → el rol puede ver/acceder al módulo
 * false → debe ser redirigido
 */
export function canSeeModule(role, module) {
  if (!ROLE_MODULES[role]) return true;          // rol sin restricciones
  return ROLE_MODULES[role].includes(module);
}

/**
 * Ruta inicial según el rol al entrar a la app.
 */
export function defaultRouteForRole(role) {
  if (role === 'refaccionario')   return '/refaccionaria';
  if (role === 'asesor_servicio') return '/clientes/consulta';
  if (role === 'captura')         return '/reportes';
  if (role === 'auditoria')       return '/reportes';
  return '/dashboard';
}
