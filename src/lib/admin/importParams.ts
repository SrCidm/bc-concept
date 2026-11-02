import "server-only";
import { parseProductsQuery } from "@/lib/api/admin";
import { parseSupplierId } from "@/lib/suppliers/registry";
import type { SupplierId } from "@/lib/suppliers/types";
import type { AdminCatalogQuery } from "./catalog";

/**
 * Estado del buscador de /admin/import, guardado en la URL (compartible, botón
 * atrás correcto): `?supplier=&q=&page=&eu=0&stock=0`. Por defecto CJ, y "solo
 * almacén UE" y "solo con stock" activos; la URL solo lleva lo que se aparta de
 * eso. Los filtros solo existen para BigBuy: CJ lista siempre stock UE. Se valida
 * con el mismo `parseProductsQuery` que la API: lo que está fuera de rango se
 * rechaza, no se "corrige".
 */

export const IMPORT_PAGE_SIZE = 24;

export const DEFAULT_IMPORT_SUPPLIER: SupplierId = "cj";

export interface ImportUiState {
  supplier: SupplierId;
  q: string;
  page: number;
  eu: boolean;
  stock: boolean;
}

export type ImportParams =
  | { ok: true; query: AdminCatalogQuery; ui: ImportUiState }
  | { ok: false };

type RawSearchParams = Record<string, string | string[] | undefined>;

/** Con parámetros repetidos (`eu=0&eu=1`, p. ej. el envío nativo del formulario) gana el último. */
function last(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v.length ? v[v.length - 1] : null;
  return v ?? null;
}

export function parseImportParams(sp: RawSearchParams): ImportParams {
  const rawSupplier = last(sp.supplier);
  const supplier = rawSupplier ? parseSupplierId(rawSupplier) : DEFAULT_IMPORT_SUPPLIER;
  if (!supplier) return { ok: false };

  const q = last(sp.q)?.trim() ?? "";
  const eu = supplier === "cj" || last(sp.eu) !== "0";
  const stock = supplier === "cj" || last(sp.stock) !== "0";

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  const page = last(sp.page);
  if (page !== null && page !== "") params.set("page", page);
  params.set("pageSize", String(IMPORT_PAGE_SIZE));
  if (!eu) params.set("euOnly", "false");
  if (!stock) params.set("inStockOnly", "false");

  try {
    const query = parseProductsQuery(params);
    return { ok: true, query: { ...query, supplier }, ui: { supplier, q: query.query ?? "", page: query.page, eu, stock } };
  } catch {
    return { ok: false };
  }
}

/** Query string canónico (sin valores por defecto) para enlaces y `key` de Suspense. */
export function importQueryString(ui: Partial<ImportUiState>): string {
  const p = new URLSearchParams();
  if (ui.supplier && ui.supplier !== DEFAULT_IMPORT_SUPPLIER) p.set("supplier", ui.supplier);
  if (ui.q) p.set("q", ui.q);
  if (ui.page && ui.page > 1) p.set("page", String(ui.page));
  if (ui.eu === false) p.set("eu", "0");
  if (ui.stock === false) p.set("stock", "0");
  return p.toString();
}
