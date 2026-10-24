import { isStoreCategory, type StoreCategory } from "./categories";

/** Productos por página de la colección. */
export const PAGE_SIZE = 24;
export const MAX_QUERY_LENGTH = 80;
/** Tope de páginas aceptado en la URL (evita offsets absurdos). */
export const MAX_PAGE = 500;

export interface CatalogParams {
  q: string;
  /** null = colección completa (también si `?cat=` trae un valor desconocido). */
  cat: StoreCategory | null;
  page: number;
}

type Raw = string | string[] | undefined;
const first = (v: Raw) => (Array.isArray(v) ? v[0] : v);

export function normalizeQuery(raw: Raw): string {
  return (first(raw) ?? "").trim().slice(0, MAX_QUERY_LENGTH);
}

/**
 * Lee `?q=&cat=&page=` de la colección. Fail-safe: categoría validada contra
 * STORE_CATEGORIES (desconocida → colección completa) y página entera ≥ 1
 * (inválida → 1). Función pura, testeable.
 */
export function parseCatalogParams(sp: { q?: Raw; cat?: Raw; page?: Raw }): CatalogParams {
  const cat = first(sp.cat)?.trim().toLowerCase();
  const pageRaw = first(sp.page)?.trim() ?? "";
  const page = /^\d{1,4}$/.test(pageRaw) ? Number(pageRaw) : 1;
  return {
    q: normalizeQuery(sp.q),
    cat: isStoreCategory(cat) ? cat : null,
    page: page >= 1 && page <= MAX_PAGE ? page : 1,
  };
}

/**
 * Query canónica de la colección (sin valores por defecto), en el orden q, cat,
 * page. Para `Link`/`router`: `{ pathname: "/catalog", query }`.
 */
export function catalogQuery(p: Partial<CatalogParams>): Record<string, string> {
  const query: Record<string, string> = {};
  if (p.q) query.q = p.q;
  if (p.cat) query.cat = p.cat;
  if (p.page && p.page > 1) query.page = String(p.page);
  return query;
}
