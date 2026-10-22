/**
 * URLs antiguas del catálogo → su ruta localizada, con redirección PERMANENTE
 * (308; el middleware conserva `?q=` y los filtros). Antes de localizar las
 * rutas, la colección vivía en `/catalog` y `/en/catalog`.
 * Función pura (sin dependencias de Next) para poder testearla.
 */
const LEGACY: Readonly<Record<string, string>> = {
  "/catalog": "/coleccion",
  "/es/catalog": "/coleccion",
  "/en/catalog": "/en/collection",
};

export function legacyRedirectPath(pathname: string): string | null {
  return LEGACY[pathname] ?? null;
}
