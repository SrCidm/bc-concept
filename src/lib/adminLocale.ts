/**
 * El área admin es solo ES (el storefront sigue bilingüe). Con
 * `localePrefix: "as-needed"` el español no lleva prefijo, así que cualquier
 * `/en/admin…` se redirige a `/admin…` conservando la ruta.
 *
 * Devuelve el pathname destino, o null si la ruta no es de admin en inglés.
 * Función pura (sin dependencias de Next) para poder testearla.
 */
export function adminSpanishPath(pathname: string): string | null {
  if (pathname === "/en/admin" || pathname.startsWith("/en/admin/")) {
    return pathname.slice("/en".length);
  }
  return null;
}
