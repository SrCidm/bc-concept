/**
 * Cookies COSMÉTICAS del modo admin (no conceden nada ni se usan para decidir
 * acceso). Sin dependencias de Next para poder usarlas desde servidor y cliente.
 *
 * · `bc_admin` (la fija el panel, la lee la cinta del storefront, la borra el logout).
 * · `bc_admin_curtain`: cookie de SESIÓN (sin Max-Age) que dice "en esta sesión del
 *   navegador ya se vio la transición a oscuro". La fija el cliente al empezarla
 *   y la lee el servidor para renderizar oscuro directamente (F5, navegación
 *   interna, volver al panel) sin repetir la transición. La borra el logout.
 */
export const ADMIN_CURTAIN_COOKIE = "bc_admin_curtain";

export interface AdminModeState {
  /** ¿Se monta el envoltorio del modo admin? (solo cuentas con el guiño). */
  shell: boolean;
  /** ¿Se renderiza ya oscuro desde el servidor? (falso = claro + transición a oscuro en cliente). */
  initiallyDark: boolean;
}

/**
 * Decisión pura del panel. Quien no tiene el guiño (p. ej. Yosra): nada cambia,
 * ni envoltorio ni transición ni cookie. Con el guiño: sin cookie de sesión la
 * primera entrada pinta CLARO y pasa a oscuro con la transición; con cookie,
 * oscuro directo.
 */
export function adminModeState(invert: boolean, hasCurtainCookie: boolean): AdminModeState {
  if (!invert) return { shell: false, initiallyDark: false };
  return { shell: true, initiallyDark: hasCurtainCookie };
}
