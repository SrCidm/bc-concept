/**
 * Enlace a `/admin/import` con un query string canónico (`importQueryString`),
 * en la forma que aceptan el `Link` y el `router` tipados de next-intl
 * (`{ pathname, query }`). Sin `server-only`: lo usa también el formulario cliente.
 */
export type ImportHref = "/admin/import" | { pathname: "/admin/import"; query: Record<string, string> };

export function importHref(qs: string): ImportHref {
  return qs ? { pathname: "/admin/import", query: Object.fromEntries(new URLSearchParams(qs)) } : "/admin/import";
}
