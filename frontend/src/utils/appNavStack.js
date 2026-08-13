/**
 * Pila simple de rutas visitadas dentro de la zona privada (AppLayout).
 * Permite que el botón "Regresar" sepa si hay una página previa dentro
 * de la app a la cual volver, o si debe ir a /dashboard en lugar de
 * retroceder hacia /login (que vive fuera de AppLayout y nunca se registra aquí).
 */
let stack = [];

export function recordVisit(pathname) {
  if (stack[stack.length - 1] === pathname) return;
  stack.push(pathname);
  if (stack.length > 50) stack.shift();
}

export function getPreviousPath() {
  return stack.length >= 2 ? stack[stack.length - 2] : null;
}

export function resetAppNavStack() {
  stack = [];
}
