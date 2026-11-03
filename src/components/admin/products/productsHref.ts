/**
 * Enlaces tipados del panel de productos (forma que aceptan `Link` y `router`
 * de next-intl). Sin `server-only`: también los usan los componentes cliente.
 */
export type ProductsListHref = "/admin/productos" | { pathname: "/admin/productos"; query: Record<string, string> };

export interface ProductsListState {
  status: "draft" | "active" | null;
  supplier: "cj" | "bigbuy" | null;
  page: number;
}

/** Query canónico: solo lo que se aparta de "todos" y de la página 1. */
export function productsListHref(s: Partial<ProductsListState>): ProductsListHref {
  const query: Record<string, string> = {};
  if (s.status) query.status = s.status;
  if (s.supplier) query.supplier = s.supplier;
  if (s.page && s.page > 1) query.page = String(s.page);
  return Object.keys(query).length ? { pathname: "/admin/productos", query } : "/admin/productos";
}

export const productHref = (id: string) => ({ pathname: "/admin/productos/[id]" as const, params: { id } });
